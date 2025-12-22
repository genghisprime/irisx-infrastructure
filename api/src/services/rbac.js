/**
 * Role-Based Access Control (RBAC) Service
 *
 * Full custom roles and permissions management
 * - Custom role creation
 * - Granular permissions
 * - Role hierarchy
 * - Team/group management
 * - Permission inheritance
 */

import { query } from '../db/connection.js';
import crypto from 'crypto';

// Default system permissions
const SYSTEM_PERMISSIONS = {
  // Tenant Management
  'tenant:read': 'View tenant settings',
  'tenant:write': 'Modify tenant settings',
  'tenant:billing': 'Manage billing',
  'tenant:users': 'Manage users',

  // User Management
  'users:read': 'View users',
  'users:create': 'Create users',
  'users:update': 'Update users',
  'users:delete': 'Delete users',
  'users:roles': 'Assign roles',

  // Campaigns
  'campaigns:read': 'View campaigns',
  'campaigns:create': 'Create campaigns',
  'campaigns:update': 'Update campaigns',
  'campaigns:delete': 'Delete campaigns',
  'campaigns:start': 'Start campaigns',
  'campaigns:stop': 'Stop campaigns',
  'campaigns:approve': 'Approve campaigns',

  // Contacts
  'contacts:read': 'View contacts',
  'contacts:create': 'Create contacts',
  'contacts:update': 'Update contacts',
  'contacts:delete': 'Delete contacts',
  'contacts:import': 'Import contacts',
  'contacts:export': 'Export contacts',

  // Calls
  'calls:read': 'View calls',
  'calls:make': 'Make calls',
  'calls:transfer': 'Transfer calls',
  'calls:record': 'Record calls',
  'calls:listen': 'Listen to recordings',

  // Messages
  'messages:read': 'View messages',
  'messages:send': 'Send messages',
  'messages:templates': 'Manage templates',

  // Analytics
  'analytics:read': 'View analytics',
  'analytics:export': 'Export analytics',
  'analytics:reports': 'Create reports',

  // Settings
  'settings:read': 'View settings',
  'settings:write': 'Modify settings',
  'settings:integrations': 'Manage integrations',
  'settings:webhooks': 'Manage webhooks',

  // Queues
  'queues:read': 'View queues',
  'queues:manage': 'Manage queues',
  'queues:assign': 'Assign agents to queues',

  // Agents
  'agents:read': 'View agents',
  'agents:manage': 'Manage agents',
  'agents:monitor': 'Monitor agents',
  'agents:whisper': 'Whisper to agents',
  'agents:barge': 'Barge into calls',

  // Admin
  'admin:access': 'Access admin panel',
  'admin:impersonate': 'Impersonate users',
  'admin:audit': 'View audit logs'
};

// Default role templates
const DEFAULT_ROLES = {
  admin: {
    name: 'Administrator',
    description: 'Full access to all features',
    permissions: Object.keys(SYSTEM_PERMISSIONS),
    isSystem: true
  },
  supervisor: {
    name: 'Supervisor',
    description: 'Manage agents and campaigns',
    permissions: [
      'campaigns:read', 'campaigns:create', 'campaigns:update', 'campaigns:start', 'campaigns:stop',
      'contacts:read', 'contacts:create', 'contacts:update', 'contacts:import',
      'calls:read', 'calls:listen',
      'messages:read', 'messages:send', 'messages:templates',
      'analytics:read', 'analytics:export',
      'queues:read', 'queues:manage', 'queues:assign',
      'agents:read', 'agents:manage', 'agents:monitor', 'agents:whisper', 'agents:barge'
    ],
    isSystem: true
  },
  agent: {
    name: 'Agent',
    description: 'Handle calls and messages',
    permissions: [
      'contacts:read', 'contacts:update',
      'calls:read', 'calls:make', 'calls:transfer',
      'messages:read', 'messages:send',
      'queues:read'
    ],
    isSystem: true
  },
  readonly: {
    name: 'Read Only',
    description: 'View-only access',
    permissions: [
      'campaigns:read', 'contacts:read', 'calls:read', 'messages:read',
      'analytics:read', 'queues:read', 'agents:read', 'settings:read'
    ],
    isSystem: true
  }
};

/**
 * RBAC Service
 */
class RBACService {
  constructor() {
    this.permissionsCache = new Map();
    this.rolesCache = new Map();
  }

  // ============================================
  // Role Management
  // ============================================

  /**
   * Create a custom role
   */
  async createRole(tenantId, roleData, createdBy) {
    const {
      name,
      description,
      permissions = [],
      parentRoleId,
      color,
      icon
    } = roleData;

    // Validate permissions
    const invalidPerms = permissions.filter(p => !SYSTEM_PERMISSIONS[p]);
    if (invalidPerms.length > 0) {
      throw new Error(`Invalid permissions: ${invalidPerms.join(', ')}`);
    }

    const roleId = crypto.randomUUID();

    const result = await query(`
      INSERT INTO roles (
        id, tenant_id, name, description, permissions, parent_role_id,
        color, icon, is_system, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, NOW())
      RETURNING *
    `, [
      roleId, tenantId, name, description, JSON.stringify(permissions),
      parentRoleId, color, icon, createdBy
    ]);

    // Clear cache
    this.clearCache(tenantId);

    return result.rows[0];
  }

  /**
   * Get all roles for a tenant
   */
  async getRoles(tenantId, includeSystem = true) {
    let sql = `
      SELECT r.*,
        (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) as user_count,
        pr.name as parent_role_name
      FROM roles r
      LEFT JOIN roles pr ON r.parent_role_id = pr.id
      WHERE r.tenant_id = $1
    `;

    if (!includeSystem) {
      sql += ' AND r.is_system = false';
    }

    sql += ' ORDER BY r.is_system DESC, r.name';

    const result = await query(sql, [tenantId]);
    return result.rows;
  }

  /**
   * Get role by ID
   */
  async getRole(roleId, tenantId) {
    const result = await query(`
      SELECT r.*,
        pr.name as parent_role_name,
        ARRAY_AGG(DISTINCT ur.user_id) FILTER (WHERE ur.user_id IS NOT NULL) as user_ids
      FROM roles r
      LEFT JOIN roles pr ON r.parent_role_id = pr.id
      LEFT JOIN user_roles ur ON r.id = ur.role_id
      WHERE r.id = $1 AND r.tenant_id = $2
      GROUP BY r.id, pr.name
    `, [roleId, tenantId]);

    return result.rows[0] || null;
  }

  /**
   * Update role
   */
  async updateRole(roleId, tenantId, updates) {
    const role = await this.getRole(roleId, tenantId);
    if (!role) {
      throw new Error('Role not found');
    }

    if (role.is_system) {
      throw new Error('Cannot modify system roles');
    }

    const { name, description, permissions, parentRoleId, color, icon, isActive } = updates;

    // Validate permissions if provided
    if (permissions) {
      const invalidPerms = permissions.filter(p => !SYSTEM_PERMISSIONS[p]);
      if (invalidPerms.length > 0) {
        throw new Error(`Invalid permissions: ${invalidPerms.join(', ')}`);
      }
    }

    const result = await query(`
      UPDATE roles
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          permissions = COALESCE($3, permissions),
          parent_role_id = COALESCE($4, parent_role_id),
          color = COALESCE($5, color),
          icon = COALESCE($6, icon),
          is_active = COALESCE($7, is_active),
          updated_at = NOW()
      WHERE id = $8 AND tenant_id = $9
      RETURNING *
    `, [
      name, description, permissions ? JSON.stringify(permissions) : null,
      parentRoleId, color, icon, isActive, roleId, tenantId
    ]);

    // Clear cache
    this.clearCache(tenantId);

    return result.rows[0];
  }

  /**
   * Delete role
   */
  async deleteRole(roleId, tenantId) {
    const role = await this.getRole(roleId, tenantId);
    if (!role) {
      throw new Error('Role not found');
    }

    if (role.is_system) {
      throw new Error('Cannot delete system roles');
    }

    // Check if role has users
    const userCount = await query(
      'SELECT COUNT(*) FROM user_roles WHERE role_id = $1',
      [roleId]
    );

    if (parseInt(userCount.rows[0].count) > 0) {
      throw new Error('Cannot delete role with assigned users');
    }

    await query('DELETE FROM roles WHERE id = $1 AND tenant_id = $2', [roleId, tenantId]);

    // Clear cache
    this.clearCache(tenantId);

    return { deleted: true };
  }

  /**
   * Initialize default roles for a tenant
   */
  async initializeDefaultRoles(tenantId) {
    for (const [key, roleData] of Object.entries(DEFAULT_ROLES)) {
      const exists = await query(
        'SELECT id FROM roles WHERE tenant_id = $1 AND name = $2',
        [tenantId, roleData.name]
      );

      if (exists.rows.length === 0) {
        await query(`
          INSERT INTO roles (
            id, tenant_id, name, description, permissions, is_system, created_at
          ) VALUES ($1, $2, $3, $4, $5, true, NOW())
        `, [
          crypto.randomUUID(), tenantId, roleData.name, roleData.description,
          JSON.stringify(roleData.permissions)
        ]);
      }
    }
  }

  // ============================================
  // User Role Assignment
  // ============================================

  /**
   * Assign role to user
   */
  async assignRole(userId, roleId, tenantId, assignedBy) {
    // Verify role exists
    const role = await this.getRole(roleId, tenantId);
    if (!role) {
      throw new Error('Role not found');
    }

    // Check if already assigned
    const existing = await query(
      'SELECT id FROM user_roles WHERE user_id = $1 AND role_id = $2',
      [userId, roleId]
    );

    if (existing.rows.length > 0) {
      return { message: 'Role already assigned' };
    }

    await query(`
      INSERT INTO user_roles (user_id, role_id, tenant_id, assigned_by, assigned_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [userId, roleId, tenantId, assignedBy]);

    // Clear user's permission cache
    this.permissionsCache.delete(`${tenantId}:${userId}`);

    return { assigned: true };
  }

  /**
   * Remove role from user
   */
  async removeRole(userId, roleId, tenantId) {
    await query(
      'DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2 AND tenant_id = $3',
      [userId, roleId, tenantId]
    );

    // Clear user's permission cache
    this.permissionsCache.delete(`${tenantId}:${userId}`);

    return { removed: true };
  }

  /**
   * Get user's roles
   */
  async getUserRoles(userId, tenantId) {
    const result = await query(`
      SELECT r.*, ur.assigned_at, u.email as assigned_by_email
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      LEFT JOIN users u ON ur.assigned_by = u.id
      WHERE ur.user_id = $1 AND ur.tenant_id = $2
      ORDER BY r.name
    `, [userId, tenantId]);

    return result.rows;
  }

  /**
   * Set user's roles (replace all)
   */
  async setUserRoles(userId, roleIds, tenantId, assignedBy) {
    // Remove all existing roles
    await query(
      'DELETE FROM user_roles WHERE user_id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );

    // Assign new roles
    for (const roleId of roleIds) {
      await this.assignRole(userId, roleId, tenantId, assignedBy);
    }

    return { roles: roleIds };
  }

  // ============================================
  // Permission Checking
  // ============================================

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId, tenantId) {
    const cacheKey = `${tenantId}:${userId}`;

    // Check cache
    if (this.permissionsCache.has(cacheKey)) {
      return this.permissionsCache.get(cacheKey);
    }

    // Get all user roles
    const roles = await this.getUserRoles(userId, tenantId);

    // Collect all permissions (including inherited)
    const permissions = new Set();

    for (const role of roles) {
      const rolePerms = typeof role.permissions === 'string'
        ? JSON.parse(role.permissions)
        : role.permissions;

      rolePerms.forEach(p => permissions.add(p));

      // Get inherited permissions from parent role
      if (role.parent_role_id) {
        const parentPerms = await this.getRolePermissionsRecursive(role.parent_role_id, tenantId);
        parentPerms.forEach(p => permissions.add(p));
      }
    }

    const permArray = Array.from(permissions);

    // Cache for 5 minutes
    this.permissionsCache.set(cacheKey, permArray);
    setTimeout(() => this.permissionsCache.delete(cacheKey), 300000);

    return permArray;
  }

  /**
   * Get role permissions recursively (with parent inheritance)
   */
  async getRolePermissionsRecursive(roleId, tenantId, visited = new Set()) {
    // Prevent circular inheritance
    if (visited.has(roleId)) {
      return [];
    }
    visited.add(roleId);

    const role = await this.getRole(roleId, tenantId);
    if (!role) return [];

    const permissions = new Set(
      typeof role.permissions === 'string'
        ? JSON.parse(role.permissions)
        : role.permissions
    );

    // Get parent permissions
    if (role.parent_role_id) {
      const parentPerms = await this.getRolePermissionsRecursive(
        role.parent_role_id, tenantId, visited
      );
      parentPerms.forEach(p => permissions.add(p));
    }

    return Array.from(permissions);
  }

  /**
   * Check if user has permission
   */
  async hasPermission(userId, tenantId, permission) {
    const permissions = await this.getUserPermissions(userId, tenantId);
    return permissions.includes(permission);
  }

  /**
   * Check if user has any of the permissions
   */
  async hasAnyPermission(userId, tenantId, permissionList) {
    const permissions = await this.getUserPermissions(userId, tenantId);
    return permissionList.some(p => permissions.includes(p));
  }

  /**
   * Check if user has all permissions
   */
  async hasAllPermissions(userId, tenantId, permissionList) {
    const permissions = await this.getUserPermissions(userId, tenantId);
    return permissionList.every(p => permissions.includes(p));
  }

  // ============================================
  // Team/Group Management
  // ============================================

  /**
   * Create a team
   */
  async createTeam(tenantId, teamData, createdBy) {
    const {
      name,
      description,
      parentTeamId,
      managerId,
      color,
      icon
    } = teamData;

    const teamId = crypto.randomUUID();

    const result = await query(`
      INSERT INTO teams (
        id, tenant_id, name, description, parent_team_id,
        manager_id, color, icon, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `, [teamId, tenantId, name, description, parentTeamId, managerId, color, icon, createdBy]);

    return result.rows[0];
  }

  /**
   * Get all teams for a tenant
   */
  async getTeams(tenantId) {
    const result = await query(`
      SELECT t.*,
        u.email as manager_email,
        u.first_name as manager_first_name,
        u.last_name as manager_last_name,
        pt.name as parent_team_name,
        (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count
      FROM teams t
      LEFT JOIN users u ON t.manager_id = u.id
      LEFT JOIN teams pt ON t.parent_team_id = pt.id
      WHERE t.tenant_id = $1 AND t.deleted_at IS NULL
      ORDER BY t.name
    `, [tenantId]);

    return result.rows;
  }

  /**
   * Get team by ID
   */
  async getTeam(teamId, tenantId) {
    const result = await query(`
      SELECT t.*,
        u.email as manager_email,
        u.first_name as manager_first_name,
        u.last_name as manager_last_name,
        pt.name as parent_team_name
      FROM teams t
      LEFT JOIN users u ON t.manager_id = u.id
      LEFT JOIN teams pt ON t.parent_team_id = pt.id
      WHERE t.id = $1 AND t.tenant_id = $2 AND t.deleted_at IS NULL
    `, [teamId, tenantId]);

    return result.rows[0] || null;
  }

  /**
   * Update team
   */
  async updateTeam(teamId, tenantId, updates) {
    const { name, description, parentTeamId, managerId, color, icon, isActive } = updates;

    const result = await query(`
      UPDATE teams
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          parent_team_id = COALESCE($3, parent_team_id),
          manager_id = COALESCE($4, manager_id),
          color = COALESCE($5, color),
          icon = COALESCE($6, icon),
          is_active = COALESCE($7, is_active),
          updated_at = NOW()
      WHERE id = $8 AND tenant_id = $9 AND deleted_at IS NULL
      RETURNING *
    `, [name, description, parentTeamId, managerId, color, icon, isActive, teamId, tenantId]);

    return result.rows[0];
  }

  /**
   * Delete team (soft delete)
   */
  async deleteTeam(teamId, tenantId) {
    await query(
      'UPDATE teams SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2',
      [teamId, tenantId]
    );

    return { deleted: true };
  }

  /**
   * Add member to team
   */
  async addTeamMember(teamId, userId, tenantId, addedBy, role = 'member') {
    const existing = await query(
      'SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, userId]
    );

    if (existing.rows.length > 0) {
      throw new Error('User is already a member of this team');
    }

    await query(`
      INSERT INTO team_members (team_id, user_id, tenant_id, role, added_by, added_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [teamId, userId, tenantId, role, addedBy]);

    return { added: true };
  }

  /**
   * Remove member from team
   */
  async removeTeamMember(teamId, userId, tenantId) {
    await query(
      'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 AND tenant_id = $3',
      [teamId, userId, tenantId]
    );

    return { removed: true };
  }

  /**
   * Get team members
   */
  async getTeamMembers(teamId, tenantId) {
    const result = await query(`
      SELECT tm.*,
        u.email, u.first_name, u.last_name,
        adder.email as added_by_email
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      LEFT JOIN users adder ON tm.added_by = adder.id
      WHERE tm.team_id = $1 AND tm.tenant_id = $2
      ORDER BY tm.role, u.first_name
    `, [teamId, tenantId]);

    return result.rows;
  }

  /**
   * Get user's teams
   */
  async getUserTeams(userId, tenantId) {
    const result = await query(`
      SELECT t.*, tm.role as member_role, tm.added_at
      FROM team_members tm
      JOIN teams t ON tm.team_id = t.id
      WHERE tm.user_id = $1 AND tm.tenant_id = $2 AND t.deleted_at IS NULL
      ORDER BY t.name
    `, [userId, tenantId]);

    return result.rows;
  }

  // ============================================
  // Utilities
  // ============================================

  /**
   * Get all available permissions
   */
  getAvailablePermissions() {
    return Object.entries(SYSTEM_PERMISSIONS).map(([key, description]) => ({
      permission: key,
      description,
      category: key.split(':')[0]
    }));
  }

  /**
   * Get permission categories
   */
  getPermissionCategories() {
    const categories = {};
    for (const [key, description] of Object.entries(SYSTEM_PERMISSIONS)) {
      const category = key.split(':')[0];
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push({ permission: key, description });
    }
    return categories;
  }

  /**
   * Clear cache for tenant
   */
  clearCache(tenantId) {
    for (const key of this.permissionsCache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        this.permissionsCache.delete(key);
      }
    }
    this.rolesCache.delete(tenantId);
  }
}

// Singleton instance
const rbacService = new RBACService();

export default rbacService;
export { SYSTEM_PERMISSIONS, DEFAULT_ROLES };
