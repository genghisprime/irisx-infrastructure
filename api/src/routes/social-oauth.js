/**
 * Social OAuth Routes
 * OAuth flows for connecting Facebook, Twitter, Instagram, and LinkedIn accounts
 * Customers connect their own accounts via these endpoints
 *
 * Architecture:
 * - Admin configures OAuth app credentials (App ID, Secret) in Admin Portal
 * - Customers connect their accounts via OAuth in Customer Portal
 * - Customer access tokens stored encrypted per-tenant
 */

import { Hono } from 'hono';
import { z } from 'zod';
import pool from '../db/connection.js';
import crypto from 'crypto';

const oauth = new Hono();

// =============================================================================
// Configuration
// =============================================================================

const OAUTH_CONFIGS = {
  facebook: {
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    scopes: ['pages_messaging', 'pages_manage_metadata', 'pages_read_engagement', 'pages_show_list', 'instagram_basic', 'instagram_manage_messages'],
  },
  twitter: {
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scopes: ['dm.read', 'dm.write', 'tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  },
  instagram: {
    // Instagram uses Facebook's OAuth
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    scopes: ['instagram_basic', 'instagram_manage_messages', 'instagram_content_publish', 'pages_show_list'],
  },
  linkedin: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['r_organization_social', 'w_organization_social', 'rw_organization_admin'],
  },
};

// =============================================================================
// Encryption Helpers
// =============================================================================

const ENCRYPTION_KEY = process.env.SOCIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || 'change-this-in-production-32-chars!';
const ALGORITHM = 'aes-256-cbc';

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const cipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv);
  let decrypted = cipher.update(parts[1], 'hex', 'utf8');
  decrypted += cipher.final('utf8');
  return decrypted;
}

// =============================================================================
// Middleware
// =============================================================================

oauth.use('*', async (c, next) => {
  // Skip auth for callback endpoints (they use state parameter)
  if (c.req.path.includes('/callback/')) {
    return await next();
  }

  const tenantId = c.get('tenant_id');
  if (!tenantId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('tenant_id', tenantId);
  await next();
});

// =============================================================================
// Helper: Get Platform OAuth App Credentials
// =============================================================================

async function getPlatformApp(platform) {
  const { rows } = await pool.query(
    `SELECT * FROM social_platform_apps WHERE platform = $1 AND is_enabled = true`,
    [platform]
  );

  if (rows.length === 0) {
    throw new Error(`${platform} integration is not enabled`);
  }

  return rows[0];
}

// =============================================================================
// OAuth Initiation Routes
// =============================================================================

/**
 * GET /v1/social/oauth/facebook/connect
 * Initiate Facebook OAuth flow
 */
oauth.get('/facebook/connect', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const redirectUri = c.req.query('redirect_uri') || process.env.SOCIAL_OAUTH_REDIRECT_BASE + '/facebook/callback';

    const app = await getPlatformApp('facebook');
    const config = OAUTH_CONFIGS.facebook;

    // Create state token for security
    const state = crypto.randomBytes(32).toString('hex');

    // Store state in database (expires in 10 minutes)
    await pool.query(
      `INSERT INTO oauth_states (state, tenant_id, platform, redirect_uri, created_at, expires_at)
       VALUES ($1, $2, 'facebook', $3, NOW(), NOW() + INTERVAL '10 minutes')`,
      [state, tenantId, redirectUri]
    );

    // Build OAuth URL
    const params = new URLSearchParams({
      client_id: app.app_id,
      redirect_uri: process.env.SOCIAL_OAUTH_REDIRECT_BASE + '/facebook/callback',
      state,
      scope: config.scopes.join(','),
      response_type: 'code',
    });

    const authUrl = `${config.authUrl}?${params.toString()}`;

    return c.json({
      success: true,
      auth_url: authUrl,
      state,
    });
  } catch (error) {
    console.error('Facebook OAuth initiation error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/oauth/twitter/connect
 * Initiate Twitter OAuth 2.0 flow with PKCE
 */
oauth.get('/twitter/connect', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const redirectUri = c.req.query('redirect_uri') || process.env.SOCIAL_OAUTH_REDIRECT_BASE + '/twitter/callback';

    const app = await getPlatformApp('twitter');
    const config = OAUTH_CONFIGS.twitter;

    // Create state and PKCE challenge
    const state = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    // Store state and code verifier
    await pool.query(
      `INSERT INTO oauth_states (state, tenant_id, platform, redirect_uri, code_verifier, created_at, expires_at)
       VALUES ($1, $2, 'twitter', $3, $4, NOW(), NOW() + INTERVAL '10 minutes')`,
      [state, tenantId, redirectUri, codeVerifier]
    );

    // Build OAuth URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: app.app_id,
      redirect_uri: process.env.SOCIAL_OAUTH_REDIRECT_BASE + '/twitter/callback',
      scope: config.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${config.authUrl}?${params.toString()}`;

    return c.json({
      success: true,
      auth_url: authUrl,
      state,
    });
  } catch (error) {
    console.error('Twitter OAuth initiation error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/oauth/instagram/connect
 * Initiate Instagram OAuth flow (via Facebook)
 */
oauth.get('/instagram/connect', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const redirectUri = c.req.query('redirect_uri') || process.env.SOCIAL_OAUTH_REDIRECT_BASE + '/instagram/callback';

    const app = await getPlatformApp('instagram');
    const config = OAUTH_CONFIGS.instagram;

    const state = crypto.randomBytes(32).toString('hex');

    await pool.query(
      `INSERT INTO oauth_states (state, tenant_id, platform, redirect_uri, created_at, expires_at)
       VALUES ($1, $2, 'instagram', $3, NOW(), NOW() + INTERVAL '10 minutes')`,
      [state, tenantId, redirectUri]
    );

    const params = new URLSearchParams({
      client_id: app.app_id,
      redirect_uri: process.env.SOCIAL_OAUTH_REDIRECT_BASE + '/instagram/callback',
      state,
      scope: config.scopes.join(','),
      response_type: 'code',
    });

    const authUrl = `${config.authUrl}?${params.toString()}`;

    return c.json({
      success: true,
      auth_url: authUrl,
      state,
    });
  } catch (error) {
    console.error('Instagram OAuth initiation error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/oauth/linkedin/connect
 * Initiate LinkedIn OAuth flow
 */
oauth.get('/linkedin/connect', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const redirectUri = c.req.query('redirect_uri') || process.env.SOCIAL_OAUTH_REDIRECT_BASE + '/linkedin/callback';

    const app = await getPlatformApp('linkedin');
    const config = OAUTH_CONFIGS.linkedin;

    const state = crypto.randomBytes(32).toString('hex');

    await pool.query(
      `INSERT INTO oauth_states (state, tenant_id, platform, redirect_uri, created_at, expires_at)
       VALUES ($1, $2, 'linkedin', $3, NOW(), NOW() + INTERVAL '10 minutes')`,
      [state, tenantId, redirectUri]
    );

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: app.app_id,
      redirect_uri: process.env.SOCIAL_OAUTH_REDIRECT_BASE + '/linkedin/callback',
      state,
      scope: config.scopes.join(' '),
    });

    const authUrl = `${config.authUrl}?${params.toString()}`;

    return c.json({
      success: true,
      auth_url: authUrl,
      state,
    });
  } catch (error) {
    console.error('LinkedIn OAuth initiation error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// =============================================================================
// OAuth Callback Routes
// =============================================================================

/**
 * GET /v1/social/oauth/callback/facebook
 * Handle Facebook OAuth callback
 */
oauth.get('/callback/facebook', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
      return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=${error}`);
    }

    // Verify state
    const { rows: stateRows } = await pool.query(
      `SELECT * FROM oauth_states WHERE state = $1 AND platform = 'facebook' AND expires_at > NOW()`,
      [state]
    );

    if (stateRows.length === 0) {
      return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=invalid_state`);
    }

    const oauthState = stateRows[0];
    const tenantId = oauthState.tenant_id;

    // Delete used state
    await pool.query('DELETE FROM oauth_states WHERE state = $1', [state]);

    // Exchange code for token
    const app = await getPlatformApp('facebook');

    const tokenResponse = await fetch(OAUTH_CONFIGS.facebook.tokenUrl + '?' + new URLSearchParams({
      client_id: app.app_id,
      client_secret: app.app_secret,
      redirect_uri: process.env.SOCIAL_OAUTH_REDIRECT_BASE + '/facebook/callback',
      code,
    }));

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Facebook token exchange error:', tokenData);
      return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=token_exchange_failed`);
    }

    // Get long-lived token
    const longLivedResponse = await fetch(OAUTH_CONFIGS.facebook.tokenUrl + '?' + new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: app.app_id,
      client_secret: app.app_secret,
      fb_exchange_token: tokenData.access_token,
    }));

    const longLivedData = await longLivedResponse.json();
    const accessToken = longLivedData.access_token || tokenData.access_token;

    // Get user info and pages
    const userResponse = await fetch(`https://graph.facebook.com/v18.0/me?access_token=${accessToken}&fields=id,name,email`);
    const userData = await userResponse.json();

    const pagesResponse = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}&fields=id,name,access_token,picture`);
    const pagesData = await pagesResponse.json();

    // Store each page
    for (const page of pagesData.data || []) {
      await pool.query(
        `INSERT INTO facebook_pages
         (tenant_id, page_id, page_name, page_access_token_encrypted, profile_picture_url, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'active', NOW())
         ON CONFLICT (tenant_id, page_id)
         DO UPDATE SET page_name = $3, page_access_token_encrypted = $4, profile_picture_url = $5, updated_at = NOW()`,
        [
          tenantId,
          page.id,
          page.name,
          encrypt(page.access_token),
          page.picture?.data?.url || null,
        ]
      );
    }

    // Redirect back to Customer Portal
    const pageCount = pagesData.data?.length || 0;
    return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?success=facebook&pages=${pageCount}`);
  } catch (error) {
    console.error('Facebook OAuth callback error:', error);
    return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=server_error`);
  }
});

/**
 * GET /v1/social/oauth/callback/twitter
 * Handle Twitter OAuth callback
 */
oauth.get('/callback/twitter', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
      return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=${error}`);
    }

    // Verify state
    const { rows: stateRows } = await pool.query(
      `SELECT * FROM oauth_states WHERE state = $1 AND platform = 'twitter' AND expires_at > NOW()`,
      [state]
    );

    if (stateRows.length === 0) {
      return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=invalid_state`);
    }

    const oauthState = stateRows[0];
    const tenantId = oauthState.tenant_id;
    const codeVerifier = oauthState.code_verifier;

    // Delete used state
    await pool.query('DELETE FROM oauth_states WHERE state = $1', [state]);

    // Exchange code for token
    const app = await getPlatformApp('twitter');

    const tokenResponse = await fetch(OAUTH_CONFIGS.twitter.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${app.app_id}:${app.app_secret}`).toString('base64'),
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.SOCIAL_OAUTH_REDIRECT_BASE + '/twitter/callback',
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Twitter token exchange error:', tokenData);
      return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=token_exchange_failed`);
    }

    // Get user info
    const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,username,name', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResponse.json();

    // Store Twitter account
    await pool.query(
      `INSERT INTO twitter_accounts
       (tenant_id, user_id, username, display_name, profile_image_url, access_token_encrypted, refresh_token_encrypted, token_expires_at, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '2 hours', 'active', NOW())
       ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET username = $3, display_name = $4, profile_image_url = $5, access_token_encrypted = $6, refresh_token_encrypted = $7, token_expires_at = NOW() + INTERVAL '2 hours', updated_at = NOW()`,
      [
        tenantId,
        userData.data.id,
        userData.data.username,
        userData.data.name,
        userData.data.profile_image_url,
        encrypt(tokenData.access_token),
        tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
      ]
    );

    return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?success=twitter`);
  } catch (error) {
    console.error('Twitter OAuth callback error:', error);
    return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=server_error`);
  }
});

/**
 * GET /v1/social/oauth/callback/instagram
 * Handle Instagram OAuth callback
 */
oauth.get('/callback/instagram', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
      return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=${error}`);
    }

    // Verify state
    const { rows: stateRows } = await pool.query(
      `SELECT * FROM oauth_states WHERE state = $1 AND platform = 'instagram' AND expires_at > NOW()`,
      [state]
    );

    if (stateRows.length === 0) {
      return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=invalid_state`);
    }

    const oauthState = stateRows[0];
    const tenantId = oauthState.tenant_id;

    // Delete used state
    await pool.query('DELETE FROM oauth_states WHERE state = $1', [state]);

    // Exchange code for token (same as Facebook)
    const app = await getPlatformApp('instagram');

    const tokenResponse = await fetch(OAUTH_CONFIGS.instagram.tokenUrl + '?' + new URLSearchParams({
      client_id: app.app_id,
      client_secret: app.app_secret,
      redirect_uri: process.env.SOCIAL_OAUTH_REDIRECT_BASE + '/instagram/callback',
      code,
    }));

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Instagram token exchange error:', tokenData);
      return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=token_exchange_failed`);
    }

    // Get Instagram accounts linked to Facebook pages
    const pagesResponse = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${tokenData.access_token}&fields=id,instagram_business_account{id,name,username,profile_picture_url}`);
    const pagesData = await pagesResponse.json();

    let igAccountCount = 0;

    // Store each Instagram account
    for (const page of pagesData.data || []) {
      if (page.instagram_business_account) {
        const igAccount = page.instagram_business_account;

        await pool.query(
          `INSERT INTO instagram_accounts
           (tenant_id, ig_user_id, username, display_name, profile_picture_url, facebook_page_id, access_token_encrypted, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())
           ON CONFLICT (tenant_id, ig_user_id)
           DO UPDATE SET username = $3, display_name = $4, profile_picture_url = $5, access_token_encrypted = $7, updated_at = NOW()`,
          [
            tenantId,
            igAccount.id,
            igAccount.username,
            igAccount.name,
            igAccount.profile_picture_url,
            page.id,
            encrypt(tokenData.access_token),
          ]
        );

        igAccountCount++;
      }
    }

    return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?success=instagram&accounts=${igAccountCount}`);
  } catch (error) {
    console.error('Instagram OAuth callback error:', error);
    return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=server_error`);
  }
});

/**
 * GET /v1/social/oauth/callback/linkedin
 * Handle LinkedIn OAuth callback
 */
oauth.get('/callback/linkedin', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
      return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=${error}`);
    }

    // Verify state
    const { rows: stateRows } = await pool.query(
      `SELECT * FROM oauth_states WHERE state = $1 AND platform = 'linkedin' AND expires_at > NOW()`,
      [state]
    );

    if (stateRows.length === 0) {
      return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=invalid_state`);
    }

    const oauthState = stateRows[0];
    const tenantId = oauthState.tenant_id;

    // Delete used state
    await pool.query('DELETE FROM oauth_states WHERE state = $1', [state]);

    // Exchange code for token
    const app = await getPlatformApp('linkedin');

    const tokenResponse = await fetch(OAUTH_CONFIGS.linkedin.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.SOCIAL_OAUTH_REDIRECT_BASE + '/linkedin/callback',
        client_id: app.app_id,
        client_secret: app.app_secret,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('LinkedIn token exchange error:', tokenData);
      return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=token_exchange_failed`);
    }

    // Get organization pages the user manages
    const orgsResponse = await fetch('https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&projection=(elements*(organizationalTarget~(localizedName,vanityName,logoV2(original~:playableStreams,cropped~:playableStreams))))', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });
    const orgsData = await orgsResponse.json();

    let pageCount = 0;

    // Store each LinkedIn page
    for (const element of orgsData.elements || []) {
      const org = element['organizationalTarget~'];
      if (org) {
        const orgId = element.organizationalTarget.replace('urn:li:organization:', '');

        await pool.query(
          `INSERT INTO linkedin_pages
           (tenant_id, organization_id, organization_name, vanity_name, logo_url, access_token_encrypted, token_expires_at, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '60 days', 'active', NOW())
           ON CONFLICT (tenant_id, organization_id)
           DO UPDATE SET organization_name = $3, vanity_name = $4, logo_url = $5, access_token_encrypted = $6, token_expires_at = NOW() + INTERVAL '60 days', updated_at = NOW()`,
          [
            tenantId,
            orgId,
            org.localizedName,
            org.vanityName,
            org.logoV2?.['original~']?.elements?.[0]?.identifiers?.[0]?.identifier || null,
            encrypt(tokenData.access_token),
          ]
        );

        pageCount++;
      }
    }

    return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?success=linkedin&pages=${pageCount}`);
  } catch (error) {
    console.error('LinkedIn OAuth callback error:', error);
    return c.redirect(`${process.env.CUSTOMER_PORTAL_URL}/social/connect?error=server_error`);
  }
});

// =============================================================================
// Account Management Routes
// =============================================================================

/**
 * GET /v1/social/oauth/accounts
 * Get all connected social accounts for tenant
 */
oauth.get('/accounts', async (c) => {
  try {
    const tenantId = c.get('tenant_id');

    // Get all connected accounts
    const [facebookPages, twitterAccounts, instagramAccounts, linkedinPages] = await Promise.all([
      pool.query(
        `SELECT id, page_id, page_name, profile_picture_url, status, created_at, updated_at
         FROM facebook_pages WHERE tenant_id = $1 ORDER BY page_name`,
        [tenantId]
      ),
      pool.query(
        `SELECT id, user_id, username, display_name, profile_image_url, status, created_at, updated_at
         FROM twitter_accounts WHERE tenant_id = $1 ORDER BY username`,
        [tenantId]
      ),
      pool.query(
        `SELECT id, ig_user_id, username, display_name, profile_picture_url, status, created_at, updated_at
         FROM instagram_accounts WHERE tenant_id = $1 ORDER BY username`,
        [tenantId]
      ),
      pool.query(
        `SELECT id, organization_id, organization_name, vanity_name, logo_url, status, created_at, updated_at
         FROM linkedin_pages WHERE tenant_id = $1 ORDER BY organization_name`,
        [tenantId]
      ),
    ]);

    return c.json({
      success: true,
      accounts: {
        facebook: facebookPages.rows,
        twitter: twitterAccounts.rows,
        instagram: instagramAccounts.rows,
        linkedin: linkedinPages.rows,
      },
      summary: {
        facebook: facebookPages.rows.length,
        twitter: twitterAccounts.rows.length,
        instagram: instagramAccounts.rows.length,
        linkedin: linkedinPages.rows.length,
        total: facebookPages.rows.length + twitterAccounts.rows.length + instagramAccounts.rows.length + linkedinPages.rows.length,
      },
    });
  } catch (error) {
    console.error('Get social accounts error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/social/oauth/accounts/facebook/:pageId
 * Disconnect a Facebook page
 */
oauth.delete('/accounts/facebook/:pageId', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const pageId = c.req.param('pageId');

    const result = await pool.query(
      `DELETE FROM facebook_pages WHERE tenant_id = $1 AND id = $2 RETURNING id, page_name`,
      [tenantId, pageId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Page not found' }, 404);
    }

    return c.json({
      success: true,
      message: `Disconnected Facebook page: ${result.rows[0].page_name}`,
    });
  } catch (error) {
    console.error('Delete Facebook page error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/social/oauth/accounts/twitter/:accountId
 * Disconnect a Twitter account
 */
oauth.delete('/accounts/twitter/:accountId', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const accountId = c.req.param('accountId');

    const result = await pool.query(
      `DELETE FROM twitter_accounts WHERE tenant_id = $1 AND id = $2 RETURNING id, username`,
      [tenantId, accountId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Account not found' }, 404);
    }

    return c.json({
      success: true,
      message: `Disconnected Twitter account: @${result.rows[0].username}`,
    });
  } catch (error) {
    console.error('Delete Twitter account error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/social/oauth/accounts/instagram/:accountId
 * Disconnect an Instagram account
 */
oauth.delete('/accounts/instagram/:accountId', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const accountId = c.req.param('accountId');

    const result = await pool.query(
      `DELETE FROM instagram_accounts WHERE tenant_id = $1 AND id = $2 RETURNING id, username`,
      [tenantId, accountId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Account not found' }, 404);
    }

    return c.json({
      success: true,
      message: `Disconnected Instagram account: @${result.rows[0].username}`,
    });
  } catch (error) {
    console.error('Delete Instagram account error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * DELETE /v1/social/oauth/accounts/linkedin/:pageId
 * Disconnect a LinkedIn page
 */
oauth.delete('/accounts/linkedin/:pageId', async (c) => {
  try {
    const tenantId = c.get('tenant_id');
    const pageId = c.req.param('pageId');

    const result = await pool.query(
      `DELETE FROM linkedin_pages WHERE tenant_id = $1 AND id = $2 RETURNING id, organization_name`,
      [tenantId, pageId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Page not found' }, 404);
    }

    return c.json({
      success: true,
      message: `Disconnected LinkedIn page: ${result.rows[0].organization_name}`,
    });
  } catch (error) {
    console.error('Delete LinkedIn page error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /v1/social/oauth/platforms
 * Get available platforms and their status
 */
oauth.get('/platforms', async (c) => {
  try {
    const { rows } = await pool.query(
      `SELECT platform, is_enabled, oauth_scopes, created_at
       FROM social_platform_apps
       ORDER BY platform`
    );

    return c.json({
      success: true,
      platforms: rows.map(p => ({
        platform: p.platform,
        enabled: p.is_enabled,
        scopes: p.oauth_scopes,
      })),
    });
  } catch (error) {
    console.error('Get platforms error:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default oauth;
