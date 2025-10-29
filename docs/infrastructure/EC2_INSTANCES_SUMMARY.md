# IRISX EC2 Instances Summary

## ✅ Instances Launched and Running!

**Created:** October 28, 2025
**Region:** us-east-1 (Virginia)
**Status:** All instances running and accessible

---

## EC2 Instance #1: API Server

**Purpose:** Hono.js API, NATS JetStream, Workers, nginx

- **Name:** `irisx-prod-ec2-api-01`
- **Instance ID:** `i-032d6844d393bdef4`
- **Instance Type:** t3.small (2 vCPU, 2 GB RAM)
- **Public IP:** `3.83.53.69`
- **Private IP:** `10.0.1.240`
- **Storage:** 30 GB GP3 SSD
- **OS:** Ubuntu 24.04 LTS
- **Cost:** ~$15/mo

**SSH Access:**
```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69
```

**What to Install:**
- Node.js 22 LTS
- npm / yarn
- NATS JetStream
- nginx
- PM2 (process manager)
- PostgreSQL client (✅ already installed)
- Redis client (✅ already installed)

---

## EC2 Instance #2: FreeSWITCH Server

**Purpose:** Telephony engine, SIP handling, media processing

- **Name:** `irisx-prod-ec2-freeswitch-01`
- **Instance ID:** `i-00b4b8ad65f1f32c1`
- **Instance Type:** t3.small (2 vCPU, 2 GB RAM)
- **Public IP (temporary):** `18.208.146.208`
- **Elastic IP (permanent):** `54.160.220.243` ⭐ **Use this for SIP trunk!**
- **Private IP:** Will be assigned
- **Storage:** 30 GB GP3 SSD
- **OS:** Ubuntu 24.04 LTS
- **Cost:** ~$15/mo

**SSH Access:**
```bash
# Use Elastic IP (permanent address)
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243
```

**What to Install:**
- FreeSWITCH 1.10.12
- coturn (TURN server for WebRTC)
- Monitoring agents

**SIP Endpoint:** `54.160.220.243:5060` (configure in Twilio/Telnyx)

---

## Security Groups

✅ **UPDATED:** Each instance now has its own security group with proper port configurations!

### API Server Security Group
**Security Group:** `irisx-prod-sg-api` (sg-03f77311c140b8f2e)

**Inbound Rules:**
- SSH (22) - **73.6.78.238/32** (your IP only) 🔒
- HTTP (80) - 0.0.0.0/0
- HTTPS (443) - 0.0.0.0/0

### FreeSWITCH Server Security Group
**Security Group:** `irisx-prod-sg-freeswitch` (sg-0460ce5af3265896a)

**Inbound Rules:**
- SSH (22) - **73.6.78.238/32** (your IP only) 🔒
- SIP TCP (5060) - 0.0.0.0/0
- SIP UDP (5060) - 0.0.0.0/0
- RTP (16384-32768 UDP) - 0.0.0.0/0
- ESL (8021) - **sg-03f77311c140b8f2e** (API server only) 🔒

**Note:** Both instances can access RDS PostgreSQL and ElastiCache Redis via private IPs.

**Security Documentation:** See [SECURITY_UPDATE_PHASE1.md](./SECURITY_UPDATE_PHASE1.md) for details.

---

## SSH Key

**Key Pair Name:** `irisx-prod-key`
**Private Key Location:** `~/.ssh/irisx-prod-key.pem`
**Permissions:** 400 (read-only)

**⚠️ IMPORTANT:** Back up this key! If you lose it, you cannot SSH to the instances.

```bash
# Backup command
cp ~/.ssh/irisx-prod-key.pem ~/Dropbox/irisx-prod-key.pem.backup
# Or upload to secure password manager
```

---

## Network Configuration

**VPC:** `irisx-prod-vpc` (10.0.0.0/16)
**Subnet:** `irisx-prod-subnet-public-1a` (10.0.1.0/24)
**Internet Gateway:** Connected
**Public IPs:** Auto-assigned

### Private Connectivity

Both EC2 instances can connect to:
- **RDS PostgreSQL:** `irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com:5432`
- **ElastiCache Redis:** (endpoint TBD when available)
- **S3 Bucket:** `irisx-prod-recordings-672e7c49`

---

## Next Steps

### 1. SSH to API Server and Run Database Migrations

```bash
# SSH to API server
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69

# Clone infrastructure repo (or upload migration files)
git clone https://github.com/genghisprime/irisx-infrastructure.git
cd irisx-infrastructure/database

# Set database password
export DB_PASSWORD="<password from .db-password.txt>"

# Test connection
./test-connection.sh $DB_PASSWORD

# Run migration
export PGPASSWORD=$DB_PASSWORD
psql -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com \
  -U irisx_admin \
  -d irisx_prod \
  < migrations/001_create_core_tables.sql

# Verify tables created
psql -h irisx-prod-rds-postgres.cmcjcluph68h.us-east-1.rds.amazonaws.com \
  -U irisx_admin \
  -d irisx_prod \
  -c "\dt"
```

### 2. Install Node.js on API Server

```bash
# SSH to API server
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version  # Should show v22.x.x
npm --version
```

### 3. Install FreeSWITCH on FreeSWITCH Server

```bash
# SSH to FreeSWITCH server
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.160.220.243

# Install FreeSWITCH (will create script for this)
# Instructions coming in Phase 0, Week 3
```

---

## Cost Summary (EC2 Only)

| Instance | Type | Monthly Cost |
|----------|------|--------------|
| API Server | t3.small | $15.18 |
| FreeSWITCH Server | t3.small | $15.18 |
| Elastic IP (attached) | Free | $0 |
| **Total EC2** | | **$30.36/mo** |

**Total Infrastructure (all services):**
- EC2: $30/mo
- RDS: $12/mo
- ElastiCache: $11/mo
- S3: $2/mo
- Data transfer: $3/mo
- **TOTAL: ~$58/mo** ✅

---

## Monitoring

### Check Instance Status

```bash
export AWS_PROFILE=irisx-virginia

# List all IRISX instances
aws ec2 describe-instances \
  --filters "Name=tag:Project,Values=IRISX" \
  --query 'Reservations[].Instances[].[Tags[?Key==`Name`].Value | [0], InstanceId, State.Name, PublicIpAddress]' \
  --output table
```

### Stop Instances (to save money during development)

```bash
# Stop API server
aws ec2 stop-instances --instance-ids i-032d6844d393bdef4

# Stop FreeSWITCH server
aws ec2 stop-instances --instance-ids i-00b4b8ad65f1f32c1

# Start them again later
aws ec2 start-instances --instance-ids i-032d6844d393bdef4 i-00b4b8ad65f1f32c1
```

**Note:** Elastic IP remains attached and free while instance is stopped.

---

## Backup Strategy

### EC2 Snapshots (Manual)

```bash
# Create snapshot of API server
aws ec2 create-snapshot \
  --volume-id $(aws ec2 describe-instances --instance-ids i-032d6844d393bdef4 --query 'Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId' --output text) \
  --description "irisx-prod-ec2-api-01 backup $(date +%Y%m%d)" \
  --tag-specifications 'ResourceType=snapshot,Tags=[{Key=Name,Value=irisx-prod-api-snapshot},{Key=Project,Value=IRISX}]'
```

### EC2 AMI (For FreeSWITCH - After configuration)

```bash
# Create AMI from FreeSWITCH server once configured
aws ec2 create-image \
  --instance-id i-00b4b8ad65f1f32c1 \
  --name "irisx-freeswitch-$(date +%Y%m%d)" \
  --description "IRISX FreeSWITCH configured AMI" \
  --tag-specifications 'ResourceType=image,Tags=[{Key=Name,Value=irisx-freeswitch-ami},{Key=Project,Value=IRISX}]'
```

---

## Troubleshooting

### Can't SSH to instance

```bash
# 1. Check instance is running
aws ec2 describe-instances --instance-ids i-032d6844d393bdef4 --query 'Reservations[0].Instances[0].State.Name'

# 2. Check security group allows SSH from your IP
aws ec2 describe-security-groups --group-ids sg-03f77311c140b8f2e

# 3. Verify key permissions
ls -l ~/.ssh/irisx-prod-key.pem  # Should be -r-------- (400)

# 4. Try verbose SSH
ssh -v -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69
```

### Instance not responding

```bash
# Reboot instance
aws ec2 reboot-instances --instance-ids i-032d6844d393bdef4

# Check system logs
aws ec2 get-console-output --instance-id i-032d6844d393bdef4
```

---

## 🎉 Success!

Both EC2 instances are running and accessible!

**Next:** Run database migrations, install application software, configure FreeSWITCH.

**Status:** ✅ Phase 0, Week 1 - EC2 infrastructure complete!
