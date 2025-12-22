/**
 * SMS Routes Integration Tests
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import { generateUUID, generatePhoneNumber, generateTestToken } from '../../helpers.js';

// Mock dependencies
const mockQuery = jest.fn();
const mockTwilioCreate = jest.fn();

jest.unstable_mockModule('../../../src/db.js', () => ({
  default: { query: mockQuery },
  query: mockQuery
}));

jest.unstable_mockModule('twilio', () => ({
  default: jest.fn(() => ({
    messages: {
      create: mockTwilioCreate
    }
  }))
}));

describe('SMS Routes', () => {
  let app;
  let authToken;
  const tenantId = generateUUID();
  const userId = generateUUID();

  beforeAll(async () => {
    authToken = generateTestToken({ userId, tenantId, role: 'admin' });
    const appModule = await import('../../../src/index.js');
    app = appModule.default || appModule.app;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default auth mock
    mockQuery.mockImplementation((query) => {
      if (query.includes('SELECT') && query.includes('users')) {
        return { rows: [{ id: userId, tenant_id: tenantId, role: 'admin' }] };
      }
      return { rows: [] };
    });
  });

  describe('POST /api/v1/sms/send', () => {
    it('should send SMS successfully', async () => {
      const to = generatePhoneNumber();
      const from = generatePhoneNumber();
      const body = 'Test message';
      const messageSid = 'SM' + generateUUID().replace(/-/g, '');

      mockTwilioCreate.mockResolvedValueOnce({
        sid: messageSid,
        status: 'queued',
        to,
        from,
        body
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] }) // Auth
        .mockResolvedValueOnce({ rows: [{ number: from, tenant_id: tenantId }] }) // Verify from number
        .mockResolvedValueOnce({
          rows: [{
            id: generateUUID(),
            twilio_sid: messageSid,
            to,
            from,
            body,
            status: 'queued'
          }]
        });

      const response = await request(app)
        .post('/api/v1/sms/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ to, from, body });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('queued');
    });

    it('should reject invalid phone number', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] });

      const response = await request(app)
        .post('/api/v1/sms/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          to: 'invalid-number',
          from: generatePhoneNumber(),
          body: 'Test'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/phone|number/i);
    });

    it('should reject empty message body', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] });

      const response = await request(app)
        .post('/api/v1/sms/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          to: generatePhoneNumber(),
          from: generatePhoneNumber(),
          body: ''
        });

      expect(response.status).toBe(400);
    });

    it('should reject message exceeding character limit', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] });

      const response = await request(app)
        .post('/api/v1/sms/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          to: generatePhoneNumber(),
          from: generatePhoneNumber(),
          body: 'x'.repeat(1601) // Over 1600 char limit
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/length|character/i);
    });

    it('should reject unauthorized from number', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({ rows: [] }); // Number not found

      const response = await request(app)
        .post('/api/v1/sms/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          to: generatePhoneNumber(),
          from: generatePhoneNumber(),
          body: 'Test'
        });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/sms/:id', () => {
    it('should retrieve SMS message by ID', async () => {
      const messageId = generateUUID();

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({
          rows: [{
            id: messageId,
            tenant_id: tenantId,
            to: generatePhoneNumber(),
            from: generatePhoneNumber(),
            body: 'Test message',
            status: 'delivered',
            created_at: new Date()
          }]
        });

      const response = await request(app)
        .get(`/api/v1/sms/${messageId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(messageId);
    });

    it('should return 404 for non-existent message', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`/api/v1/sms/${generateUUID()}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it('should prevent accessing other tenant messages', async () => {
      const messageId = generateUUID();
      const otherTenantId = generateUUID();

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({
          rows: [{
            id: messageId,
            tenant_id: otherTenantId // Different tenant
          }]
        });

      const response = await request(app)
        .get(`/api/v1/sms/${messageId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/sms', () => {
    it('should list SMS messages with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({ rows: [{ count: 50 }] })
        .mockResolvedValueOnce({
          rows: Array(10).fill(null).map(() => ({
            id: generateUUID(),
            tenant_id: tenantId,
            to: generatePhoneNumber(),
            status: 'delivered'
          }))
        });

      const response = await request(app)
        .get('/api/v1/sms')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(10);
      expect(response.body).toHaveProperty('pagination');
    });

    it('should filter by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({ rows: [{ count: 5 }] })
        .mockResolvedValueOnce({
          rows: Array(5).fill(null).map(() => ({
            id: generateUUID(),
            status: 'delivered'
          }))
        });

      const response = await request(app)
        .get('/api/v1/sms')
        .query({ status: 'delivered' })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.every(m => m.status === 'delivered')).toBe(true);
    });

    it('should filter by date range', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })
        .mockResolvedValueOnce({ rows: [{ id: generateUUID() }] });

      const response = await request(app)
        .get('/api/v1/sms')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/v1/sms/webhook', () => {
    it('should handle status webhook callback', async () => {
      const messageSid = 'SM' + generateUUID().replace(/-/g, '');

      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: generateUUID(), twilio_sid: messageSid }]
        })
        .mockResolvedValueOnce({
          rows: [{ id: generateUUID(), status: 'delivered' }]
        });

      const response = await request(app)
        .post('/api/v1/sms/webhook')
        .send({
          MessageSid: messageSid,
          MessageStatus: 'delivered'
        });

      expect(response.status).toBe(200);
    });

    it('should handle incoming SMS webhook', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: generateUUID() }]
      });

      const response = await request(app)
        .post('/api/v1/sms/webhook/incoming')
        .send({
          From: generatePhoneNumber(),
          To: generatePhoneNumber(),
          Body: 'Incoming message',
          MessageSid: 'SM' + generateUUID().replace(/-/g, '')
        });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/v1/sms/bulk', () => {
    it('should send bulk SMS messages', async () => {
      const recipients = [
        generatePhoneNumber(),
        generatePhoneNumber(),
        generatePhoneNumber()
      ];

      mockTwilioCreate.mockResolvedValue({
        sid: 'SM' + generateUUID().replace(/-/g, ''),
        status: 'queued'
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({ rows: [{ number: generatePhoneNumber(), tenant_id: tenantId }] })
        .mockResolvedValue({ rows: [{ id: generateUUID() }] });

      const response = await request(app)
        .post('/api/v1/sms/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipients,
          from: generatePhoneNumber(),
          body: 'Bulk test message'
        });

      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('jobId');
      expect(response.body).toHaveProperty('recipientCount', 3);
    });

    it('should reject bulk send with too many recipients', async () => {
      const recipients = Array(10001).fill(null).map(() => generatePhoneNumber());

      mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] });

      const response = await request(app)
        .post('/api/v1/sms/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipients,
          from: generatePhoneNumber(),
          body: 'Test'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/limit|too many/i);
    });
  });

  describe('GET /api/v1/sms/analytics', () => {
    it('should return SMS analytics', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({
          rows: [{
            total_sent: 1000,
            total_delivered: 950,
            total_failed: 50,
            delivery_rate: 95
          }]
        });

      const response = await request(app)
        .get('/api/v1/sms/analytics')
        .query({ period: '30d' })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total_sent');
      expect(response.body).toHaveProperty('delivery_rate');
    });
  });
});
