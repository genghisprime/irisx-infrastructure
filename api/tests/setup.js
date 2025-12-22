/**
 * Jest Test Setup
 *
 * Global test configuration and utilities
 */

import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

// Set test environment defaults
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/irisx_test';
process.env.REDIS_HOST = process.env.TEST_REDIS_HOST || 'localhost';

// Global test timeout
jest.setTimeout(30000);

// Mock console.error to reduce noise in tests (optional)
// global.console.error = jest.fn();

// Global beforeAll
beforeAll(async () => {
  // Any global setup
});

// Global afterAll
afterAll(async () => {
  // Any global cleanup
});

// Custom matchers
expect.extend({
  toBeValidUUID(received) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    return {
      message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid UUID`,
      pass
    };
  },

  toBeISODate(received) {
    const date = new Date(received);
    const pass = !isNaN(date.getTime()) && received === date.toISOString();
    return {
      message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid ISO date`,
      pass
    };
  }
});
