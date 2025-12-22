/**
 * RBAC Service Unit Tests
 */

import { jest } from '@jest/globals';
import { generateUUID, createTestContext } from '../../helpers.js';

// Mock the database
const mockQuery = jest.fn();
jest.unstable_mockModule('../../../src/db.js', () => ({
  default: { query: mockQuery },
  query: mockQuery
}));

// Import after mocking
const { RBACService } = await import('../../../src/services/rbac.js');

describe('RBACService', () => {
  let rbacService;
  let testContext;

  beforeEach(() => {
    jest.clearAllMocks();
    rbacService = new RBACService();
    testContext = createTestContext();
  });

  describe('createRole', () => {
    it('should create a new role with permissions', async () => {
      const roleId = generateUUID();
      const roleData = {
        name: 'Custom Manager',
        description: 'Custom manager role',
        permissions: ['calls:read', 'calls:write', 'sms:read']
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // Check existing role
        .mockResolvedValueOnce({ rows: [{ id: roleId, ...roleData, tenant_id: testContext.tenant.id }] }); // Insert role

      const result = await rbacService.createRole(testContext.tenant.id, roleData);

      expect(result).toBeDefined();
      expect(result.id).toBe(roleId);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should reject duplicate role names', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: generateUUID() }] }); // Existing role

      await expect(
        rbacService.createRole(testContext.tenant.id, { name: 'Existing Role' })
      ).rejects.toThrow();
    });
  });

  describe('checkPermission', () => {
    it('should return true for users with permission', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ permissions: ['calls:read', 'calls:write', 'sms:*'] }]
      });

      const hasPermission = await rbacService.checkPermission(
        testContext.user.id,
        'calls:read'
      );

      expect(hasPermission).toBe(true);
    });

    it('should return true for wildcard permissions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ permissions: ['sms:*'] }]
      });

      const hasPermission = await rbacService.checkPermission(
        testContext.user.id,
        'sms:send'
      );

      expect(hasPermission).toBe(true);
    });

    it('should return false for users without permission', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ permissions: ['calls:read'] }]
      });

      const hasPermission = await rbacService.checkPermission(
        testContext.user.id,
        'billing:write'
      );

      expect(hasPermission).toBe(false);
    });

    it('should return true for super admin', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ permissions: ['*'] }]
      });

      const hasPermission = await rbacService.checkPermission(
        testContext.user.id,
        'any:permission'
      );

      expect(hasPermission).toBe(true);
    });
  });

  describe('assignRole', () => {
    it('should assign role to user', async () => {
      const roleId = generateUUID();
      const userId = generateUUID();

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: roleId }] }) // Role exists
        .mockResolvedValueOnce({ rows: [{ id: userId }] }) // User exists
        .mockResolvedValueOnce({ rows: [{ user_id: userId, role_id: roleId }] }); // Assignment

      const result = await rbacService.assignRole(userId, roleId);

      expect(result).toBeDefined();
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('should reject assignment to non-existent role', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Role doesn't exist

      await expect(
        rbacService.assignRole(generateUUID(), generateUUID())
      ).rejects.toThrow();
    });
  });

  describe('getEffectivePermissions', () => {
    it('should merge permissions from multiple roles', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { permissions: ['calls:read', 'calls:write'] },
          { permissions: ['sms:read', 'sms:send'] }
        ]
      });

      const permissions = await rbacService.getEffectivePermissions(testContext.user.id);

      expect(permissions).toContain('calls:read');
      expect(permissions).toContain('calls:write');
      expect(permissions).toContain('sms:read');
      expect(permissions).toContain('sms:send');
    });

    it('should deduplicate permissions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { permissions: ['calls:read', 'sms:read'] },
          { permissions: ['calls:read', 'billing:read'] }
        ]
      });

      const permissions = await rbacService.getEffectivePermissions(testContext.user.id);
      const callsReadCount = permissions.filter(p => p === 'calls:read').length;

      expect(callsReadCount).toBe(1);
    });
  });
});
