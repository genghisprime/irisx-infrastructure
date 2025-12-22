/**
 * OAuth 2.0 Social Login Service
 *
 * Supports:
 * - Google OAuth 2.0
 * - Microsoft Azure AD
 * - GitHub OAuth
 *
 * Flow:
 * 1. User clicks "Sign in with Google/Microsoft/GitHub"
 * 2. Redirect to provider's consent screen
 * 3. Provider redirects back with authorization code
 * 4. Exchange code for tokens
 * 5. Fetch user profile
 * 6. Create/link account
 * 7. Issue JWT tokens
 */

import jwt from 'jsonwebtoken';
import { query } from '../db/connection.js';
import authService from './auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// OAuth Provider Configurations
const PROVIDERS = {
  google: {
    name: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scopes: ['openid', 'email', 'profile'],
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET
  },
  microsoft: {
    name: 'Microsoft',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
    scopes: ['openid', 'email', 'profile', 'User.Read'],
    clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET
  },
  github: {
    name: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    emailsUrl: 'https://api.github.com/user/emails',
    scopes: ['read:user', 'user:email'],
    clientId: process.env.GITHUB_OAUTH_CLIENT_ID,
    clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET
  }
};

class OAuthService {
  /**
   * Get list of enabled OAuth providers
   */
  getEnabledProviders() {
    const enabled = [];

    for (const [key, config] of Object.entries(PROVIDERS)) {
      if (config.clientId && config.clientSecret) {
        enabled.push({
          id: key,
          name: config.name,
          authUrl: this.getAuthUrl(key)
        });
      }
    }

    return enabled;
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthUrl(provider, state = null) {
    const config = PROVIDERS[provider];
    if (!config || !config.clientId) {
      throw new Error(`OAuth provider ${provider} is not configured`);
    }

    const callbackUrl = `${process.env.API_URL || 'http://localhost:3000'}/v1/auth/oauth/${provider}/callback`;

    // Generate state token for CSRF protection
    const stateToken = state || jwt.sign(
      { provider, timestamp: Date.now() },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state: stateToken,
      access_type: 'offline', // For refresh tokens (Google)
      prompt: 'consent' // Force consent screen
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(provider, code) {
    const config = PROVIDERS[provider];
    if (!config) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const callbackUrl = `${process.env.API_URL || 'http://localhost:3000'}/v1/auth/oauth/${provider}/callback`;

    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: callbackUrl
    });

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    const data = await response.json();

    if (data.error) {
      console.error(`[OAuth] Token exchange error for ${provider}:`, data);
      throw new Error(data.error_description || data.error);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      idToken: data.id_token // For OpenID Connect providers
    };
  }

  /**
   * Fetch user profile from provider
   */
  async fetchUserProfile(provider, accessToken) {
    const config = PROVIDERS[provider];
    if (!config) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const response = await fetch(config.userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user profile: ${response.statusText}`);
    }

    const data = await response.json();

    // Normalize profile data across providers
    let profile = {
      provider,
      providerId: null,
      email: null,
      firstName: null,
      lastName: null,
      name: null,
      picture: null,
      emailVerified: false
    };

    switch (provider) {
      case 'google':
        profile = {
          ...profile,
          providerId: data.sub,
          email: data.email,
          firstName: data.given_name,
          lastName: data.family_name,
          name: data.name,
          picture: data.picture,
          emailVerified: data.email_verified
        };
        break;

      case 'microsoft':
        profile = {
          ...profile,
          providerId: data.id,
          email: data.mail || data.userPrincipalName,
          firstName: data.givenName,
          lastName: data.surname,
          name: data.displayName,
          picture: null, // Microsoft requires separate API call for photo
          emailVerified: true // Microsoft accounts are verified
        };
        break;

      case 'github':
        // GitHub may not return email in profile, need separate call
        let email = data.email;
        if (!email && config.emailsUrl) {
          const emailsResponse = await fetch(config.emailsUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            }
          });
          if (emailsResponse.ok) {
            const emails = await emailsResponse.json();
            const primaryEmail = emails.find(e => e.primary && e.verified);
            email = primaryEmail?.email || emails[0]?.email;
          }
        }

        const nameParts = (data.name || '').split(' ');
        profile = {
          ...profile,
          providerId: String(data.id),
          email: email,
          firstName: nameParts[0] || data.login,
          lastName: nameParts.slice(1).join(' ') || '',
          name: data.name || data.login,
          picture: data.avatar_url,
          emailVerified: true // Primary GitHub emails are verified
        };
        break;
    }

    if (!profile.email) {
      throw new Error('Could not retrieve email from OAuth provider');
    }

    return profile;
  }

  /**
   * Handle OAuth callback - create or link account
   */
  async handleCallback(provider, code, state) {
    // Verify state token
    try {
      jwt.verify(state, JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired state token');
    }

    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(provider, code);

    // Fetch user profile
    const profile = await this.fetchUserProfile(provider, tokens.accessToken);

    // Check if this OAuth identity is already linked to an account
    const linkedAccount = await query(
      `SELECT ol.*, u.id as user_id, u.tenant_id, u.email as user_email, u.role, u.status
       FROM oauth_links ol
       INNER JOIN users u ON ol.user_id = u.id
       WHERE ol.provider = $1 AND ol.provider_user_id = $2`,
      [provider, profile.providerId]
    );

    if (linkedAccount.rows.length > 0) {
      // User has linked this OAuth account before - log them in
      const user = linkedAccount.rows[0];

      if (user.status !== 'active') {
        throw new Error('Account is not active');
      }

      // Update last login
      await query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [user.user_id]
      );

      // Update OAuth link
      await query(
        `UPDATE oauth_links
         SET access_token = $1, refresh_token = $2, last_used_at = NOW()
         WHERE id = $3`,
        [tokens.accessToken, tokens.refreshToken, linkedAccount.rows[0].id]
      );

      // Generate JWT tokens
      const jwtTokens = await authService.generateTokens({
        id: user.user_id,
        email: user.user_email,
        tenantId: user.tenant_id,
        role: user.role
      });

      return {
        type: 'login',
        user: {
          id: user.user_id,
          email: user.user_email,
          tenantId: user.tenant_id,
          role: user.role
        },
        tokens: jwtTokens
      };
    }

    // Check if email already exists
    const existingUser = await query(
      'SELECT id, email, tenant_id, role, status FROM users WHERE email = $1',
      [profile.email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];

      if (user.status !== 'active') {
        throw new Error('Account is not active');
      }

      // Link OAuth to existing account
      await query(
        `INSERT INTO oauth_links (user_id, provider, provider_user_id, provider_email, access_token, refresh_token, profile_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [user.id, provider, profile.providerId, profile.email, tokens.accessToken, tokens.refreshToken, JSON.stringify(profile)]
      );

      // Update last login
      await query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [user.id]
      );

      // Generate JWT tokens
      const jwtTokens = await authService.generateTokens({
        id: user.id,
        email: user.email,
        tenantId: user.tenant_id,
        role: user.role
      });

      return {
        type: 'linked',
        user: {
          id: user.id,
          email: user.email,
          tenantId: user.tenant_id,
          role: user.role
        },
        tokens: jwtTokens
      };
    }

    // New user - create account
    // Generate company name from email domain
    const emailDomain = profile.email.split('@')[1];
    const companyName = emailDomain.split('.')[0].charAt(0).toUpperCase() + emailDomain.split('.')[0].slice(1);

    // Create tenant and user
    const tenant = await query(
      `INSERT INTO tenants (name, billing_email, status, created_at)
       VALUES ($1, $2, 'active', NOW())
       RETURNING id`,
      [companyName, profile.email]
    );

    const tenantId = tenant.rows[0].id;

    // Create user (no password for OAuth-only users)
    const newUser = await query(
      `INSERT INTO users (tenant_id, email, first_name, last_name, role, status, email_verified, created_at)
       VALUES ($1, $2, $3, $4, 'admin', 'active', $5, NOW())
       RETURNING id, email, tenant_id, role`,
      [tenantId, profile.email.toLowerCase(), profile.firstName || '', profile.lastName || '', profile.emailVerified]
    );

    const user = newUser.rows[0];

    // Create OAuth link
    await query(
      `INSERT INTO oauth_links (user_id, provider, provider_user_id, provider_email, access_token, refresh_token, profile_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user.id, provider, profile.providerId, profile.email, tokens.accessToken, tokens.refreshToken, JSON.stringify(profile)]
    );

    // Generate JWT tokens
    const jwtTokens = await authService.generateTokens({
      id: user.id,
      email: user.email,
      tenantId: user.tenant_id,
      role: user.role
    });

    return {
      type: 'registered',
      user: {
        id: user.id,
        email: user.email,
        tenantId: user.tenant_id,
        role: user.role
      },
      tokens: jwtTokens
    };
  }

  /**
   * Link OAuth provider to existing authenticated user
   */
  async linkProvider(userId, provider, code) {
    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(provider, code);

    // Fetch user profile
    const profile = await this.fetchUserProfile(provider, tokens.accessToken);

    // Check if this OAuth is already linked to another account
    const existingLink = await query(
      'SELECT user_id FROM oauth_links WHERE provider = $1 AND provider_user_id = $2',
      [provider, profile.providerId]
    );

    if (existingLink.rows.length > 0) {
      if (existingLink.rows[0].user_id !== userId) {
        throw new Error('This OAuth account is already linked to a different user');
      }
      // Already linked to this user
      return { success: true, message: 'Already linked' };
    }

    // Create link
    await query(
      `INSERT INTO oauth_links (user_id, provider, provider_user_id, provider_email, access_token, refresh_token, profile_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, provider, profile.providerId, profile.email, tokens.accessToken, tokens.refreshToken, JSON.stringify(profile)]
    );

    return {
      success: true,
      provider,
      providerEmail: profile.email
    };
  }

  /**
   * Unlink OAuth provider from user
   */
  async unlinkProvider(userId, provider) {
    // Check if user has password or other OAuth links
    const user = await query(
      `SELECT password_hash,
        (SELECT COUNT(*) FROM oauth_links WHERE user_id = $1) as oauth_count
       FROM users WHERE id = $1`,
      [userId]
    );

    if (user.rows.length === 0) {
      throw new Error('User not found');
    }

    const hasPassword = !!user.rows[0].password_hash;
    const oauthCount = parseInt(user.rows[0].oauth_count);

    // User must have either a password or at least one other OAuth link
    if (!hasPassword && oauthCount <= 1) {
      throw new Error('Cannot unlink the only authentication method. Please set a password first.');
    }

    await query(
      'DELETE FROM oauth_links WHERE user_id = $1 AND provider = $2',
      [userId, provider]
    );

    return { success: true };
  }

  /**
   * Get linked providers for a user
   */
  async getLinkedProviders(userId) {
    const result = await query(
      `SELECT provider, provider_email, created_at, last_used_at
       FROM oauth_links
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows;
  }
}

export default new OAuthService();
