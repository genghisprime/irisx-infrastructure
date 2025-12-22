-- RBAC, Teams, and Password Policies
-- Custom roles, team management, and password policies

-- Custom roles table
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]',
    parent_role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
    color VARCHAR(20),
    icon VARCHAR(50),
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

-- User roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role_id)
);

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
    color VARCHAR(20),
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, name)
);

-- Team members junction table
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member',
    added_by UUID REFERENCES users(id),
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- Password policies per tenant
CREATE TABLE IF NOT EXISTS password_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
    min_length INTEGER DEFAULT 8,
    max_length INTEGER DEFAULT 128,
    require_uppercase BOOLEAN DEFAULT true,
    require_lowercase BOOLEAN DEFAULT true,
    require_numbers BOOLEAN DEFAULT true,
    require_special_chars BOOLEAN DEFAULT true,
    special_chars VARCHAR(100) DEFAULT '!@#$%^&*()_+-=[]{}|;:,.<>?',
    prevent_common_passwords BOOLEAN DEFAULT true,
    prevent_username_in_password BOOLEAN DEFAULT true,
    password_history_count INTEGER DEFAULT 5,
    max_age_days INTEGER DEFAULT 90,
    min_age_days INTEGER DEFAULT 1,
    lockout_threshold INTEGER DEFAULT 5,
    lockout_duration_minutes INTEGER DEFAULT 30,
    require_mfa BOOLEAN DEFAULT false,
    session_timeout_minutes INTEGER DEFAULT 480,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User invitations
CREATE TABLE IF NOT EXISTS user_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    role_ids UUID[] DEFAULT '{}',
    team_ids UUID[] DEFAULT '{}',
    invited_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    accepted_user_id UUID REFERENCES users(id),
    resent_count INTEGER DEFAULT 0,
    last_resent_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_roles_parent ON roles(parent_role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_teams_tenant ON teams(tenant_id);
CREATE INDEX IF NOT EXISTS idx_teams_parent ON teams(parent_team_id);
CREATE INDEX IF NOT EXISTS idx_teams_manager ON teams(manager_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_tenant ON user_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON user_invitations(token);

-- Comments
COMMENT ON TABLE roles IS 'Custom roles with permissions';
COMMENT ON TABLE user_roles IS 'User to role assignments';
COMMENT ON TABLE teams IS 'Team/group hierarchy';
COMMENT ON TABLE team_members IS 'Team membership';
COMMENT ON TABLE password_policies IS 'Password complexity and security policies';
COMMENT ON TABLE user_invitations IS 'User invitation tokens';

COMMENT ON COLUMN roles.permissions IS 'JSON array of permission strings';
COMMENT ON COLUMN roles.is_system IS 'System roles cannot be modified or deleted';
COMMENT ON COLUMN team_members.role IS 'Role within team: member, lead, etc.';
