/**
 * K6 Stress Test: IRISX API (All Endpoints)
 * Test: Mixed workload across all API endpoints
 * Duration: 15 minutes
 * Target: Identify breaking point
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const successRate = new Rate('success_rate');
const apiResponseTime = new Trend('api_response_time');

export const options = {
  scenarios: {
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '5m', target: 100 },
        { duration: '2m', target: 150 },
        { duration: '3m', target: 200 },  // Push to breaking point
        { duration: '2m', target: 100 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration': ['p(99)<10000'], // 99% < 10s even under stress
  },
};

const API_URL = __ENV.API_URL || 'http://54.160.220.243:3000';
const API_KEY = __ENV.API_KEY || 'test_api_key';

const params = {
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  },
};

export default function () {
  // Randomly choose an endpoint to test
  const endpoints = [
    testHealthCheck,
    testListCalls,
    testListSMS,
    testAnalyticsDashboard,
    testPhoneNumberSearch,
  ];

  const testFunc = endpoints[Math.floor(Math.random() * endpoints.length)];
  testFunc();

  sleep(Math.random() * 3 + 1); // 1-4 seconds
}

function testHealthCheck() {
  group('Health Check', () => {
    const response = http.get(`${API_URL}/health`);
    check(response, {
      'health check OK': (r) => r.status === 200,
    });
  });
}

function testListCalls() {
  group('List Calls', () => {
    const response = http.get(`${API_URL}/v1/calls?limit=50&page=1`, params);
    const success = check(response, {
      'list calls OK': (r) => r.status === 200,
      'has pagination': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.pagination !== undefined;
        } catch (e) {
          return false;
        }
      },
    });
    successRate.add(success);
  });
}

function testListSMS() {
  group('List SMS', () => {
    const response = http.get(`${API_URL}/v1/sms?limit=50&page=1`, params);
    const success = check(response, {
      'list SMS OK': (r) => r.status === 200,
    });
    successRate.add(success);
  });
}

function testAnalyticsDashboard() {
  group('Analytics Dashboard', () => {
    const response = http.get(`${API_URL}/v1/analytics/dashboard`, params);
    const success = check(response, {
      'analytics OK': (r) => r.status === 200,
      'has stats': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.calls !== undefined;
        } catch (e) {
          return false;
        }
      },
    });
    successRate.add(success);
  });
}

function testPhoneNumberSearch() {
  group('Phone Number Search', () => {
    const response = http.get(
      `${API_URL}/v1/phone-numbers/search?country=US&limit=10`,
      params
    );
    const success = check(response, {
      'search OK': (r) => r.status === 200,
    });
    successRate.add(success);
  });
}
