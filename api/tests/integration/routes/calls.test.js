/**
 * Calls Routes Integration Tests
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import { generateUUID, generatePhoneNumber, generateTestToken } from '../../helpers.js';

// Mock dependencies
const mockQuery = jest.fn();
const mockTwilioCall = jest.fn();

jest.unstable_mockModule('../../../src/db.js', () => ({
  default: { query: mockQuery },
  query: mockQuery
}));

jest.unstable_mockModule('twilio', () => ({
  default: jest.fn(() => ({
    calls: {
      create: mockTwilioCall
    }
  }))
}));

describe('Calls Routes', () => {
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
  });

  describe('POST /api/v1/calls', () => {
    it('should initiate an outbound call', async () => {
      const to = generatePhoneNumber();
      const from = generatePhoneNumber();
      const callSid = 'CA' + generateUUID().replace(/-/g, '');

      mockTwilioCall.mockResolvedValueOnce({
        sid: callSid,
        status: 'queued',
        to,
        from
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({ rows: [{ number: from, tenant_id: tenantId }] })
        .mockResolvedValueOnce({
          rows: [{
            id: generateUUID(),
            twilio_sid: callSid,
            to,
            from,
            status: 'queued',
            direction: 'outbound'
          }]
        });

      const response = await request(app)
        .post('/api/v1/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ to, from });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.direction).toBe('outbound');
    });

    it('should initiate call with TwiML URL', async () => {
      const callSid = 'CA' + generateUUID().replace(/-/g, '');

      mockTwilioCall.mockResolvedValueOnce({
        sid: callSid,
        status: 'queued'
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({ rows: [{ number: '+15551234567', tenant_id: tenantId }] })
        .mockResolvedValueOnce({ rows: [{ id: generateUUID() }] });

      const response = await request(app)
        .post('/api/v1/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          to: generatePhoneNumber(),
          from: '+15551234567',
          twimlUrl: 'https://example.com/twiml'
        });

      expect(response.status).toBe(201);
      expect(mockTwilioCall).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/twiml'
        })
      );
    });

    it('should reject invalid phone number', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] });

      const response = await request(app)
        .post('/api/v1/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          to: 'not-a-phone-number',
          from: generatePhoneNumber()
        });

      expect(response.status).toBe(400);
    });

    it('should handle Twilio API errors', async () => {
      mockTwilioCall.mockRejectedValueOnce(new Error('Twilio error'));

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({ rows: [{ number: '+15551234567', tenant_id: tenantId }] });

      const response = await request(app)
        .post('/api/v1/calls')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          to: generatePhoneNumber(),
          from: '+15551234567'
        });

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/v1/calls/:id', () => {
    it('should retrieve call details', async () => {
      const callId = generateUUID();

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({
          rows: [{
            id: callId,
            tenant_id: tenantId,
            to: generatePhoneNumber(),
            from: generatePhoneNumber(),
            status: 'completed',
            duration: 120,
            direction: 'outbound',
            created_at: new Date(),
            ended_at: new Date()
          }]
        });

      const response = await request(app)
        .get(`/api/v1/calls/${callId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(callId);
      expect(response.body.duration).toBe(120);
    });

    it('should return 404 for non-existent call', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`/api/v1/calls/${generateUUID()}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/calls', () => {
    it('should list calls with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({ rows: [{ count: 100 }] })
        .mockResolvedValueOnce({
          rows: Array(20).fill(null).map(() => ({
            id: generateUUID(),
            tenant_id: tenantId,
            status: 'completed'
          }))
        });

      const response = await request(app)
        .get('/api/v1/calls')
        .query({ page: 1, limit: 20 })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(20);
      expect(response.body.pagination.total).toBe(100);
    });

    it('should filter by direction', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({ rows: [{ count: 10 }] })
        .mockResolvedValueOnce({
          rows: Array(10).fill(null).map(() => ({
            id: generateUUID(),
            direction: 'inbound'
          }))
        });

      const response = await request(app)
        .get('/api/v1/calls')
        .query({ direction: 'inbound' })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.every(c => c.direction === 'inbound')).toBe(true);
    });

    it('should filter by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({ rows: [{ count: 5 }] })
        .mockResolvedValueOnce({
          rows: Array(5).fill(null).map(() => ({
            id: generateUUID(),
            status: 'in-progress'
          }))
        });

      const response = await request(app)
        .get('/api/v1/calls')
        .query({ status: 'in-progress' })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/v1/calls/:id/actions', () => {
    it('should hangup an active call', async () => {
      const callId = generateUUID();

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({
          rows: [{
            id: callId,
            tenant_id: tenantId,
            twilio_sid: 'CA123',
            status: 'in-progress'
          }]
        })
        .mockResolvedValueOnce({ rows: [{ status: 'completed' }] });

      const response = await request(app)
        .post(`/api/v1/calls/${callId}/actions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action: 'hangup' });

      expect(response.status).toBe(200);
    });

    it('should hold/unhold a call', async () => {
      const callId = generateUUID();

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({
          rows: [{
            id: callId,
            tenant_id: tenantId,
            status: 'in-progress'
          }]
        })
        .mockResolvedValueOnce({ rows: [{ status: 'in-progress', on_hold: true }] });

      const response = await request(app)
        .post(`/api/v1/calls/${callId}/actions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action: 'hold' });

      expect(response.status).toBe(200);
    });

    it('should transfer a call', async () => {
      const callId = generateUUID();
      const transferTo = generatePhoneNumber();

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({
          rows: [{
            id: callId,
            tenant_id: tenantId,
            status: 'in-progress'
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post(`/api/v1/calls/${callId}/actions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action: 'transfer', transferTo });

      expect(response.status).toBe(200);
    });

    it('should reject invalid action', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] });

      const response = await request(app)
        .post(`/api/v1/calls/${generateUUID()}/actions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ action: 'invalid-action' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/calls/webhook', () => {
    it('should handle call status webhook', async () => {
      const callSid = 'CA' + generateUUID().replace(/-/g, '');

      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: generateUUID(), twilio_sid: callSid }]
        })
        .mockResolvedValueOnce({
          rows: [{ status: 'completed', duration: 60 }]
        });

      const response = await request(app)
        .post('/api/v1/calls/webhook')
        .send({
          CallSid: callSid,
          CallStatus: 'completed',
          CallDuration: 60
        });

      expect(response.status).toBe(200);
    });

    it('should handle incoming call webhook', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: generateUUID() }]
      });

      const response = await request(app)
        .post('/api/v1/calls/webhook/incoming')
        .send({
          CallSid: 'CA' + generateUUID().replace(/-/g, ''),
          From: generatePhoneNumber(),
          To: generatePhoneNumber(),
          Direction: 'inbound'
        });

      expect(response.status).toBe(200);
      expect(response.type).toMatch(/xml/);
    });
  });

  describe('GET /api/v1/calls/:id/recording', () => {
    it('should retrieve call recording', async () => {
      const callId = generateUUID();

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({
          rows: [{
            id: callId,
            tenant_id: tenantId,
            recording_url: 'https://api.twilio.com/recording.wav',
            recording_duration: 120
          }]
        });

      const response = await request(app)
        .get(`/api/v1/calls/${callId}/recording`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('recording_url');
    });

    it('should return 404 when no recording exists', async () => {
      const callId = generateUUID();

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({
          rows: [{
            id: callId,
            tenant_id: tenantId,
            recording_url: null
          }]
        });

      const response = await request(app)
        .get(`/api/v1/calls/${callId}/recording`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/calls/analytics', () => {
    it('should return call analytics', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: userId, tenant_id: tenantId }] })
        .mockResolvedValueOnce({
          rows: [{
            total_calls: 1000,
            total_duration: 50000,
            avg_duration: 50,
            answered_rate: 85,
            inbound_count: 600,
            outbound_count: 400
          }]
        });

      const response = await request(app)
        .get('/api/v1/calls/analytics')
        .query({ period: '30d' })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total_calls');
      expect(response.body).toHaveProperty('avg_duration');
    });
  });
});
