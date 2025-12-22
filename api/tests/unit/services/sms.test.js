/**
 * SMS Service Unit Tests
 */

import { jest } from '@jest/globals';
import { generateUUID, generatePhoneNumber, createTestContext } from '../../helpers.js';

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

describe('SMS Service', () => {
  let smsService;
  let testContext;

  beforeEach(async () => {
    jest.clearAllMocks();
    testContext = createTestContext();

    // Dynamic import after mocking
    const smsModule = await import('../../../src/services/sms.js');
    smsService = smsModule.default || smsModule;
  });

  describe('sendSMS', () => {
    it('should send SMS successfully', async () => {
      const messageSid = 'SM' + generateUUID().replace(/-/g, '');
      const to = generatePhoneNumber();
      const from = generatePhoneNumber();
      const body = 'Test message';

      mockTwilioCreate.mockResolvedValueOnce({
        sid: messageSid,
        status: 'queued',
        to,
        from,
        body
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: generateUUID(),
          twilio_sid: messageSid,
          status: 'queued'
        }]
      });

      const result = await smsService.send({
        tenantId: testContext.tenant.id,
        to,
        from,
        body
      });

      expect(result).toBeDefined();
      expect(result.twilio_sid).toBe(messageSid);
      expect(mockTwilioCreate).toHaveBeenCalledWith(expect.objectContaining({
        to,
        from,
        body
      }));
    });

    it('should validate phone number format', async () => {
      await expect(
        smsService.send({
          tenantId: testContext.tenant.id,
          to: 'invalid-number',
          from: generatePhoneNumber(),
          body: 'Test'
        })
      ).rejects.toThrow(/invalid.*phone/i);
    });

    it('should reject empty message body', async () => {
      await expect(
        smsService.send({
          tenantId: testContext.tenant.id,
          to: generatePhoneNumber(),
          from: generatePhoneNumber(),
          body: ''
        })
      ).rejects.toThrow();
    });

    it('should handle Twilio API errors', async () => {
      mockTwilioCreate.mockRejectedValueOnce(new Error('Twilio API error'));

      await expect(
        smsService.send({
          tenantId: testContext.tenant.id,
          to: generatePhoneNumber(),
          from: generatePhoneNumber(),
          body: 'Test message'
        })
      ).rejects.toThrow('Twilio API error');
    });
  });

  describe('sendBulkSMS', () => {
    it('should send multiple SMS messages', async () => {
      const recipients = [
        generatePhoneNumber(),
        generatePhoneNumber(),
        generatePhoneNumber()
      ];

      mockTwilioCreate.mockResolvedValue({
        sid: 'SM' + generateUUID().replace(/-/g, ''),
        status: 'queued'
      });

      mockQuery.mockResolvedValue({ rows: [{ id: generateUUID() }] });

      const results = await smsService.sendBulk({
        tenantId: testContext.tenant.id,
        recipients,
        from: generatePhoneNumber(),
        body: 'Bulk test message'
      });

      expect(results.length).toBe(recipients.length);
      expect(mockTwilioCreate).toHaveBeenCalledTimes(recipients.length);
    });

    it('should handle partial failures in bulk send', async () => {
      const recipients = [generatePhoneNumber(), generatePhoneNumber()];

      mockTwilioCreate
        .mockResolvedValueOnce({ sid: 'SM123', status: 'queued' })
        .mockRejectedValueOnce(new Error('Invalid number'));

      mockQuery.mockResolvedValue({ rows: [{ id: generateUUID() }] });

      const results = await smsService.sendBulk({
        tenantId: testContext.tenant.id,
        recipients,
        from: generatePhoneNumber(),
        body: 'Test'
      });

      expect(results.filter(r => r.success).length).toBe(1);
      expect(results.filter(r => !r.success).length).toBe(1);
    });
  });

  describe('getMessageStatus', () => {
    it('should return message status', async () => {
      const messageId = generateUUID();

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: messageId,
          status: 'delivered',
          delivered_at: new Date()
        }]
      });

      const status = await smsService.getStatus(messageId);

      expect(status.status).toBe('delivered');
    });

    it('should return null for non-existent message', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const status = await smsService.getStatus(generateUUID());

      expect(status).toBeNull();
    });
  });

  describe('handleWebhook', () => {
    it('should update message status from webhook', async () => {
      const messageSid = 'SM' + generateUUID().replace(/-/g, '');

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: generateUUID() }] }) // Find message
        .mockResolvedValueOnce({ rows: [{ status: 'delivered' }] }); // Update status

      const result = await smsService.handleStatusWebhook({
        MessageSid: messageSid,
        MessageStatus: 'delivered'
      });

      expect(result.status).toBe('delivered');
    });

    it('should handle failed delivery status', async () => {
      const messageSid = 'SM' + generateUUID().replace(/-/g, '');

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: generateUUID() }] })
        .mockResolvedValueOnce({
          rows: [{
            status: 'failed',
            error_code: '30003',
            error_message: 'Unreachable destination'
          }]
        });

      const result = await smsService.handleStatusWebhook({
        MessageSid: messageSid,
        MessageStatus: 'failed',
        ErrorCode: '30003'
      });

      expect(result.status).toBe('failed');
      expect(result.error_code).toBe('30003');
    });
  });

  describe('getConversation', () => {
    it('should return conversation history', async () => {
      const phoneNumber = generatePhoneNumber();

      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: generateUUID(), direction: 'outbound', body: 'Hello', created_at: new Date() },
          { id: generateUUID(), direction: 'inbound', body: 'Hi there', created_at: new Date() }
        ]
      });

      const conversation = await smsService.getConversation(
        testContext.tenant.id,
        phoneNumber
      );

      expect(conversation.length).toBe(2);
    });

    it('should paginate conversation results', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: Array(10).fill(null).map(() => ({
          id: generateUUID(),
          direction: 'outbound',
          body: 'Message'
        }))
      });

      const conversation = await smsService.getConversation(
        testContext.tenant.id,
        generatePhoneNumber(),
        { page: 1, limit: 10 }
      );

      expect(conversation.length).toBe(10);
    });
  });
});
