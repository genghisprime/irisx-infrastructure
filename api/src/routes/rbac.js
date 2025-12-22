/**
 * RBAC (Role-Based Access Control) API Routes
 *
 * Endpoints for custom roles, permissions, and team management
 */

import { Router } from 'express';
import rbacService, { SYSTEM_PERMISSIONS } from '../services/rbac.js';

const router = Router();

// ============================================
// Permissions
// ============================================

/**
 * GET /v1/rbac/permissions
 * Get all available permissions
 */
router.get('/permissions', (req, res) => {
  const permissions = rbacService.getAvailablePermissions();
  const categories = rbacService.getPermissionCategories();

  res.json({ permissions, categories });
});

// ============================================
// Roles
// ============================================

/**
 * GET /v1/rbac/roles
 * Get all roles for tenant
 */
router.get('/roles', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;
    const includeSystem = req.query.include_system !== 'false';

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const roles = await rbacService.getRoles(tenantId, includeSystem);
    res.json({ roles });
  } catch (error) {
    console.error('Error getting roles:', error);
    res.status(500).json({ error: 'Failed to get roles' });
  }
});

/**
 * POST /v1/rbac/roles
 * Create a custom role
 */
router.post('/roles', async (req, res) => {
  try {
    const {
      tenant_id,
      name,
      description,
      permissions = [],
      parent_role_id,
      color,
      icon
    } = req.body;

    const tenantId = req.tenant?.id || tenant_id;
    const userId = req.user?.id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const role = await rbacService.createRole(tenantId, {
      name,
      description,
      permissions,
      parentRoleId: parent_role_id,
      color,
      icon
    }, userId);

    res.status(201).json(role);
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /v1/rbac/roles/:id
 * Get role by ID
 */
router.get('/roles/:id', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const role = await rbacService.getRole(req.params.id, tenantId);

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    res.json(role);
  } catch (error) {
    console.error('Error getting role:', error);
    res.status(500).json({ error: 'Failed to get role' });
  }
});

/**
 * PATCH /v1/rbac/roles/:id
 * Update role
 */
router.patch('/roles/:id', async (req, res) => {
  try {
    const {
      tenant_id,
      name,
      description,
      permissions,
      parent_role_id,
      color,
      icon,
      is_active
    } = req.body;

    const tenantId = req.tenant?.id || tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const role = await rbacService.updateRole(req.params.id, tenantId, {
      name,
      description,
      permissions,
      parentRoleId: parent_role_id,
      color,
      icon,
      isActive: is_active
    });

    res.json(role);
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /v1/rbac/roles/:id
 * Delete role
 */
router.delete('/roles/:id', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const result = await rbacService.deleteRole(req.params.id, tenantId);
    res.json(result);
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /v1/rbac/roles/initialize
 * Initialize default roles for tenant
 */
router.post('/roles/initialize', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.body.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    await rbacService.initializeDefaultRoles(tenantId);
    res.json({ success: true, message: 'Default roles initialized' });
  } catch (error) {
    console.error('Error initializing roles:', error);
    res.status(500).json({ error: 'Failed to initialize roles' });
  }
});

// ============================================
// User Roles
// ============================================

/**
 * GET /v1/rbac/users/:userId/roles
 * Get user's roles
 */
router.get('/users/:userId/roles', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const roles = await rbacService.getUserRoles(req.params.userId, tenantId);
    res.json({ roles });
  } catch (error) {
    console.error('Error getting user roles:', error);
    res.status(500).json({ error: 'Failed to get user roles' });
  }
});

/**
 * POST /v1/rbac/users/:userId/roles
 * Assign role to user
 */
router.post('/users/:userId/roles', async (req, res) => {
  try {
    const { tenant_id, role_id } = req.body;
    const tenantId = req.tenant?.id || tenant_id;
    const assignedBy = req.user?.id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    if (!role_id) {
      return res.status(400).json({ error: 'role_id is required' });
    }

    const result = await rbacService.assignRole(
      req.params.userId, role_id, tenantId, assignedBy
    );

    res.json(result);
  } catch (error) {
    console.error('Error assigning role:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /v1/rbac/users/:userId/roles/:roleId
 * Remove role from user
 */
router.delete('/users/:userId/roles/:roleId', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const result = await rbacService.removeRole(
      req.params.userId, req.params.roleId, tenantId
    );

    res.json(result);
  } catch (error) {
    console.error('Error removing role:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /v1/rbac/users/:userId/roles
 * Set user's roles (replace all)
 */
router.put('/users/:userId/roles', async (req, res) => {
  try {
    const { tenant_id, role_ids } = req.body;
    const tenantId = req.tenant?.id || tenant_id;
    const assignedBy = req.user?.id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    if (!Array.isArray(role_ids)) {
      return res.status(400).json({ error: 'role_ids must be an array' });
    }

    const result = await rbacService.setUserRoles(
      req.params.userId, role_ids, tenantId, assignedBy
    );

    res.json(result);
  } catch (error) {
    console.error('Error setting user roles:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /v1/rbac/users/:userId/permissions
 * Get user's effective permissions
 */
router.get('/users/:userId/permissions', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const permissions = await rbacService.getUserPermissions(req.params.userId, tenantId);
    res.json({ permissions });
  } catch (error) {
    console.error('Error getting user permissions:', error);
    res.status(500).json({ error: 'Failed to get user permissions' });
  }
});

/**
 * POST /v1/rbac/users/:userId/check-permission
 * Check if user has permission
 */
router.post('/users/:userId/check-permission', async (req, res) => {
  try {
    const { tenant_id, permission, permissions } = req.body;
    const tenantId = req.tenant?.id || tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    if (!permission && !permissions) {
      return res.status(400).json({ error: 'permission or permissions is required' });
    }

    let hasAccess;

    if (permission) {
      hasAccess = await rbacService.hasPermission(req.params.userId, tenantId, permission);
    } else if (Array.isArray(permissions)) {
      hasAccess = await rbacService.hasAllPermissions(req.params.userId, tenantId, permissions);
    }

    res.json({ has_permission: hasAccess });
  } catch (error) {
    console.error('Error checking permission:', error);
    res.status(500).json({ error: 'Failed to check permission' });
  }
});

// ============================================
// Teams
// ============================================

/**
 * GET /v1/rbac/teams
 * Get all teams for tenant
 */
router.get('/teams', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const teams = await rbacService.getTeams(tenantId);
    res.json({ teams });
  } catch (error) {
    console.error('Error getting teams:', error);
    res.status(500).json({ error: 'Failed to get teams' });
  }
});

/**
 * POST /v1/rbac/teams
 * Create a team
 */
router.post('/teams', async (req, res) => {
  try {
    const {
      tenant_id,
      name,
      description,
      parent_team_id,
      manager_id,
      color,
      icon
    } = req.body;

    const tenantId = req.tenant?.id || tenant_id;
    const userId = req.user?.id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const team = await rbacService.createTeam(tenantId, {
      name,
      description,
      parentTeamId: parent_team_id,
      managerId: manager_id,
      color,
      icon
    }, userId);

    res.status(201).json(team);
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /v1/rbac/teams/:id
 * Get team by ID
 */
router.get('/teams/:id', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const team = await rbacService.getTeam(req.params.id, tenantId);

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    res.json(team);
  } catch (error) {
    console.error('Error getting team:', error);
    res.status(500).json({ error: 'Failed to get team' });
  }
});

/**
 * PATCH /v1/rbac/teams/:id
 * Update team
 */
router.patch('/teams/:id', async (req, res) => {
  try {
    const {
      tenant_id,
      name,
      description,
      parent_team_id,
      manager_id,
      color,
      icon,
      is_active
    } = req.body;

    const tenantId = req.tenant?.id || tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const team = await rbacService.updateTeam(req.params.id, tenantId, {
      name,
      description,
      parentTeamId: parent_team_id,
      managerId: manager_id,
      color,
      icon,
      isActive: is_active
    });

    res.json(team);
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /v1/rbac/teams/:id
 * Delete team
 */
router.delete('/teams/:id', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const result = await rbacService.deleteTeam(req.params.id, tenantId);
    res.json(result);
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /v1/rbac/teams/:id/members
 * Get team members
 */
router.get('/teams/:id/members', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const members = await rbacService.getTeamMembers(req.params.id, tenantId);
    res.json({ members });
  } catch (error) {
    console.error('Error getting team members:', error);
    res.status(500).json({ error: 'Failed to get team members' });
  }
});

/**
 * POST /v1/rbac/teams/:id/members
 * Add member to team
 */
router.post('/teams/:id/members', async (req, res) => {
  try {
    const { tenant_id, user_id, role = 'member' } = req.body;
    const tenantId = req.tenant?.id || tenant_id;
    const addedBy = req.user?.id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const result = await rbacService.addTeamMember(
      req.params.id, user_id, tenantId, addedBy, role
    );

    res.json(result);
  } catch (error) {
    console.error('Error adding team member:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /v1/rbac/teams/:id/members/:userId
 * Remove member from team
 */
router.delete('/teams/:id/members/:userId', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const result = await rbacService.removeTeamMember(
      req.params.id, req.params.userId, tenantId
    );

    res.json(result);
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /v1/rbac/users/:userId/teams
 * Get user's teams
 */
router.get('/users/:userId/teams', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    const teams = await rbacService.getUserTeams(req.params.userId, tenantId);
    res.json({ teams });
  } catch (error) {
    console.error('Error getting user teams:', error);
    res.status(500).json({ error: 'Failed to get user teams' });
  }
});

export default router;
