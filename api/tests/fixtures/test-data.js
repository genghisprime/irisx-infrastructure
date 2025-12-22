/**
 * Test Data Fixtures
 *
 * Pre-defined test data for consistent testing
 */

import crypto from 'crypto';

// Generate a consistent UUID from a seed for reproducible tests
const seedUUID = (seed) => {
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32)
  ].join('-');
};

// Test tenants
export const tenants = {
  primary: {
    id: seedUUID('tenant-primary'),
    name: 'Test Company Inc',
    subdomain: 'testcompany',
    plan: 'enterprise',
    status: 'active',
    settings: {
      timezone: 'America/New_York',
      dateFormat: 'MM/DD/YYYY',
      currency: 'USD'
    },
    created_at: new Date('2024-01-01')
  },
  secondary: {
    id: seedUUID('tenant-secondary'),
    name: 'Other Company LLC',
    subdomain: 'othercompany',
    plan: 'professional',
    status: 'active',
    created_at: new Date('2024-02-01')
  },
  suspended: {
    id: seedUUID('tenant-suspended'),
    name: 'Suspended Corp',
    subdomain: 'suspended',
    plan: 'basic',
    status: 'suspended',
    created_at: new Date('2024-03-01')
  }
};

// Test users
export const users = {
  admin: {
    id: seedUUID('user-admin'),
    tenant_id: tenants.primary.id,
    email: 'admin@testcompany.com',
    first_name: 'Admin',
    last_name: 'User',
    role: 'admin',
    is_active: true,
    password_hash: 'hashed_AdminP@ss123!'
  },
  agent: {
    id: seedUUID('user-agent'),
    tenant_id: tenants.primary.id,
    email: 'agent@testcompany.com',
    first_name: 'Agent',
    last_name: 'Smith',
    role: 'agent',
    is_active: true,
    password_hash: 'hashed_AgentP@ss123!'
  },
  supervisor: {
    id: seedUUID('user-supervisor'),
    tenant_id: tenants.primary.id,
    email: 'supervisor@testcompany.com',
    first_name: 'Super',
    last_name: 'Visor',
    role: 'supervisor',
    is_active: true,
    password_hash: 'hashed_SuperP@ss123!'
  },
  inactive: {
    id: seedUUID('user-inactive'),
    tenant_id: tenants.primary.id,
    email: 'inactive@testcompany.com',
    first_name: 'Inactive',
    last_name: 'User',
    role: 'agent',
    is_active: false,
    password_hash: 'hashed_InactiveP@ss123!'
  }
};

// Test phone numbers
export const phoneNumbers = {
  primary: {
    id: seedUUID('phone-primary'),
    tenant_id: tenants.primary.id,
    number: '+15551234567',
    friendly_name: 'Main Line',
    capabilities: ['voice', 'sms'],
    status: 'active'
  },
  secondary: {
    id: seedUUID('phone-secondary'),
    tenant_id: tenants.primary.id,
    number: '+15559876543',
    friendly_name: 'Support Line',
    capabilities: ['voice', 'sms'],
    status: 'active'
  },
  smsOnly: {
    id: seedUUID('phone-sms'),
    tenant_id: tenants.primary.id,
    number: '+15555551234',
    friendly_name: 'SMS Only',
    capabilities: ['sms'],
    status: 'active'
  }
};

// Test campaigns
export const campaigns = {
  active: {
    id: seedUUID('campaign-active'),
    tenant_id: tenants.primary.id,
    name: 'Q1 Outreach',
    type: 'outbound',
    status: 'active',
    settings: {
      dialingMode: 'preview',
      maxConcurrent: 5
    },
    created_at: new Date('2024-01-15')
  },
  paused: {
    id: seedUUID('campaign-paused'),
    tenant_id: tenants.primary.id,
    name: 'Holiday Campaign',
    type: 'outbound',
    status: 'paused',
    created_at: new Date('2024-02-01')
  },
  completed: {
    id: seedUUID('campaign-completed'),
    tenant_id: tenants.primary.id,
    name: 'Old Campaign',
    type: 'outbound',
    status: 'completed',
    created_at: new Date('2023-12-01')
  }
};

// Test queues
export const queues = {
  sales: {
    id: seedUUID('queue-sales'),
    tenant_id: tenants.primary.id,
    name: 'Sales Queue',
    type: 'inbound',
    priority: 1,
    settings: {
      maxWaitTime: 300,
      skillBased: true
    }
  },
  support: {
    id: seedUUID('queue-support'),
    tenant_id: tenants.primary.id,
    name: 'Support Queue',
    type: 'inbound',
    priority: 2,
    settings: {
      maxWaitTime: 600,
      skillBased: true
    }
  }
};

// Test calls
export const calls = {
  completed: {
    id: seedUUID('call-completed'),
    tenant_id: tenants.primary.id,
    twilio_sid: 'CA' + seedUUID('twilio-call-1').replace(/-/g, ''),
    from: phoneNumbers.primary.number,
    to: '+15559998888',
    direction: 'outbound',
    status: 'completed',
    duration: 180,
    created_at: new Date('2024-03-01T10:00:00Z'),
    ended_at: new Date('2024-03-01T10:03:00Z')
  },
  inProgress: {
    id: seedUUID('call-inprogress'),
    tenant_id: tenants.primary.id,
    twilio_sid: 'CA' + seedUUID('twilio-call-2').replace(/-/g, ''),
    from: '+15557776666',
    to: phoneNumbers.primary.number,
    direction: 'inbound',
    status: 'in-progress',
    created_at: new Date()
  },
  failed: {
    id: seedUUID('call-failed'),
    tenant_id: tenants.primary.id,
    twilio_sid: 'CA' + seedUUID('twilio-call-3').replace(/-/g, ''),
    from: phoneNumbers.primary.number,
    to: '+15551112222',
    direction: 'outbound',
    status: 'failed',
    error_code: '21211',
    error_message: 'Invalid To number',
    created_at: new Date('2024-03-01T11:00:00Z')
  }
};

// Test SMS messages
export const smsMessages = {
  delivered: {
    id: seedUUID('sms-delivered'),
    tenant_id: tenants.primary.id,
    twilio_sid: 'SM' + seedUUID('twilio-sms-1').replace(/-/g, ''),
    from: phoneNumbers.primary.number,
    to: '+15559998888',
    body: 'Hello! This is a test message.',
    direction: 'outbound',
    status: 'delivered',
    created_at: new Date('2024-03-01T10:00:00Z'),
    delivered_at: new Date('2024-03-01T10:00:05Z')
  },
  pending: {
    id: seedUUID('sms-pending'),
    tenant_id: tenants.primary.id,
    twilio_sid: 'SM' + seedUUID('twilio-sms-2').replace(/-/g, ''),
    from: phoneNumbers.primary.number,
    to: '+15557776666',
    body: 'This message is pending.',
    direction: 'outbound',
    status: 'queued',
    created_at: new Date()
  },
  inbound: {
    id: seedUUID('sms-inbound'),
    tenant_id: tenants.primary.id,
    twilio_sid: 'SM' + seedUUID('twilio-sms-3').replace(/-/g, ''),
    from: '+15553334444',
    to: phoneNumbers.primary.number,
    body: 'Can you help me?',
    direction: 'inbound',
    status: 'received',
    created_at: new Date('2024-03-01T09:00:00Z')
  }
};

// Test contacts
export const contacts = {
  john: {
    id: seedUUID('contact-john'),
    tenant_id: tenants.primary.id,
    first_name: 'John',
    last_name: 'Doe',
    email: 'john.doe@example.com',
    phone: '+15559998888',
    company: 'Acme Corp',
    tags: ['lead', 'priority']
  },
  jane: {
    id: seedUUID('contact-jane'),
    tenant_id: tenants.primary.id,
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane.smith@example.com',
    phone: '+15557776666',
    company: 'XYZ Inc',
    tags: ['customer']
  }
};

// Test budgets
export const budgets = {
  monthly: {
    id: seedUUID('budget-monthly'),
    tenant_id: tenants.primary.id,
    name: 'Monthly Call Budget',
    type: 'monthly',
    category: 'calls',
    amount: 5000,
    alert_thresholds: [50, 75, 90, 100],
    is_active: true
  },
  sms: {
    id: seedUUID('budget-sms'),
    tenant_id: tenants.primary.id,
    name: 'SMS Budget',
    type: 'monthly',
    category: 'sms',
    amount: 1000,
    alert_thresholds: [75, 90, 100],
    is_active: true
  }
};

// Test API keys
export const apiKeys = {
  active: {
    id: seedUUID('apikey-active'),
    tenant_id: tenants.primary.id,
    name: 'Production API Key',
    key_hash: 'hashed_irisx_live_abc123',
    prefix: 'irisx_live_abc',
    permissions: ['calls:*', 'sms:*', 'contacts:*'],
    is_active: true,
    last_used_at: new Date()
  },
  readonly: {
    id: seedUUID('apikey-readonly'),
    tenant_id: tenants.primary.id,
    name: 'Read-only Key',
    key_hash: 'hashed_irisx_live_readonly',
    prefix: 'irisx_live_rea',
    permissions: ['calls:read', 'sms:read', 'contacts:read'],
    is_active: true
  },
  expired: {
    id: seedUUID('apikey-expired'),
    tenant_id: tenants.primary.id,
    name: 'Expired Key',
    key_hash: 'hashed_irisx_test_expired',
    prefix: 'irisx_test_exp',
    permissions: ['*'],
    is_active: false,
    expires_at: new Date('2024-01-01')
  }
};

// Test roles
export const roles = {
  customAdmin: {
    id: seedUUID('role-custom-admin'),
    tenant_id: tenants.primary.id,
    name: 'Custom Admin',
    description: 'Custom admin role with limited permissions',
    permissions: ['calls:*', 'sms:*', 'users:read', 'reports:*'],
    is_system: false
  },
  supervisor: {
    id: seedUUID('role-supervisor'),
    tenant_id: tenants.primary.id,
    name: 'Supervisor',
    description: 'Team supervisor role',
    permissions: ['calls:*', 'sms:*', 'agents:manage', 'reports:read'],
    is_system: false
  }
};

// Export all fixtures as default
export default {
  tenants,
  users,
  phoneNumbers,
  campaigns,
  queues,
  calls,
  smsMessages,
  contacts,
  budgets,
  apiKeys,
  roles
};
