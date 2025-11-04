/**
 * K6 Load Test: IRISX Calls API
 * Test: 100 concurrent calls, 20 CPS (calls per second)
 * Duration: 30 minutes
 * Target: >98% success rate
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const successRate = new Rate('call_success_rate');
const callDuration = new Trend('call_duration');
const apiResponseTime = new Trend('api_response_time');
const errorCounter = new Counter('errors');

// Test configuration
export const options = {
  scenarios: {
    // Ramp up to 100 concurrent calls
    calls_load_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 },   // Ramp up to 20 VUs
        { duration: '3m', target: 50 },   // Ramp to 50 VUs
        { duration: '5m', target: 100 },  // Ramp to 100 VUs
        { duration: '15m', target: 100 }, // Hold 100 VUs for 15 min
        { duration: '3m', target: 50 },   // Ramp down to 50
        { duration: '2m', target: 0 },    // Ramp down to 0
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'call_success_rate': ['rate>0.98'],     // >98% success rate
    'api_response_time': ['p(95)<2000'],    // 95% of requests < 2s
    'http_req_duration': ['p(99)<5000'],    // 99% of requests < 5s
    'errors': ['count<100'],                 // Less than 100 total errors
  },
};

// Configuration
const API_URL = __ENV.API_URL || 'http://54.160.220.243:3000';
const API_KEY = __ENV.API_KEY || 'test_api_key';
const FROM_NUMBER = __ENV.FROM_NUMBER || '+15559876543';
const DRY_RUN = __ENV.DRY_RUN === 'true';  // Dry run mode - no real calls
const TO_NUMBERS = [
  '+15551111111',
  '+15552222222',
  '+15553333333',
  '+15554444444',
  '+15555555555',
];

export function setup() {
  console.log('Load Test Configuration:');
  console.log(`API URL: ${API_URL}`);
  console.log(`FROM: ${FROM_NUMBER}`);
  console.log(`Peak VUs: 100`);
  console.log(`Duration: 30 minutes`);
  console.log(`Target CPS: ~20`);
  console.log(`DRY RUN: ${DRY_RUN ? 'YES (no real calls)' : 'NO (real calls)'}`);
  console.log('---');

  // Verify API is reachable
  const healthCheck = http.get(`${API_URL}/health`);
  check(healthCheck, {
    'API is healthy': (r) => r.status === 200,
  });

  return { startTime: new Date() };
}

export default function () {
  // Select random destination number
  const toNumber = TO_NUMBERS[Math.floor(Math.random() * TO_NUMBERS.length)];

  // Prepare request payload
  const payload = JSON.stringify({
    to: toNumber,
    from: FROM_NUMBER,
    record: false,  // Don't record during load test
    dry_run: DRY_RUN,  // Dry run mode - skip FreeSWITCH
    metadata: {
      load_test: true,
      vu: __VU,
      iteration: __ITER,
    },
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    tags: {
      name: 'CreateCall',
    },
  };

  // Make API call
  const startTime = new Date();
  const response = http.post(`${API_URL}/v1/calls`, payload, params);
  const endTime = new Date();
  const responseTime = endTime - startTime;

  // Record metrics
  apiResponseTime.add(responseTime);

  // Check response
  const success = check(response, {
    'status is 201': (r) => r.status === 201,
    'has call uuid': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.call && body.call.uuid;
      } catch (e) {
        return false;
      }
    },
    'response time OK': (r) => responseTime < 5000,
  });

  // Record success/failure
  successRate.add(success);

  if (!success) {
    errorCounter.add(1);
    console.error(`Failed request: ${response.status} - ${response.body}`);
  }

  // Parse call data
  if (response.status === 201) {
    try {
      const data = JSON.parse(response.body);
      const callUuid = data.call.uuid;

      // Simulate call duration (random between 30s-180s)
      const duration = Math.floor(Math.random() * 150) + 30;
      callDuration.add(duration);

      // Optional: Monitor call status
      // Uncomment to enable status polling (adds significant load)
      // monitorCallStatus(callUuid, duration);
    } catch (e) {
      console.error('Failed to parse response:', e);
    }
  }

  // Rate limiting: ~20 CPS with 100 VUs = ~5s sleep per iteration
  sleep(Math.random() * 2 + 4); // 4-6 seconds
}

// Optional: Monitor call status
function monitorCallStatus(callUuid, maxDuration) {
  const params = {
    headers: {
      'X-API-Key': API_KEY,
    },
    tags: {
      name: 'GetCallStatus',
    },
  };

  let elapsed = 0;
  const pollInterval = 5; // Poll every 5 seconds

  while (elapsed < maxDuration && elapsed < 60) {
    sleep(pollInterval);
    elapsed += pollInterval;

    const response = http.get(`${API_URL}/v1/calls/${callUuid}`, params);

    if (response.status === 200) {
      try {
        const data = JSON.parse(response.body);
        const status = data.call.status;

        if (['completed', 'failed', 'no-answer', 'busy'].includes(status)) {
          // Call finished
          break;
        }
      } catch (e) {
        console.error('Failed to parse status response:', e);
        break;
      }
    }
  }
}

export function teardown(data) {
  const endTime = new Date();
  const duration = (endTime - data.startTime) / 1000;

  console.log('---');
  console.log('Load Test Complete');
  console.log(`Total Duration: ${Math.floor(duration / 60)} minutes`);
  console.log('Check the results above for detailed metrics');
}

export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  return {
    [`../results/calls-load-test-${timestamp}.json`]: JSON.stringify(data, null, 2),
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, { indent = '', enableColors = false } = {}) {
  const metrics = data.metrics;

  let summary = '\n';
  summary += `${indent}Load Test Summary\n`;
  summary += `${indent}${'='.repeat(50)}\n\n`;

  // Success rate
  if (metrics.call_success_rate) {
    const rate = metrics.call_success_rate.values.rate * 100;
    const color = rate >= 98 ? '\x1b[32m' : '\x1b[31m';
    summary += `${indent}Call Success Rate: ${enableColors ? color : ''}${rate.toFixed(2)}%\x1b[0m\n`;
  }

  // API response time
  if (metrics.api_response_time) {
    summary += `${indent}API Response Time:\n`;
    summary += `${indent}  Average: ${metrics.api_response_time.values.avg.toFixed(2)}ms\n`;
    summary += `${indent}  P95: ${metrics.api_response_time.values['p(95)'].toFixed(2)}ms\n`;
    summary += `${indent}  P99: ${metrics.api_response_time.values['p(99)'].toFixed(2)}ms\n`;
  }

  // HTTP request duration
  if (metrics.http_req_duration) {
    summary += `${indent}HTTP Request Duration:\n`;
    summary += `${indent}  Average: ${metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
    summary += `${indent}  P95: ${metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
    summary += `${indent}  P99: ${metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n`;
  }

  // Total requests
  if (metrics.http_reqs) {
    summary += `${indent}Total Requests: ${metrics.http_reqs.values.count}\n`;
  }

  // Errors
  if (metrics.errors) {
    const errorCount = metrics.errors.values.count;
    const color = errorCount < 100 ? '\x1b[32m' : '\x1b[31m';
    summary += `${indent}Total Errors: ${enableColors ? color : ''}${errorCount}\x1b[0m\n`;
  }

  summary += `\n${indent}${'='.repeat(50)}\n`;

  return summary;
}
