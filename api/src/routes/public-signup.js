/**
 * Public Signup Routes
 * Handles customer self-service registration
 */

import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import pool from '../db/connection.js';
import { sendVerificationEmail, sendWelcomeEmail } from '../services/signup-email.js';

const router = new Hono();

// Validation schemas
const signupSchema = z.object({
  companyName: z.string().min(2).max(100),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email(),
  password: z.string().min(8).regex(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/,
    'Password must contain uppercase, number, and special character'),
  phone: z.string().optional(),
  utmSource: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmMedium: z.string().optional(),
});

/**
 * POST /public/signup
 * Register new customer account
 */
router.post('/signup', async (c) => {
  try {
    const body = await c.req.json();
    const validated = signupSchema.parse(body);

    // Check if email already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [validated.email]
    );

    if (existingUser.rows.length > 0) {
      return c.json({ error: 'Email already registered' }, 400);
    }

    // Check if signup already exists (prevent duplicates)
    const existingSignup = await pool.query(
      'SELECT id, status FROM public_signups WHERE email = $1',
      [validated.email]
    );

    if (existingSignup.rows.length > 0 && existingSignup.rows[0].status === 'verified') {
      return c.json({ error: 'Account already exists. Please log in.' }, 400);
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Hash password
    const passwordHash = await bcrypt.hash(validated.password, 10);

    // Get client IP
    const clientIP = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create tenant
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
      const tenantResult = await client.query(`
        INSERT INTO tenants (
          name,
          domain,
          plan,
          status,
          trial_ends_at,
          signup_source,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id
      `, [
        validated.companyName,
        validated.companyName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        'trial',
        'active',
        trialEndsAt,
        'website'
      ]);

      const tenantId = tenantResult.rows[0].id;

      // Create admin user
      const userResult = await client.query(`
        INSERT INTO users (
          tenant_id,
          email,
          password_hash,
          first_name,
          last_name,
          phone,
          role,
          status,
          email_verified,
          email_verification_token,
          email_verification_expires_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        RETURNING id
      `, [
        tenantId,
        validated.email,
        passwordHash,
        validated.firstName,
        validated.lastName,
        validated.phone || null,
        'admin',
        'active',
        false,
        verificationToken,
        expiresAt
      ]);

      const userId = userResult.rows[0].id;

      // Create signup record
      await client.query(`
        INSERT INTO public_signups (
          email,
          company_name,
          first_name,
          last_name,
          phone,
          tenant_id,
          user_id,
          status,
          verification_token,
          signup_ip,
          utm_source,
          utm_campaign,
          utm_medium,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      `, [
        validated.email,
        validated.companyName,
        validated.firstName,
        validated.lastName,
        validated.phone || null,
        tenantId,
        userId,
        'pending',
        verificationToken,
        clientIP,
        validated.utmSource || null,
        validated.utmCampaign || null,
        validated.utmMedium || null
      ]);

      await client.query('COMMIT');

      // Send verification email
      await sendVerificationEmail({
        email: validated.email,
        firstName: validated.firstName,
        verificationToken,
        companyName: validated.companyName
      });

      return c.json({
        success: true,
        message: 'Account created! Please check your email to verify your address.',
        email: validated.email,
        verificationRequired: true,
        trialDays: 14
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation failed', details: error.errors }, 400);
    }
    console.error('Signup error:', error);
    return c.json({ error: 'Failed to create account' }, 500);
  }
});

/**
 * GET /public/verify-email/:token
 * Verify email address via token
 */
router.get('/verify-email/:token', async (c) => {
  try {
    const { token } = c.req.param();

    // Find user by verification token
    const userResult = await pool.query(`
      SELECT u.id, u.email, u.first_name, u.tenant_id, u.email_verification_expires_at,
             ps.id as signup_id, ps.company_name
      FROM users u
      LEFT JOIN public_signups ps ON ps.user_id = u.id
      WHERE u.email_verification_token = $1
        AND u.email_verified = FALSE
    `, [token]);

    if (userResult.rows.length === 0) {
      return c.html(`
        <!DOCTYPE html>
        <html>
        <head><title>Invalid Link</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>❌ Invalid or Expired Link</h1>
          <p>This verification link is invalid or has already been used.</p>
          <a href="https://app.tazzi.com/login">Go to Login</a>
        </body>
        </html>
      `);
    }

    const user = userResult.rows[0];

    // Check if token expired
    if (new Date() > new Date(user.email_verification_expires_at)) {
      return c.html(`
        <!DOCTYPE html>
        <html>
        <head><title>Link Expired</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>⏰ Link Expired</h1>
          <p>This verification link has expired. Please request a new one.</p>
          <a href="https://app.tazzi.com/resend-verification">Resend Verification</a>
        </body>
        </html>
      `);
    }

    // Update user as verified
    await pool.query(`
      UPDATE users
      SET email_verified = TRUE,
          email_verification_token = NULL,
          email_verification_expires_at = NULL
      WHERE id = $1
    `, [user.id]);

    // Update signup record
    if (user.signup_id) {
      await pool.query(`
        UPDATE public_signups
        SET status = 'verified',
            verified_at = NOW()
        WHERE id = $1
      `, [user.signup_id]);
    }

    // Send welcome email
    await sendWelcomeEmail({
      email: user.email,
      firstName: user.first_name,
      companyName: user.company_name
    });

    // Redirect to login with success message
    return c.redirect('https://app.tazzi.com/login?verified=true');

  } catch (error) {
    console.error('Email verification error:', error);
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head><title>Error</title></head>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1>⚠️ Verification Error</h1>
        <p>Something went wrong. Please try again or contact support.</p>
      </body>
      </html>
    `);
  }
});

/**
 * POST /public/resend-verification
 * Resend verification email
 */
router.post('/resend-verification', async (c) => {
  try {
    const { email } = await c.req.json();

    // Find unverified user
    const userResult = await pool.query(`
      SELECT u.id, u.first_name, ps.company_name
      FROM users u
      LEFT JOIN public_signups ps ON ps.user_id = u.id
      WHERE u.email = $1 AND u.email_verified = FALSE
    `, [email]);

    if (userResult.rows.length === 0) {
      return c.json({ error: 'Email not found or already verified' }, 404);
    }

    const user = userResult.rows[0];

    // Generate new token
    const newToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Update user
    await pool.query(`
      UPDATE users
      SET email_verification_token = $1,
          email_verification_expires_at = $2
      WHERE id = $3
    `, [newToken, expiresAt, user.id]);

    // Send new verification email
    await sendVerificationEmail({
      email,
      firstName: user.first_name,
      verificationToken: newToken,
      companyName: user.company_name
    });

    return c.json({
      success: true,
      message: 'Verification email sent! Please check your inbox.'
    });

  } catch (error) {
    console.error('Resend verification error:', error);
    return c.json({ error: 'Failed to resend verification' }, 500);
  }
});

export default router;
