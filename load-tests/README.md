# IRISX Load Testing

Load and stress tests for IRISX API using k6.

## Prerequisites

### Install k6

**macOS:**
```bash
brew install k6
```

**Linux:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Windows:**
```bash
choco install k6
```

Or download from: https://k6.io/docs/getting-started/installation

## Test Scripts

### 1. Calls Load Test
**File:** `scripts/calls-load-test.js`
**Purpose:** Test call creation under load
**Profile:** 100 concurrent VUs, 20 CPS, 30 minutes
**Target:** >98% success rate

```bash
k6 run scripts/calls-load-test.js \
  --env API_URL=http://54.160.220.243:3000 \
  --env API_KEY=your_api_key_here \
  --env FROM_NUMBER=+15559876543
```

### 2. SMS Load Test
**File:** `scripts/sms-load-test.js`
**Purpose:** Test SMS sending under load
**Profile:** 200 messages/minute, 30 minutes
**Target:** >99% success rate

```bash
k6 run scripts/sms-load-test.js \
  --env API_URL=http://54.160.220.243:3000 \
  --env API_KEY=your_api_key_here \
  --env FROM_NUMBER=+15559876543
```

### 3. API Stress Test
**File:** `scripts/api-stress-test.js`
**Purpose:** Find breaking point of API
**Profile:** Ramp up to 200 VUs, mixed endpoints
**Target:** Identify performance limits

```bash
k6 run scripts/api-stress-test.js \
  --env API_URL=http://54.160.220.243:3000 \
  --env API_KEY=your_api_key_here
```

## Running Tests

### Basic Run

```bash
k6 run scripts/calls-load-test.js
```

### With Environment Variables

Create `.env` file:
```bash
API_URL=http://54.160.220.243:3000
API_KEY=your_api_key_here
FROM_NUMBER=+15559876543
```

Run with env file:
```bash
export $(cat .env | xargs) && k6 run scripts/calls-load-test.js
```

### Output Results to File

```bash
k6 run scripts/calls-load-test.js --out json=results/calls-test-result.json
```

### Cloud Run (k6 Cloud)

```bash
k6 cloud scripts/calls-load-test.js
```

## Interpreting Results

### Success Criteria

**Calls Load Test:**
- ✅ Call success rate > 98%
- ✅ API response time P95 < 2000ms
- ✅ HTTP request duration P99 < 5000ms
- ✅ Total errors < 100

**SMS Load Test:**
- ✅ SMS success rate > 99%
- ✅ API response time P95 < 1000ms
- ✅ HTTP request duration P99 < 3000ms
- ✅ Total errors < 50

**API Stress Test:**
- ✅ HTTP request duration P99 < 10000ms (even under stress)
- ✅ Identify maximum sustainable load

### Reading Output

```
call_success_rate.............: 99.24%  ✅ Good (> 98%)
api_response_time.............: avg=450ms p(95)=1200ms  ✅ Good
http_req_duration.............: avg=550ms p(99)=2800ms  ✅ Good
http_reqs.....................: 50000 total
errors........................: 38 total  ✅ Good (< 100)
```

## Monitoring During Tests

### Watch API Server

```bash
# SSH to API server
ssh -i ~/.ssh/your-key.pem ubuntu@54.160.220.243

# Monitor PM2 processes
pm2 monit

# Watch logs
pm2 logs --lines 100

# Check CPU/Memory
htop
```

### Watch Database

```bash
# Monitor PostgreSQL connections
psql -h your-rds-endpoint.rds.amazonaws.com -U postgres -d irisx -c "SELECT count(*) FROM pg_stat_activity;"

# Check slow queries
psql -h your-rds-endpoint.rds.amazonaws.com -U postgres -d irisx -c "SELECT query, calls, total_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

### Watch Redis

```bash
# Connect to Redis
redis-cli -h your-redis-endpoint.cache.amazonaws.com

# Monitor commands
redis-cli -h your-redis-endpoint.cache.amazonaws.com MONITOR

# Check memory
redis-cli -h your-redis-endpoint.cache.amazonaws.com INFO memory
```

## Troubleshooting

### Test Fails to Start

**Error:** `connection refused`
**Solution:** Verify API URL and ensure API is running

**Error:** `401 Unauthorized`
**Solution:** Check API_KEY environment variable

**Error:** `too many open files`
**Solution:** Increase file descriptor limit:
```bash
ulimit -n 10000
```

### High Error Rate

**Symptom:** Error rate > 2%
**Investigation:**
1. Check API logs: `pm2 logs`
2. Check database connections
3. Check Redis memory
4. Verify rate limits not triggered

### Slow Response Times

**Symptom:** P95 > 2000ms
**Investigation:**
1. Check CPU usage on API server
2. Check database query performance
3. Check network latency
4. Review slow query logs

## Best Practices

### Before Running Tests

- [ ] Inform team about load test
- [ ] Verify production environment not affected
- [ ] Take database backup
- [ ] Check current system load
- [ ] Clear old logs and results
- [ ] Warm up API (run small test first)

### During Tests

- [ ] Monitor API server resources
- [ ] Watch error logs in real-time
- [ ] Track database connections
- [ ] Monitor Redis memory
- [ ] Note any anomalies

### After Tests

- [ ] Analyze results against thresholds
- [ ] Review error logs
- [ ] Check for memory leaks
- [ ] Document findings
- [ ] Create tickets for issues found
- [ ] Archive test results

## Test Schedule

### Pre-Beta (Week 11)
- ✅ Smoke test (10 VUs, 5 minutes)
- ✅ Load test (100 VUs, 30 minutes)
- ✅ Stress test (find breaking point)

### Beta Period (Weeks 12-18)
- Weekly: Load test (validate stability)
- Monthly: Stress test (capacity planning)

### Pre-Production (Week 19)
- Full load test (expected prod traffic × 2)
- Soak test (sustained load, 4 hours)
- Spike test (sudden traffic surge)

## Results Archive

Results are saved to `results/` directory:
```
results/
├── calls-load-test-2025-10-30.json
├── sms-load-test-2025-10-30.json
└── api-stress-test-2025-10-30.json
```

## Integration with CI/CD

### GitHub Actions

```yaml
name: Load Tests

on:
  schedule:
    - cron: '0 2 * * 1'  # Every Monday 2am

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6
      - name: Run load tests
        run: |
          k6 run load-tests/scripts/calls-load-test.js \
            --env API_URL=${{ secrets.API_URL }} \
            --env API_KEY=${{ secrets.API_KEY }}
```

## Resources

- [k6 Documentation](https://k6.io/docs/)
- [k6 Cloud](https://k6.io/cloud)
- [Best Practices](https://k6.io/docs/testing-guides/api-load-testing/)
- [Metrics Reference](https://k6.io/docs/using-k6/metrics/)

## Support

Issues? Contact:
- Engineering team in #load-testing Slack channel
- Email: devops@useiris.com
