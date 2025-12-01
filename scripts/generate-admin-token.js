/**
 * Generate a fresh admin JWT token
 * Run this on the production server to get a new token
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pg from 'pg';

const { Pool } = pg;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com',
  port: 5432,
  database: process.env.DB_NAME || 'irisx_prod',
  user: process.env.DB_USER || 'irisx_admin',
  password: process.env.DB_PASSWORD || '5cdce73ae642767beb8bac7085ad2bf2',
  max: 10
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-admin-jwt-key-change-this';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function generateToken() {
  try {
    // Get superadmin user
    const result = await pool.query(
      `SELECT id, email, role FROM admin_users WHERE role = 'superadmin' AND deleted_at IS NULL LIMIT 1`
    );

    if (result.rows.length === 0) {
      console.error('No superadmin user found');
      process.exit(1);
    }

    const admin = result.rows[0];

    // Generate JWT
    const token = jwt.sign(
      {
        adminId: admin.id,
        email: admin.email,
        role: admin.role
      },
      JWT_SECRET,
      { expiresIn: '24h' } // 24 hour token
    );

    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Revoke all existing sessions for this admin
    await pool.query(
      `UPDATE admin_sessions
       SET revoked_at = NOW()
       WHERE admin_user_id = $1 AND revoked_at IS NULL`,
      [admin.id]
    );

    // Create new session
    await pool.query(
      `INSERT INTO admin_sessions (
        admin_user_id, token_hash, ip_address, user_agent, expires_at
      ) VALUES ($1, $2, $3, $4, $5)`,
      [admin.id, tokenHash, 'script-generated', 'generate-admin-token.js', expiresAt]
    );

    console.log('\n=== NEW ADMIN TOKEN GENERATED ===');
    console.log('Admin:', admin.email);
    console.log('Role:', admin.role);
    console.log('Expires:', expiresAt.toISOString());
    console.log('\nToken:');
    console.log(token);
    console.log('\n=== Copy this token and paste it in your browser console ===');
    console.log(`localStorage.setItem('adminToken', '${token}');`);
    console.log('Then refresh the page.');
    console.log('\n');

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error generating token:', err);
    await pool.end();
    process.exit(1);
  }
}

generateToken();
