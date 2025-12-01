# IRISX Self-Hosted Mail Server Setup Guide
## Production-Ready Postfix Deployment with Multi-Region Load Balancing

**Version:** 1.0
**Last Updated:** January 2025
**Target Deployment:** Oregon (us-west-2) + Virginia (us-east-1)
**Domain:** tazzi.com

---

## Executive Summary

This guide walks you through setting up a **production-grade, self-hosted mail server** using **Postfix** that integrates seamlessly with IRISX's Provider Abstraction Layer. By following this guide, you'll have:

- ✅ **Two Postfix mail servers** (Oregon + Virginia) with automatic failover
- ✅ **Full email authentication** (SPF, DKIM, DMARC) for maximum deliverability
- ✅ **Integration with IRISX API** as a standard email provider (like Elastic Email)
- ✅ **Least-Cost Routing** - Your mail server can be prioritized over paid providers
- ✅ **Health monitoring** with automatic failover to backup providers
- ✅ **Enterprise-grade security** with TLS encryption and rate limiting

**Cost Savings:** Self-hosted email eliminates per-message costs. At 100k emails/month, you save ~$90/month vs Elastic Email.

**Timeline:** 4-6 hours for initial setup, 2 hours for second region.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [DNS Configuration](#dns-configuration)
4. [EC2 Instance Setup (Oregon)](#ec2-instance-setup-oregon)
5. [Postfix Installation & Configuration](#postfix-installation--configuration)
6. [DKIM, SPF, DMARC Setup](#dkim-spf-dmarc-setup)
7. [SSL/TLS Configuration](#ssltls-configuration)
8. [IRISX Provider Integration](#irisx-provider-integration)
9. [Multi-Region Setup (Virginia)](#multi-region-setup-virginia)
10. [Load Balancing Strategy](#load-balancing-strategy)
11. [Monitoring & Health Checks](#monitoring--health-checks)
12. [Security Hardening](#security-hardening)
13. [Testing & Verification](#testing--verification)
14. [Troubleshooting](#troubleshooting)
15. [Scaling Strategy](#scaling-strategy)

---

## Architecture Overview

### How Self-Hosted Mail Integrates with IRISX

```
┌─────────────────────────────────────────────────────────────────┐
│                      IRISX API (Hono.js)                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Email Service (LCR + Health Routing)              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│         ┌────────────────────┼────────────────────┐            │
│         ▼                    ▼                    ▼            │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     │
│  │   Postfix   │     │   Elastic   │     │   Custom    │     │
│  │   Oregon    │     │    Email    │     │    SMTP     │     │
│  │  Priority 1 │     │  Priority 2 │     │  Priority 3 │     │
│  └─────────────┘     └─────────────┘     └─────────────┘     │
│         │                                                       │
│         └──► mail-oregon.tazzi.com (52.x.x.x)                  │
│                                                                 │
│  ┌─────────────┐                                               │
│  │   Postfix   │                                               │
│  │  Virginia   │                                               │
│  │  (Failover) │                                               │
│  └─────────────┘                                               │
│         │                                                       │
│         └──► mail-virginia.tazzi.com (3.x.x.x)                 │
└─────────────────────────────────────────────────────────────────┘
```

### Provider Abstraction Layer

Your Postfix servers will be added to the `messaging_providers` table just like Elastic Email:

```sql
-- Postfix Oregon
INSERT INTO messaging_providers (
  provider_type,
  provider_name,
  credentials_encrypted,
  credentials_iv,
  config,
  is_active
) VALUES (
  'email',
  'postfix-oregon',
  '...encrypted smtp credentials...',
  '...iv...',
  '{
    "priority": 1,
    "display_name": "Self-Hosted Oregon",
    "cost_per_1000": 0.00,
    "smtp_host": "mail-oregon.tazzi.com",
    "smtp_port": 587,
    "health_score": 100,
    "daily_limit": 500000,
    "supports_attachments": true
  }'::jsonb,
  true
);
```

### Why Postfix?

- ✅ **Industry Standard** - Powers 30%+ of internet email infrastructure
- ✅ **Battle-Tested** - 25+ years of development and security hardening
- ✅ **High Performance** - Can send 1M+ emails/day on a single t3.medium
- ✅ **Zero Per-Message Costs** - Fixed monthly EC2 cost only
- ✅ **Full Control** - Complete control over delivery, retries, logging
- ✅ **Excellent Documentation** - Massive community and enterprise support

---

## Prerequisites

Before starting, ensure you have:

- [x] **AWS Account** with EC2, Route53 access
- [x] **Domain Name** (tazzi.com) with DNS control
- [x] **Existing IRISX Infrastructure** (API server, PostgreSQL, Redis)
- [x] **SSH Key Pair** for EC2 access (irisx-prod-key.pem)
- [x] **Email for Testing** (Your personal email to receive test messages)

### Required AWS Resources

| Resource | Type | Purpose |
|----------|------|---------|
| EC2 Instance | t3.small | Postfix mail server (Oregon) |
| EC2 Instance | t3.small | Postfix mail server (Virginia) |
| Elastic IP | 2x | Static IPs for mail servers |
| Security Group | mail-server-sg | Port 25, 587, 465, 22 |
| Route53 Zone | tazzi.com | DNS records (MX, SPF, DKIM) |

**Monthly Cost Estimate:** ~$30-40/month for both regions

---

## DNS Configuration

### Step 1: Create DNS Records for Mail Servers

Before launching EC2 instances, set up your DNS records in Route53:

```bash
# Get your Route53 hosted zone ID
/opt/homebrew/bin/aws route53 list-hosted-zones \
  --query 'HostedZones[?Name==`tazzi.com.`].Id' \
  --output text
```

### Step 2: Add MX Records

**Priority:** MX records tell the internet where to deliver emails for @tazzi.com

```json
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "tazzi.com",
      "Type": "MX",
      "TTL": 300,
      "ResourceRecords": [
        {"Value": "10 mail-oregon.tazzi.com"},
        {"Value": "20 mail-virginia.tazzi.com"}
      ]
    }
  }]
}
```

**Apply DNS changes:**

```bash
HOSTED_ZONE_ID="Z0123456789ABC"  # From previous step

/opt/homebrew/bin/aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://mx-records.json
```

### Step 3: Add A Records (Placeholder - Update After EC2 Launch)

Create placeholder A records. We'll update these with actual IPs after launching EC2:

```json
{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "mail-oregon.tazzi.com",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "1.1.1.1"}]
      }
    },
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "mail-virginia.tazzi.com",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "1.1.1.1"}]
      }
    }
  ]
}
```

### Step 4: Add SPF Record

**SPF** (Sender Policy Framework) tells receiving servers which IPs are authorized to send email for tazzi.com:

```json
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "tazzi.com",
      "Type": "TXT",
      "TTL": 300,
      "ResourceRecords": [
        {"Value": "\"v=spf1 ip4:OREGON_IP ip4:VIRGINIA_IP include:_spf.elasticemail.com ~all\""}
      ]
    }
  }]
}
```

**Note:** Replace `OREGON_IP` and `VIRGINIA_IP` with your actual Elastic IPs after EC2 launch. The `include:_spf.elasticemail.com` keeps Elastic Email authorized as a backup.

### Step 5: DKIM Record (Created Later)

We'll add DKIM records after generating keys on the mail server. Placeholder for now:

```
Selector: mail
Domain: tazzi.com
Record Name: mail._domainkey.tazzi.com
Type: TXT
Value: (Generated during DKIM setup)
```

### Step 6: DMARC Record

**DMARC** tells receiving servers what to do if SPF/DKIM checks fail:

```json
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "_dmarc.tazzi.com",
      "Type": "TXT",
      "TTL": 300,
      "ResourceRecords": [
        {"Value": "\"v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@tazzi.com; ruf=mailto:dmarc-failures@tazzi.com; pct=100\""}
      ]
    }
  }]
}
```

**DMARC Policy Explained:**
- `p=quarantine` - Put suspicious emails in spam folder (use `p=reject` after testing)
- `rua=` - Where to send aggregate reports
- `ruf=` - Where to send forensic (failure) reports
- `pct=100` - Apply policy to 100% of emails

---

## EC2 Instance Setup (Oregon)

### Step 1: Create Security Group

```bash
# Create security group for mail servers
/opt/homebrew/bin/aws ec2 create-security-group \
  --group-name mail-server-sg \
  --description "Security group for Postfix mail servers" \
  --vpc-id vpc-0a1b2c3d4e5f6g7h8 \
  --region us-west-2
```

**Output:** Note the `GroupId` (e.g., `sg-0abc123def456`)

### Step 2: Configure Security Group Rules

```bash
MAIL_SG_ID="sg-0abc123def456"  # From previous step

# Allow SMTP (outbound email to other servers)
/opt/homebrew/bin/aws ec2 authorize-security-group-ingress \
  --group-id $MAIL_SG_ID \
  --ip-permissions IpProtocol=tcp,FromPort=25,ToPort=25,IpRanges='[{CidrIp=0.0.0.0/0,Description="SMTP"}]' \
  --region us-west-2

# Allow SMTP Submission (authenticated clients)
/opt/homebrew/bin/aws ec2 authorize-security-group-ingress \
  --group-id $MAIL_SG_ID \
  --ip-permissions IpProtocol=tcp,FromPort=587,ToPort=587,IpRanges='[{CidrIp=0.0.0.0/0,Description="SMTP Submission"}]' \
  --region us-west-2

# Allow SMTPS (SSL/TLS encrypted SMTP)
/opt/homebrew/bin/aws ec2 authorize-security-group-ingress \
  --group-id $MAIL_SG_ID \
  --ip-permissions IpProtocol=tcp,FromPort=465,ToPort=465,IpRanges='[{CidrIp=0.0.0.0/0,Description="SMTPS"}]' \
  --region us-west-2

# Allow SSH from your IP only
/opt/homebrew/bin/aws ec2 authorize-security-group-ingress \
  --group-id $MAIL_SG_ID \
  --ip-permissions IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges='[{CidrIp=73.6.78.238/32,Description="SSH from home"}]' \
  --region us-west-2
```

### Step 3: Launch EC2 Instance (Oregon)

```bash
/opt/homebrew/bin/aws ec2 run-instances \
  --region us-west-2 \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.small \
  --key-name irisx-prod-key \
  --security-group-ids $MAIL_SG_ID \
  --subnet-id subnet-0a1b2c3d \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=irisx-mail-oregon},{Key=Environment,Value=production},{Key=Role,Value=mail-server}]' \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":30,"VolumeType":"gp3"}}]'
```

**Output:** Note the `InstanceId` (e.g., `i-0abc123def456`)

### Step 4: Allocate and Associate Elastic IP

```bash
# Allocate Elastic IP
/opt/homebrew/bin/aws ec2 allocate-address \
  --domain vpc \
  --region us-west-2

# Note the AllocationId and PublicIp from output

# Associate with instance
INSTANCE_ID="i-0abc123def456"
ALLOCATION_ID="eipalloc-0abc123def"

/opt/homebrew/bin/aws ec2 associate-address \
  --instance-id $INSTANCE_ID \
  --allocation-id $ALLOCATION_ID \
  --region us-west-2
```

### Step 5: Update DNS A Record with Actual IP

```bash
OREGON_IP="52.12.34.56"  # From Elastic IP allocation
HOSTED_ZONE_ID="Z0123456789ABC"

# Update mail-oregon.tazzi.com A record
cat > update-oregon-a-record.json <<EOF
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "mail-oregon.tazzi.com",
      "Type": "A",
      "TTL": 300,
      "ResourceRecords": [{"Value": "$OREGON_IP"}]
    }
  }]
}
EOF

/opt/homebrew/bin/aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://update-oregon-a-record.json
```

### Step 6: Update SPF Record with Oregon IP

```bash
cat > update-spf-record.json <<EOF
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "tazzi.com",
      "Type": "TXT",
      "TTL": 300,
      "ResourceRecords": [
        {"Value": "\"v=spf1 ip4:$OREGON_IP include:_spf.elasticemail.com ~all\""}
      ]
    }
  }]
}
EOF

/opt/homebrew/bin/aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://update-spf-record.json
```

### Step 7: Configure Reverse DNS (PTR Record)

**Critical for deliverability!** Most email servers reject emails without proper reverse DNS.

Contact AWS Support to set PTR record:
1. Go to AWS Support Center
2. Create case: "EC2 Instance Issue"
3. Subject: "Request Reverse DNS (PTR) for Elastic IP"
4. Body:
```
Please configure reverse DNS for the following Elastic IP:

IP Address: 52.12.34.56
PTR Record: mail-oregon.tazzi.com
Use Case: Outbound SMTP mail server
Instance ID: i-0abc123def456
Region: us-west-2

I confirm this IP will be used for legitimate email sending only.
```

**Processing Time:** Usually 1-2 business days

---

## Postfix Installation & Configuration

SSH into your Oregon mail server and follow these steps:

### Step 1: Connect to EC2 Instance

```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@52.12.34.56
```

### Step 2: Update System and Install Postfix

```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install Postfix and required tools
sudo DEBIAN_FRONTEND=noninteractive apt install -y \
  postfix \
  postfix-pcre \
  opendkim \
  opendkim-tools \
  mailutils \
  certbot \
  python3-certbot-nginx

# Set hostname
sudo hostnamectl set-hostname mail-oregon.tazzi.com
```

### Step 3: Configure Postfix Main Settings

```bash
# Backup original config
sudo cp /etc/postfix/main.cf /etc/postfix/main.cf.orig

# Edit main.cf
sudo nano /etc/postfix/main.cf
```

**Replace entire file with this production-ready configuration:**

```conf
# Basic Settings
myhostname = mail-oregon.tazzi.com
mydomain = tazzi.com
myorigin = $mydomain
mydestination = localhost
relayhost =
mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128
mailbox_size_limit = 0
recipient_delimiter = +
inet_interfaces = all
inet_protocols = ipv4

# Network and Delivery
smtpd_banner = $myhostname ESMTP
biff = no
append_dot_mydomain = no
readme_directory = no
compatibility_level = 3.6

# TLS Settings (Outbound - When Postfix Connects to Other Servers)
smtp_tls_security_level = may
smtp_tls_cert_file = /etc/letsencrypt/live/mail-oregon.tazzi.com/fullchain.pem
smtp_tls_key_file = /etc/letsencrypt/live/mail-oregon.tazzi.com/privkey.pem
smtp_tls_session_cache_database = btree:${data_directory}/smtp_scache
smtp_tls_loglevel = 1

# TLS Settings (Inbound - When Other Servers Connect to Postfix)
smtpd_tls_security_level = may
smtpd_tls_cert_file = /etc/letsencrypt/live/mail-oregon.tazzi.com/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/mail-oregon.tazzi.com/privkey.pem
smtpd_tls_session_cache_database = btree:${data_directory}/smtpd_scache
smtpd_tls_loglevel = 1
smtpd_tls_received_header = yes
smtpd_tls_auth_only = yes

# SASL Authentication (For IRISX API to Authenticate)
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes
smtpd_sasl_security_options = noanonymous
smtpd_sasl_local_domain = $myhostname
broken_sasl_auth_clients = yes

# Anti-Spam and Rate Limiting
smtpd_helo_required = yes
smtpd_delay_reject = yes
smtpd_recipient_limit = 50
smtpd_client_connection_count_limit = 10
smtpd_client_connection_rate_limit = 30
smtpd_error_sleep_time = 1s
smtpd_soft_error_limit = 10
smtpd_hard_error_limit = 20

# Client Restrictions
smtpd_client_restrictions =
  permit_mynetworks,
  permit_sasl_authenticated,
  reject_unknown_client_hostname,
  reject_unauth_pipelining

# Helo Restrictions
smtpd_helo_restrictions =
  permit_mynetworks,
  permit_sasl_authenticated,
  reject_invalid_helo_hostname,
  reject_non_fqdn_helo_hostname,
  reject_unknown_helo_hostname

# Sender Restrictions
smtpd_sender_restrictions =
  permit_mynetworks,
  permit_sasl_authenticated,
  reject_non_fqdn_sender,
  reject_unknown_sender_domain

# Recipient Restrictions
smtpd_recipient_restrictions =
  permit_mynetworks,
  permit_sasl_authenticated,
  reject_non_fqdn_recipient,
  reject_unknown_recipient_domain,
  reject_unauth_destination

# DKIM (OpenDKIM Integration)
milter_default_action = accept
milter_protocol = 6
smtpd_milters = inet:127.0.0.1:8891
non_smtpd_milters = $smtpd_milters

# Performance Tuning
default_process_limit = 100
smtp_destination_concurrency_limit = 20
smtp_destination_rate_delay = 1s
smtp_extra_recipient_limit = 10

# Logging
maillog_file = /var/log/postfix.log
```

**Save and exit** (Ctrl+X, Y, Enter)

### Step 4: Configure Postfix Master Settings

```bash
sudo nano /etc/postfix/master.cf
```

**Add these lines at the end:**

```conf
# SMTP Submission (Port 587) - For IRISX API
submission inet n       -       y       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=encrypt
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_tls_auth_only=yes
  -o smtpd_reject_unlisted_recipient=no
  -o smtpd_client_restrictions=permit_sasl_authenticated,reject
  -o smtpd_helo_restrictions=
  -o smtpd_sender_restrictions=
  -o smtpd_recipient_restrictions=
  -o smtpd_relay_restrictions=permit_sasl_authenticated,reject
  -o milter_macro_daemon_name=ORIGINATING

# SMTPS (Port 465) - Alternative SSL/TLS
smtps     inet  n       -       y       -       -       smtpd
  -o syslog_name=postfix/smtps
  -o smtpd_tls_wrappermode=yes
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_reject_unlisted_recipient=no
  -o smtpd_client_restrictions=permit_sasl_authenticated,reject
  -o smtpd_recipient_restrictions=
  -o smtpd_relay_restrictions=permit_sasl_authenticated,reject
  -o milter_macro_daemon_name=ORIGINATING
```

---

## DKIM, SPF, DMARC Setup

### Step 1: Install and Configure OpenDKIM

```bash
# Install OpenDKIM
sudo apt install -y opendkim opendkim-tools

# Create directory structure
sudo mkdir -p /etc/opendkim/keys/tazzi.com
sudo chown -R opendkim:opendkim /etc/opendkim
sudo chmod 750 /etc/opendkim/keys
```

### Step 2: Generate DKIM Keys

```bash
# Generate 2048-bit DKIM key pair
sudo opendkim-genkey -b 2048 -d tazzi.com -D /etc/opendkim/keys/tazzi.com -s mail -v

# Set correct permissions
sudo chown opendkim:opendkim /etc/opendkim/keys/tazzi.com/mail.private
sudo chmod 400 /etc/opendkim/keys/tazzi.com/mail.private
```

### Step 3: Configure OpenDKIM

```bash
sudo nano /etc/opendkim.conf
```

**Replace with:**

```conf
# Logging
Syslog                  yes
SyslogSuccess           yes
LogWhy                  yes

# Common settings
Canonicalization        relaxed/simple
Mode                    sv
SubDomains              no
AutoRestart             yes
AutoRestartRate         10/1M
Background              yes
DNSTimeout              5

# Security
UMask                   007

# Signing Table
KeyTable                /etc/opendkim/key.table
SigningTable            refile:/etc/opendkim/signing.table
ExternalIgnoreList      /etc/opendkim/trusted.hosts
InternalHosts           /etc/opendkim/trusted.hosts

# Socket
Socket                  inet:8891@localhost

# Paths
PidFile                 /run/opendkim/opendkim.pid
```

### Step 4: Create OpenDKIM Tables

```bash
# Key Table (Maps selector to private key)
sudo nano /etc/opendkim/key.table
```

**Add:**

```
mail._domainkey.tazzi.com tazzi.com:mail:/etc/opendkim/keys/tazzi.com/mail.private
```

```bash
# Signing Table (Maps email addresses to DKIM key)
sudo nano /etc/opendkim/signing.table
```

**Add:**

```
*@tazzi.com mail._domainkey.tazzi.com
```

```bash
# Trusted Hosts (Localhost and your mail server)
sudo nano /etc/opendkim/trusted.hosts
```

**Add:**

```
127.0.0.1
localhost
mail-oregon.tazzi.com
52.12.34.56
```

### Step 5: Get DKIM Public Key for DNS

```bash
# Display DKIM public key
sudo cat /etc/opendkim/keys/tazzi.com/mail.txt
```

**Output will look like:**

```
mail._domainkey IN TXT ( "v=DKIM1; h=sha256; k=rsa; "
  "p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."
  "...more characters..." )
```

### Step 6: Add DKIM Record to Route53

**Combine all the quoted strings into one long value:**

```bash
# Create DKIM DNS record
HOSTED_ZONE_ID="Z0123456789ABC"

cat > dkim-record.json <<EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "mail._domainkey.tazzi.com",
      "Type": "TXT",
      "TTL": 300,
      "ResourceRecords": [
        {"Value": "\"v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...YOUR_FULL_KEY_HERE...\""}
      ]
    }
  }]
}
EOF

/opt/homebrew/bin/aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://dkim-record.json
```

### Step 7: Start and Enable OpenDKIM

```bash
# Start OpenDKIM
sudo systemctl start opendkim
sudo systemctl enable opendkim

# Check status
sudo systemctl status opendkim
```

### Step 8: Restart Postfix

```bash
sudo systemctl restart postfix
sudo systemctl status postfix
```

---

## SSL/TLS Configuration

### Step 1: Install Let's Encrypt Certificate

```bash
# Stop Postfix temporarily
sudo systemctl stop postfix

# Obtain certificate
sudo certbot certonly --standalone \
  -d mail-oregon.tazzi.com \
  --preferred-challenges http \
  --agree-tos \
  --email rrodkey@me.com \
  --non-interactive

# Start Postfix
sudo systemctl start postfix
```

### Step 2: Set Up Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Create renewal hook to reload Postfix
sudo nano /etc/letsencrypt/renewal-hooks/post/reload-postfix.sh
```

**Add:**

```bash
#!/bin/bash
systemctl reload postfix
```

**Make executable:**

```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/post/reload-postfix.sh
```

### Step 3: Verify TLS Configuration

```bash
# Test SMTP with TLS
openssl s_client -starttls smtp -connect mail-oregon.tazzi.com:587
```

**Expected output should include:**

```
SSL handshake has read ... bytes
Verify return code: 0 (ok)
```

---

## IRISX Provider Integration

Now we integrate the Postfix server into IRISX's email service as a standard provider.

### Step 1: Create SMTP Authentication User

On the mail server, create a dedicated user for IRISX API authentication:

```bash
# Install Dovecot for SASL authentication
sudo apt install -y dovecot-core dovecot-imapd

# Create mail user
sudo useradd -m -s /bin/bash irisx_mailer
echo "irisx_mailer:YOUR_SECURE_PASSWORD_HERE" | sudo chpasswd
```

### Step 2: Configure Dovecot SASL

```bash
sudo nano /etc/dovecot/conf.d/10-master.conf
```

**Find the `service auth` section and update:**

```conf
service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0660
    user = postfix
    group = postfix
  }
}
```

```bash
sudo nano /etc/dovecot/conf.d/10-auth.conf
```

**Update:**

```conf
disable_plaintext_auth = no
auth_mechanisms = plain login
```

**Restart Dovecot:**

```bash
sudo systemctl restart dovecot
sudo systemctl enable dovecot
```

### Step 3: Create CustomSMTPProvider Class

On your **local development machine**, create the provider adapter:

```bash
cd /Users/gamer/Documents/GitHub/IRISX/api/src/services/email-providers
```

Create new file: `custom-smtp.js`

```javascript
/**
 * Custom SMTP Provider Adapter (Postfix)
 * Self-hosted mail server integration
 */

import nodemailer from 'nodemailer';

export class CustomSMTPProvider {
  constructor(credentials) {
    this.host = credentials.smtp_host;
    this.port = credentials.smtp_port || 587;
    this.secure = credentials.smtp_port === 465; // Use SSL for port 465
    this.username = credentials.smtp_username;
    this.password = credentials.smtp_password;
    this.fromEmail = credentials.from_email || 'noreply@tazzi.com';
    this.fromName = credentials.from_name || 'IRISX';

    // Create reusable transporter
    this.transporter = nodemailer.createTransport({
      host: this.host,
      port: this.port,
      secure: this.secure,
      auth: {
        user: this.username,
        pass: this.password
      },
      pool: true, // Use connection pooling
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 10 // Max 10 emails per second
    });
  }

  /**
   * Send email via custom SMTP server
   */
  async send(emailData) {
    const { to, subject, html, text, from, replyTo, attachments } = emailData;

    const mailOptions = {
      from: from || `"${this.fromName}" <${this.fromEmail}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text,
      replyTo: replyTo || this.fromEmail
    };

    // Add attachments if present
    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType
      }));
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
        provider: 'custom-smtp',
        response: info.response
      };
    } catch (error) {
      console.error('[Custom SMTP] Send failed:', error);
      return {
        success: false,
        error: error.message,
        provider: 'custom-smtp'
      };
    }
  }

  /**
   * Test connection to SMTP server
   */
  async testConnection() {
    try {
      await this.transporter.verify();
      return {
        success: true,
        message: 'SMTP connection successful'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Get provider statistics
   * Note: Custom SMTP doesn't provide detailed stats like commercial providers
   */
  async getStats(startDate, endDate) {
    // For custom SMTP, we rely on database tracking in messaging_providers table
    return {
      sent: null, // Query from message_routing_logs
      delivered: null,
      bounced: null,
      note: 'Stats tracked in IRISX database (messaging_providers table)'
    };
  }

  /**
   * Close connection pool
   */
  async close() {
    this.transporter.close();
  }
}

export default CustomSMTPProvider;
```

### Step 4: Update Provider Index

```bash
nano /Users/gamer/Documents/GitHub/IRISX/api/src/services/email-providers/index.js
```

**Update to include CustomSMTPProvider:**

```javascript
import { ElasticEmailProvider } from './elastic-email.js';
import { SendGridProvider } from './sendgrid.js';
import { CustomSMTPProvider } from './custom-smtp.js';

export const EmailProviders = {
  'elastic-email': ElasticEmailProvider,
  'sendgrid': SendGridProvider,
  'custom-smtp': CustomSMTPProvider
};

export { ElasticEmailProvider, SendGridProvider, CustomSMTPProvider };
```

### Step 5: Install Nodemailer Dependency

```bash
cd /Users/gamer/Documents/GitHub/IRISX/api
npm install nodemailer
```

### Step 6: Run Database Migration to Add Provider

Create migration script:

```bash
nano /Users/gamer/Documents/GitHub/IRISX/scripts/add-postfix-oregon.js
```

```javascript
/**
 * Add Postfix Oregon Provider to Database
 */

import pool from '../api/src/db/connection.js';
import crypto from 'crypto';

// Encryption settings (must match backend)
const ENCRYPTION_PASSWORD = process.env.ENCRYPTION_KEY || 'change-this-key-in-production';
const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt credentials
 */
function encryptCredentials(credentials) {
  const key = crypto.scryptSync(ENCRYPTION_PASSWORD, 'salt', 32);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex')
  };
}

async function addPostfixOregon() {
  try {
    console.log('[Migration] Adding Postfix Oregon provider...');

    // Credentials for SMTP authentication
    const credentials = {
      smtp_host: 'mail-oregon.tazzi.com',
      smtp_port: 587,
      smtp_username: 'irisx_mailer',
      smtp_password: 'YOUR_SECURE_PASSWORD_HERE', // Replace with actual password
      from_email: 'noreply@tazzi.com',
      from_name: 'IRISX'
    };

    const { encryptedData, iv } = encryptCredentials(credentials);

    // Insert provider
    const result = await pool.query(`
      INSERT INTO messaging_providers (
        provider_type,
        provider_name,
        credentials_encrypted,
        credentials_iv,
        config,
        is_active
      ) VALUES (
        'email',
        'postfix-oregon',
        $1,
        $2,
        $3,
        true
      )
      RETURNING id, provider_name
    `, [
      encryptedData,
      iv,
      JSON.stringify({
        priority: 1,
        display_name: 'Self-Hosted Oregon',
        region: 'us-west-2',
        cost_per_1000: 0.00,
        smtp_host: 'mail-oregon.tazzi.com',
        smtp_port: 587,
        health_score: 100,
        daily_limit: 500000,
        supports_attachments: true,
        supports_templates: false,
        supports_tracking: false
      })
    ]);

    console.log(`✓ Added provider: ${result.rows[0].provider_name} (ID: ${result.rows[0].id})`);
    console.log('');
    console.log('✓ Migration complete!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Deploy API changes to production');
    console.log('2. Test email sending via admin portal');
    console.log('3. Monitor logs for delivery success');

  } catch (error) {
    console.error('[Migration] Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

addPostfixOregon().catch(console.error);
```

### Step 7: Deploy to Production

```bash
# Deploy API changes
cd /Users/gamer/Documents/GitHub/IRISX
./deploy-api.sh

# SSH to production and run migration
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69
cd ~/irisx-backend/scripts
node add-postfix-oregon.js
```

---

## Multi-Region Setup (Virginia)

Repeat the EC2 setup for Virginia (us-east-1):

### Quick Steps:

```bash
# 1. Launch EC2 in Virginia
/opt/homebrew/bin/aws ec2 run-instances \
  --region us-east-1 \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.small \
  --key-name irisx-prod-key \
  --security-group-ids $MAIL_SG_ID_VIRGINIA \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=irisx-mail-virginia}]'

# 2. Allocate Elastic IP
/opt/homebrew/bin/aws ec2 allocate-address --domain vpc --region us-east-1

# 3. Associate IP with instance
# 4. Update DNS A record for mail-virginia.tazzi.com
# 5. Update SPF record to include both IPs:
#    "v=spf1 ip4:OREGON_IP ip4:VIRGINIA_IP include:_spf.elasticemail.com ~all"
# 6. Request PTR record from AWS Support
# 7. SSH and repeat Postfix installation steps
# 8. Generate separate DKIM key for Virginia (selector: mail-va)
# 9. Add second DKIM DNS record: mail-va._domainkey.tazzi.com
# 10. Run migration script to add postfix-virginia provider
```

---

## Load Balancing Strategy

### Option 1: Application-Level Load Balancing (Recommended)

Use IRISX's built-in health scoring and least-cost routing:

```sql
-- Both regions configured as separate providers
UPDATE messaging_providers SET
  config = config || '{"priority": 1, "weight": 50}'::jsonb
WHERE provider_name = 'postfix-oregon';

UPDATE messaging_providers SET
  config = config || '{"priority": 1, "weight": 50}'::jsonb
WHERE provider_name = 'postfix-virginia';
```

IRISX will automatically:
- Route 50% of traffic to each region
- Failover to Virginia if Oregon is unhealthy
- Track delivery success rates per region
- Disable unhealthy providers automatically

### Option 2: DNS Round-Robin

Update MX records to alternate between regions:

```json
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "tazzi.com",
      "Type": "MX",
      "TTL": 60,
      "ResourceRecords": [
        {"Value": "10 mail-oregon.tazzi.com"},
        {"Value": "10 mail-virginia.tazzi.com"}
      ]
    }
  }]
}
```

**Note:** Same priority (10) means 50/50 split. Lower TTL (60s) allows faster failover.

### Option 3: Geolocation Routing (Advanced)

Use Route53 geolocation routing to send:
- West coast traffic → Oregon
- East coast traffic → Virginia
- International traffic → Closest region

---

## Monitoring & Health Checks

### Step 1: Create Health Check Endpoint

On each mail server, create a simple health check:

```bash
# Install nginx for health endpoint
sudo apt install -y nginx

# Create health check page
sudo nano /var/www/html/health
```

**Add:**

```json
{"status":"healthy","server":"oregon","timestamp":"2025-01-11T12:00:00Z"}
```

### Step 2: Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/default
```

**Add location block:**

```nginx
server {
    listen 80;
    server_name mail-oregon.tazzi.com;

    location /health {
        return 200 '{"status":"healthy","server":"oregon"}';
        add_header Content-Type application/json;
    }
}
```

**Restart:**

```bash
sudo systemctl restart nginx
```

### Step 3: IRISX Health Monitoring

The email service will automatically monitor provider health based on:
- Delivery success rate (target: >95%)
- Response time (target: <2 seconds)
- Consecutive failures (auto-disable after 10)

Health checks run every 5 minutes and update the `health_score` in `messaging_providers`.

### Step 4: CloudWatch Alarms

```bash
# Create CPU alarm for mail server
/opt/homebrew/bin/aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-Mail-Oregon-High-CPU" \
  --alarm-description "Alert if mail server CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --dimensions Name=InstanceId,Value=i-0abc123def456
```

### Step 5: Log Monitoring

```bash
# Monitor Postfix logs in real-time
sudo tail -f /var/log/postfix.log

# Check OpenDKIM logs
sudo tail -f /var/log/mail.log | grep opendkim

# Search for delivery failures
sudo grep "status=bounced" /var/log/postfix.log
```

---

## Security Hardening

### Step 1: Enable Fail2Ban

Protect against brute force attacks:

```bash
sudo apt install -y fail2ban

# Create Postfix jail
sudo nano /etc/fail2ban/jail.d/postfix.conf
```

**Add:**

```ini
[postfix-auth]
enabled = true
port = smtp,submission,smtps
filter = postfix-auth
logpath = /var/log/postfix.log
maxretry = 3
bantime = 3600
findtime = 600
```

**Start Fail2Ban:**

```bash
sudo systemctl start fail2ban
sudo systemctl enable fail2ban
```

### Step 2: Rate Limiting

Already configured in `main.cf`:
- `smtpd_client_connection_rate_limit = 30` (max 30 connections/minute per IP)
- `smtpd_recipient_limit = 50` (max 50 recipients per message)

### Step 3: Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 25/tcp   # SMTP
sudo ufw allow 587/tcp  # Submission
sudo ufw allow 465/tcp  # SMTPS
sudo ufw allow 80/tcp   # HTTP (for health checks)
sudo ufw enable
```

### Step 4: Disable Root Login

```bash
sudo passwd -l root
```

### Step 5: Automatic Security Updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

---

## Testing & Verification

### Step 1: Test SMTP Authentication

```bash
# From your local machine
echo "Subject: Test from IRISX" | \
  curl --ssl-reqd \
  --url "smtp://mail-oregon.tazzi.com:587" \
  --user "irisx_mailer:YOUR_PASSWORD" \
  --mail-from "noreply@tazzi.com" \
  --mail-rcpt "rrodkey@me.com" \
  --upload-file -
```

### Step 2: Test DKIM Signing

Send a test email and check headers:

```bash
# On mail server
echo "Test DKIM" | mail -s "DKIM Test" rrodkey@me.com
```

**In Gmail, click "Show original" and verify:**
- `DKIM-Signature:` header is present
- `dkim=pass` in Authentication-Results

### Step 3: Check Deliverability Score

Use these free tools:

- **Mail Tester:** https://www.mail-tester.com/
  1. Send email to the provided address
  2. Check score (target: 10/10)

- **MXToolbox:** https://mxtoolbox.com/SuperTool.aspx
  1. Enter `tazzi.com`
  2. Verify MX, SPF, DKIM, DMARC records

- **DMARC Analyzer:** https://www.dmarcanalyzer.com/dmarc-checker/
  1. Enter `tazzi.com`
  2. Verify DMARC policy

### Step 4: Test via IRISX Admin Portal

1. Go to https://admin.tazzi.com/dashboard/email-service
2. Select "Self-Hosted Oregon" provider
3. Click "Send Test Email"
4. Check inbox at rrodkey@me.com
5. Verify email delivered with DKIM signature

### Step 5: Load Testing

Test throughput with K6:

```bash
# Install K6
brew install k6

# Create test script
cat > email-load-test.js <<EOF
import http from 'k6/http';

export let options = {
  vus: 10,
  duration: '30s',
};

export default function() {
  const payload = JSON.stringify({
    to: 'test@example.com',
    subject: 'Load Test',
    html: '<p>Testing IRISX mail server</p>'
  });

  http.post('http://3.83.53.69:3000/v1/emails', payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_TOKEN'
    },
  });
}
EOF

# Run test
k6 run email-load-test.js
```

**Target Performance:**
- Throughput: 100+ emails/second
- P95 latency: <2 seconds
- Error rate: <0.1%

---

## Troubleshooting

### Issue: Emails Going to Spam

**Cause:** SPF/DKIM/DMARC not configured correctly

**Solution:**

```bash
# Verify DNS records
dig tazzi.com TXT +short  # Check SPF
dig mail._domainkey.tazzi.com TXT +short  # Check DKIM
dig _dmarc.tazzi.com TXT +short  # Check DMARC

# Verify PTR record
dig -x 52.12.34.56 +short  # Should return mail-oregon.tazzi.com
```

### Issue: Connection Refused on Port 587

**Cause:** Firewall blocking submission port

**Solution:**

```bash
# Check if Postfix is listening
sudo netstat -tlnp | grep :587

# Check UFW rules
sudo ufw status

# Verify security group
/opt/homebrew/bin/aws ec2 describe-security-groups \
  --group-ids sg-0abc123def \
  --region us-west-2
```

### Issue: SASL Authentication Failed

**Cause:** Dovecot not configured or credentials wrong

**Solution:**

```bash
# Test SASL on server
testsaslauthd -u irisx_mailer -p YOUR_PASSWORD

# Check Dovecot logs
sudo tail -f /var/log/dovecot.log

# Verify Postfix can connect to Dovecot
sudo postconf -d | grep smtpd_sasl
```

### Issue: High Bounce Rate

**Cause:** IP reputation issues or invalid recipients

**Solution:**

```bash
# Check IP reputation
curl -s "https://www.hetrixtools.com/api/blacklist-check/IP/52.12.34.56/" | jq

# Monitor bounces in Postfix logs
sudo grep "status=bounced" /var/log/postfix.log | tail -20

# Check bounce reason
sudo grep "Recipient address rejected" /var/log/postfix.log
```

### Issue: Slow Delivery

**Cause:** DNS resolution issues or rate limiting

**Solution:**

```bash
# Test DNS resolution speed
time dig gmail.com MX +short

# Check connection count
sudo postfix status

# Increase connection limit
sudo postconf -e "default_process_limit = 200"
sudo systemctl reload postfix
```

---

## Scaling Strategy

### Phase 1: Current (2 Regions, 1M emails/month)

**Infrastructure:**
- 2x t3.small instances ($30/month)
- Elastic Email as backup provider

**Capacity:** 500k emails/day per region

### Phase 2: Growth (10M emails/month)

**Upgrade to:**
- 2x t3.medium instances ($60/month)
- Add CloudFront for static assets
- Enable connection pooling in IRISX API

**Capacity:** 5M emails/day

### Phase 3: Enterprise (100M+ emails/month)

**Multi-Region Cluster:**
- 3 regions (Oregon, Virginia, EU)
- 2 instances per region (6 total)
- AWS Application Load Balancer per region
- Redis-based queue for email processing
- Dedicated RDS read replicas for analytics

**Architecture:**

```
                    Route53 (Global DNS)
                            │
           ┌────────────────┼────────────────┐
           │                │                │
      Oregon ALB       Virginia ALB       EU ALB
           │                │                │
    ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐
    │   │   │   │  │  │   │   │   │  │  │   │   │
Postfix Postfix  Postfix Postfix  Postfix Postfix
  (Primary)         (Primary)         (Primary)
```

**Capacity:** 100M+ emails/day

**Cost:** ~$500/month (vs $9,000/month with Elastic Email)

---

## Appendix: Quick Reference Commands

### DNS Verification

```bash
# Check MX records
dig tazzi.com MX +short

# Check SPF
dig tazzi.com TXT +short | grep spf

# Check DKIM
dig mail._domainkey.tazzi.com TXT +short

# Check DMARC
dig _dmarc.tazzi.com TXT +short

# Check PTR (reverse DNS)
dig -x YOUR_IP +short
```

### Postfix Commands

```bash
# Check queue
sudo postqueue -p

# Flush queue (force immediate delivery)
sudo postqueue -f

# View configuration
sudo postconf -n

# Test configuration
sudo postfix check

# Reload configuration
sudo systemctl reload postfix

# View real-time logs
sudo tail -f /var/log/postfix.log
```

### OpenDKIM Commands

```bash
# Test DKIM key
sudo opendkim-testkey -d tazzi.com -s mail -vvv

# Verify DKIM signature
sudo opendkim-testmsg -s mail -d tazzi.com < email.txt

# Check status
sudo systemctl status opendkim
```

### Database Queries

```sql
-- Check all email providers
SELECT
  id,
  provider_name,
  is_active,
  config->>'priority' as priority,
  config->>'health_score' as health_score
FROM messaging_providers
WHERE provider_type = 'email'
ORDER BY (config->>'priority')::int;

-- View recent email deliveries via self-hosted
SELECT
  created_at,
  selected_provider_name,
  destination,
  selected_rate,
  provider_selection_reason
FROM message_routing_logs
WHERE message_type = 'email'
  AND selected_provider_name LIKE 'postfix%'
ORDER BY created_at DESC
LIMIT 20;

-- Check provider health history
SELECT
  provider_id,
  status,
  response_time_ms,
  error_message,
  checked_at
FROM messaging_provider_health_logs
WHERE provider_id IN (
  SELECT id FROM messaging_providers WHERE provider_name LIKE 'postfix%'
)
ORDER BY checked_at DESC
LIMIT 50;
```

---

## Success Checklist

Before going live, verify:

- [ ] DNS records configured (MX, A, SPF, DKIM, DMARC)
- [ ] PTR (reverse DNS) set up via AWS Support
- [ ] SSL/TLS certificate installed and auto-renewing
- [ ] Postfix running and accepting connections on 587/465
- [ ] OpenDKIM signing emails correctly
- [ ] Dovecot SASL authentication working
- [ ] IRISX CustomSMTPProvider deployed to production
- [ ] Provider added to `messaging_providers` table
- [ ] Test email delivered successfully
- [ ] Mail-tester.com score: 10/10
- [ ] MXToolbox shows all green checks
- [ ] Fail2Ban protecting against brute force
- [ ] CloudWatch alarms configured
- [ ] Firewall (UFW) enabled
- [ ] Security updates automatic
- [ ] Virginia region set up (multi-region redundancy)
- [ ] Load balancing configured
- [ ] Health checks passing
- [ ] Documentation updated

---

## Support and Resources

- **Postfix Documentation:** http://www.postfix.org/documentation.html
- **OpenDKIM Setup Guide:** http://www.opendkim.org/opendkim-README
- **Let's Encrypt:** https://letsencrypt.org/docs/
- **DMARC Guide:** https://dmarc.org/overview/
- **AWS EC2 Reverse DNS:** https://aws.amazon.com/premiumsupport/knowledge-center/ec2-reverse-dns/

---

**Document Created:** January 2025
**Maintained By:** IRISX Development Team
**Next Review:** March 2025
