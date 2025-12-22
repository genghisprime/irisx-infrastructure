/**
 * Auth Routes Integration Tests
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import { generateUUID, generateEmail, generateTestToken } from '../../helpers.js';

// Mock database
const mockQuery = jest.fn();
jest.unstable_mockModule('../../../src/db.js', () => ({
  default: { query: mockQuery },
  query: mockQuery
}));

// Mock bcrypt
jest.unstable_mockModule('bcrypt', () => ({
  default: {
    hash: jest.fn(async (password) => `hashed_${password}`),
    compare: jest.fn(async (password, hash) => hash === `hashed_${password}`)
  }
}));

describe('Auth Routes', () => {
  let app;

  beforeAll(async () => {
    // Import app after mocks are set up
    const appModule = await import('../../../src/index.js');
    app = appModule.default || appModule.app;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const email = generateEmail();
      const userId = generateUUID();
      const tenantId = generateUUID();

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // Check existing user
        .mockResolvedValueOnce({ rows: [{ id: tenantId }] }) // Create tenant
        .mockResolvedValueOnce({
          rows: [{
            id: userId,
            email,
            tenant_id: tenantId,
            role: 'admin'
          }]
        }); // Create user

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'SecureP@ssword123!',
          companyName: 'Test Company'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
    });

    it('should reject registration with existing email', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: generateUUID() }]
      }); // User exists

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'SecureP@ssword123!',
          companyName: 'Test Company'
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject weak passwords', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: generateEmail(),
          password: 'weak',
          companyName: 'Test Company'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/password/i);
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'not-an-email',
          password: 'SecureP@ssword123!',
          companyName: 'Test Company'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/email/i);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const email = 'test@example.com';
      const userId = generateUUID();
      const tenantId = generateUUID();

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: userId,
          email,
          password_hash: 'hashed_SecureP@ssword123!',
          tenant_id: tenantId,
          role: 'admin',
          is_active: true
        }]
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'SecureP@ssword123!'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(email);
    });

    it('should reject invalid password', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: generateUUID(),
          email: 'test@example.com',
          password_hash: 'hashed_correctPassword',
          is_active: true
        }]
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongPassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/invalid/i);
    });

    it('should reject login for inactive users', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: generateUUID(),
          email: 'inactive@example.com',
          password_hash: 'hashed_password',
          is_active: false
        }]
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'inactive@example.com',
          password: 'password'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/inactive|disabled/i);
    });

    it('should reject non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user with valid token', async () => {
      const userId = generateUUID();
      const tenantId = generateUUID();
      const token = generateTestToken({ userId, tenantId });

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: userId,
          email: 'test@example.com',
          tenant_id: tenantId,
          role: 'admin'
        }]
      });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', userId);
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me');

      expect(response.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    it('should reject request with expired token', async () => {
      const token = generateTestToken({}, '-1h'); // Expired 1 hour ago

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh token successfully', async () => {
      const userId = generateUUID();
      const tenantId = generateUUID();
      const refreshToken = generateTestToken({ userId, tenantId, type: 'refresh' }, '7d');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: userId,
          tenant_id: tenantId,
          is_active: true
        }]
      });

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully', async () => {
      const token = generateTestToken();

      mockQuery.mockResolvedValueOnce({ rows: [] }); // Blacklist token

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should initiate password reset', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: generateUUID(), email: 'test@example.com' }]
        })
        .mockResolvedValueOnce({ rows: [] }); // Create reset token

      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'test@example.com' });

      // Should always return 200 to prevent email enumeration
      expect(response.status).toBe(200);
    });

    it('should return 200 even for non-existent email', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    it('should reset password with valid token', async () => {
      const resetToken = 'valid-reset-token';

      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            user_id: generateUUID(),
            expires_at: new Date(Date.now() + 3600000),
            used: false
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // Update password
        .mockResolvedValueOnce({ rows: [] }); // Mark token used

      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          password: 'NewSecureP@ssword123!'
        });

      expect(response.status).toBe(200);
    });

    it('should reject expired reset token', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: generateUUID(),
          expires_at: new Date(Date.now() - 3600000), // Expired
          used: false
        }]
      });

      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'expired-token',
          password: 'NewSecureP@ssword123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/expired/i);
    });
  });
});
