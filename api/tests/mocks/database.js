/**
 * Database Mock for Unit Testing
 *
 * Mocks the database connection for isolated unit tests
 */

// Store for mock data
const mockStore = {
  tenants: new Map(),
  users: new Map(),
  calls: new Map(),
  campaigns: new Map(),
  contacts: new Map()
};

// Mock query results
let queryResults = [];
let queryIndex = 0;

/**
 * Mock query function
 */
export const query = jest.fn(async (sql, params = []) => {
  // Return next mock result if available
  if (queryResults.length > queryIndex) {
    const result = queryResults[queryIndex];
    queryIndex++;
    return result;
  }

  // Default empty result
  return { rows: [], rowCount: 0 };
});

/**
 * Set mock query results for next queries
 */
export const setQueryResults = (results) => {
  queryResults = Array.isArray(results) ? results : [results];
  queryIndex = 0;
};

/**
 * Reset all mocks
 */
export const resetMocks = () => {
  query.mockClear();
  queryResults = [];
  queryIndex = 0;
  mockStore.tenants.clear();
  mockStore.users.clear();
  mockStore.calls.clear();
  mockStore.campaigns.clear();
  mockStore.contacts.clear();
};

/**
 * Get mock store for assertions
 */
export const getMockStore = () => mockStore;

/**
 * Create mock tenant
 */
export const createMockTenant = (overrides = {}) => ({
  id: 'test-tenant-uuid',
  name: 'Test Tenant',
  subdomain: 'test',
  status: 'active',
  created_at: new Date().toISOString(),
  ...overrides
});

/**
 * Create mock user
 */
export const createMockUser = (overrides = {}) => ({
  id: 'test-user-uuid',
  tenant_id: 'test-tenant-uuid',
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  role: 'admin',
  is_active: true,
  created_at: new Date().toISOString(),
  ...overrides
});

/**
 * Create mock call
 */
export const createMockCall = (overrides = {}) => ({
  id: 'test-call-uuid',
  tenant_id: 'test-tenant-uuid',
  sid: 'CALL123456',
  from_number: '+15551234567',
  to_number: '+15559876543',
  direction: 'outbound',
  status: 'completed',
  duration_seconds: 120,
  created_at: new Date().toISOString(),
  ...overrides
});

/**
 * Create mock campaign
 */
export const createMockCampaign = (overrides = {}) => ({
  id: 'test-campaign-uuid',
  tenant_id: 'test-tenant-uuid',
  name: 'Test Campaign',
  type: 'voice',
  status: 'draft',
  created_at: new Date().toISOString(),
  ...overrides
});

/**
 * Create mock contact
 */
export const createMockContact = (overrides = {}) => ({
  id: 'test-contact-uuid',
  tenant_id: 'test-tenant-uuid',
  phone: '+15551234567',
  email: 'contact@example.com',
  first_name: 'John',
  last_name: 'Doe',
  created_at: new Date().toISOString(),
  ...overrides
});

export default {
  query,
  setQueryResults,
  resetMocks,
  getMockStore,
  createMockTenant,
  createMockUser,
  createMockCall,
  createMockCampaign,
  createMockContact
};
