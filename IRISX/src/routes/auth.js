import { Hono } from 'hono';
import { z } from 'zod';
import authService from '../services/auth.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';

const auth = new Hono();

/**
 * Validation schemas
 */
const registerSchema = z.object({
  company_name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  first_name: z.string().min(1).max(50),
  last_name: z.string().min(1).max(50),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  reset_token: z.string().min(1),
  new_password: z.string().min(8),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

/**
 * POST /v1/auth/register
 * Register new tenant with admin user
 */
auth.post('/register', async (c) => {
  try {
    const body = await c.req.json();

    // Validate input
    const validated = registerSchema.parse(body);

    // Register user
    const result = await authService.register({
      companyName: validated.company_name,
      email: validated.email,
      password: validated.password,
      firstName: validated.first_name,
      lastName: validated.last_name,
      phone: validated.phone,
    });

    return c.json({
      success: true,
      message: 'Registration successful',
      data: result,
    }, 201);
  } catch (error) {
    console.error('[Auth Routes] Register error:', error);

    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    if (error.message === 'Email already registered') {
      return c.json({
        success: false,
        error: 'Email already registered',
      }, 409);
    }

    return c.json({
      success: false,
      error: 'Registration failed',
      message: error.message,
    }, 500);
  }
});

/**
 * POST /v1/auth/login
 * Login with email and password
 */
auth.post('/login', async (c) => {
  try {
    const body = await c.req.json();

    // Validate input
    const validated = loginSchema.parse(body);

    // Login user
    const result = await authService.login(validated.email, validated.password);

    return c.json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    console.error('[Auth Routes] Login error:', error);

    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    if (error.message.includes('Invalid email or password')) {
      return c.json({
        success: false,
        error: 'Invalid email or password',
      }, 401);
    }

    if (error.message.includes('inactive')) {
      return c.json({
        success: false,
        error: error.message,
      }, 403);
    }

    return c.json({
      success: false,
      error: 'Login failed',
      message: error.message,
    }, 500);
  }
});

/**
 * POST /v1/auth/refresh
 * Refresh access token using refresh token
 */
auth.post('/refresh', async (c) => {
  try {
    const body = await c.req.json();

    // Validate input
    const validated = refreshSchema.parse(body);

    // Refresh token
    const result = await authService.refreshAccessToken(validated.refresh_token);

    return c.json({
      success: true,
      message: 'Token refreshed',
      data: result,
    });
  } catch (error) {
    console.error('[Auth Routes] Refresh error:', error);

    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    if (error.message.includes('Invalid') || error.message.includes('expired')) {
      return c.json({
        success: false,
        error: error.message,
      }, 401);
    }

    return c.json({
      success: false,
      error: 'Token refresh failed',
      message: error.message,
    }, 500);
  }
});

/**
 * POST /v1/auth/logout
 * Logout - revoke refresh token
 */
auth.post('/logout', authenticateJWT, async (c) => {
  try {
    const body = await c.req.json();
    const user = c.get('user');

    const refreshToken = body.refresh_token;

    if (!refreshToken) {
      return c.json({
        success: false,
        error: 'Refresh token required',
      }, 400);
    }

    // Revoke refresh token
    await authService.logout(user.userId, refreshToken);

    return c.json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    console.error('[Auth Routes] Logout error:', error);

    return c.json({
      success: false,
      error: 'Logout failed',
      message: error.message,
    }, 500);
  }
});

/**
 * POST /v1/auth/forgot-password
 * Request password reset token
 */
auth.post('/forgot-password', async (c) => {
  try {
    const body = await c.req.json();

    // Validate input
    const validated = forgotPasswordSchema.parse(body);

    // Generate reset token
    const result = await authService.generatePasswordResetToken(validated.email);

    // In production, send email here
    // For now, return success (don't reveal if email exists)
    return c.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent',
      // DO NOT return reset_token in production!
      ...(process.env.NODE_ENV === 'development' && result.reset_token ? {
        dev_reset_token: result.reset_token,
      } : {}),
    });
  } catch (error) {
    console.error('[Auth Routes] Forgot password error:', error);

    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    return c.json({
      success: false,
      error: 'Password reset request failed',
      message: error.message,
    }, 500);
  }
});

/**
 * POST /v1/auth/reset-password
 * Reset password using reset token
 */
auth.post('/reset-password', async (c) => {
  try {
    const body = await c.req.json();

    // Validate input
    const validated = resetPasswordSchema.parse(body);

    // Reset password
    await authService.resetPassword(validated.reset_token, validated.new_password);

    return c.json({
      success: true,
      message: 'Password reset successful',
    });
  } catch (error) {
    console.error('[Auth Routes] Reset password error:', error);

    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    if (error.message.includes('Invalid') || error.message.includes('expired')) {
      return c.json({
        success: false,
        error: 'Invalid or expired reset token',
      }, 400);
    }

    return c.json({
      success: false,
      error: 'Password reset failed',
      message: error.message,
    }, 500);
  }
});

/**
 * GET /v1/auth/me
 * Get current authenticated user
 */
auth.get('/me', authenticateJWT, async (c) => {
  try {
    const user = c.get('user');

    // Get full user data
    const userData = await authService.getUserById(user.userId);

    if (!userData) {
      return c.json({
        success: false,
        error: 'User not found',
      }, 404);
    }

    return c.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    console.error('[Auth Routes] Get me error:', error);

    return c.json({
      success: false,
      error: 'Failed to get user data',
      message: error.message,
    }, 500);
  }
});

/**
 * POST /v1/auth/change-password
 * Change password for authenticated user
 */
auth.post('/change-password', authenticateJWT, async (c) => {
  try {
    const body = await c.req.json();
    const user = c.get('user');

    // Validate input
    const validated = changePasswordSchema.parse(body);

    // Change password
    await authService.changePassword(
      user.userId,
      validated.current_password,
      validated.new_password
    );

    return c.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('[Auth Routes] Change password error:', error);

    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    if (error.message.includes('incorrect')) {
      return c.json({
        success: false,
        error: 'Current password is incorrect',
      }, 401);
    }

    return c.json({
      success: false,
      error: 'Password change failed',
      message: error.message,
    }, 500);
  }
});

/**
 * GET /v1/auth/health
 * Health check endpoint for auth service
 */
auth.get('/health', async (c) => {
  return c.json({
    success: true,
    service: 'auth',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

export default auth;
