# IRISX API Testing Guide

This guide covers how to run tests and write new tests for the IRISX API.

## Quick Start

```bash
# Navigate to the API directory
cd api

# Install dependencies (if not already done)
npm install

# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only e2e tests
npm run test:e2e
```

## Test Structure

```
api/tests/
├── unit/                    # Unit tests for individual functions/services
│   └── services/            # Service layer tests
│       ├── rbac.test.js
│       ├── credit-system.test.js
│       ├── sms.test.js
│       ├── password-policy.test.js
│       └── budget-alerts.test.js
├── integration/             # Integration tests for API routes
│   └── routes/
│       ├── auth.test.js
│       ├── sms.test.js
│       └── calls.test.js
├── e2e/                     # End-to-end tests
├── fixtures/                # Test data and fixtures
│   └── test-data.js
├── mocks/                   # Mock implementations
│   └── database.js
├── helpers.js               # Test utility functions
└── setup.js                 # Global test setup
```

## Test Types

### Unit Tests

Unit tests focus on testing individual services and functions in isolation. Database and external services are mocked.

**Location:** `tests/unit/`

**Example:**
```javascript
import { jest } from '@jest/globals';
import { generateUUID, createTestContext } from '../../helpers.js';

// Mock dependencies
const mockQuery = jest.fn();
jest.unstable_mockModule('../../../src/db.js', () => ({
  default: { query: mockQuery },
  query: mockQuery
}));

const { MyService } = await import('../../../src/services/my-service.js');

describe('MyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should do something', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: generateUUID() }] });

    const result = await MyService.doSomething();

    expect(result).toBeDefined();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
```

### Integration Tests

Integration tests verify that API routes work correctly with mocked databases and services.

**Location:** `tests/integration/`

**Example:**
```javascript
import request from 'supertest';
import { generateTestToken } from '../../helpers.js';

describe('API Routes', () => {
  let app;
  let authToken;

  beforeAll(async () => {
    authToken = generateTestToken();
    const appModule = await import('../../../src/index.js');
    app = appModule.default;
  });

  it('should return 200 for authenticated request', async () => {
    const response = await request(app)
      .get('/api/v1/resource')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
  });
});
```

### E2E Tests

End-to-end tests run against a test database and verify complete workflows.

**Location:** `tests/e2e/`

**Note:** E2E tests require additional setup (test database, etc.)

## Test Helpers

The `helpers.js` file provides utility functions for testing:

```javascript
import {
  generateUUID,           // Generate random UUID
  generateTestToken,      // Generate JWT token for testing
  generateTestApiKey,     // Generate API key for testing
  createTestContext,      // Create mock request context
  wait,                   // Wait for specified milliseconds
  generatePhoneNumber,    // Generate random phone number
  generateEmail,          // Generate random email
  createMockRequest,      // Create mock HTTP request
  createMockResponse,     // Create mock HTTP response
  assertSuccessResponse,  // Assert successful response
  assertErrorResponse,    // Assert error response
  generateBulkData,       // Generate array of test data
  deepClone,              // Deep clone an object
  datesAreClose           // Compare dates within tolerance
} from './helpers.js';
```

## Test Fixtures

Pre-defined test data is available in `fixtures/test-data.js`:

```javascript
import fixtures from '../fixtures/test-data.js';

// Access test data
const { tenants, users, phoneNumbers, campaigns } = fixtures;

// Use in tests
const testUser = users.admin;
const testTenant = tenants.primary;
```

## Mocking

### Database Mocking

```javascript
const mockQuery = jest.fn();
jest.unstable_mockModule('../../../src/db.js', () => ({
  default: { query: mockQuery },
  query: mockQuery
}));

// In tests
mockQuery.mockResolvedValueOnce({ rows: [{ id: '123' }] });
```

### External Service Mocking (e.g., Twilio)

```javascript
const mockTwilioCreate = jest.fn();
jest.unstable_mockModule('twilio', () => ({
  default: jest.fn(() => ({
    messages: { create: mockTwilioCreate },
    calls: { create: mockTwilioCreate }
  }))
}));
```

## Custom Matchers

Custom Jest matchers are available in `setup.js`:

```javascript
// Check if value is valid UUID
expect(value).toBeValidUUID();

// Check if value is valid phone number
expect(value).toBeValidPhoneNumber();

// Check if value is valid email
expect(value).toBeValidEmail();

// Check if array is sorted
expect(array).toBeSorted('asc'); // or 'desc'
```

## Writing Good Tests

### Test Naming

Use descriptive names that explain what is being tested:

```javascript
// Good
it('should reject login for inactive users')
it('should return 404 for non-existent resource')
it('should paginate results when limit is specified')

// Bad
it('test login')
it('error test')
it('works')
```

### Test Organization

Group related tests using `describe` blocks:

```javascript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with valid data', async () => {});
    it('should reject duplicate email', async () => {});
    it('should hash password before storing', async () => {});
  });

  describe('updateUser', () => {
    it('should update user fields', async () => {});
    it('should reject invalid user ID', async () => {});
  });
});
```

### AAA Pattern

Follow the Arrange-Act-Assert pattern:

```javascript
it('should calculate total correctly', () => {
  // Arrange
  const items = [{ price: 10 }, { price: 20 }];

  // Act
  const total = calculateTotal(items);

  // Assert
  expect(total).toBe(30);
});
```

## Coverage Targets

We aim for the following test coverage targets:

| Type        | Target |
|-------------|--------|
| Statements  | 80%    |
| Branches    | 75%    |
| Functions   | 80%    |
| Lines       | 80%    |

Run `npm run test:coverage` to see current coverage.

## CI/CD Integration

Tests are run automatically in CI/CD pipeline:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: |
    cd api
    npm ci
    npm test -- --ci --coverage
```

## Troubleshooting

### ES Modules Issues

If you encounter ES module errors, ensure you're using:
```bash
NODE_OPTIONS='--experimental-vm-modules' jest
```

This is already configured in package.json scripts.

### Mock Not Working

Ensure mocks are set up before importing the module being tested:

```javascript
// ✅ Correct order
jest.unstable_mockModule('module', () => ({ ... }));
const { thing } = await import('./thing.js');

// ❌ Wrong order
const { thing } = await import('./thing.js');
jest.unstable_mockModule('module', () => ({ ... }));
```

### Async Test Timeouts

For long-running tests, increase timeout:

```javascript
it('should complete long operation', async () => {
  // test code
}, 30000); // 30 second timeout
```

## Contributing

When adding new features:

1. Write tests first (TDD encouraged)
2. Ensure all existing tests pass
3. Add both unit and integration tests
4. Update fixtures if needed
5. Aim for >80% coverage on new code
