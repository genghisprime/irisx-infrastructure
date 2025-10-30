/**
 * K6 Load Test: IRISX SMS API
 * Test: 200 SMS per minute
 * Duration: 30 minutes
 * Target: >99% delivery rate
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const successRate = new Rate('sms_success_rate');
const apiResponseTime = new Trend('api_response_time');
const errorCounter = new Counter('errors');

// Test configuration
export const options = {
  scenarios: {
    sms_load_test: {
      executor: 'constant-arrival-rate',
      rate: 200,              // 200 SMS per minute
      timeUnit: '1m',
      duration: '30m',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    'sms_success_rate': ['rate>0.99'],      // >99% success rate
    'api_response_time': ['p(95)<1000'],    // 95% < 1s
    'http_req_duration': ['p(99)<3000'],    // 99% < 3s
    'errors': ['count<50'],                  // Less than 50 errors
  },
};

const API_URL = __ENV.API_URL || 'http://54.160.220.243:3000';
const API_KEY = __ENV.API_KEY || 'test_api_key';
const FROM_NUMBER = __ENV.FROM_NUMBER || '+15559876543';

const MESSAGE_TEMPLATES = [
  'Hello! This is a test message #{ITER}',
  'Your verification code is: #{ITER}',
  'Order #{ITER} has been confirmed',
  'Reminder: Your appointment is tomorrow',
  'Test message #{ITER} from IRISX load test',
];

export default function () {
  const toNumber = `+1555${Math.floor(Math.random() * 9000000) + 1000000}`;
  const template = MESSAGE_TEMPLATES[Math.floor(Math.random() * MESSAGE_TEMPLATES.length)];
  const message = template.replace('#{ITER}', __ITER);

  const payload = JSON.stringify({
    to: toNumber,
    from: FROM_NUMBER,
    body: message,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  };

  const startTime = new Date();
  const response = http.post(`${API_URL}/v1/sms/send`, payload, params);
  const responseTime = new Date() - startTime;

  apiResponseTime.add(responseTime);

  const success = check(response, {
    'status is 201': (r) => r.status === 201,
    'has message id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.message && body.message.id;
      } catch (e) {
        return false;
      }
    },
  });

  successRate.add(success);

  if (!success) {
    errorCounter.add(1);
    console.error(`SMS failed: ${response.status} - ${response.body}`);
  }
}
