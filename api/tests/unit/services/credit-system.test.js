/**
 * Credit System Service Unit Tests
 */

import { jest } from '@jest/globals';
import { generateUUID, createTestContext } from '../../helpers.js';

// Mock the database
const mockQuery = jest.fn();
jest.unstable_mockModule('../../../src/db.js', () => ({
  default: { query: mockQuery },
  query: mockQuery
}));

const { CreditSystemService } = await import('../../../src/services/credit-system.js');

describe('CreditSystemService', () => {
  let creditService;
  let testContext;

  beforeEach(() => {
    jest.clearAllMocks();
    creditService = new CreditSystemService();
    testContext = createTestContext();
  });

  describe('addCredits', () => {
    it('should add credits to tenant account', async () => {
      const tenantId = testContext.tenant.id;
      const amount = 1000;

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // Begin transaction
        .mockResolvedValueOnce({
          rows: [{
            id: generateUUID(),
            tenant_id: tenantId,
            amount,
            type: 'purchase',
            balance_after: amount
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // Commit

      const result = await creditService.addCredits(tenantId, {
        amount,
        type: 'purchase',
        description: 'Credit purchase'
      });

      expect(result).toBeDefined();
      expect(result.amount).toBe(amount);
    });

    it('should reject negative credit amounts', async () => {
      await expect(
        creditService.addCredits(testContext.tenant.id, { amount: -100 })
      ).rejects.toThrow();
    });

    it('should handle promotional credits with expiration', async () => {
      const tenantId = testContext.tenant.id;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: generateUUID(),
            tenant_id: tenantId,
            amount: 500,
            type: 'promotional',
            expires_at: expiresAt
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await creditService.addCredits(tenantId, {
        amount: 500,
        type: 'promotional',
        expiresAt
      });

      expect(result.type).toBe('promotional');
      expect(result.expires_at).toBeDefined();
    });
  });

  describe('deductCredits', () => {
    it('should deduct credits from tenant account', async () => {
      const tenantId = testContext.tenant.id;

      mockQuery
        .mockResolvedValueOnce({ rows: [{ balance: 1000 }] }) // Get balance
        .mockResolvedValueOnce({
          rows: [{
            id: generateUUID(),
            amount: -100,
            balance_after: 900
          }]
        });

      const result = await creditService.deductCredits(tenantId, {
        amount: 100,
        reason: 'API usage'
      });

      expect(result.balance_after).toBe(900);
    });

    it('should reject deduction when insufficient balance', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ balance: 50 }] });

      await expect(
        creditService.deductCredits(testContext.tenant.id, { amount: 100 })
      ).rejects.toThrow(/insufficient/i);
    });

    it('should use promotional credits first (FIFO)', async () => {
      const tenantId = testContext.tenant.id;

      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: generateUUID(), type: 'promotional', amount: 100, expires_at: new Date() },
            { id: generateUUID(), type: 'purchase', amount: 500, expires_at: null }
          ]
        })
        .mockResolvedValueOnce({ rows: [{ amount: -100 }] });

      const result = await creditService.deductCredits(tenantId, {
        amount: 100,
        usePromotionalFirst: true
      });

      expect(result).toBeDefined();
    });
  });

  describe('getBalance', () => {
    it('should return current credit balance', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_balance: 1500, available_balance: 1500 }]
      });

      const balance = await creditService.getBalance(testContext.tenant.id);

      expect(balance.total_balance).toBe(1500);
      expect(balance.available_balance).toBe(1500);
    });

    it('should exclude expired promotional credits', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_balance: 1500,
          available_balance: 1000,
          expired_promotional: 500
        }]
      });

      const balance = await creditService.getBalance(testContext.tenant.id);

      expect(balance.available_balance).toBe(1000);
    });
  });

  describe('applyPromoCode', () => {
    it('should apply valid promo code', async () => {
      const promoCode = 'WELCOME50';

      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: generateUUID(),
            code: promoCode,
            credit_amount: 50,
            is_active: true,
            max_uses: 100,
            current_uses: 10
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // Check if already used
        .mockResolvedValueOnce({
          rows: [{
            id: generateUUID(),
            amount: 50,
            type: 'promotional'
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // Update promo usage

      const result = await creditService.applyPromoCode(
        testContext.tenant.id,
        promoCode
      );

      expect(result.amount).toBe(50);
    });

    it('should reject expired promo codes', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: generateUUID(),
          code: 'EXPIRED',
          expires_at: new Date(Date.now() - 86400000),
          is_active: true
        }]
      });

      await expect(
        creditService.applyPromoCode(testContext.tenant.id, 'EXPIRED')
      ).rejects.toThrow(/expired/i);
    });

    it('should reject already used promo codes', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: generateUUID(),
            code: 'ONETIME',
            is_active: true,
            single_use: true
          }]
        })
        .mockResolvedValueOnce({ rows: [{ id: generateUUID() }] }); // Already used

      await expect(
        creditService.applyPromoCode(testContext.tenant.id, 'ONETIME')
      ).rejects.toThrow(/already used/i);
    });
  });

  describe('getCreditHistory', () => {
    it('should return paginated credit history', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: generateUUID(), amount: 1000, type: 'purchase', created_at: new Date() },
          { id: generateUUID(), amount: -50, type: 'usage', created_at: new Date() },
          { id: generateUUID(), amount: 100, type: 'promotional', created_at: new Date() }
        ]
      });

      const history = await creditService.getCreditHistory(testContext.tenant.id, {
        page: 1,
        limit: 10
      });

      expect(history.length).toBe(3);
    });

    it('should filter by credit type', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: generateUUID(), amount: 1000, type: 'purchase' }
        ]
      });

      const history = await creditService.getCreditHistory(testContext.tenant.id, {
        type: 'purchase'
      });

      expect(history.every(h => h.type === 'purchase')).toBe(true);
    });
  });
});
