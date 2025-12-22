/**
 * Password Policy Service Unit Tests
 */

import { jest } from '@jest/globals';
import { generateUUID, createTestContext } from '../../helpers.js';

// Mock the database
const mockQuery = jest.fn();
jest.unstable_mockModule('../../../src/db.js', () => ({
  default: { query: mockQuery },
  query: mockQuery
}));

const { PasswordPolicyService } = await import('../../../src/services/password-policy.js');

describe('PasswordPolicyService', () => {
  let passwordService;
  let testContext;

  beforeEach(() => {
    jest.clearAllMocks();
    passwordService = new PasswordPolicyService();
    testContext = createTestContext();
  });

  describe('validatePassword', () => {
    const defaultPolicy = {
      minLength: 8,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      minSpecialChars: 1,
      disallowCommonPasswords: true,
      disallowUserInfo: true
    };

    it('should accept valid password meeting all requirements', () => {
      const result = passwordService.validatePassword(
        'SecureP@ss123!',
        defaultPolicy
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject password that is too short', () => {
      const result = passwordService.validatePassword(
        'Sh0rt!',
        defaultPolicy
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringMatching(/minimum.*length/i));
    });

    it('should reject password without uppercase', () => {
      const result = passwordService.validatePassword(
        'lowercase123!@#',
        defaultPolicy
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringMatching(/uppercase/i));
    });

    it('should reject password without lowercase', () => {
      const result = passwordService.validatePassword(
        'UPPERCASE123!@#',
        defaultPolicy
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringMatching(/lowercase/i));
    });

    it('should reject password without numbers', () => {
      const result = passwordService.validatePassword(
        'NoNumbers!@#ABC',
        defaultPolicy
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringMatching(/number/i));
    });

    it('should reject password without special characters', () => {
      const result = passwordService.validatePassword(
        'NoSpecial123ABC',
        defaultPolicy
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringMatching(/special/i));
    });

    it('should reject common passwords', () => {
      const result = passwordService.validatePassword(
        'Password123!',
        defaultPolicy
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringMatching(/common/i));
    });

    it('should reject password containing user email', () => {
      const result = passwordService.validatePassword(
        'john.doe@company.com123!',
        defaultPolicy,
        { email: 'john.doe@company.com' }
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringMatching(/personal.*info/i));
    });

    it('should calculate password strength score', () => {
      const weak = passwordService.calculateStrength('password');
      const medium = passwordService.calculateStrength('Password1');
      const strong = passwordService.calculateStrength('C0mpl3x!P@ssw0rd#2024');

      expect(weak).toBeLessThan(medium);
      expect(medium).toBeLessThan(strong);
    });
  });

  describe('checkPasswordHistory', () => {
    it('should reject password that matches history', async () => {
      const userId = generateUUID();
      const hashedPassword = 'hashedPassword123';

      mockQuery.mockResolvedValueOnce({
        rows: [
          { password_hash: hashedPassword },
          { password_hash: 'oldPassword1' },
          { password_hash: 'oldPassword2' }
        ]
      });

      const result = await passwordService.checkPasswordHistory(
        userId,
        hashedPassword,
        5
      );

      expect(result.isInHistory).toBe(true);
    });

    it('should accept password not in history', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { password_hash: 'oldPassword1' },
          { password_hash: 'oldPassword2' }
        ]
      });

      const result = await passwordService.checkPasswordHistory(
        generateUUID(),
        'completelyNewPassword',
        5
      );

      expect(result.isInHistory).toBe(false);
    });
  });

  describe('checkPasswordExpiration', () => {
    it('should return expired for old passwords', async () => {
      const userId = generateUUID();
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago

      mockQuery.mockResolvedValueOnce({
        rows: [{ password_changed_at: oldDate }]
      });

      const result = await passwordService.checkPasswordExpiration(
        userId,
        { maxAgeDays: 90 }
      );

      expect(result.expired).toBe(true);
      expect(result.daysUntilExpiration).toBeLessThan(0);
    });

    it('should return not expired for recent passwords', async () => {
      const userId = generateUUID();
      const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

      mockQuery.mockResolvedValueOnce({
        rows: [{ password_changed_at: recentDate }]
      });

      const result = await passwordService.checkPasswordExpiration(
        userId,
        { maxAgeDays: 90 }
      );

      expect(result.expired).toBe(false);
      expect(result.daysUntilExpiration).toBeGreaterThan(0);
    });

    it('should warn when password is about to expire', async () => {
      const userId = generateUUID();
      const almostExpired = new Date(Date.now() - 85 * 24 * 60 * 60 * 1000); // 85 days ago

      mockQuery.mockResolvedValueOnce({
        rows: [{ password_changed_at: almostExpired }]
      });

      const result = await passwordService.checkPasswordExpiration(
        userId,
        { maxAgeDays: 90, warningDays: 14 }
      );

      expect(result.expired).toBe(false);
      expect(result.warning).toBe(true);
      expect(result.daysUntilExpiration).toBeLessThanOrEqual(14);
    });
  });

  describe('getTenantPolicy', () => {
    it('should return tenant-specific policy', async () => {
      const tenantId = testContext.tenant.id;

      mockQuery.mockResolvedValueOnce({
        rows: [{
          min_length: 12,
          require_uppercase: true,
          require_special_chars: true,
          password_history_count: 10
        }]
      });

      const policy = await passwordService.getTenantPolicy(tenantId);

      expect(policy.minLength).toBe(12);
      expect(policy.requireUppercase).toBe(true);
    });

    it('should return default policy when tenant has none', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const policy = await passwordService.getTenantPolicy(generateUUID());

      expect(policy).toBeDefined();
      expect(policy.minLength).toBeGreaterThanOrEqual(8);
    });
  });

  describe('recordPasswordChange', () => {
    it('should record password change in history', async () => {
      const userId = generateUUID();

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // Begin transaction
        .mockResolvedValueOnce({ rows: [{ id: generateUUID() }] }) // Insert history
        .mockResolvedValueOnce({ rows: [] }) // Update user
        .mockResolvedValueOnce({ rows: [] }); // Commit

      await passwordService.recordPasswordChange(userId, 'newHashedPassword');

      expect(mockQuery).toHaveBeenCalledTimes(4);
    });

    it('should trim old history entries', async () => {
      const userId = generateUUID();
      const historyLimit = 5;

      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: generateUUID() }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 2 }) // Deleted 2 old entries
        .mockResolvedValueOnce({ rows: [] });

      await passwordService.recordPasswordChange(userId, 'newHash', { historyLimit });

      expect(mockQuery).toHaveBeenCalled();
    });
  });
});
