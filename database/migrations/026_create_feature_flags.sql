-- Feature Flags Management
-- Allows admins to control feature rollouts system-wide or per-tenant

CREATE TABLE IF NOT EXISTS feature_flags (
  id SERIAL PRIMARY KEY,

  -- Flag identification
  key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Status
  enabled BOOLEAN DEFAULT false,

  -- Rollout configuration
  rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  rollout_tenants JSONB DEFAULT '[]'::jsonb, -- Array of tenant IDs for targeted rollout

  -- Metadata
  created_by INTEGER REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  CONSTRAINT feature_flags_key_valid CHECK (key ~ '^[a-z0-9_]+$')
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled);

-- Tenant-specific feature overrides
-- Allows per-tenant feature enabling/disabling
CREATE TABLE IF NOT EXISTS tenant_feature_overrides (
  id SERIAL PRIMARY KEY,

  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_key VARCHAR(100) NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,

  -- Metadata
  created_by INTEGER REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(tenant_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_overrides_tenant ON tenant_feature_overrides(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_overrides_key ON tenant_feature_overrides(feature_key);

-- Insert some default feature flags
INSERT INTO feature_flags (key, name, description, enabled, rollout_percentage, created_at) VALUES
  ('ai_powered_routing', 'AI-Powered Channel Routing', 'Machine learning model for optimal channel selection', false, 0, NOW()),
  ('new_campaign_builder', 'New Campaign Builder UI', 'Vue 3 drag-and-drop campaign builder', false, 10, NOW()),
  ('advanced_analytics', 'Advanced Analytics Dashboard', 'Enhanced analytics with predictive insights', false, 0, NOW()),
  ('multi_agent_support', 'Multi-Agent Support', 'Allow multiple agents per tenant', true, 100, NOW()),
  ('voice_transcription', 'Voice Call Transcription', 'Automatic transcription of voice calls', false, 25, NOW()),
  ('sentiment_analysis', 'Sentiment Analysis', 'Real-time sentiment detection in conversations', false, 0, NOW()),
  ('custom_integrations', 'Custom Integrations', 'Allow tenants to build custom integrations', false, 0, NOW()),
  ('priority_support', 'Priority Support', '24/7 priority support access', false, 0, NOW())
ON CONFLICT (key) DO NOTHING;

-- Comment on tables
COMMENT ON TABLE feature_flags IS 'System-wide feature flags for gradual rollouts';
COMMENT ON TABLE tenant_feature_overrides IS 'Per-tenant feature flag overrides';

COMMENT ON COLUMN feature_flags.rollout_percentage IS 'Percentage of tenants to enable (0-100), hash-based for consistency';
COMMENT ON COLUMN feature_flags.rollout_tenants IS 'JSON array of specific tenant IDs for beta testing';
