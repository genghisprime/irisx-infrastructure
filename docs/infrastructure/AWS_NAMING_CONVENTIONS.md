# IRISX AWS Naming Conventions

## Philosophy: Clear, Consistent, Searchable

Every AWS resource will be clearly labeled with `irisx-` prefix and descriptive naming so you can instantly identify what belongs to this project.

---

## Naming Pattern

```
irisx-{environment}-{resource-type}-{description}
```

**Examples:**
- `irisx-prod-ec2-api` - Production API server
- `irisx-dev-rds-postgres` - Development database
- `irisx-prod-s3-recordings` - Production recordings bucket

---

## Environments

- **prod** - Production (live customers)
- **staging** - Staging (pre-production testing)
- **dev** - Development (testing, experiments)

**For Phase 0-1:** We'll start with **prod** only (dev/staging can come later to save costs)

---

## Resource Naming Guide

### VPC & Networking
- **VPC:** `irisx-prod-vpc`
- **Subnets:**
  - `irisx-prod-subnet-public-1a` (us-east-1a)
  - `irisx-prod-subnet-public-1b` (us-east-1b)
  - `irisx-prod-subnet-private-1a` (us-east-1a)
  - `irisx-prod-subnet-private-1b` (us-east-1b)
  - `irisx-prod-subnet-database-1a` (us-east-1a)
  - `irisx-prod-subnet-database-1b` (us-east-1b)
- **Internet Gateway:** `irisx-prod-igw`
- **NAT Gateway:** `irisx-prod-nat-1a` (skip initially to save $32/mo)
- **Route Tables:**
  - `irisx-prod-rt-public`
  - `irisx-prod-rt-private`
  - `irisx-prod-rt-database`

### Security Groups
- **API/FreeSWITCH:** `irisx-prod-sg-api`
  - Ports: 22 (SSH), 80 (HTTP), 443 (HTTPS), 5060-5061 (SIP), 16384-32768 (RTP)
- **Database:** `irisx-prod-sg-database`
  - Port: 5432 (PostgreSQL)
- **Cache:** `irisx-prod-sg-cache`
  - Port: 6379 (Redis)
- **Load Balancer:** `irisx-prod-sg-alb` (add later)
  - Ports: 80, 443

### EC2 Instances
- **API + FreeSWITCH:** `irisx-prod-ec2-api-01`
  - Instance type: t3.small
  - Tags:
    - Name: `irisx-prod-ec2-api-01`
    - Project: `IRISX`
    - Environment: `prod`
    - Component: `api-freeswitch`
    - ManagedBy: `terraform`

### RDS Databases
- **PostgreSQL:** `irisx-prod-rds-postgres`
  - Instance identifier: `irisx-prod-rds-postgres`
  - Database name: `irisx_prod`
  - Instance type: db.t4g.micro
  - Tags:
    - Name: `irisx-prod-rds-postgres`
    - Project: `IRISX`
    - Environment: `prod`
    - Component: `database`
    - ManagedBy: `terraform`

### ElastiCache
- **Redis:** `irisx-prod-redis`
  - Cluster name: `irisx-prod-redis`
  - Node type: cache.t4g.micro
  - Tags:
    - Name: `irisx-prod-redis`
    - Project: `IRISX`
    - Environment: `prod`
    - Component: `cache`
    - ManagedBy: `terraform`

### S3 Buckets
- **Call Recordings:** `irisx-prod-recordings`
  - Bucket name: `irisx-prod-recordings` (must be globally unique, add random suffix if taken)
  - Tags:
    - Name: `irisx-prod-recordings`
    - Project: `IRISX`
    - Environment: `prod`
    - Component: `storage`
- **TTS Audio Cache:** `irisx-prod-tts-cache`
- **Media Files:** `irisx-prod-media`
- **Backups:** `irisx-prod-backups`

### IAM Roles & Policies
- **EC2 Role:** `irisx-prod-role-ec2`
  - Policies: S3 access, CloudWatch logs, SSM
- **Lambda Role:** `irisx-prod-role-lambda` (add later)
- **RDS Enhanced Monitoring:** `irisx-prod-role-rds-monitoring`

### CloudWatch Log Groups
- **API Logs:** `/irisx/prod/api`
- **FreeSWITCH Logs:** `/irisx/prod/freeswitch`
- **Worker Logs:** `/irisx/prod/workers`
- **Nginx Logs:** `/irisx/prod/nginx`

### Elastic IPs
- **FreeSWITCH EIP:** `irisx-prod-eip-freeswitch`
  - Tags:
    - Name: `irisx-prod-eip-freeswitch`
    - Project: `IRISX`
    - Purpose: `SIP trunk endpoint`

### Key Pairs
- **SSH Key:** `irisx-prod-key`
  - Use for all EC2 instances in production

### Load Balancers (add later)
- **Application Load Balancer:** `irisx-prod-alb`
- **Target Groups:**
  - `irisx-prod-tg-api`
  - `irisx-prod-tg-websocket`

### Auto Scaling Groups (add later)
- **API ASG:** `irisx-prod-asg-api`
- **Workers ASG:** `irisx-prod-asg-workers`

### SNS Topics
- **Alerts:** `irisx-prod-alerts`
- **CDR Events:** `irisx-prod-cdr-events`

### SQS Queues (if using instead of NATS)
- **Call Queue:** `irisx-prod-queue-calls`
- **CDR Queue:** `irisx-prod-queue-cdr`

---

## Mandatory Tags for ALL Resources

Every resource must have these tags:

```json
{
  "Name": "irisx-prod-{resource-type}-{description}",
  "Project": "IRISX",
  "Environment": "prod",
  "Component": "api|database|cache|storage|network",
  "ManagedBy": "terraform|manual",
  "CostCenter": "infrastructure",
  "Owner": "ryan@techradium.com"
}
```

**Why tags matter:**
1. **Cost tracking** - See exactly what IRISX costs in AWS Cost Explorer
2. **Easy filtering** - Find all IRISX resources instantly
3. **Automation** - Scripts can find resources by tags
4. **Compliance** - Know who owns what

---

## Cost Allocation Tags (Enable in AWS Billing)

Enable these tags for cost tracking:
1. `Project` (IRISX)
2. `Environment` (prod/staging/dev)
3. `Component` (api/database/cache/storage)
4. `CostCenter` (infrastructure)

**Benefit:** AWS Cost Explorer will show costs broken down by these dimensions!

---

## AWS Resource Groups

Create a Resource Group to see all IRISX resources in one view:

**Group Name:** `IRISX-Production`
**Tag Filter:** `Project = IRISX` AND `Environment = prod`

**URL:** https://console.aws.amazon.com/resource-groups/

---

## DNS Naming (Route 53 - add later)

When you add a custom domain:
- **API:** `api.irisx.com`
- **Portal:** `portal.irisx.com`
- **Admin:** `admin.irisx.com`
- **Agent Desktop:** `agent.irisx.com`
- **SIP Endpoint:** `sip.irisx.com` (points to FreeSWITCH EIP)

---

## Database Naming

### PostgreSQL Database Names
- **Database:** `irisx_prod`
- **User:** `irisx_app`
- **Admin User:** `irisx_admin`

### Table Naming (lowercase with underscores)
- `tenants`
- `users`
- `phone_numbers`
- `calls`
- `call_logs`
- `recordings`
- `api_keys`
- `webhooks`
- `campaigns`
- `contacts`

---

## Redis Key Naming

```
irisx:{namespace}:{key}
```

**Examples:**
- `irisx:session:user:12345` - User session
- `irisx:ratelimit:api:tenant:67` - Rate limit for tenant
- `irisx:cache:tts:hash123` - TTS audio cache
- `irisx:queue:calls` - Call queue
- `irisx:presence:agent:456` - Agent presence

---

## S3 Object Naming

### Call Recordings
```
recordings/{tenant_id}/{year}/{month}/{day}/{call_uuid}.wav
```

**Example:** `recordings/tenant_123/2025/10/28/550e8400-e29b-41d4-a716-446655440000.wav`

### TTS Cache
```
tts/{hash}/{voice}.mp3
```

**Example:** `tts/abc123def456/en-US-Neural2-D.mp3`

---

## GitHub Repository Naming

- **Backend API:** `irisx-backend`
- **Frontend (Vue):** `irisx-frontend`
- **Infrastructure (Terraform):** `irisx-infrastructure`
- **Documentation:** `irisx-docs`
- **Mobile SDK:** `irisx-sdk-mobile`
- **JavaScript SDK:** `irisx-sdk-js`

---

## Docker Image Naming (add later)

```
irisx/{component}:{version}
```

**Examples:**
- `irisx/api:1.0.0`
- `irisx/api:latest`
- `irisx/worker:1.0.0`
- `irisx/freeswitch:1.10.12`

---

## CloudFormation/Terraform Stack Naming

- **Main Stack:** `irisx-prod-infrastructure`
- **Network Stack:** `irisx-prod-network`
- **Database Stack:** `irisx-prod-database`
- **Compute Stack:** `irisx-prod-compute`

---

## AWS Budgets

- **Budget Name:** `IRISX Production Monthly Budget`
- **Amount:** $50/mo (with alerts at $30, $40, $50)

---

## CloudWatch Alarms

Naming: `irisx-prod-alarm-{resource}-{metric}`

**Examples:**
- `irisx-prod-alarm-ec2-cpu-high`
- `irisx-prod-alarm-rds-connections-high`
- `irisx-prod-alarm-redis-memory-high`
- `irisx-prod-alarm-s3-bucket-size`

---

## Summary

**Prefix everything with:** `irisx-{environment}-`

**Benefits:**
1. ✅ Instantly recognizable in AWS Console
2. ✅ Easy to filter and search
3. ✅ Clear cost tracking
4. ✅ Safe to delete (no confusion with other projects)
5. ✅ Professional and organized

**Next:** Let's start creating AWS resources with these names! 🚀
