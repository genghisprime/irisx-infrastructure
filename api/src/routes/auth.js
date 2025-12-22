import { Hono } from 'hono';
import { z } from 'zod';
import authService from '../services/auth.js';
import oauthService from '../services/oauth.js';
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

const enable2FASchema = z.object({
  totp_code: z.string().length(6).regex(/^\d{6}$/, 'TOTP code must be 6 digits'),
});

const disable2FASchema = z.object({
  password: z.string().min(1),
  totp_code: z.string().length(6).regex(/^\d{6}$/, 'TOTP code must be 6 digits'),
});

const verify2FASchema = z.object({
  pending_token: z.string().min(1),
  totp_code: z.string().length(6).regex(/^\d{6}$/, 'TOTP code must be 6 digits'),
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
 * GET /v1/auth/2fa/status
 * Get 2FA status for current user
 */
auth.get('/2fa/status', authenticateJWT, async (c) => {
  try {
    const user = c.get('user');
    const status = await authService.get2FAStatus(user.userId);

    return c.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('[Auth Routes] 2FA status error:', error);

    return c.json({
      success: false,
      error: 'Failed to get 2FA status',
      message: error.message,
    }, 500);
  }
});

/**
 * POST /v1/auth/2fa/setup
 * Generate 2FA secret and QR code for setup
 */
auth.post('/2fa/setup', authenticateJWT, async (c) => {
  try {
    const user = c.get('user');
    const result = await authService.setup2FA(user.userId);

    return c.json({
      success: true,
      message: '2FA setup initiated. Scan QR code with authenticator app.',
      data: result,
    });
  } catch (error) {
    console.error('[Auth Routes] 2FA setup error:', error);

    if (error.message.includes('already enabled')) {
      return c.json({
        success: false,
        error: '2FA is already enabled for this account',
      }, 400);
    }

    return c.json({
      success: false,
      error: '2FA setup failed',
      message: error.message,
    }, 500);
  }
});

/**
 * POST /v1/auth/2fa/enable
 * Enable 2FA after verifying TOTP code
 */
auth.post('/2fa/enable', authenticateJWT, async (c) => {
  try {
    const body = await c.req.json();
    const user = c.get('user');

    // Validate input
    const validated = enable2FASchema.parse(body);

    // Enable 2FA
    const result = await authService.enable2FA(user.userId, validated.totp_code);

    return c.json({
      success: true,
      message: '2FA has been enabled successfully',
      data: result,
    });
  } catch (error) {
    console.error('[Auth Routes] 2FA enable error:', error);

    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    if (error.message.includes('Invalid') || error.message.includes('code')) {
      return c.json({
        success: false,
        error: 'Invalid verification code',
      }, 400);
    }

    if (error.message.includes('setup')) {
      return c.json({
        success: false,
        error: 'Please run 2FA setup first',
      }, 400);
    }

    return c.json({
      success: false,
      error: '2FA enable failed',
      message: error.message,
    }, 500);
  }
});

/**
 * POST /v1/auth/2fa/disable
 * Disable 2FA (requires password and TOTP code)
 */
auth.post('/2fa/disable', authenticateJWT, async (c) => {
  try {
    const body = await c.req.json();
    const user = c.get('user');

    // Validate input
    const validated = disable2FASchema.parse(body);

    // Disable 2FA
    await authService.disable2FA(user.userId, validated.password, validated.totp_code);

    return c.json({
      success: true,
      message: '2FA has been disabled',
    });
  } catch (error) {
    console.error('[Auth Routes] 2FA disable error:', error);

    if (error.name === 'ZodError') {
      return c.json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      }, 400);
    }

    if (error.message.includes('password')) {
      return c.json({
        success: false,
        error: 'Incorrect password',
      }, 401);
    }

    if (error.message.includes('Invalid') || error.message.includes('code')) {
      return c.json({
        success: false,
        error: 'Invalid verification code',
      }, 400);
    }

    return c.json({
      success: false,
      error: '2FA disable failed',
      message: error.message,
    }, 500);
  }
});

/**
 * POST /v1/auth/verify-2fa
 * Verify 2FA code during login flow
 */
auth.post('/verify-2fa', async (c) => {
  try {
    const body = await c.req.json();

    // Validate input
    const validated = verify2FASchema.parse(body);

    // Verify 2FA and complete login
    const result = await authService.verify2FALogin(
      validated.pending_token,
      validated.totp_code
    );

    return c.json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    console.error('[Auth Routes] 2FA verify error:', error);

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
        error: 'Invalid or expired verification',
      }, 401);
    }

    return c.json({
      success: false,
      error: '2FA verification failed',
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

// =========================================
// OAUTH 2.0 SOCIAL LOGIN ROUTES
// =========================================

/**
 * GET /v1/auth/oauth/providers
 * Get list of enabled OAuth providers
 */
auth.get('/oauth/providers', async (c) => {
  try {
    const providers = oauthService.getEnabledProviders();

    return c.json({
      success: true,
      data: providers,
    });
  } catch (error) {
    console.error('[Auth Routes] OAuth providers error:', error);

    return c.json({
      success: false,
      error: 'Failed to get OAuth providers',
    }, 500);
  }
});

/**
 * GET /v1/auth/oauth/:provider
 * Initiate OAuth flow - redirects to provider
 */
auth.get('/oauth/:provider', async (c) => {
  try {
    const provider = c.req.param('provider');
    const authUrl = oauthService.getAuthUrl(provider);

    // Return redirect URL (frontend will redirect)
    return c.json({
      success: true,
      data: {
        auth_url: authUrl,
        provider,
      },
    });
  } catch (error) {
    console.error('[Auth Routes] OAuth init error:', error);

    return c.json({
      success: false,
      error: error.message || 'OAuth provider not configured',
    }, 400);
  }
});

/**
 * GET /v1/auth/oauth/:provider/callback
 * OAuth callback - exchange code for tokens
 */
auth.get('/oauth/:provider/callback', async (c) => {
  try {
    const provider = c.req.param('provider');
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    // Handle OAuth errors
    if (error) {
      const errorDescription = c.req.query('error_description') || error;
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return c.redirect(`${frontendUrl}/auth/oauth-error?error=${encodeURIComponent(errorDescription)}`);
    }

    if (!code) {
      return c.json({
        success: false,
        error: 'Missing authorization code',
      }, 400);
    }

    // Handle callback
    const result = await oauthService.handleCallback(provider, code, state);

    // Redirect to frontend with tokens
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const params = new URLSearchParams({
      type: result.type,
      access_token: result.tokens.accessToken,
      refresh_token: result.tokens.refreshToken,
    });

    return c.redirect(`${frontendUrl}/auth/oauth-success?${params.toString()}`);

  } catch (error) {
    console.error('[Auth Routes] OAuth callback error:', error);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return c.redirect(`${frontendUrl}/auth/oauth-error?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * POST /v1/auth/oauth/:provider/link
 * Link OAuth provider to existing account
 */
auth.post('/oauth/:provider/link', authenticateJWT, async (c) => {
  try {
    const provider = c.req.param('provider');
    const user = c.get('user');
    const body = await c.req.json();

    if (!body.code) {
      return c.json({
        success: false,
        error: 'Authorization code required',
      }, 400);
    }

    const result = await oauthService.linkProvider(user.userId, provider, body.code);

    return c.json({
      success: true,
      message: `${provider} account linked successfully`,
      data: result,
    });
  } catch (error) {
    console.error('[Auth Routes] OAuth link error:', error);

    return c.json({
      success: false,
      error: error.message || 'Failed to link OAuth account',
    }, 400);
  }
});

/**
 * DELETE /v1/auth/oauth/:provider/unlink
 * Unlink OAuth provider from account
 */
auth.delete('/oauth/:provider/unlink', authenticateJWT, async (c) => {
  try {
    const provider = c.req.param('provider');
    const user = c.get('user');

    await oauthService.unlinkProvider(user.userId, provider);

    return c.json({
      success: true,
      message: `${provider} account unlinked successfully`,
    });
  } catch (error) {
    console.error('[Auth Routes] OAuth unlink error:', error);

    return c.json({
      success: false,
      error: error.message || 'Failed to unlink OAuth account',
    }, 400);
  }
});

/**
 * GET /v1/auth/oauth/linked
 * Get linked OAuth providers for current user
 */
auth.get('/oauth/linked', authenticateJWT, async (c) => {
  try {
    const user = c.get('user');
    const providers = await oauthService.getLinkedProviders(user.userId);

    return c.json({
      success: true,
      data: providers,
    });
  } catch (error) {
    console.error('[Auth Routes] OAuth linked error:', error);

    return c.json({
      success: false,
      error: 'Failed to get linked providers',
    }, 500);
  }
});

export default auth;
