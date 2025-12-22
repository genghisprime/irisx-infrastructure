/**
 * Test Helpers
 *
 * Utility functions for testing IRISX API
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Generate a valid UUID
 */
export const generateUUID = () => crypto.randomUUID();

/**
 * Generate test JWT token
 */
export const generateTestToken = (payload = {}, expiresIn = '1h') => {
  const defaultPayload = {
    userId: generateUUID(),
    tenantId: generateUUID(),
    email: 'test@example.com',
    role: 'admin',
    ...payload
  };

  return jwt.sign(defaultPayload, process.env.JWT_SECRET || 'test-secret', { expiresIn });
};

/**
 * Generate test API key
 */
export const generateTestApiKey = () => {
  return `irisx_test_${crypto.randomBytes(24).toString('hex')}`;
};

/**
 * Create test request context
 */
export const createTestContext = (overrides = {}) => ({
  tenant: {
    id: generateUUID(),
    name: 'Test Tenant',
    ...overrides.tenant
  },
  user: {
    id: generateUUID(),
    email: 'test@example.com',
    role: 'admin',
    ...overrides.user
  },
  ...overrides
});

/**
 * Wait for a specified time
 */
export const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generate random phone number
 */
export const generatePhoneNumber = () => {
  const areaCode = Math.floor(Math.random() * 900) + 100;
  const exchange = Math.floor(Math.random() * 900) + 100;
  const subscriber = Math.floor(Math.random() * 9000) + 1000;
  return `+1${areaCode}${exchange}${subscriber}`;
};

/**
 * Generate random email
 */
export const generateEmail = () => {
  const random = crypto.randomBytes(8).toString('hex');
  return `test-${random}@example.com`;
};

/**
 * Create mock HTTP request
 */
export const createMockRequest = (overrides = {}) => ({
  method: 'GET',
  url: '/test',
  headers: {
    'content-type': 'application/json',
    ...overrides.headers
  },
  body: overrides.body || {},
  params: overrides.params || {},
  query: overrides.query || {},
  ...overrides
});

/**
 * Create mock HTTP response
 */
export const createMockResponse = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null
  };

  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });

  res.json = jest.fn((data) => {
    res.body = data;
    return res;
  });

  res.header = jest.fn((key, value) => {
    res.headers[key] = value;
    return res;
  });

  res.send = jest.fn((data) => {
    res.body = data;
    return res;
  });

  return res;
};

/**
 * Assert API response structure
 */
export const assertSuccessResponse = (response) => {
  expect(response.statusCode).toBeLessThan(400);
  expect(response.body).toBeDefined();
};

/**
 * Assert error response structure
 */
export const assertErrorResponse = (response, expectedStatus) => {
  expect(response.statusCode).toBe(expectedStatus);
  expect(response.body).toHaveProperty('error');
};

/**
 * Generate bulk test data
 */
export const generateBulkData = (generator, count) => {
  return Array.from({ length: count }, () => generator());
};

/**
 * Deep clone an object
 */
export const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

/**
 * Compare dates within tolerance
 */
export const datesAreClose = (date1, date2, toleranceMs = 1000) => {
  const d1 = new Date(date1).getTime();
  const d2 = new Date(date2).getTime();
  return Math.abs(d1 - d2) <= toleranceMs;
};

export default {
  generateUUID,
  generateTestToken,
  generateTestApiKey,
  createTestContext,
  wait,
  generatePhoneNumber,
  generateEmail,
  createMockRequest,
  createMockResponse,
  assertSuccessResponse,
  assertErrorResponse,
  generateBulkData,
  deepClone,
  datesAreClose
};
