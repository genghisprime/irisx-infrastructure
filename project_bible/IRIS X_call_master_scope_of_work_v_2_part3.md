# IRIS X Master Scope of Work v2.0 (Part 3 - Final)

## 15. Infrastructure and Deployment

### Infrastructure as Code

**OpenTofu (Terraform fork):**
- Use OpenTofu instead of Terraform (MPL license vs BUSL)
- Same HCL syntax, better community governance
- Version: 1.6+

**Repository Structure:**
```
infrastructure/
├── modules/
│   ├── networking/         # VPC, subnets, security groups
│   ├── compute/            # EC2, ASG, launch templates
│   ├── database/           # RDS, Aurora (when scaling)
│   ├── storage/            # S3, R2 bucket configs
│   ├── monitoring/         # CloudWatch, Grafana
│   └── media/              # FreeSWITCH, Kamailio
├── environments/
│   ├── dev/
│   ├── staging/
│   └── production/
└── terraform.tfvars.example
```

**Startup Phase Terraform (minimal):**

```hcl
# environments/production/main.tf

terraform {
  required_version = ">= 1.6"

  backend "s3" {
    bucket = "irisx-terraform-state"
    key    = "production/terraform.tfstate"
    region = "us-east-1"
    encrypt = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# VPC and Networking
module "networking" {
  source = "../../modules/networking"

  vpc_cidr = "10.0.0.0/16"
  public_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets = ["10.0.10.0/24", "10.0.11.0/24"]
  availability_zones = ["us-east-1a", "us-east-1b"]
}

# FreeSWITCH Media Node (startup: single t3.medium)
module "freeswitch" {
  source = "../../modules/media"

  instance_type = "t3.medium"
  ami_id = var.freeswitch_ami_id
  subnet_id = module.networking.public_subnets[0]
  security_group_ids = [module.networking.media_sg_id]

  user_data = templatefile("${path.module}/user_data.sh", {
    nats_enabled = true
    coturn_enabled = true
    region = var.aws_region
  })

  tags = {
    Name = "irisx-freeswitch-1"
    Environment = "production"
    Role = "media"
  }
}

# Elastic IP for FreeSWITCH (static for SIP trunk registration)
resource "aws_eip" "freeswitch" {
  instance = module.freeswitch.instance_id
  domain   = "vpc"
}

# S3 Bucket for Recordings (or use Cloudflare R2 via API)
resource "aws_s3_bucket" "recordings" {
  bucket = "irisx-recordings-${var.environment}"

  tags = {
    Name = "IRIS X Recordings"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_versioning" "recordings" {
  bucket = aws_s3_bucket.recordings.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "recordings" {
  bucket = aws_s3_bucket.recordings.id

  rule {
    id     = "archive-old-recordings"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "GLACIER_IR"
    }

    expiration {
      days = 90
    }
  }
}

resource "aws_s3_bucket_encryption" "recordings" {
  bucket = aws_s3_bucket.recordings.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "freeswitch_cpu" {
  alarm_name          = "irisx-freeswitch-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "FreeSWITCH CPU above 80%"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    InstanceId = module.freeswitch.instance_id
  }
}

resource "aws_sns_topic" "alerts" {
  name = "irisx-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
```

### Packer AMI Builds

**FreeSWITCH AMI:**

```hcl
# packer/freeswitch.pkr.hcl

packer {
  required_plugins {
    amazon = {
      version = ">= 1.0.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

source "amazon-ebs" "freeswitch" {
  ami_name      = "irisx-freeswitch-{{timestamp}}"
  instance_type = "t3.medium"
  region        = var.aws_region

  source_ami_filter {
    filters = {
      name                = "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["099720109477"]  # Canonical
  }

  ssh_username = "ubuntu"

  tags = {
    Name = "IRIS X FreeSWITCH"
    Version = "1.10.12"
  }
}

build {
  sources = ["source.amazon-ebs.freeswitch"]

  provisioner "shell" {
    inline = [
      "sudo apt-get update",
      "sudo apt-get install -y curl gnupg2 wget lsb-release",

      # Add FreeSWITCH repository
      "wget --http-user=signalwire --http-password=$SIGNALWIRE_TOKEN -O - https://freeswitch.signalwire.com/repo/deb/debian-release/signalwire-freeswitch-repo.gpg | sudo apt-key add -",
      "echo 'deb https://freeswitch.signalwire.com/repo/deb/debian-release/ $(lsb_release -sc) main' | sudo tee /etc/apt/sources.list.d/freeswitch.list",

      # Install FreeSWITCH
      "sudo apt-get update",
      "sudo apt-get install -y freeswitch-meta-all",

      # Install NATS
      "wget https://github.com/nats-io/nats-server/releases/download/v2.10.10/nats-server-v2.10.10-linux-amd64.tar.gz",
      "tar -xzf nats-server-*.tar.gz",
      "sudo mv nats-server-*/nats-server /usr/local/bin/",
      "sudo chmod +x /usr/local/bin/nats-server",

      # Install coturn
      "sudo apt-get install -y coturn",

      # Install Prometheus Node Exporter
      "wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz",
      "tar -xzf node_exporter-*.tar.gz",
      "sudo mv node_exporter-*/node_exporter /usr/local/bin/",
      "sudo chmod +x /usr/local/bin/node_exporter",

      # Create systemd services
      "sudo systemctl enable freeswitch",
      "sudo systemctl enable coturn"
    ]

    environment_vars = [
      "SIGNALWIRE_TOKEN=${var.signalwire_token}"
    ]
  }

  provisioner "file" {
    source      = "configs/freeswitch/"
    destination = "/tmp/freeswitch-configs"
  }

  provisioner "shell" {
    inline = [
      "sudo cp -r /tmp/freeswitch-configs/* /etc/freeswitch/",
      "sudo chown -R freeswitch:freeswitch /etc/freeswitch"
    ]
  }
}
```

### CI/CD Pipeline (GitHub Actions)

**.github/workflows/deploy-api.yml:**

```yaml
name: Deploy API to Cloudflare Workers

on:
  push:
    branches: [main]
    paths:
      - 'api/**'
      - '.github/workflows/deploy-api.yml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        working-directory: ./api
        run: bun install

      - name: Run tests
        working-directory: ./api
        run: bun test

      - name: Deploy to Cloudflare Workers
        working-directory: ./api
        run: bun run deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

**.github/workflows/build-ami.yml:**

```yaml
name: Build FreeSWITCH AMI

on:
  push:
    branches: [main]
    paths:
      - 'packer/**'
      - 'configs/freeswitch/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Packer
        uses: hashicorp/setup-packer@v3
        with:
          version: latest

      - name: Initialize Packer
        working-directory: ./packer
        run: packer init .

      - name: Validate Packer template
        working-directory: ./packer
        run: packer validate freeswitch.pkr.hcl

      - name: Build AMI
        working-directory: ./packer
        run: packer build freeswitch.pkr.hcl
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          SIGNALWIRE_TOKEN: ${{ secrets.SIGNALWIRE_TOKEN }}
```

### Deployment Strategy

**Blue-Green Deployment (for media nodes):**

1. Build new AMI with updated FreeSWITCH config
2. Launch new "green" instance alongside "blue" (current)
3. Register green instance in Redis node registry
4. Wait for health checks to pass (5 minutes)
5. Gradually shift traffic: 10% → 50% → 100% over 30 minutes
6. Monitor error rates and rollback if >1% increase
7. Decommission blue instance after 24 hours (if green stable)

**Canary Deployment (for API/workers):**

1. Deploy new version to 5% of Cloudflare Workers
2. Monitor error rates, latency p95, throughput
3. If stable for 10 minutes, increase to 25%
4. If stable for 20 minutes, increase to 100%
5. Automatic rollback if error rate >0.5% or latency p95 >500ms

### Database Migrations

**Tool:** Prisma or node-pg-migrate

**Migration workflow:**

```bash
# Create migration
bun run migrate:create add_fraud_detection_fields

# Apply migration to dev
bun run migrate:dev

# Apply to staging
bun run migrate:staging

# Apply to production (requires approval)
bun run migrate:prod
```

**Zero-downtime migrations:**

1. **Additive changes only:** Add columns with defaults, don't drop columns
2. **Multi-phase approach:**
   - Phase 1: Add new column with default value
   - Phase 2: Backfill data with worker (async)
   - Phase 3: Deploy code using new column
   - Phase 4: Drop old column (after 7 days)

3. **Large table migrations:** Use `CREATE INDEX CONCURRENTLY` to avoid locking

---

## 16. Observability, SLOs, and KPIs

### Service Level Objectives (SLOs)

**Control Plane (API):**
- **Availability:** 99.9% (43.2 minutes downtime per month)
- **Latency p95:** <400ms
- **Latency p99:** <1s
- **Error rate:** <0.1%

**Media Plane (FreeSWITCH):**
- **Availability:** 99.95% (21.6 minutes downtime per month)
- **Call setup time p95:** <2s (from INVITE to 200 OK)
- **Audio quality MOS:** >4.0 (on PESQ scale)
- **Packet loss:** <0.5%

**Webhook Delivery:**
- **Success rate:** >99.5%
- **Delivery time p95:** <1s (in-region)
- **Retry success rate:** >95% (after 6 retries)

**CDR Processing:**
- **Latency p95:** <5s (call end to CDR written)
- **Accuracy:** 100% (no lost CDRs)

### Key Performance Indicators (KPIs)

**Business Metrics:**
- Monthly Recurring Revenue (MRR)
- Customer Acquisition Cost (CAC)
- Customer Lifetime Value (LTV)
- Gross Margin %
- Churn Rate %

**Technical Metrics:**
- Calls Per Second (CPS)
- Concurrent Channels
- Answer Seizure Ratio (ASR) %
- Average Call Duration (ACD)
- System Uptime %

**Operational Metrics:**
- Incident Count (P0, P1, P2)
- Mean Time to Detect (MTTD)
- Mean Time to Resolve (MTTR)
- Deployment Frequency
- Change Failure Rate %

### Monitoring Stack

**Startup Phase:**
- **Better Stack:** Logs, uptime monitoring, incident alerts
  - Free tier: 1GB logs/month, 10 monitors
  - Upgrade: $10/mo for Slack integration
- **Grafana Cloud Free Tier:**
  - 10K Prometheus series
  - 50GB logs
  - 50GB traces

**Scale Phase:**
- **Prometheus:** Metrics collection
- **Loki:** Log aggregation
- **Grafana:** Dashboards and alerting
- **Tempo:** Distributed tracing
- **OpenTelemetry:** Instrumentation

### Metrics Collection

**FreeSWITCH Exporter (Prometheus):**

```python
# metrics_exporter.py (run on each FreeSWITCH node)

from prometheus_client import start_http_server, Gauge
import ESL
import time

# Define metrics
active_channels = Gauge('freeswitch_active_channels', 'Number of active channels')
cps = Gauge('freeswitch_cps', 'Calls per second')
sessions_total = Gauge('freeswitch_sessions_total', 'Total sessions since start')
cpu_percent = Gauge('freeswitch_cpu_percent', 'CPU usage percentage')

def collect_metrics():
    con = ESL.ESLconnection("localhost", "8021", "ClueCon")

    if con.connected():
        # Get active channels
        e = con.api("show", "channels count")
        channels = int(e.getBody().split()[0])
        active_channels.set(channels)

        # Get CPS
        e = con.api("status")
        for line in e.getBody().split('\n'):
            if 'session(s) per Sec' in line:
                cps_value = float(line.split()[0])
                cps.set(cps_value)

        con.disconnect()

if __name__ == '__main__':
    start_http_server(9090)
    while True:
        collect_metrics()
        time.sleep(5)
```

**API Instrumentation (Hono.js):**

```typescript
// api/src/middleware/metrics.ts

import { Context, Next } from 'hono';
import { Counter, Histogram } from 'prom-client';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status']
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

export async function metricsMiddleware(c: Context, next: Next) {
  const start = Date.now();

  await next();

  const duration = (Date.now() - start) / 1000;
  const path = c.req.path;
  const method = c.req.method;
  const status = c.res.status;

  httpRequestsTotal.inc({ method, path, status });
  httpRequestDuration.observe({ method, path }, duration);
}
```

### Alerting Rules

**Prometheus Alert Rules:**

```yaml
# alerts/api.yml

groups:
  - name: api_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "API error rate is {{ $value | humanizePercentage }} over the last 5 minutes"

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.4
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High API latency"
          description: "API p95 latency is {{ $value }}s (threshold: 0.4s)"

      - alert: DatabaseConnectionPoolExhausted
        expr: pg_stat_database_numbackends / pg_settings_max_connections > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Database connection pool nearly exhausted"
          description: "{{ $value | humanizePercentage }} of database connections in use"

  - name: media_alerts
    interval: 30s
    rules:
      - alert: FreeSWITCHHighCPU
        expr: freeswitch_cpu_percent > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "FreeSWITCH high CPU usage"
          description: "FreeSWITCH CPU is {{ $value }}% on {{ $labels.instance }}"

      - alert: FreeSWITCHHighChannels
        expr: freeswitch_active_channels > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "FreeSWITCH approaching capacity"
          description: "{{ $value }} active channels on {{ $labels.instance }} (limit: 100)"

      - alert: LowASR
        expr: rate(calls_answered[15m]) / rate(calls_attempted[15m]) < 0.85
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Low Answer Seizure Ratio"
          description: "ASR is {{ $value | humanizePercentage }} (threshold: 85%)"
```

**PagerDuty Integration:**

```yaml
# alertmanager/config.yml

route:
  receiver: 'pagerduty'
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 5m
  repeat_interval: 4h

  routes:
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      continue: true

    - match:
        severity: warning
      receiver: 'slack'

receivers:
  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: '<your-pagerduty-key>'
        description: '{{ .CommonAnnotations.summary }}'

  - name: 'slack'
    slack_configs:
      - api_url: '<your-slack-webhook>'
        channel: '#alerts'
        title: '{{ .CommonAnnotations.summary }}'
        text: '{{ .CommonAnnotations.description }}'
```

---

## 17. Observability Dashboard Specifications

### Executive Dashboard

**Audience:** CEO, CFO, executives

**Metrics:**
- **Revenue Today:** $1,234 (↑12% vs yesterday)
- **Revenue MTD:** $45,678 (on track for $60K this month)
- **MRR:** $58,432 (+$3,200 this month)
- **Active Customers:** 127 (+5 this month, -2 churned)
- **Calls Today:** 12,345 (↑8% vs yesterday)
- **System Uptime:** 99.96% (this month)

**Charts:**
- Revenue trend (last 30 days)
- Customer growth (last 12 months)
- Top customers by spend (top 10)

### Operations Dashboard

**Audience:** SRE, DevOps

**Panels:**

**1. Call Metrics:**
- Calls per second (CPS) - live graph
- Active channels - gauge (current / max capacity)
- Answer seizure ratio (ASR) % - trend
- Average call duration (ACD) - trend

**2. System Health:**
- API latency p50/p95/p99 - graph
- API error rate % - graph
- Database connections used/available - gauge
- Redis operations/sec - graph

**3. Media Nodes:**
- Table: Node ID, Region, Channels, CPU %, Memory %, Status
- Map: Geographic distribution of nodes

**4. Carrier Health:**
- Table: Carrier, CPS, ASR %, Avg Setup Time, Health Score
- Graph: Carrier error rate over time

**5. Queue Depth:**
- NATS stream lag - graph
- Redis queue depth - graph
- Worker processing rate - graph

### Tenant Dashboard

**Audience:** Individual customer (tenant)

**Metrics:**
- **Calls Today:** 234 (cost: $4.68)
- **Minutes Today:** 1,456
- **Calls This Month:** 8,923 (cost: $178.46)
- **Current Balance:** $821.54 remaining (spending $5-7/day)

**Charts:**
- Calls per day (last 30 days)
- Cost per day (last 30 days)
- Top destinations (pie chart)

**Recent Calls (table):**
- Call ID, From, To, Duration, Cost, Status, Time

**Actions:**
- Download CDR (CSV)
- View invoice
- Add credits

### Developer Dashboard

**Audience:** API consumers (tenant's developers)

**Panels:**

**1. API Usage:**
- Requests today: 5,432
- Requests this month: 156,789
- Rate limit: 987 / 1,000 remaining

**2. API Performance:**
- Latency p95: 234ms
- Error rate: 0.02%
- Most used endpoints (bar chart)

**3. Webhook Status:**
- Success rate: 99.8%
- Failed webhooks: 5 (view in DLQ)
- Avg response time: 456ms

**4. Recent Errors (table):**
- Timestamp, Endpoint, Error Code, Message

**Actions:**
- View API docs
- Generate new API key
- Test webhook endpoint

---

## 18. Security and Compliance Controls

### Authentication & Authorization

**Multi-Factor Authentication (MFA):**
- Enforced for Owner and Admin roles
- TOTP via Google Authenticator, Authy
- Backup codes provided (10 single-use codes)

**API Key Security:**
- Keys prefixed: `ix_live_` (production), `ix_test_` (sandbox)
- Full key shown once at creation, then only prefix
- Keys hashed with bcrypt (cost factor 12)
- Scopes limit permissions: `calls.read`, `calls.write`, `queues.*`

**Rate Limiting:**
- Per API key: 1,000 req/min (Startup), 10,000 req/min (Growth)
- Per IP (unauthenticated): 100 req/min
- Exponential backoff on repeated 429s

### Encryption

**At Rest:**
- Database: AES-256 encryption (Neon native, Aurora KMS)
- Recordings: S3 server-side encryption (SSE-S3 or SSE-KMS)
- Backups: Encrypted snapshots

**In Transit:**
- API: TLS 1.3 only, cert via Let's Encrypt or AWS ACM
- SIP: TLS for signaling (SIP over TLS), SRTP for media (optional)
- Internal: mTLS between services (in scale phase)

### Network Security

**Firewall Rules (Security Groups):**

**API (Cloudflare Workers):**
- No direct EC2 access, proxied via Cloudflare

**FreeSWITCH (Media Node):**
- Port 5060 (SIP UDP): Open to carrier IPs only (whitelist)
- Port 5061 (SIP TLS): Open to carrier IPs only
- Port 10000-20000 (RTP): Open (required for media)
- Port 8021 (ESL): Localhost only
- Port 22 (SSH): Closed (use SSM Session Manager instead)

**Database:**
- Port 5432 (Postgres): API/worker IPs only (security group)
- No public access

**Redis:**
- Port 6379: API/worker IPs only (security group)
- No public access

**DDoS Protection:**
- Cloudflare DDoS protection (free tier: automatic)
- AWS Shield Standard (free, basic protection)
- AWS Shield Advanced ($3K/month, for enterprise only)

### Access Control

**IAM Policies (AWS):**
- Principle of least privilege
- Service accounts for workers (no long-lived credentials)
- Use IAM roles for EC2 instances
- MFA required for console access

**SSM Session Manager:**
- No SSH keys, no port 22 open
- Connect to EC2 via AWS Systems Manager
- All sessions logged to CloudWatch

```bash
# Connect to FreeSWITCH instance
aws ssm start-session --target i-1234567890abcdef0
```

### Audit Logging

**Events to log:**
- User login/logout
- API key creation/revocation
- Configuration changes (numbers, webhooks, queues)
- Recording access (who downloaded which recording)
- Spend threshold breaches
- Failed authentication attempts

**Audit Log Schema:**
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant_time ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
```

**Retention:** 2 years (compliance requirement for financial data)

### Compliance Frameworks

**SOC 2 Type II (target: Phase 3):**
- **Security:** Policies, access controls, encryption
- **Availability:** Uptime monitoring, redundancy, incident response
- **Processing Integrity:** Data validation, error handling
- **Confidentiality:** Tenant isolation, encryption
- **Privacy:** GDPR compliance, data deletion

**Steps to SOC 2:**
1. Hire compliance consultant (Vanta, Drata, Secureframe)
2. Implement controls (6-12 months)
3. Engage auditor (3 months for audit)
4. Continuous monitoring (quarterly reviews)
5. Annual re-audit

**Cost:** $50-100K for initial audit, $30-50K annually

**HIPAA (if healthcare customers):**
- Business Associate Agreement (BAA)
- PHI encryption at rest and in transit
- Access logging and audit trails
- Risk assessment and mitigation plan

**STIR/SHAKEN (robocall prevention):**
- Phase 1: Rely on carrier's STIR/SHAKEN attestation
- Phase 2: Implement STI-AS (Authentication Service) for signing calls
- Phase 3: Implement STI-VS (Verification Service) for verifying caller ID

### Vulnerability Management

**Dependency Scanning:**
- Dependabot (GitHub): Weekly PRs for outdated packages
- Snyk or Trivy: Scan for known vulnerabilities
- Auto-merge patch versions, manual review for minor/major

**Container/AMI Scanning:**
- Trivy scan on Packer builds
- Fail build if HIGH or CRITICAL vulnerabilities found

**Penetration Testing:**
- Annual third-party pentest (required for SOC 2)
- Bug bounty program (Phase 3+): HackerOne or Bugcrowd

### Incident Response Plan

**Severity Levels:**

**P0 (Critical):**
- Complete outage (API down, all calls failing)
- Data breach
- Response time: Immediate (page on-call)
- Update frequency: Every 30 minutes

**P1 (High):**
- Partial outage (one region down, one carrier failing)
- Elevated error rates (>5%)
- Response time: <15 minutes
- Update frequency: Every hour

**P2 (Medium):**
- Degraded performance (high latency, slow webhooks)
- Single customer impacted
- Response time: <1 hour
- Update frequency: Every 4 hours

**P3 (Low):**
- Minor issues (UI bugs, documentation errors)
- Response time: Next business day
- Update frequency: As needed

**Incident Response Runbook:**

1. **Detection:** Alert fires, customer reports issue
2. **Triage:** On-call engineer assesses severity, creates incident
3. **Escalation:** If P0/P1, page Incident Commander
4. **War Room:** Slack channel created, video call for P0
5. **Mitigation:** Deploy fix, rollback, or failover
6. **Communication:** Status page updated, customers notified
7. **Resolution:** Issue resolved, monitoring continues
8. **Post-Mortem:** Blameless review within 48 hours, action items tracked

---

## 19. Fraud Detection and Prevention

### Fraud Patterns

**Common telecom fraud:**

1. **International Revenue Share Fraud (IRSF):**
   - Attacker calls premium-rate numbers (e.g., +882, +979)
   - Number owner shares revenue with fraudster
   - Can cost $10-100 per minute

2. **Short Duration Calls:**
   - Bot makes 1000s of calls, <6 seconds each
   - Tests stolen credit cards or probes for vulnerabilities
   - Spikes CPS, generates costs with no business value

3. **Traffic Pumping:**
   - Route calls through expensive carriers deliberately
   - Affiliate with carrier, share inflated termination fees

4. **Account Takeover:**
   - Stolen credentials used to make calls
   - Attacker racks up charges on victim's account

5. **Stolen Credit Cards:**
   - Sign up for free trial, make expensive international calls
   - Chargeback 30-60 days later, losses absorbed by IRIS X

### Detection Rules

**Rule 1: Premium Rate Destination Block**

```javascript
const PREMIUM_RATE_PREFIXES = [
  '+882',  // International premium
  '+979',  // International premium
  '+90',   // Turkey (high fraud)
  '+92',   // Pakistan (high fraud)
  '+234',  // Nigeria (high fraud)
  '+251',  // Ethiopia (high fraud)
  '+252',  // Somalia (high fraud)
  '+88216' // Satellite premium
];

async function checkPremiumRate(toNumber, tenantId) {
  const isPremium = PREMIUM_RATE_PREFIXES.some(prefix => toNumber.startsWith(prefix));

  if (isPremium) {
    const tenant = await getTenant(tenantId);

    if (!tenant.settings.allow_premium_destinations) {
      throw new Error('Premium rate destinations blocked for this account. Contact support to enable.');
    }
  }
}
```

**Rule 2: Velocity Limits**

```javascript
async function checkVelocityLimits(tenantId) {
  const limits = await getTenantLimits(tenantId);

  // Check calls in last 1 minute
  const callsLastMinute = await redis.get(`velocity:${tenantId}:1m`);
  if (callsLastMinute > limits.cps * 60) {
    throw new Error('Velocity limit exceeded: too many calls in last minute');
  }

  // Check calls in last hour
  const callsLastHour = await redis.get(`velocity:${tenantId}:1h`);
  if (callsLastHour > limits.max_calls_per_hour) {
    throw new Error('Velocity limit exceeded: too many calls in last hour');
  }

  // Check unique destinations in last hour
  const uniqueDestinations = await redis.scard(`destinations:${tenantId}:1h`);
  if (uniqueDestinations > 50) {
    // Calling >50 different numbers in an hour is suspicious
    await flagForReview(tenantId, 'high_destination_diversity');
  }
}
```

**Rule 3: Short Duration Detection**

```javascript
async function detectShortDurationFraud() {
  // Run every 5 minutes
  const tenants = await getActiveTenants();

  for (const tenant of tenants) {
    const recentCalls = await db.query(`
      SELECT COUNT(*) as short_calls
      FROM cdr
      WHERE tenant_id = $1
        AND created_at > NOW() - INTERVAL '15 minutes'
        AND billable_seconds < 6
    `, [tenant.id]);

    if (recentCalls.short_calls > 100) {
      // More than 100 calls under 6 seconds in 15 minutes = fraud
      await pauseTenant(tenant.id, 'short_duration_fraud_detected');
      await alertSecurityTeam(tenant.id, 'Short duration fraud pattern detected');
    }
  }
}
```

**Rule 4: Spend Spike Detection**

```javascript
async function detectSpendSpike(tenantId) {
  const last24hSpend = await getSpend(tenantId, '24 hours');
  const avg7dSpend = await getAvgDailySpend(tenantId, '7 days');

  if (last24hSpend > avg7dSpend * 5) {
    // Spending 5x normal amount today
    await pauseTenant(tenantId, 'spend_spike_detected');
    await alertTenant(tenantId, 'Unusual spend pattern detected, account paused for review');
  }
}
```

**Rule 5: Geographic Anomaly**

```javascript
async function detectGeographicAnomaly(tenantId) {
  const countriesLast24h = await db.query(`
    SELECT DISTINCT substring(to_number, 1, 3) as country_code
    FROM cdr
    WHERE tenant_id = $1
      AND created_at > NOW() - INTERVAL '24 hours'
  `, [tenantId]);

  if (countriesLast24h.length > 20) {
    // Calling 20+ countries in 24 hours is unusual
    await flagForReview(tenantId, 'high_country_diversity');
  }
}
```

### Automated Actions

**When fraud detected:**

1. **Pause account:** Stop all new calls immediately
2. **Alert tenant:** Email + webhook with reason
3. **Alert security team:** Slack notification for manual review
4. **Log incident:** Audit trail with all evidence

**Resolution workflow:**

1. Security team reviews evidence (CDR, spend, patterns)
2. If fraud: Permanently ban account, report to authorities if severe
3. If false positive: Unpause account, adjust detection rules
4. If legitimate but risky: Require identity verification (KYC), set spending cap

### KYC (Know Your Customer)

**Risk tiers:**

**Low Risk (Developer Plan):**
- Email verification only
- Spending cap: $100/month
- Premium destinations blocked

**Medium Risk (Startup/Growth Plan):**
- Email + phone verification
- Credit card on file (Stripe Identity check)
- Spending cap: $1,000/month
- Can request increase with ID upload

**High Risk (Enterprise Plan):**
- Full KYC: Business name, EIN, address
- Video verification call
- Reference check (for utilities/call centers)
- Unlimited spend (with contract)

### Credit Limits

**Prepaid model (default for new customers):**
- Customer adds credits upfront ($100, $500, $1000)
- Calls deducted in real-time from balance
- Low balance alerts at 20%, 10%, 5%
- Auto-pause when balance hits $0

**Postpaid model (Enterprise customers):**
- Monthly invoicing (NET 30 terms)
- Credit limit based on revenue, credit check
- Soft limit warning at 80% (email)
- Hard limit at 100% (pause account until payment)

**Balance check before call:**

```javascript
async function checkBalance(tenantId, estimatedCost) {
  const tenant = await getTenant(tenantId);

  if (tenant.billing_mode === 'prepaid') {
    const balance = await getBalance(tenantId);

    if (balance < estimatedCost) {
      throw new Error('Insufficient balance. Please add credits to continue.');
    }
  } else if (tenant.billing_mode === 'postpaid') {
    const mtdSpend = await getMonthToDateSpend(tenantId);
    const creditLimit = tenant.credit_limit;

    if (mtdSpend >= creditLimit) {
      throw new Error('Credit limit exceeded. Please contact billing.');
    }
  }
}
```

### Robocall Mitigation

**FCC requirements:**
- Caller ID authentication (STIR/SHAKEN)
- Robocall mitigation plan published
- Register in RMD (Robocall Mitigation Database)

**IRIS X robocall policy:**
1. No auto-dialing to numbers on National DNC Registry
2. Customers must maintain their own DNC lists
3. AMD (answering machine detection) available but not required
4. Predictive dialer abandon rate enforced <3%
5. TCPA compliance responsibility on customer (with tools provided)

**STIR/SHAKEN Attestation Levels:**

- **A (Full):** Originating carrier knows and verifies caller ID
- **B (Partial):** Carrier knows caller but can't verify number ownership
- **C (Gateway):** Carrier received call from gateway, no verification

IRIS X provides **B attestation** initially (we know the tenant but don't verify number ownership beyond purchase records).

---

## 20. Disaster Recovery Procedures

### Recovery Objectives

**RPO (Recovery Point Objective):** Max data loss acceptable
- **Critical data (CDR, billing):** RPO = 5 minutes
- **Configuration data (numbers, apps):** RPO = 1 hour
- **Recordings:** RPO = 24 hours (acceptable loss for disaster)

**RTO (Recovery Time Objective):** Max downtime acceptable
- **API (control plane):** RTO = 15 minutes
- **Media plane:** RTO = 30 minutes (active calls drop, new calls within 30 min)
- **Billing system:** RTO = 4 hours (can process invoices manually short-term)

### Backup Strategy

**Database Backups (Neon/Aurora):**
- **Automated snapshots:** Every 6 hours
- **Point-in-time recovery:** 35-day retention
- **Cross-region replication:** Async replication to secondary region (Phase 3+)

**Configuration Backups:**
- **Terraform state:** Versioned in S3 with encryption
- **Application configs:** Stored in Git, immutable history
- **Secrets:** AWS Secrets Manager with automatic rotation

**Recording Backups:**
- **Primary:** S3 Standard (us-east-1)
- **Backup:** S3 replication to us-west-2 (Phase 3+)
- **Lifecycle:** Glacier after 30 days, delete after 90 days

### Disaster Scenarios

**Scenario 1: Single EC2 Instance Failure**

**Detection:**
- Health check fails 3 times (30 seconds)
- CloudWatch alarm fires
- No call traffic from node

**Response:**
1. Auto Scaling Group launches replacement instance (5 minutes)
2. New instance pulls latest AMI
3. User data script runs: configure NATS, register in Redis
4. Health checks pass, instance added to pool
5. Total downtime: ~5-10 minutes for that node only

**Impact:**
- Active calls on failed node drop (~50-100 calls)
- New calls route to other nodes
- No data loss (CDR already written)

---

**Scenario 2: Database Failure**

**Detection:**
- Connection errors spike
- API returns 503 Service Unavailable
- Monitoring alerts fire

**Response (Neon):**
1. Neon automatically fails over to standby (30-60 seconds)
2. API reconnects automatically (connection pool refresh)
3. Total downtime: 1-2 minutes

**Response (Aurora - Phase 3+):**
1. Aurora automatic failover to read replica (60-120 seconds)
2. API endpoint (cluster endpoint) automatically points to new primary
3. Total downtime: 1-2 minutes

**Impact:**
- API unavailable for 1-2 minutes
- No data loss (last committed transaction)

---

**Scenario 3: Redis Cluster Failure**

**Detection:**
- Redis commands timing out
- Queue depth metrics stop updating
- Worker logs show connection errors

**Response (Upstash):**
1. Upstash automatic failover to replica (30 seconds)
2. Workers reconnect automatically
3. Total downtime: <1 minute

**Response (ElastiCache - Phase 3+):**
1. Redis Cluster automatic failover (30-90 seconds)
2. Workers reconnect to new primary
3. Total downtime: 1-2 minutes

**Impact:**
- In-flight operations may fail (retry on client)
- Queue processing paused briefly
- No data loss for persistent data (JetStream)
- Ephemeral data (agent presence) may need refresh

---

**Scenario 4: Carrier Outage (Twilio)**

**Detection:**
- High rate of SIP 503 errors
- ASR drops below 50%
- Carrier health score <70

**Response:**
1. Automatic carrier downgrade (30 seconds)
2. Route traffic to Telnyx or Bandwidth
3. Alert ops team for manual review

**Manual steps:**
1. Confirm Twilio status page shows outage
2. Notify customers via status page
3. When Twilio recovers, gradually shift traffic back

**Impact:**
- Brief call failure spike (~1-2 minutes)
- ASR may drop to 80-90% during transition
- No long-term impact if secondary carrier healthy

---

**Scenario 5: Region Failure (us-east-1)**

**Detection:**
- All health checks fail in region
- Route 53 health checks fail
- Multiple alarms fire simultaneously

**Response (Phase 1 - Single Region):**
1. **Manual failover required** (launch new EC2 in us-west-2)
2. Update Twilio SIP trunk to point to new IP
3. Restore database from backup
4. Total RTO: 30-60 minutes (manual process)

**Response (Phase 3+ - Multi-Region Active-Passive):**
1. Route 53 detects failure, updates DNS to us-west-2 (TTL: 60 seconds)
2. Aurora Global Database promotes us-west-2 to primary (5 minutes)
3. Media nodes in us-west-2 already running, take full load
4. Total RTO: 5-10 minutes (mostly automatic)

**Response (Phase 4 - Multi-Region Active-Active):**
1. Route 53 instantly routes traffic to healthy regions
2. No database failover needed (Global Database already multi-primary)
3. Total RTO: <1 minute (fully automatic)

**Impact:**
- Phase 1: 30-60 min downtime, last 5 min of data loss possible
- Phase 3: 5-10 min downtime, no data loss
- Phase 4: <1 min downtime, no data loss

---

**Scenario 6: Data Breach**

**Detection:**
- Unusual data export activity
- Failed login attempts spike
- Security monitoring alerts

**Response:**
1. **Immediate:** Isolate affected systems, revoke API keys
2. **1 hour:** Identify breach scope, notify security team
3. **24 hours:** Notify affected customers, regulatory bodies
4. **48 hours:** Post-mortem, implement fixes
5. **7 days:** External security audit, penetration test

**Legal requirements:**
- GDPR: Notify within 72 hours
- US state laws (CCPA, etc.): Notify within 30-90 days

---

### Disaster Recovery Drills

**Quarterly DR Drills:**

**Q1: Database Failover Drill**
- Manually trigger Aurora failover
- Verify RTO <2 minutes
- Verify no data loss

**Q2: Region Failover Drill**
- Simulate us-east-1 outage (block traffic)
- Execute failover runbook
- Verify RTO <15 minutes

**Q3: Carrier Failover Drill**
- Block Twilio traffic
- Verify automatic failover to Telnyx
- Measure call success rate during transition

**Q4: Full Disaster Drill**
- Simulate complete outage (all systems)
- Restore from backups
- Verify RPO and RTO targets met

**Drill checklist:**
- [ ] Runbook documented and up-to-date
- [ ] All team members trained
- [ ] Customer communication plan tested
- [ ] Backups verified (restore test)
- [ ] RTO/RPO targets met
- [ ] Post-drill review completed
- [ ] Action items tracked and resolved

---

## 21. Acceptance Criteria

### Module-by-Module Acceptance Criteria

**9.1 Identity and Tenancy:**
- [ ] User can sign up and create tenant in <30 seconds
- [ ] API key authentication works with Bearer token
- [ ] Rate limits enforced per tenant within 100ms
- [ ] Tenant cannot exceed CPS limit (returns 429)
- [ ] Role permissions enforced on all API endpoints
- [ ] API key scopes prevent unauthorized actions
- [ ] MFA enforced for Owner/Admin roles
- [ ] Audit log captures all sensitive actions

**9.2 Numbers and Carriers:**
- [ ] Search available numbers by area code in <2 seconds
- [ ] Purchase number and assign to application in <10 seconds
- [ ] Port request submitted with automated LOA generation
- [ ] CSR validation errors provide clear messages
- [ ] FOC date tracked, customer notified 24hrs before
- [ ] Post-port inbound calls route correctly within 5 minutes
- [ ] Emergency address validated before number activation
- [ ] Multi-carrier failover works when Twilio fails

**9.3 Call Control and Webhooks:**
- [ ] POST /v1/calls returns 202 Accepted within 200ms
- [ ] Webhook signature validation prevents replay attacks
- [ ] Webhook retries work with exponential backoff (6 attempts)
- [ ] Failed webhooks appear in DLQ, can replay from portal
- [ ] Visual flow builder exports to executable JSON
- [ ] Sandbox mode simulates calls without charges
- [ ] Gather verb collects DTMF and speech correctly
- [ ] Say verb uses TTS, caches for repeat calls
- [ ] Play verb streams audio from customer URL

**9.4 Queue and Agent System:**
- [ ] Queue holds 10K callers without Redis exhaustion
- [ ] Agent login reflects in UI <500ms (Firestore)
- [ ] Call distribution follows strategy correctly
- [ ] Skills-based routing matches in <2 seconds
- [ ] EWT calculation accurate within ±10 seconds
- [ ] Service level updates every 5 seconds
- [ ] Supervisor can monitor agent call without glitches
- [ ] Abandoned calls correctly decremented from queue

**9.5 Dialer Engine:**
- [ ] CSV upload of 100K contacts completes in <60 seconds
- [ ] DNC check completes in <10ms (indexed)
- [ ] Curfew prevents calls outside 8AM-9PM local time
- [ ] Predictive dialer maintains <3% abandon rate
- [ ] AMD identifies machines >85% accuracy
- [ ] Campaign pause stops dials within 2 seconds
- [ ] Max attempts enforced (contact marked complete)
- [ ] Dial ratio auto-adjusts every 2 minutes

**9.6 Media Features:**
- [ ] TTS generates audio in <500ms for 200 chars
- [ ] TTS cache returns URL in <50ms (no generation)
- [ ] Audio upload transcoded to 8kHz mono automatically
- [ ] Recording uploaded to storage <30s after call end
- [ ] Signed URL expires after 15 minutes
- [ ] Redacted recording has silence where specified
- [ ] STT transcription >90% accuracy on clear audio
- [ ] Sentiment analysis completes <10s for 5-min call

**9.7 WebRTC and Softphone:**
- [ ] WebRTC token generated in <200ms
- [ ] Softphone connects to SIP in <3 seconds
- [ ] Audio quality MOS >4.0 (PESQ test)
- [ ] Mute, hold, transfer work without glitches
- [ ] Token cannot be reused after expiry
- [ ] TURN relay works from restricted networks
- [ ] Agent status reflects in dashboard <500ms

**9.8 Billing and Analytics:**
- [ ] CDR written to Postgres <5s after call end
- [ ] Rating engine calculates cost <100ms per call
- [ ] Invoice generated automatically on 1st of month
- [ ] Usage dashboard updates <10s after call end
- [ ] Spend alert fired <1 min after threshold breach
- [ ] ClickHouse queries return <1s for 1M+ rows

---

## 22. Risks and Mitigations

### Risk Matrix

| Risk | Probability | Impact | Owner | Mitigation | Status |
|------|-------------|--------|-------|------------|--------|
| **Function cold starts slow API** | Medium | High | Dev Lead | Keep-alive pings every 5 min, move heavy work to long-lived workers | Mitigated |
| **Firestore cost at scale** | High | High | Dev Lead | Use Aurora for CDR, Firestore only for real-time UI data | Mitigated |
| **Abuse and spam traffic** | High | Critical | Security Lead | Strict KYC, velocity limits, premium destination blocks | In Progress |
| **Carrier outage** | Medium | High | Telephony Lead | Multi-carrier failover, automated routing | Planned (Phase 2) |
| **Transcoding cost** | Low | Medium | Telephony Lead | Prefer direct media (G.711), avoid transcoding | Mitigated |
| **STIR/SHAKEN compliance delay** | Medium | High | Telephony Lead | Rely on carrier attestation initially, build STI-AS in Phase 3 | Accepted |
| **SOC 2 timeline underestimated** | Medium | Medium | Security Lead | Hire compliance consultant early (month 6), allocate 12 months | Planned |
| **Database connection pool exhaustion** | Medium | High | SRE Lead | PgBouncer pooling, monitor connection count, alert at 80% | Mitigated |
| **Redis memory exhaustion** | Low | High | SRE Lead | Monitor memory usage, implement LRU eviction for cache keys | Mitigated |
| **FreeSWITCH memory leak** | Low | Critical | Telephony Lead | Test soak for 24+ hours, monitor RSS growth, auto-restart at threshold | In Progress |
| **Customer churn due to Twilio cost** | Medium | Medium | Product Owner | Price 30% below Twilio, highlight cost savings in marketing | Planned |
| **Competitor (Twilio/Vonage) price war** | Low | High | Product Owner | Differentiate on features (better queue analytics, flow builder) | Accepted |
| **Key person risk (single telephony expert)** | Medium | High | Hiring Manager | Cross-train devs on FreeSWITCH, hire second telephony engineer | Planned (Q2) |
| **AWS bill shock** | Medium | Medium | SRE Lead | Set billing alarms at $500, $1K, $2K; review weekly | Mitigated |
| **Data breach from stolen API key** | Medium | Critical | Security Lead | Rotate keys quarterly, scope limits, monitor unusual usage | Mitigated |
| **GDPR fine for non-compliance** | Low | Critical | Legal/Security | Implement right-to-delete, data export, consent tracking | Planned (Phase 3) |

### Risk Scoring

**Probability:**
- Low: <10% chance in next 12 months
- Medium: 10-50% chance
- High: >50% chance

**Impact:**
- Low: <$10K loss or <1 day downtime
- Medium: $10-100K loss or 1-7 days downtime
- High: $100K-1M loss or 1-4 weeks downtime
- Critical: >$1M loss or >1 month downtime

**Risk Score:** Probability × Impact (scale 1-10)

**Action Thresholds:**
- Score 1-3: Accept risk, monitor
- Score 4-6: Mitigate if cost-effective
- Score 7-10: Must mitigate before launch

---

## 23. Build vs Buy Analysis

### Billing/Rating Engine

**Build:**
- **Pros:** Full control, no vendor lock-in, exact features needed
- **Cons:** 2-3 months dev time, ongoing maintenance, complexity
- **Cost:** $30-50K dev cost (400-600 hours)

**Buy (CGRateS - open source):**
- **Pros:** Battle-tested, handles complex rating, free
- **Cons:** Steep learning curve, Go-based (team is Node/JS), customization hard
- **Cost:** $0 software, $20K integration time

**Decision:** **Build simple rating engine initially**, integrate CGRateS in Phase 3 if complexity increases (multi-currency, time-of-day rating, etc.)

---

### WebRTC Softphone

**Build (Vue component with JsSIP):**
- **Pros:** Full control, customizable, learn WebRTC deeply
- **Cons:** 3-4 weeks dev time, browser compatibility testing
- **Cost:** $15-20K dev cost (200-250 hours)

**Buy (Agora, Twilio Voice SDK, or Daily.co):**
- **Pros:** Production-ready, maintained, handles edge cases
- **Cons:** Vendor lock-in, $0.005-0.01/min cost, less control
- **Cost:** $0.005/min (adds 25% to carrier cost)

**Decision:** **Build in-house** (saves recurring costs, team has Vue expertise)

---

### Webhook Inspector/Debugger

**Build:**
- **Pros:** Integrated into portal, show IRIS X-specific fields
- **Cons:** 1-2 weeks dev time
- **Cost:** $5-10K dev cost (80-120 hours)

**Buy (Svix, Hookdeck):**
- **Pros:** Full-featured, retry logic, analytics
- **Cons:** $50-200/mo, another vendor, less customization
- **Cost:** $50-200/mo = $600-2,400/year

**Decision:** **Build in-house** (relatively simple, better UX when integrated)

---

### Transcription/STT

**Build (self-host Whisper):**
- **Pros:** Lowest cost at scale ($0.001/min on GPU instance)
- **Cons:** Manage infrastructure, GPU instances expensive when idle
- **Cost:** $100-500/mo GPU instance + dev time

**Buy (OpenAI Whisper API, Deepgram, AssemblyAI):**
- **Pros:** Zero infrastructure, pay-per-use, latest models
- **Cons:** $0.0043-0.006/min cost, vendor dependency
- **Cost:** $0.006/min (acceptable at <10K mins/month)

**Decision:** **Buy (OpenAI Whisper API)** for Phase 1-2, re-evaluate self-hosting at >100K mins/month

---

### TTS (Text-to-Speech)

**Build (self-host Coqui TTS or Piper):**
- **Pros:** $0 cost per use, full control over voices
- **Cons:** Lower quality than commercial, manage models
- **Cost:** Dev time + hosting

**Buy (OpenAI TTS, ElevenLabs, AWS Polly):**
- **Pros:** High quality, many voices, pay-per-use
- **Cons:** $0.004-0.015/1K chars, vendor dependency
- **Cost:** $0.015/1K chars (OpenAI) = $15 per 1M chars

**Decision:** **Buy (OpenAI TTS)** for quality, ElevenLabs for premium tier

---

### Analytics Database

**Build (self-host ClickHouse on EC2):**
- **Pros:** Lower cost at scale, full control
- **Cons:** Manage cluster, backups, upgrades
- **Cost:** $100-300/mo EC2 + ops time

**Buy (ClickHouse Cloud, Tinybird):**
- **Pros:** Managed, autoscaling, zero ops
- **Cons:** $100-500/mo cost
- **Cost:** ClickHouse Cloud free tier: 1TB ingestion

**Decision:** **Buy (ClickHouse Cloud)** free tier initially, migrate to self-hosted if cost becomes issue

---

## 24. Dependencies and Assumptions

### Critical Dependencies

**External Services:**
- **Twilio SIP Trunk:** Existing trunk operational, 40-60 CPS capacity available
- **AWS Account:** Active with billing set up, IAM permissions configured
- **Cloudflare Account:** Verified, Workers enabled
- **Domain Name:** irisx.com (or similar) purchased, DNS control
- **Neon Postgres:** Account created, free tier available
- **Upstash Redis:** Account created, free tier available

**Team Availability:**
- **Telephony Engineer:** Available full-time, FreeSWITCH expertise
- **Backend Engineer:** 2 developers full-time, Node.js/TypeScript
- **Frontend Engineer:** 1 developer full-time, Vue 3 expertise
- **DevOps/SRE:** 0.5 FTE, can ramp to 1 FTE in Phase 2

**Third-Party Integrations:**
- **SignalWire Token:** For FreeSWITCH packages (obtain from SignalWire)
- **Let's Encrypt:** For SSL certificates (free, automated)
- **Stripe Account:** For payment processing (if monetizing)

### Key Assumptions

**Technical:**
- [ ] FreeSWITCH 1.10.12 stable on Ubuntu 22.04
- [ ] t3.medium handles 100 concurrent calls (verified in load test)
- [ ] Cloudflare Workers scale to 100K req/min without issues
- [ ] Neon Postgres free tier sufficient for 50K CDRs (6 months runway)
- [ ] NATS JetStream handles 10K events/sec on t3.medium
- [ ] Twilio SIP trunk allows third-party media endpoints (not proxied through Twilio)

**Business:**
- [ ] Customers willing to pay $0.020/min (vs Twilio's $0.013 carrier cost + $0.004 markup)
- [ ] Market exists for "Twilio alternative" (validated via surveys, competitor analysis)
- [ ] 50% of trial users convert to paid (industry standard: 10-30%, need validation)
- [ ] Average customer uses 10K mins/month ($200 revenue)
- [ ] Churn rate <5% per month (industry standard: 5-10%)
- [ ] CAC <$400 (achievable via content marketing, SEO)

**Regulatory:**
- [ ] FCC robocall rules understood and followed (STIR/SHAKEN via carrier acceptable initially)
- [ ] TCPA compliance responsibility on customer (IRIS X provides tools, not liable)
- [ ] GDPR applies (if EU customers), plan for compliance in Phase 3
- [ ] No HIPAA compliance required initially (avoid healthcare customers in Phase 1)

**Timeline:**
- [ ] Phase 0 (Foundations) completed in 4 weeks
- [ ] Phase 1 (Core Calling) completed in 8 weeks
- [ ] Phase 2 (Queues) completed in 6 weeks
- [ ] Phase 3 (Dialer) completed in 8 weeks
- [ ] Total time to market: 26 weeks (~6 months)

### Dependency Risks

**If Twilio trunk unavailable:**
- **Impact:** Cannot originate/terminate calls
- **Mitigation:** Set up Telnyx account in parallel (1-week lead time)

**If Neon Postgres free tier exhausted:**
- **Impact:** Need to pay $20/mo (not critical)
- **Mitigation:** Budget includes $20/mo Neon cost

**If FreeSWITCH expertise not available:**
- **Impact:** Major blocker, cannot build media plane
- **Mitigation:** Hire contractor short-term ($100-150/hr), train internal team

**If AWS costs exceed budget:**
- **Impact:** Financial strain, may need fundraising
- **Mitigation:** Set billing alarms at $500, $1K, $2K; review weekly

---

## 25. Firebase to AWS Migration Path

### Migration Trigger Criteria

**When to migrate:**
- [ ] **Scale:** >50K API requests/min (Cloudflare Workers can handle this, but may want Lambda for tighter AWS integration)
- [ ] **Cost:** Firestore costs >$500/mo (migrate to Aurora/DynamoDB)
- [ ] **Compliance:** SOC 2 audit requires AWS-only stack (simpler compliance boundary)
- [ ] **Performance:** Need <50ms latency between API and database (single-region co-location)

**Do NOT migrate if:**
- Costs <$500/mo and system stable
- Team size <5 engineers (migration is 3-month project)
- No compliance pressure

### Migration Phases

**Phase 1: Control Plane (Cloudflare Workers → AWS Lambda)**

**Reason:** Cloudflare Workers are excellent and cost-effective. Only migrate if:
- Need VPC access to private subnets (database, Redis)
- Compliance requires AWS-only
- Want unified observability (CloudWatch vs Cloudflare Logs)

**Steps:**
1. Rewrite API using AWS Lambda + API Gateway (or Hono on Lambda adapter)
2. Deploy to staging, run parallel with Cloudflare Workers
3. A/B test: 10% → 50% → 100% traffic
4. Cutover DNS, decomm Cloudflare Workers

**Timeline:** 6 weeks (2 weeks dev, 2 weeks testing, 2 weeks migration)

**Cost delta:** $0-5/mo (Cloudflare) → $50-200/mo (Lambda + API Gateway)

---

**Phase 2: Database (Neon Postgres → Aurora Serverless)**

**Reason:** Neon excellent for startup, but Aurora needed for:
- Multi-region replication (Global Database)
- Higher IOPS (>10K req/sec)
- Enterprise compliance (AWS Marketplace listings require Aurora)

**Steps:**
1. Set up Aurora Serverless v2 cluster
2. Enable logical replication from Neon to Aurora (using pglogical or AWS DMS)
3. Run dual-write for 48 hours (write to both, read from Neon)
4. Flip read traffic to Aurora
5. Monitor for 24 hours, then flip writes
6. Decomm Neon after 7-day grace period

**Timeline:** 4 weeks (2 weeks setup, 1 week dual-write, 1 week validation)

**Cost delta:** $0-20/mo (Neon) → $100-300/mo (Aurora Serverless v2)

**Downtime:** Zero (dual-write cutover)

---

**Phase 3: Real-Time Data (Firestore → DynamoDB Streams + AppSync)**

**Reason:** Firestore perfect for real-time dashboards. Only migrate if:
- Need single-vendor compliance (AWS-only)
- Cost >$500/mo
- Need custom access patterns (DynamoDB more flexible)

**Steps:**
1. Model Firestore data in DynamoDB (collections → tables, documents → items)
2. Set up DynamoDB Streams → Lambda → AppSync (for real-time subscriptions)
3. Implement GraphQL API via AppSync
4. Migrate frontend from Firestore listeners to AppSync subscriptions
5. Backfill data with export/import
6. Run parallel for 1 week, then cutover

**Timeline:** 8 weeks (major frontend refactor)

**Cost delta:** $50-200/mo (Firestore) → $100-300/mo (DynamoDB + AppSync)

**Complexity:** High (AppSync is powerful but steep learning curve)

---

**Phase 4: Event Bus (NATS → EventBridge + SQS/Kinesis)**

**Reason:** NATS is excellent and self-hosted. Only migrate if:
- Want managed service (eliminate self-hosted maintenance)
- Need AWS-native integrations (Lambda triggers, Step Functions)
- Need long-term event retention (Kinesis Data Streams)

**Steps:**
1. Set up EventBridge custom bus + SQS queues for workers
2. Dual-publish events to both NATS and EventBridge
3. Run consumers from both for 48 hours
4. Cutover consumers to EventBridge
5. Decomm NATS

**Timeline:** 4 weeks

**Cost delta:** $0/mo (NATS self-hosted) → $50-200/mo (EventBridge + SQS)

---

### Total Migration Cost

**Time:** 22 weeks (~5.5 months) if done sequentially, 3 months if parallel

**Engineering cost:** 2 engineers × 3 months = 6 engineer-months = $60-90K salary cost

**Infrastructure cost increase:** $150-300/mo → $300-800/mo

**Recommendation:** Do NOT migrate unless absolutely necessary. Firebase + Cloudflare + Neon is a fantastic stack for <$10M ARR companies.

---

## 26. Roles and RACI Matrix

### Team Structure (Startup Phase)

**Core Team (6 people):**
- **Product Owner** (0.5 FTE): Prioritizes features, customer feedback
- **Tech Lead / Solution Architect** (1 FTE): Architecture decisions, code review
- **Backend Engineer** (2 FTE): API, workers, database, billing
- **Telephony Engineer** (1 FTE): FreeSWITCH, Kamailio, SIP integration
- **Frontend Engineer** (1 FTE): Portal, dashboards, flow builder
- **DevOps/SRE** (0.5 FTE): Infrastructure, CI/CD, monitoring

**Extended Team (contractors/part-time):**
- **Security Consultant** (as needed): SOC 2, pentests
- **Billing Specialist** (as needed): Invoice logic, taxes, compliance
- **Technical Writer** (as needed): API docs, guides

### RACI Matrix

**Key:**
- **R** = Responsible (does the work)
- **A** = Accountable (owns the outcome, one per task)
- **C** = Consulted (provides input)
- **I** = Informed (kept updated)

| Task | Product Owner | Tech Lead | Backend Eng | Telephony Eng | Frontend Eng | DevOps |
|------|--------------|-----------|-------------|---------------|--------------|--------|
| **API Design** | C | A/R | C | I | I | I |
| **Database Schema** | I | C | A/R | I | I | C |
| **FreeSWITCH Config** | I | C | I | A/R | I | C |
| **Carrier Integration** | C | C | C | A/R | I | I |
| **Portal UI** | A | C | I | I | R | I |
| **Queue System** | A | C | R | R | I | I |
| **Dialer Engine** | A | C | R | R | I | I |
| **Billing Engine** | A | C | R | I | I | I |
| **Infrastructure (Terraform)** | I | C | I | C | I | A/R |
| **CI/CD Pipeline** | I | C | C | C | C | A/R |
| **Monitoring Setup** | I | C | C | C | I | A/R |
| **Load Testing** | C | A | R | R | I | R |
| **Security Audit** | I | A | C | I | I | C |
| **SOC 2 Compliance** | C | A | C | I | I | C |
| **API Documentation** | C | A | R | C | C | I |
| **Incident Response** | I | A | C | C | I | R |

### Decision-Making Authority

**Architectural Decisions:**
- **Owner:** Tech Lead (final decision)
- **Input:** All engineers, Product Owner
- **Process:** RFC (Request for Comments) doc, 1-week review, async approval

**Product Priorities:**
- **Owner:** Product Owner (final decision)
- **Input:** Customer feedback, sales, engineering feasibility
- **Process:** Weekly planning meeting, prioritized backlog

**Infrastructure Changes:**
- **Owner:** DevOps/SRE (final decision for ops) or Tech Lead (for architecture)
- **Input:** Cost analysis, team feedback
- **Process:** Terraform PR review, approval from 2 people

**Security Policies:**
- **Owner:** Tech Lead (startup phase) or Security Lead (scale phase)
- **Input:** Legal, compliance consultant
- **Process:** Written policy, team review, sign-off from all engineers

---

## 27. Order of Development

### Phase 0: Foundations (Weeks 1-4)

**Goal:** Infrastructure ready, first call working end-to-end

**Week 1:**
- [ ] Set up AWS account, IAM users, billing alarms
- [ ] Register domain (irisx.com), point to Cloudflare
- [ ] Create Neon Postgres database, Upstash Redis
- [ ] Set up GitHub repo, CI/CD pipeline (GitHub Actions)
- [ ] Design database schema (tenants, users, calls, cdr)

**Week 2:**
- [ ] Build FreeSWITCH AMI with Packer
- [ ] Launch single t3.medium EC2 instance
- [ ] Configure Twilio SIP trunk to point to EC2 Elastic IP
- [ ] Test inbound call (Twilio → FreeSWITCH → hangup)
- [ ] Test outbound call (FreeSWITCH → Twilio → PSTN)

**Week 3:**
- [ ] Build Hono.js API skeleton (auth, tenants, calls endpoints)
- [ ] Deploy to Cloudflare Workers
- [ ] Implement POST /v1/calls (create job in NATS)
- [ ] Build orchestrator worker (consume NATS, originate via ESL)
- [ ] Test end-to-end: API → NATS → Worker → FreeSWITCH → Twilio

**Week 4:**
- [ ] Implement CDR write path (FreeSWITCH events → NATS → Postgres)
- [ ] Set up Grafana Cloud, import default dashboards
- [ ] Implement basic webhook delivery (call.answered, call.completed)
- [ ] Build simple portal (Vue 3): Tenant signup, API key generation
- [ ] **Milestone:** Can create outbound call via API, receive webhook, see CDR

**Exit Criteria:**
- [ ] 10 test calls placed successfully, 100% success rate
- [ ] CDR written within 10 seconds of call end
- [ ] Webhooks delivered within 2 seconds
- [ ] Infrastructure cost <$50/mo

---

### Phase 1: Core Calling and Webhooks (Weeks 5-12)

**Goal:** Production-ready calling platform, first 5 beta customers

**Week 5-6: TTS and Media**
- [ ] Integrate OpenAI TTS API
- [ ] Implement TTS caching to Cloudflare R2
- [ ] Implement Say verb (play TTS to caller)
- [ ] Implement Play verb (stream audio URL)
- [ ] Test: IVR flow with TTS greeting

**Week 7-8: Call Actions**
- [ ] Implement Gather verb (DTMF and speech input)
- [ ] Implement Transfer verb (blind transfer)
- [ ] Implement Record verb (start/stop recording, upload to R2)
- [ ] Test: Multi-step IVR (press 1 for sales, 2 for support)

**Week 9-10: Portal Enhancements**
- [ ] Build webhook inspector (show webhook payloads, retry failed)
- [ ] Build live call logs (refresh every 5 seconds)
- [ ] Build visual flow builder (drag-and-drop Say, Play, Gather)
- [ ] Test: Non-technical user can build IVR without code

**Week 11-12: Onboarding and Beta**
- [ ] Write API documentation (Mintlify)
- [ ] Generate Node.js SDK (Speakeasy from OpenAPI)
- [ ] Create quickstart guide, sample code
- [ ] Onboard 5 beta customers (free trial)
- [ ] Load test: 100 concurrent calls, 20 CPS, 30 minutes
- [ ] **Milestone:** Beta customers making production calls

**Exit Criteria:**
- [ ] API docs published, SDK available
- [ ] 5 beta customers active, positive feedback
- [ ] Load test passed (>98% success rate)
- [ ] Zero P0/P1 incidents in last 2 weeks
- [ ] Infrastructure cost $150-200/mo

---

### Phase 2: Queues and Agents (Weeks 13-18)

**Goal:** ACD (Automatic Call Distributor) for call centers

**Week 13-14: Queue Backend**
- [ ] Implement Redis-backed queue (LPUSH/RPOP)
- [ ] Implement agent presence (WebSocket heartbeat)
- [ ] Implement Enqueue verb
- [ ] Implement round-robin routing
- [ ] Test: 10 calls in queue, 3 agents pick up

**Week 15-16: Advanced Routing**
- [ ] Implement skills-based routing
- [ ] Implement sticky agent (same caller → same agent)
- [ ] Implement queue metrics (EWT, service level, abandon rate)
- [ ] Test: Skills matching works (Spanish-speaking caller → Spanish agent)

**Week 17-18: Supervisor Dashboard**
- [ ] Build queue dashboard (live queue depth, EWT)
- [ ] Build agent grid (status, current call, stats)
- [ ] Build WebRTC softphone (Vue component with JsSIP)
- [ ] Test: Agent logs in via web, receives call from queue
- [ ] **Milestone:** First call center customer live (10 agents)

**Exit Criteria:**
- [ ] Queue holds 1,000 callers without issues
- [ ] Agent presence updates in <500ms
- [ ] Service level metrics accurate
- [ ] WebRTC softphone works in Chrome, Firefox, Safari
- [ ] 1 call center customer in production

---

### Phase 3: Dialer and Billing (Weeks 19-26)

**Goal:** Outbound dialer for campaigns, billing system

**Week 19-20: Campaign Management**
- [ ] Build campaign CRUD (create, start, pause, stop)
- [ ] Implement CSV upload for contacts (10K+)
- [ ] Implement progressive dialer (1:1 dial ratio)
- [ ] Test: Campaign of 1K contacts, agents receive calls

**Week 21-22: Predictive Dialer**
- [ ] Implement dial ratio calculation (adaptive)
- [ ] Implement AMD (answering machine detection)
- [ ] Implement DNC list checking
- [ ] Test: Predictive dialer at 2.5:1 ratio, <3% abandon rate

**Week 23-24: Billing Engine**
- [ ] Build rating engine (prefix match, calculate cost)
- [ ] Implement invoice generation (monthly, PDF)
- [ ] Integrate Stripe for payment processing
- [ ] Test: Invoice generated automatically on 1st of month

**Week 25-26: Analytics and Reporting**
- [ ] Set up ClickHouse Cloud, stream CDR data
- [ ] Build usage dashboard (calls/day, cost/day, top destinations)
- [ ] Build spend alerts (email + webhook at 80%, 100% limit)
- [ ] Soak test: 1,000 concurrent calls for 2 hours
- [ ] **Milestone:** First paying customer ($199/mo Growth plan)

**Exit Criteria:**
- [ ] Predictive dialer working, <3% abandon rate
- [ ] Invoices generated automatically, accurate to 99.9%
- [ ] Soak test passed (1K concurrent, no memory leaks)
- [ ] MRR >$1,000 (5 Growth customers or 20 Startup customers)

---

### Phase 4: Multi-Carrier, Multi-Region (Weeks 27-34)

**Goal:** Enterprise-ready reliability, scale to 10K concurrent

**Week 27-28: Second Carrier**
- [ ] Set up Telnyx account, SIP trunk
- [ ] Implement carrier health scoring
- [ ] Implement automatic failover (Twilio → Telnyx)
- [ ] Test: Disable Twilio, calls automatically route to Telnyx

**Week 29-30: Kamailio Load Balancer**
- [ ] Build Kamailio AMI
- [ ] Deploy 2 Kamailio instances (us-east-1)
- [ ] Add 2 more FreeSWITCH instances (total 3)
- [ ] Test: Load balanced across 3 FreeSWITCH nodes

**Week 31-32: Multi-Region**
- [ ] Set up us-west-2 region (1 Kamailio, 2 FreeSWITCH)
- [ ] Enable Aurora Global Database (us-east-1 → us-west-2 replica)
- [ ] Set up Route 53 health checks, geo routing
- [ ] Test: Fail over entire us-east-1 region, RTO <15 min

**Week 33-34: Enterprise Features**
- [ ] Implement STT (OpenAI Whisper API)
- [ ] Implement sentiment analysis (optional add-on)
- [ ] SOC 2 readiness review (hire consultant)
- [ ] **Milestone:** First enterprise customer ($5K+/mo)

**Exit Criteria:**
- [ ] Multi-carrier failover working automatically
- [ ] Multi-region failover tested, RTO <15 minutes
- [ ] Infrastructure handles 5K concurrent calls
- [ ] MRR >$10K

---

## 28. Testing Strategy

### Test Pyramid

**Unit Tests (70%):**
- All business logic (rating, pacing, routing)
- Utility functions (E.164 validation, timezone conversion)
- Coverage target: >80%

**Integration Tests (20%):**
- API endpoints (POST /v1/calls, webhook delivery)
- Database operations (CRUD, transactions)
- External service mocks (Twilio API, OpenAI TTS)

**End-to-End Tests (10%):**
- Full call flow (API → FreeSWITCH → Twilio → PSTN)
- Run nightly, not in CI (too slow, flaky)

### Load Testing

**Tool:** k6 (Grafana Labs, open source)

**Scenario 1: API Load Test**

```javascript
// k6/api-load.js

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp-up to 100 RPS
    { duration: '5m', target: 100 },  // Stay at 100 RPS
    { duration: '2m', target: 0 }     // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<400'], // 95% of requests must complete below 400ms
    http_req_failed: ['rate<0.01']    // Error rate <1%
  }
};

export default function () {
  const payload = JSON.stringify({
    from: '+15555551234',
    to: '+15555556789',
    play: {
      type: 'tts',
      text: 'This is a load test call.'
    }
  });

  const params = {
    headers: {
      'Authorization': `Bearer ${__ENV.API_KEY}`,
      'Content-Type': 'application/json'
    }
  };

  const res = http.post('https://api.irisx.com/v1/calls', payload, params);

  check(res, {
    'status is 202': (r) => r.status === 202,
    'has call_id': (r) => JSON.parse(r.body).call_id !== undefined
  });

  sleep(1);
}
```

**Run:**
```bash
k6 run k6/api-load.js --env API_KEY=ix_test_abc123
```

---

**Scenario 2: Call Load Test (SIPp)**

```xml
<!-- sipp/call-load.xml -->

<?xml version="1.0" encoding="ISO-8859-1" ?>
<scenario name="Outbound Call Load Test">
  <send retrans="500">
    <![CDATA[
      INVITE sip:[service]@[remote_ip]:[remote_port] SIP/2.0
      Via: SIP/2.0/[transport] [local_ip]:[local_port];branch=[branch]
      From: <sip:loadtest@irisx.com>;tag=[call_number]
      To: <sip:[service]@[remote_ip]>
      Call-ID: [call_id]
      CSeq: 1 INVITE
      Contact: <sip:loadtest@[local_ip]:[local_port]>
      Max-Forwards: 70
      Content-Type: application/sdp
      Content-Length: [len]

      v=0
      o=user1 53655765 2353687637 IN IP[local_ip_type] [local_ip]
      s=-
      c=IN IP[media_ip_type] [media_ip]
      t=0 0
      m=audio [media_port] RTP/AVP 0
      a=rtpmap:0 PCMU/8000
    ]]>
  </send>

  <recv response="100" optional="true" />
  <recv response="180" optional="true" />
  <recv response="200" rrs="true" />

  <send>
    <![CDATA[
      ACK sip:[service]@[remote_ip]:[remote_port] SIP/2.0
      [last_Via:]
      [last_From:]
      [last_To:]
      Call-ID: [call_id]
      CSeq: 1 ACK
      Contact: <sip:loadtest@[local_ip]:[local_port]>
      Max-Forwards: 70
      Content-Length: 0
    ]]>
  </send>

  <pause milliseconds="10000"/>

  <send retrans="500">
    <![CDATA[
      BYE sip:[service]@[remote_ip]:[remote_port] SIP/2.0
      [last_Via:]
      [last_From:]
      [last_To:]
      Call-ID: [call_id]
      CSeq: 2 BYE
      Contact: <sip:loadtest@[local_ip]:[local_port]>
      Max-Forwards: 70
      Content-Length: 0
    ]]>
  </send>

  <recv response="200" />
</scenario>
```

**Run:**
```bash
sipp -sf sipp/call-load.xml \
  -s +15555556789 \
  <freeswitch-ip> \
  -r 20 \     # 20 CPS
  -l 100 \    # 100 concurrent calls
  -d 10000 \  # 10 second call duration
  -m 1000     # Stop after 1000 calls
```

---

**Scenario 3: Soak Test**

**Goal:** Find memory leaks, resource exhaustion

**Setup:**
1. Run 1,000 concurrent calls for 4 hours
2. Monitor FreeSWITCH RSS memory every minute
3. Monitor PostgreSQL connections
4. Monitor Redis memory usage

**Pass Criteria:**
- FreeSWITCH memory growth <10% over 4 hours
- No connection pool exhaustion
- No crashes or restarts
- CDR 100% accurate (compared to FreeSWITCH logs)

---

### Chaos Engineering

**Chaos Toolkit:** Open source chaos engineering tool

**Experiment 1: Kill FreeSWITCH Mid-Call**

```yaml
# chaos/kill-freeswitch.yaml

version: 1.0.0
title: Kill FreeSWITCH process mid-call
description: Verify active calls drop, new calls route to other nodes

steady-state-hypothesis:
  title: System is healthy
  probes:
    - type: probe
      name: api-is-responding
      tolerance: 200
      provider:
        type: http
        url: https://api.irisx.com/health
        expect: [200]

method:
  - type: action
    name: kill-freeswitch-1
    provider:
      type: process
      path: pkill
      arguments: "freeswitch"
    pauses:
      after: 60  # Wait 60 seconds for recovery

rollbacks:
  - type: action
    name: restart-freeswitch
    provider:
      type: process
      path: systemctl
      arguments: "restart freeswitch"
```

**Run:**
```bash
chaos run chaos/kill-freeswitch.yaml
```

---

## 29. Go-to-Market Strategy

### Target Customers (Phase 1-2)

**Primary:**
1. **Small Utilities (water, electric, gas):**
   - Need: Outage notifications, appointment reminders
   - Pain: Twilio too expensive for high-volume notifications
   - Size: 500-5K customers, 10-50K calls/month
   - Budget: $100-500/month
   - Acquisition: Direct outreach, utility conferences (AWWA, DistribuTECH)

2. **Small Call Centers (5-20 agents):**
   - Need: Inbound queue, agent dashboard, recording
   - Pain: Five9/Genesys too expensive ($100-150/agent/month)
   - Size: 10-20 agents, 50-200K mins/month
   - Budget: $500-2K/month
   - Acquisition: Google Ads ("Twilio alternative", "call center API"), content marketing

3. **Developers (API-first use cases):**
   - Need: 2FA, notifications, appointment reminders
   - Pain: Twilio markup too high, want more control
   - Size: 5-50K mins/month per customer
   - Budget: $100-1K/month
   - Acquisition: Dev community (Dev.to, Reddit r/webdev, Hacker News)

### Positioning

**Tagline:** "The open, affordable voice platform for developers and utilities"

**Key Messages:**
- **30% cheaper than Twilio** ($0.020/min vs $0.026/min)
- **No vendor lock-in** (export CDR, own your data)
- **Better queue analytics** (service level, EWT, agent occupancy)
- **Visual flow builder** (no code needed for simple IVRs)

**Competitive Differentiation:**

| Feature | IRIS X | Twilio | Telnyx | Vonage |
|---------|--------|--------|--------|--------|
| **Price/min (US)** | $0.020 | $0.026 | $0.013* | $0.023 |
| **Queue system** | ✅ Included | ❌ Separate product | ❌ Extra cost | ✅ TaskRouter |
| **Visual flow builder** | ✅ Drag & drop | ❌ Code only | ❌ Code only | ✅ Studio |
| **Queue analytics** | ✅ Real-time | ⚠️ Basic | ❌ None | ✅ Good |
| **Self-hosted option** | ✅ Future | ❌ No | ❌ No | ❌ No |
| **Open source tools** | ✅ FreeSWITCH | ❌ Proprietary | ⚠️ Some | ❌ Proprietary |

*Telnyx is cheaper but developer experience worse (less docs, fewer features)

### Launch Plan

**Month 1-2 (Private Beta):**
- [ ] Onboard 5 beta customers (free)
- [ ] Collect feedback, iterate on UX
- [ ] Build 3 case studies (quotes, results)
- [ ] No marketing, referrals only

**Month 3 (Public Beta):**
- [ ] Launch Product Hunt, Hacker News
- [ ] Write launch blog post, post on Dev.to, Reddit
- [ ] Offer 50% off first 3 months (early adopter pricing)
- [ ] Goal: 20 signups, 10 active (free tier)

**Month 4-6 (Growth):**
- [ ] SEO content: "Twilio alternative", "call center API", "voice API for utilities"
- [ ] Google Ads: Target competitor keywords ($500/mo budget)
- [ ] Outreach to utilities: LinkedIn, email, conferences
- [ ] Goal: 50 signups, 30 active, 5 paid ($500 MRR)

**Month 7-12 (Scale):**
- [ ] Increase ad spend to $2K/mo
- [ ] Hire sales rep (commission-only initially)
- [ ] Sponsor developer podcasts (Syntax.fm, Software Engineering Daily)
- [ ] Goal: 200 signups, 100 active, 30 paid ($5K MRR)

### Pricing Strategy (v1)

**Free Tier (Developer):**
- 100 minutes/month free
- 1 phone number
- API access, webhooks
- Community support (Discord, docs)
- **Goal:** Acquisition, product validation

**Startup ($49/mo):**
- 2,000 minutes included
- 5 phone numbers
- Queue + IVR
- Email support (24hr response)
- **Goal:** SMB call centers, utilities

**Growth ($199/mo):**
- 10,000 minutes included
- 25 phone numbers
- Predictive dialer
- Priority support (4hr response)
- **Goal:** Mid-market call centers

**Enterprise (Custom):**
- Volume discounts (>100K mins/mo)
- Dedicated media nodes (optional)
- SOC 2 + HIPAA compliance
- 99.99% SLA, dedicated CSM
- **Goal:** Large enterprises, healthcare, finance

---

## 30. Competitive Differentiation

### Why Customers Choose IRIS X

**1. Price-Performance Ratio**

**IRIS X advantage:**
- 30% cheaper than Twilio ($0.020 vs $0.026/min)
- Transparent pricing (no surprise fees)
- Startup plan ($49/mo) includes 2K mins (Twilio: pay-as-you-go only)

**Proof:**
- TCO calculator on website (enter mins/month, see savings)
- Case study: "XYZ Utility saved $18K/year switching from Twilio"

---

**2. Better Queue/ACD System**

**IRIS X advantage:**
- Built-in queue with real-time metrics (EWT, service level)
- Skills-based routing included
- Supervisor dashboard (no extra cost)
- Twilio TaskRouter: $1/worker/hour = $720/agent/month extra

**Proof:**
- Demo video: Agent logs in, receives call from queue in <30 seconds
- Service level calculation explanation (industry-standard)

---

**3. Developer Experience**

**IRIS X advantage:**
- Visual flow builder (no code needed)
- OpenAPI spec, auto-generated SDKs
- Webhook debugger (see all payloads, retry failed)
- Better docs (more examples, quickstarts)

**Proof:**
- Live playground: Test API calls from browser
- "Time to first call" benchmark: 5 minutes (vs 15 mins for Twilio)

---

**4. Transparency and Control**

**IRIS X advantage:**
- Export all CDR data (CSV, JSON)
- Webhooks for every event (not just "important" ones)
- No hidden fees (Twilio has carrier fees, regulatory fees, etc.)
- Open source roadmap (customers vote on features)

**Proof:**
- Public changelog, roadmap (Canny or similar)
- GitHub repo for SDKs, examples

---

**5. Built for Utilities**

**IRIS X advantage:**
- High-volume notifications optimized (1M+ calls/day)
- Curfew enforcement built-in (no 8PM-8AM calls)
- DNC list management included
- Case studies from utility customers

**Proof:**
- "Utility Quickstart" guide
- Template: "Water main break notification campaign"

---

### Competitive Weaknesses (Be Honest)

**vs Twilio:**
- ❌ Smaller feature set (no SMS initially, no video)
- ❌ Smaller carrier network (2-3 carriers vs Twilio's 50+)
- ❌ No global presence (US-only initially)
- ✅ But: 80% of customers only need voice + queues + US coverage

**vs Telnyx:**
- ❌ Telnyx is cheaper ($0.004/min)
- ❌ Telnyx has better international coverage
- ✅ But: IRIS X has better docs, queue system, flow builder

**vs Vonage:**
- ❌ Vonage has better enterprise sales team
- ❌ Vonage has compliance certifications (SOC 2, HIPAA)
- ✅ But: IRIS X is cheaper, better developer experience

---

## 31. Operational Runbooks

### Runbook 1: Carrier Failover (Twilio Down)

**Trigger:** ASR <50% on Twilio for >5 minutes

**Detection:**
- Prometheus alert: `LowASR`
- PagerDuty page to on-call engineer

**Steps:**

1. **Verify carrier outage:**
```bash
# Check Twilio status page
curl https://status.twilio.com/api/v2/status.json

# Check recent calls in our system
psql -c "SELECT carrier, COUNT(*), AVG(CASE WHEN disposition='ANSWERED' THEN 1 ELSE 0 END) as asr FROM cdr WHERE created_at > NOW() - INTERVAL '10 minutes' GROUP BY carrier;"
```

2. **Check secondary carrier (Telnyx) health:**
```bash
# Test call via Telnyx
curl -X POST https://api.irisx.com/v1/calls \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"from":"+15555551234","to":"+15555556789","carrier":"telnyx"}'
```

3. **If Telnyx healthy, manually downgrade Twilio:**
```bash
# Set Twilio health score to 0 (forces failover)
redis-cli SET carrier:twilio:health_score 0
```

4. **Monitor for 10 minutes:**
- Watch Grafana dashboard for ASR recovery
- Check error logs for Telnyx issues

5. **Update status page:**
- Post incident: "Experiencing issues with primary carrier, failed over to backup"

6. **When Twilio recovers:**
```bash
# Gradually restore Twilio traffic (10% every 5 min)
redis-cli SET carrier:twilio:health_score 50  # 50% traffic
# wait 5 minutes, monitor
redis-cli SET carrier:twilio:health_score 100  # Full traffic
```

7. **Post-incident review:** Within 24 hours, document root cause, timeline

---

### Runbook 2: Database Connection Pool Exhausted

**Trigger:** `pg_stat_database_numbackends > 80` (>80 connections, max 100)

**Detection:**
- Prometheus alert: `DatabaseConnectionPoolExhausted`
- Slack notification to #alerts

**Steps:**

1. **Check active connections:**
```sql
SELECT pid, usename, application_name, client_addr, state, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;
```

2. **Identify long-running queries:**
```sql
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC
LIMIT 10;
```

3. **Kill long-running queries (>5 minutes):**
```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE now() - query_start > INTERVAL '5 minutes'
  AND state = 'active'
  AND query NOT LIKE '%pg_stat_activity%';
```

4. **Check for connection leaks in code:**
```bash
# Review recent deploys (last 2 hours)
git log --since="2 hours ago" --oneline

# Check application logs for "connection timeout" errors
grep "connection timeout" /var/log/app.log | tail -20
```

5. **Temporary mitigation (increase pool size):**
```bash
# Edit PgBouncer config
sudo nano /etc/pgbouncer/pgbouncer.ini
# Change: max_client_conn = 200 (from 100)

sudo systemctl restart pgbouncer
```

6. **Permanent fix:** Deploy code fix (proper connection release in workers)

---

### Runbook 3: FreeSWITCH High CPU (>90%)

**Trigger:** FreeSWITCH CPU >90% for >3 minutes

**Steps:**

1. **Check active channels:**
```bash
ssh ec2-user@freeswitch-1

fs_cli -x "show channels count"
# If >100 channels on t3.medium, that's the issue (capacity exceeded)
```

2. **Check for codec transcoding:**
```bash
fs_cli -x "show channels" | grep -E "PCMA|PCMU|G729"
# If seeing G.729, that requires transcoding (CPU-intensive)
```

3. **If capacity exceeded:**
```bash
# Launch second FreeSWITCH instance via Terraform
cd infrastructure/environments/production
terraform apply -target=module.freeswitch_2
```

4. **If transcoding issue:**
- Update Twilio trunk to prefer PCMU (G.711) codec
- Restart FreeSWITCH: `sudo systemctl restart freeswitch`

5. **If neither, check for runaway calls:**
```bash
fs_cli -x "show channels" | grep -E "duration:[2-9][0-9]{3,}"
# Kill calls >30 minutes (suspicious)
```

---

### Runbook 4: Customer Reports Missing CDR

**Trigger:** Customer support ticket: "CDR missing for call XYZ"

**Steps:**

1. **Search CDR table:**
```sql
SELECT * FROM cdr WHERE call_id = 'call_01J1KQZX9F7GH4';
-- If not found, check calls table
SELECT * FROM calls WHERE id = 'call_01J1KQZX9F7GH4';
```

2. **If in calls but not CDR:**
- CDR write path failed (check NATS stream for event)
```bash
nats stream view calls-events --id <call_id>
```

3. **If event in NATS but not Postgres:**
- Worker failed to process event (check worker logs)
```bash
kubectl logs -l app=cdr-worker --since=1h | grep call_01J1KQZX9F7GH4
```

4. **Manually backfill CDR:**
```bash
# Replay event from NATS
nats stream replay calls-events --subject calls.completed.<call_id>
```

5. **Verify CDR now exists:**
```sql
SELECT * FROM cdr WHERE call_id = 'call_01J1KQZX9F7GH4';
```

6. **Notify customer:** "CDR has been restored, issue with event processing pipeline (fixed)"

---

### Runbook 5: Region Failover (us-east-1 → us-west-2)

**Trigger:** All health checks fail in us-east-1 for >5 minutes

**Manual Steps (Phase 1, no automation):**

1. **Verify region down:**
```bash
# Check AWS Status page
open https://status.aws.amazon.com/

# Ping FreeSWITCH instances in us-east-1
ping freeswitch-1.us-east-1.irisx.com
# (timeout = confirmed down)
```

2. **Launch FreeSWITCH in us-west-2:**
```bash
cd infrastructure/environments/production
terraform apply -var="region=us-west-2"
# Wait 5 minutes for instance to launch
```

3. **Update Twilio SIP trunk to new IP:**
```bash
# Get new Elastic IP
terraform output freeswitch_us_west_2_ip

# Update via Twilio Console or API
curl -X POST https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/SIP/Trunks/$TRUNK_SID.json \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -d "Origination=[{\"SipUrl\":\"sip:$NEW_IP\"}]"
```

4. **Restore database from backup:**
```bash
# If using Neon, restore from snapshot (via UI)
# If using Aurora, promote us-west-2 read replica to primary
aws rds failover-db-cluster --db-cluster-identifier irisx-aurora-global
```

5. **Update DNS (if using custom domain):**
```bash
# Update Route 53 A record to point to us-west-2
aws route53 change-resource-record-sets --hosted-zone-id Z123456 --change-batch file://dns-update.json
```

6. **Test end-to-end:**
```bash
curl -X POST https://api.irisx.com/v1/calls \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"from":"+15555551234","to":"+15555556789"}'
```

7. **Update status page:**
- Post: "us-east-1 region unavailable, failed over to us-west-2"
- Estimated restoration: TBD (monitor AWS status)

8. **Post-incident:** When us-east-1 recovers, fail back (reverse process)

**Total RTO:** 30-60 minutes (manual process)

---

## 32. Documentation and Handover

### Documentation Structure

**Internal Docs (Confluence, Notion, or GitHub Wiki):**

1. **Architecture Decision Records (ADRs):**
   - Why Cloudflare Workers over AWS Lambda
   - Why Neon over Aurora (initially)
   - Why NATS over Kafka
   - Why FreeSWITCH over Asterisk

2. **Runbooks (see Section 31)**

3. **Deployment Guides:**
   - How to deploy API to Cloudflare Workers
   - How to build FreeSWITCH AMI
   - How to add new carrier
   - How to add new region

4. **Troubleshooting Guides:**
   - API returning 500 errors
   - Calls failing to connect
   - WebRTC not working (firewall issues)
   - Webhooks not delivering

---

**External Docs (Mintlify, Docusaurus):**

**Structure:**

```
docs/
├── getting-started/
│   ├── quickstart.md          # Your first call in 5 minutes
│   ├── authentication.md      # API keys, OAuth
│   └── sandbox-mode.md        # Test without charges
├── guides/
│   ├── ivr-tutorial.md        # Build an IVR flow
│   ├── queue-setup.md         # Set up call queue
│   ├── dialer-campaign.md     # Run outbound campaign
│   └── webrtc-softphone.md    # Integrate WebRTC
├── api-reference/
│   ├── calls.md               # POST /v1/calls, etc.
│   ├── queues.md
│   ├── agents.md
│   └── webhooks.md
├── sdks/
│   ├── node.md
│   ├── python.md
│   └── go.md
└── compliance/
    ├── security.md            # Encryption, auditing
    ├── stir-shaken.md         # Caller ID auth
    └── gdpr.md                # Data privacy
```

---

### Knowledge Transfer (Handover)

**For New Engineers Joining Team:**

**Week 1: Read and Setup**
- [ ] Read all internal docs (ADRs, architecture diagrams)
- [ ] Set up local dev environment (Bun, Postgres, Redis)
- [ ] Run API locally, make test call to sandbox
- [ ] Deploy to staging, verify end-to-end

**Week 2: Shadow Senior Engineer**
- [ ] Pair on feature development
- [ ] Sit in on incident response (if one occurs)
- [ ] Review code in PRs, ask questions

**Week 3: Small Feature**
- [ ] Implement small feature (e.g., add new API endpoint)
- [ ] Write tests, documentation
- [ ] Deploy to staging, then production

**Week 4: On-Call Training**
- [ ] Review all runbooks
- [ ] Practice in dev: simulate carrier failure, database failover
- [ ] Shadow on-call engineer for 1 week

**Week 5: Independent**
- [ ] Join on-call rotation (with backup)
- [ ] Pick up tickets from backlog

---

### Handover Checklist (for Outgoing Engineer)

- [ ] Document all in-flight projects (status, blockers)
- [ ] Share access credentials (1Password, LastPass)
- [ ] Review recent incidents, lessons learned
- [ ] Introduce to key customers (if customer-facing role)
- [ ] Update README with any tribal knowledge
- [ ] Schedule 30-minute Q&A call 1 week after departure (Zoom)

---

## Conclusion

This document represents a **comprehensive, production-ready** plan to build IRIS X from **$150/month startup phase** to **$10M+ ARR enterprise platform**. Key decisions prioritize:

1. **Lean startup:** Minimize costs, validate quickly
2. **Modern tech:** 2025 stack (Bun, Hono, Neon, Cloudflare)
3. **Incremental scaling:** Don't over-build, grow infrastructure with revenue
4. **Developer experience:** API-first, great docs, fast onboarding

**Next Steps:**

- [ ] Review and approve this scope document
- [ ] Allocate budget ($10K for first 3 months)
- [ ] Hire/assign team (1 telephony eng, 2 backend, 1 frontend, 0.5 DevOps)
- [ ] Kick off Phase 0 (Week 1)
- [ ] Target: First beta customer call by **Month 3**

---

**Document Version:** 2.0
**Last Updated:** 2025-01-15
**Authors:** Claude (AI Assistant) + Ryan (Product Owner)
**Status:** Draft → Awaiting Approval
