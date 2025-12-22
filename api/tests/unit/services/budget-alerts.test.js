/**
 * Budget Alerts Service Unit Tests
 */

import { jest } from '@jest/globals';
import { generateUUID, createTestContext } from '../../helpers.js';

// Mock dependencies
const mockQuery = jest.fn();
jest.unstable_mockModule('../../../src/db.js', () => ({
  default: { query: mockQuery },
  query: mockQuery
}));

const { BudgetAlertService } = await import('../../../src/services/budget-alerts.js');

describe('BudgetAlertService', () => {
  let budgetService;
  let testContext;

  beforeEach(() => {
    jest.clearAllMocks();
    budgetService = new BudgetAlertService();
    testContext = createTestContext();
  });

  describe('createBudget', () => {
    it('should create a new budget', async () => {
      const budgetId = generateUUID();
      const budgetData = {
        name: 'Monthly Call Budget',
        amount: 5000,
        type: 'monthly',
        category: 'calls',
        alertThresholds: [50, 75, 90, 100]
      };

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: budgetId,
          ...budgetData,
          tenant_id: testContext.tenant.id
        }]
      });

      const result = await budgetService.createBudget(testContext.tenant.id, budgetData);

      expect(result).toBeDefined();
      expect(result.id).toBe(budgetId);
      expect(result.amount).toBe(5000);
    });

    it('should reject negative budget amounts', async () => {
      await expect(
        budgetService.createBudget(testContext.tenant.id, {
          name: 'Invalid Budget',
          amount: -1000
        })
      ).rejects.toThrow();
    });

    it('should validate alert thresholds', async () => {
      await expect(
        budgetService.createBudget(testContext.tenant.id, {
          name: 'Test Budget',
          amount: 1000,
          alertThresholds: [150] // Invalid: over 100%
        })
      ).rejects.toThrow(/threshold/i);
    });
  });

  describe('recordSpending', () => {
    it('should record spending against budget', async () => {
      const budgetId = generateUUID();

      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: budgetId,
            amount: 1000,
            alert_thresholds: [50, 75, 90]
          }]
        })
        .mockResolvedValueOnce({
          rows: [{ total_spent: 500 }]
        })
        .mockResolvedValueOnce({ rows: [] }); // Update spending

      const result = await budgetService.recordSpending(budgetId, 100, 'API call');

      expect(result.newTotal).toBe(600);
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('should trigger alert when threshold crossed', async () => {
      const budgetId = generateUUID();

      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: budgetId,
            amount: 1000,
            alert_thresholds: [50, 75, 90],
            tenant_id: testContext.tenant.id
          }]
        })
        .mockResolvedValueOnce({ rows: [{ total_spent: 740 }] }) // Current spending
        .mockResolvedValueOnce({ rows: [] }) // Update spending
        .mockResolvedValueOnce({ rows: [{ id: generateUUID() }] }); // Create alert

      const result = await budgetService.recordSpending(budgetId, 20, 'SMS');

      expect(result.newTotal).toBe(760);
      expect(result.alertTriggered).toBe(true);
      expect(result.thresholdCrossed).toBe(75);
    });
  });

  describe('checkBudgets', () => {
    it('should return budgets approaching limits', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: generateUUID(),
            name: 'Call Budget',
            amount: 1000,
            total_spent: 850,
            percent_used: 85
          },
          {
            id: generateUUID(),
            name: 'SMS Budget',
            amount: 500,
            total_spent: 475,
            percent_used: 95
          }
        ]
      });

      const result = await budgetService.checkBudgets(testContext.tenant.id, {
        minPercentUsed: 80
      });

      expect(result.length).toBe(2);
      expect(result.every(b => b.percent_used >= 80)).toBe(true);
    });

    it('should return exceeded budgets', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: generateUUID(),
          name: 'Exceeded Budget',
          amount: 1000,
          total_spent: 1050,
          percent_used: 105
        }]
      });

      const result = await budgetService.checkBudgets(testContext.tenant.id, {
        exceededOnly: true
      });

      expect(result.length).toBe(1);
      expect(result[0].percent_used).toBeGreaterThan(100);
    });
  });

  describe('getSpendingForecast', () => {
    it('should forecast end-of-period spending', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          budget_id: generateUUID(),
          budget_amount: 1000,
          current_spent: 400,
          days_elapsed: 15,
          days_remaining: 15,
          daily_avg: 26.67
        }]
      });

      const forecast = await budgetService.getSpendingForecast(
        testContext.tenant.id,
        generateUUID()
      );

      expect(forecast.projectedTotal).toBeGreaterThan(400);
      expect(forecast.onTrack).toBeDefined();
    });

    it('should flag budgets projected to exceed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          budget_id: generateUUID(),
          budget_amount: 1000,
          current_spent: 700,
          days_elapsed: 10,
          days_remaining: 20,
          daily_avg: 70
        }]
      });

      const forecast = await budgetService.getSpendingForecast(
        testContext.tenant.id,
        generateUUID()
      );

      // 700 + (70 * 20) = 2100, will exceed 1000
      expect(forecast.projectedTotal).toBeGreaterThan(1000);
      expect(forecast.willExceed).toBe(true);
    });
  });

  describe('getAlerts', () => {
    it('should return active alerts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: generateUUID(),
            alert_type: 'threshold_75',
            severity: 'warning',
            acknowledged: false,
            created_at: new Date()
          },
          {
            id: generateUUID(),
            alert_type: 'threshold_90',
            severity: 'critical',
            acknowledged: false,
            created_at: new Date()
          }
        ]
      });

      const alerts = await budgetService.getAlerts(testContext.tenant.id, {
        unacknowledgedOnly: true
      });

      expect(alerts.length).toBe(2);
      expect(alerts.every(a => !a.acknowledged)).toBe(true);
    });

    it('should filter alerts by severity', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: generateUUID(),
          severity: 'critical'
        }]
      });

      const alerts = await budgetService.getAlerts(testContext.tenant.id, {
        severity: 'critical'
      });

      expect(alerts.every(a => a.severity === 'critical')).toBe(true);
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge an alert', async () => {
      const alertId = generateUUID();

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: alertId,
          acknowledged: true,
          acknowledged_by: testContext.user.id,
          acknowledged_at: new Date()
        }]
      });

      const result = await budgetService.acknowledgeAlert(alertId, testContext.user.id);

      expect(result.acknowledged).toBe(true);
      expect(result.acknowledged_by).toBe(testContext.user.id);
    });
  });

  describe('getSpendingBreakdown', () => {
    it('should return spending by category', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { category: 'calls', total: 500, percentage: 50 },
          { category: 'sms', total: 300, percentage: 30 },
          { category: 'numbers', total: 200, percentage: 20 }
        ]
      });

      const breakdown = await budgetService.getSpendingBreakdown(
        testContext.tenant.id,
        { period: 'month' }
      );

      expect(breakdown.length).toBe(3);
      expect(breakdown.reduce((sum, b) => sum + b.percentage, 0)).toBe(100);
    });

    it('should return spending trends over time', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { date: '2024-01-01', total: 100 },
          { date: '2024-01-02', total: 150 },
          { date: '2024-01-03', total: 120 }
        ]
      });

      const trends = await budgetService.getSpendingTrends(
        testContext.tenant.id,
        { days: 30 }
      );

      expect(trends.length).toBe(3);
    });
  });
});
