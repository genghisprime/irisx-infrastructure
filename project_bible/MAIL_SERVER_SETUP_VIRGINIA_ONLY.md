# IRISX Self-Hosted Mail Server Setup - Virginia Only
## Production Postfix Deployment (Single Region)

**Version:** 1.0
**Region:** us-east-1 (Virginia)
**Domain:** tazzi.com
**Timeline:** 4-6 hours

> **Note:** This is a single-region setup for Virginia. We'll mirror to Oregon later when mirroring the rest of the infrastructure.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [DNS Configuration](#dns-configuration)
3. [EC2 Instance Setup](#ec2-instance-setup)
4. [Postfix Installation](#postfix-installation)
5. [DKIM Setup](#dkim-setup)
6. [SSL/TLS Configuration](#ssltls-configuration)
7. [IRISX Integration](#irisx-integration)
8. [Testing](#testing)
9. [Quick Reference](#quick-reference)

---

## Prerequisites

Before starting, ensure you have:

- [x] AWS Account with EC2, Route53 access
- [x] Domain tazzi.com with DNS control
- [x] SSH key pair (irisx-prod-key.pem)
- [x] IRISX API running on 3.83.53.69

**Required AWS Resources:**

| Resource | Type | Purpose | Estimated Cost |
|----------|------|---------|----------------|
| EC2 Instance | t3.small | Postfix mail server | ~$15/month |
| Elastic IP | 1x | Static IP for mail | Free (when attached) |
| Security Group | mail-server-sg | Firewall rules | Free |

**Total Monthly Cost:** ~$15-20/month

---

## DNS Configuration

### Step 1: Get Route53 Hosted Zone ID

```bash
/opt/homebrew/bin/aws route53 list-hosted-zones \
  --query 'HostedZones[?Name==`tazzi.com.`].Id' \
  --output text
```

Save this as `HOSTED_ZONE_ID` - you'll need it for all DNS changes.

### Step 2: Create A Record (Placeholder)

We'll create a placeholder A record now and update it with the real IP after EC2 launch:

```bash
HOSTED_ZONE_ID="YOUR_ZONE_ID"  # From step 1

cat > /tmp/mail-va-a-record.json <<EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "mail-va.tazzi.com",
      "Type": "A",
      "TTL": 300,
      "ResourceRecords": [{"Value": "1.1.1.1"}]
    }
  }]
}
EOF

/opt/homebrew/bin/aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file:///tmp/mail-va-a-record.json
```

### Step 3: Create MX Record

```bash
cat > /tmp/mx-record.json <<EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "tazzi.com",
      "Type": "MX",
      "TTL": 300,
      "ResourceRecords": [
        {"Value": "10 mail-va.tazzi.com"}
      ]
    }
  }]
}
EOF

/opt/homebrew/bin/aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file:///tmp/mx-record.json
```

### Step 4: Create SPF Record (Placeholder)

```bash
cat > /tmp/spf-record.json <<EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "tazzi.com",
      "Type": "TXT",
      "TTL": 300,
      "ResourceRecords": [
        {"Value": "\"v=spf1 ip4:PLACEHOLDER include:_spf.elasticemail.com ~all\""}
      ]
    }
  }]
}
EOF

/opt/homebrew/bin/aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file:///tmp/spf-record.json
```

**Note:** We'll update this with the actual IP after EC2 launch.

### Step 5: Create DMARC Record

```bash
cat > /tmp/dmarc-record.json <<EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "_dmarc.tazzi.com",
      "Type": "TXT",
      "TTL": 300,
      "ResourceRecords": [
        {"Value": "\"v=DMARC1; p=quarantine; rua=mailto:rrodkey@me.com; ruf=mailto:rrodkey@me.com; pct=100\""}
      ]
    }
  }]
}
EOF

/opt/homebrew/bin/aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file:///tmp/dmarc-record.json
```

---

## EC2 Instance Setup

### Step 1: Create Security Group

```bash
# Get your VPC ID
VPC_ID=$(/opt/homebrew/bin/aws ec2 describe-vpcs \
  --region us-east-1 \
  --query 'Vpcs[0].VpcId' \
  --output text)

echo "Using VPC: $VPC_ID"

# Create security group
/opt/homebrew/bin/aws ec2 create-security-group \
  --region us-east-1 \
  --group-name irisx-mail-server-sg \
  --description "Security group for IRISX Postfix mail server" \
  --vpc-id $VPC_ID
```

**Output:** Save the `GroupId` (e.g., `sg-abc123xyz`)

### Step 2: Configure Security Group Rules

```bash
MAIL_SG_ID="sg-abc123xyz"  # From previous step

# SMTP (port 25) - Outbound email to other mail servers
/opt/homebrew/bin/aws ec2 authorize-security-group-ingress \
  --region us-east-1 \
  --group-id $MAIL_SG_ID \
  --ip-permissions IpProtocol=tcp,FromPort=25,ToPort=25,IpRanges='[{CidrIp=0.0.0.0/0,Description="SMTP"}]'

# SMTP Submission (port 587) - Authenticated email sending from IRISX API
/opt/homebrew/bin/aws ec2 authorize-security-group-ingress \
  --region us-east-1 \
  --group-id $MAIL_SG_ID \
  --ip-permissions IpProtocol=tcp,FromPort=587,ToPort=587,IpRanges='[{CidrIp=0.0.0.0/0,Description="SMTP Submission"}]'

# SMTPS (port 465) - SSL/TLS encrypted SMTP
/opt/homebrew/bin/aws ec2 authorize-security-group-ingress \
  --region us-east-1 \
  --group-id $MAIL_SG_ID \
  --ip-permissions IpProtocol=tcp,FromPort=465,ToPort=465,IpRanges='[{CidrIp=0.0.0.0/0,Description="SMTPS"}]'

# SSH (port 22) - From your IP only
YOUR_IP="73.6.78.238"  # Update with your current IP
/opt/homebrew/bin/aws ec2 authorize-security-group-ingress \
  --region us-east-1 \
  --group-id $MAIL_SG_ID \
  --ip-permissions IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges="[{CidrIp=$YOUR_IP/32,Description=\"SSH from home\"}]"

# HTTP (port 80) - For Let's Encrypt certificate validation
/opt/homebrew/bin/aws ec2 authorize-security-group-ingress \
  --region us-east-1 \
  --group-id $MAIL_SG_ID \
  --ip-permissions IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges='[{CidrIp=0.0.0.0/0,Description="HTTP for SSL cert"}]'
```

### Step 3: Launch EC2 Instance

```bash
# Get latest Ubuntu AMI for us-east-1
AMI_ID=$(/opt/homebrew/bin/aws ec2 describe-images \
  --region us-east-1 \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
  --output text)

echo "Using AMI: $AMI_ID"

# Get default subnet
SUBNET_ID=$(/opt/homebrew/bin/aws ec2 describe-subnets \
  --region us-east-1 \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[0].SubnetId' \
  --output text)

echo "Using Subnet: $SUBNET_ID"

# Launch instance
/opt/homebrew/bin/aws ec2 run-instances \
  --region us-east-1 \
  --image-id $AMI_ID \
  --instance-type t3.small \
  --key-name irisx-prod-key \
  --security-group-ids $MAIL_SG_ID \
  --subnet-id $SUBNET_ID \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=irisx-mail-virginia},{Key=Environment,Value=production},{Key=Role,Value=mail-server}]' \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":30,"VolumeType":"gp3"}}]'
```

**Output:** Save the `InstanceId` (e.g., `i-0abc123def456`)

### Step 4: Allocate and Associate Elastic IP

```bash
INSTANCE_ID="i-0abc123def456"  # From previous step

# Allocate Elastic IP
ALLOCATION_OUTPUT=$(/opt/homebrew/bin/aws ec2 allocate-address \
  --region us-east-1 \
  --domain vpc)

ALLOCATION_ID=$(echo $ALLOCATION_OUTPUT | jq -r '.AllocationId')
MAIL_IP=$(echo $ALLOCATION_OUTPUT | jq -r '.PublicIp')

echo "Allocated IP: $MAIL_IP"
echo "Allocation ID: $ALLOCATION_ID"

# Wait for instance to be running
echo "Waiting for instance to be running..."
/opt/homebrew/bin/aws ec2 wait instance-running \
  --region us-east-1 \
  --instance-ids $INSTANCE_ID

# Associate Elastic IP with instance
/opt/homebrew/bin/aws ec2 associate-address \
  --region us-east-1 \
  --instance-id $INSTANCE_ID \
  --allocation-id $ALLOCATION_ID

echo "✓ Elastic IP $MAIL_IP associated with instance $INSTANCE_ID"
```

### Step 5: Update DNS A Record with Real IP

```bash
cat > /tmp/mail-va-a-record-update.json <<EOF
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "mail-va.tazzi.com",
      "Type": "A",
      "TTL": 300,
      "ResourceRecords": [{"Value": "$MAIL_IP"}]
    }
  }]
}
EOF

/opt/homebrew/bin/aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file:///tmp/mail-va-a-record-update.json

echo "✓ DNS A record updated: mail-va.tazzi.com -> $MAIL_IP"
```

### Step 6: Update SPF Record with Real IP

```bash
cat > /tmp/spf-record-update.json <<EOF
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "tazzi.com",
      "Type": "TXT",
      "TTL": 300,
      "ResourceRecords": [
        {"Value": "\"v=spf1 ip4:$MAIL_IP include:_spf.elasticemail.com ~all\""}
      ]
    }
  }]
}
EOF

/opt/homebrew/bin/aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file:///tmp/spf-record-update.json

echo "✓ SPF record updated with IP: $MAIL_IP"
```

### Step 7: Request Reverse DNS (PTR Record)

**Critical for email deliverability!**

1. Go to AWS Support Center: https://console.aws.amazon.com/support/home
2. Click "Create case"
3. Select "Service limit increase"
4. Fill in:
   - **Limit type:** EC2 Instances
   - **Region:** US East (N. Virginia)
   - **Primary Instance Type:** t3.small
   - **Use Case Description:**

   ```
   Request: Configure Reverse DNS (PTR record) for Elastic IP

   Elastic IP: [YOUR_MAIL_IP]
   PTR Record Value: mail-va.tazzi.com
   Instance ID: [YOUR_INSTANCE_ID]
   Region: us-east-1
   Use Case: Production SMTP mail server for tazzi.com

   This IP will be used exclusively for legitimate transactional and
   marketing email sending for our IRISX communications platform.
   We have configured SPF, DKIM, and DMARC records and will maintain
   proper email hygiene.
   ```

5. Submit case

**Processing Time:** Usually 1-2 business days

---

## Postfix Installation

### Step 1: Connect to Mail Server

Wait 2-3 minutes for DNS to propagate, then:

```bash
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@$MAIL_IP
```

### Step 2: Update System and Install Postfix

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Postfix and dependencies
sudo DEBIAN_FRONTEND=noninteractive apt install -y \
  postfix \
  postfix-pcre \
  opendkim \
  opendkim-tools \
  mailutils \
  certbot \
  dovecot-core \
  dovecot-imapd

# Set hostname
sudo hostnamectl set-hostname mail-va.tazzi.com
```

### Step 3: Configure Postfix

```bash
# Backup original config
sudo cp /etc/postfix/main.cf /etc/postfix/main.cf.orig

# Create new main.cf
sudo tee /etc/postfix/main.cf > /dev/null <<'EOF'
# Basic Settings
myhostname = mail-va.tazzi.com
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

# TLS Settings (will be configured after Let's Encrypt)
smtp_tls_security_level = may
smtp_tls_session_cache_database = btree:${data_directory}/smtp_scache
smtp_tls_loglevel = 1

smtpd_tls_security_level = may
smtpd_tls_session_cache_database = btree:${data_directory}/smtpd_scache
smtpd_tls_loglevel = 1
smtpd_tls_received_header = yes
smtpd_tls_auth_only = yes

# SASL Authentication
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
EOF
```

### Step 4: Configure Postfix Master

```bash
sudo tee -a /etc/postfix/master.cf > /dev/null <<'EOF'

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
EOF
```

### Step 5: Configure Dovecot for SASL

```bash
# Configure Dovecot auth
sudo tee /etc/dovecot/conf.d/10-master.conf > /dev/null <<'EOF'
service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0660
    user = postfix
    group = postfix
  }
}
EOF

# Allow plaintext auth over TLS
sudo tee /etc/dovecot/conf.d/10-auth.conf > /dev/null <<'EOF'
disable_plaintext_auth = no
auth_mechanisms = plain login
!include auth-system.conf.ext
EOF

# Restart Dovecot
sudo systemctl restart dovecot
sudo systemctl enable dovecot
```

### Step 6: Create SMTP User for IRISX

```bash
# Create dedicated mail user
sudo useradd -m -s /bin/bash irisx_mailer

# Set strong password
SMTP_PASSWORD=$(openssl rand -base64 32)
echo "irisx_mailer:$SMTP_PASSWORD" | sudo chpasswd

# Save password for later
echo "SMTP_PASSWORD=$SMTP_PASSWORD" > ~/irisx-smtp-creds.txt
chmod 600 ~/irisx-smtp-creds.txt

echo "✓ Created user: irisx_mailer"
echo "✓ Password saved to: ~/irisx-smtp-creds.txt"
echo ""
echo "IMPORTANT: Save this password - you'll need it for IRISX API configuration"
echo "Password: $SMTP_PASSWORD"
```

---

## DKIM Setup

### Step 1: Configure OpenDKIM

```bash
# Create directory structure
sudo mkdir -p /etc/opendkim/keys/tazzi.com
sudo chown -R opendkim:opendkim /etc/opendkim
sudo chmod 750 /etc/opendkim/keys

# Generate DKIM key
sudo opendkim-genkey -b 2048 -d tazzi.com -D /etc/opendkim/keys/tazzi.com -s mail -v

# Set permissions
sudo chown opendkim:opendkim /etc/opendkim/keys/tazzi.com/mail.private
sudo chmod 400 /etc/opendkim/keys/tazzi.com/mail.private
```

### Step 2: Configure OpenDKIM

```bash
sudo tee /etc/opendkim.conf > /dev/null <<'EOF'
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

# Tables
KeyTable                /etc/opendkim/key.table
SigningTable            refile:/etc/opendkim/signing.table
ExternalIgnoreList      /etc/opendkim/trusted.hosts
InternalHosts           /etc/opendkim/trusted.hosts

# Socket
Socket                  inet:8891@localhost

# Paths
PidFile                 /run/opendkim/opendkim.pid
EOF

# Key Table
sudo tee /etc/opendkim/key.table > /dev/null <<'EOF'
mail._domainkey.tazzi.com tazzi.com:mail:/etc/opendkim/keys/tazzi.com/mail.private
EOF

# Signing Table
sudo tee /etc/opendkim/signing.table > /dev/null <<'EOF'
*@tazzi.com mail._domainkey.tazzi.com
EOF

# Trusted Hosts
sudo tee /etc/opendkim/trusted.hosts > /dev/null <<'EOF'
127.0.0.1
localhost
mail-va.tazzi.com
EOF

# Add mail server IP
echo "$MAIL_IP" | sudo tee -a /etc/opendkim/trusted.hosts
```

### Step 3: Get DKIM Public Key

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

### Step 4: Add DKIM DNS Record

**On your local machine**, combine all quoted strings into one value:

```bash
# Copy the DKIM key from the server output above
# Remove line breaks and combine all parts after "p="

DKIM_KEY="v=DKIM1; h=sha256; k=rsa; p=YOUR_FULL_KEY_HERE"

cat > /tmp/dkim-record.json <<EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "mail._domainkey.tazzi.com",
      "Type": "TXT",
      "TTL": 300,
      "ResourceRecords": [
        {"Value": "\"$DKIM_KEY\""}
      ]
    }
  }]
}
EOF

/opt/homebrew/bin/aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file:///tmp/dkim-record.json
```

### Step 5: Start OpenDKIM

**Back on the mail server:**

```bash
sudo systemctl start opendkim
sudo systemctl enable opendkim
sudo systemctl status opendkim
```

---

## SSL/TLS Configuration

### Step 1: Obtain Let's Encrypt Certificate

```bash
# Stop Postfix temporarily
sudo systemctl stop postfix

# Obtain certificate
sudo certbot certonly --standalone \
  -d mail-va.tazzi.com \
  --preferred-challenges http \
  --agree-tos \
  --email rrodkey@me.com \
  --non-interactive

# Start Postfix
sudo systemctl start postfix
```

### Step 2: Update Postfix to Use SSL Certificates

```bash
# Add SSL certificate paths to main.cf
sudo tee -a /etc/postfix/main.cf > /dev/null <<'EOF'

# SSL/TLS Certificates
smtp_tls_cert_file = /etc/letsencrypt/live/mail-va.tazzi.com/fullchain.pem
smtp_tls_key_file = /etc/letsencrypt/live/mail-va.tazzi.com/privkey.pem
smtpd_tls_cert_file = /etc/letsencrypt/live/mail-va.tazzi.com/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/mail-va.tazzi.com/privkey.pem
EOF

# Reload Postfix
sudo systemctl reload postfix
```

### Step 3: Set Up Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Create renewal hook
sudo mkdir -p /etc/letsencrypt/renewal-hooks/post
sudo tee /etc/letsencrypt/renewal-hooks/post/reload-postfix.sh > /dev/null <<'EOF'
#!/bin/bash
systemctl reload postfix
EOF

sudo chmod +x /etc/letsencrypt/renewal-hooks/post/reload-postfix.sh
```

### Step 4: Verify TLS

```bash
# Test SMTP with STARTTLS
openssl s_client -starttls smtp -connect mail-va.tazzi.com:587 -crlf
```

Type `QUIT` to exit. You should see `Verify return code: 0 (ok)`.

---

## IRISX Integration

Now we integrate the mail server into IRISX as a provider.

### Step 1: Install nodemailer Dependency

**On your local machine:**

```bash
cd /Users/gamer/Documents/GitHub/IRISX/api
npm install nodemailer
```

### Step 2: Create custom-smtp.js Provider

```bash
cd /Users/gamer/Documents/GitHub/IRISX/api/src/services/email-providers
```

Check if the file already exists:

```bash
ls -la custom-smtp.js
```

**Good news:** The [custom-smtp.js](api/src/services/email-providers/custom-smtp.js) file already exists and is production-ready! It was created earlier in the project.

You can verify it by reading it, but it should already have the CustomSMTPProvider class that connects to your Postfix server using nodemailer.

### Step 3: Deploy to Production Server

```bash
# Deploy updated API with nodemailer dependency
cd /Users/gamer/Documents/GitHub/IRISX/api

# Upload the entire email-providers directory
scp -i ~/.ssh/irisx-prod-key.pem -r src/services/email-providers ubuntu@3.83.53.69:/home/ubuntu/irisx-backend/src/services/

# SSH to production and install nodemailer
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@3.83.53.69

# On the production server:
cd /home/ubuntu/irisx-backend
npm install nodemailer

# Restart API
CURRENT_PID=$(ps aux | grep "node /home/ubuntu/irisx-backend/src/index.js" | grep -v grep | awk '{print $2}')
sudo kill $CURRENT_PID
sleep 3
cd /home/ubuntu/irisx-backend && nohup node src/index.js > /tmp/api-console.log 2>&1 &
sleep 5

# Verify API is running
curl -s http://localhost:3000/health | jq -c '{status, db: .database.status}'

# Exit SSH
exit
```

### Step 4: Add Mail Server as Provider via Admin Portal

Now you'll add your Postfix mail server as a provider through the IRISX Admin Portal.

**On your local machine**, open browser to: https://docs.tazzi.com/dashboard/email-service

1. Click **"Add Provider"** button
2. Select **"Custom SMTP"** from the dropdown
3. Fill in the credentials:

```
Display Name: IRISX Mail Server Virginia
SMTP Host: mail-va.tazzi.com
SMTP Port: 587
SMTP Username: irisx_mailer
SMTP Password: [GET FROM MAIL SERVER - see below]
Use TLS/SSL: ✓ (checked)
From Email: noreply@tazzi.com
From Name: IRISX Platform
```

**To get the SMTP password:**

```bash
# On your local machine:
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@$MAIL_IP

# On the mail server:
cat ~/irisx-smtp-creds.txt

# Copy the password, then exit
exit
```

4. Click **"Test Connection"** (should show green checkmark)
5. Click **"Add Provider"**
6. **Enable** the provider by toggling it ON

**Expected Result:**
- Provider shows as "Active" in the providers list
- Health score starts at 100%
- You can now send emails via your own mail server!

### Step 5: Test Sending Email

**Test via Admin Portal:**

1. Go to Email Service page
2. Click "Test Email" next to IRISX Mail Server Virginia
3. Enter your email address
4. Click Send
5. Check your inbox (should arrive in <30 seconds)

**Test via API:**

```bash
# Get a tenant API key
# Assuming tenant_id=7 (voicetest@irisx.com)

TOKEN="YOUR_TENANT_TOKEN_HERE"

curl -X POST https://api.tazzi.com/v1/email/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com",
    "subject": "Test from IRISX Self-Hosted Mail",
    "html": "<h1>Success!</h1><p>This email was sent through our own Postfix mail server in Virginia.</p>",
    "text": "Success! This email was sent through our own Postfix mail server in Virginia.",
    "provider": "custom-smtp"
  }'
```

---

## Testing

### Email Deliverability Testing

#### 1. Test Authentication (SPF, DKIM, DMARC)

Send a test email to one of these services:

**Mail Tester** (Best for comprehensive testing):
```bash
# Send to a unique address they provide
curl -X POST https://api.tazzi.com/v1/email/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test-abc123@mail-tester.com",
    "subject": "IRISX Mail Server Test",
    "html": "<p>Testing deliverability</p>",
    "provider": "custom-smtp"
  }'
```

Then visit: https://www.mail-tester.com/test-abc123

**Target score:** 9/10 or higher

**Gmail Test:**
```bash
curl -X POST https://api.tazzi.com/v1/email/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-gmail-address@gmail.com",
    "subject": "Gmail Deliverability Test",
    "html": "<p>Testing Gmail delivery</p>",
    "provider": "custom-smtp"
  }'
```

Check the email headers in Gmail:
1. Open the email
2. Click three dots > "Show original"
3. Verify:
   - `SPF: PASS`
   - `DKIM: PASS`
   - `DMARC: PASS`

#### 2. Test TLS/SSL

**On the mail server:**

```bash
# Test STARTTLS on port 587
openssl s_client -starttls smtp -connect mail-va.tazzi.com:587 -crlf

# Should show:
# - SSL handshake successful
# - Certificate: CN=mail-va.tazzi.com
# - Verify return code: 0 (ok)
```

Type `QUIT` to exit.

#### 3. Test SMTP Authentication

```bash
# On the mail server:
telnet localhost 587

# Should see: 220 mail-va.tazzi.com ESMTP

# Type:
EHLO test
# Should see: 250-AUTH PLAIN LOGIN

QUIT
```

#### 4. Check Reverse DNS (PTR Record)

```bash
# On your local machine:
dig -x $MAIL_IP +short

# Should return: mail-va.tazzi.com.
```

If this doesn't work, your PTR record request may still be pending with AWS Support.

**Without PTR record:**
- Gmail: May accept but flag as suspicious
- Office 365: May reject
- Yahoo: May reject

**With PTR record:**
- All major providers: Should accept

#### 5. Verify DNS Records

```bash
# MX Record
dig MX tazzi.com +short
# Should return: 10 mail-va.tazzi.com.

# A Record
dig A mail-va.tazzi.com +short
# Should return: [YOUR_MAIL_IP]

# SPF Record
dig TXT tazzi.com +short
# Should return: "v=spf1 ip4:[YOUR_MAIL_IP] include:_spf.elasticemail.com ~all"

# DKIM Record
dig TXT mail._domainkey.tazzi.com +short
# Should return: "v=DKIM1; h=sha256; k=rsa; p=..."

# DMARC Record
dig TXT _dmarc.tazzi.com +short
# Should return: "v=DMARC1; p=quarantine; rua=mailto:rrodkey@me.com..."
```

All records should return valid values.

### Performance Testing

#### Test Send Rate

```bash
# On mail server - check queue is empty
mailq
# Should return: Mail queue is empty

# Send 10 test emails
for i in {1..10}; do
  curl -X POST https://api.tazzi.com/v1/email/send \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"to\": \"test$i@mailinator.com\",
      \"subject\": \"Batch Test $i\",
      \"html\": \"<p>Test email #$i</p>\",
      \"provider\": \"custom-smtp\"
    }" &
done

# Wait for all to complete
wait

# Check all were delivered
echo "Check mailinator.com inbox for test1 through test10"
```

All 10 emails should arrive within 1-2 minutes.

#### Check Postfix Logs

```bash
# On mail server:
sudo tail -50 /var/log/postfix.log

# Look for:
# - "status=sent" (successful deliveries)
# - No "status=deferred" or "status=bounced"
```

### Troubleshooting

#### Emails Not Sending

```bash
# Check Postfix is running
sudo systemctl status postfix

# Check OpenDKIM is running
sudo systemctl status opendkim

# Check Postfix logs
sudo tail -100 /var/log/postfix.log | grep -i error

# Check queue
mailq

# Test SMTP authentication manually
telnet localhost 587
```

#### Emails Going to Spam

**Common causes:**
1. **No PTR record** - Wait for AWS Support to configure
2. **DKIM not signing** - Check OpenDKIM logs: `sudo journalctl -u opendkim -n 50`
3. **SPF alignment** - Verify `mail-va.tazzi.com` resolves to `$MAIL_IP`
4. **Low sender reputation** - New IPs need to warm up (start with low volume)

**IP Warm-up Schedule:**
- Day 1-2: 50 emails/day
- Day 3-5: 100 emails/day
- Day 6-10: 500 emails/day
- Day 11-20: 1,000 emails/day
- Day 21+: Full volume

#### Certificate Renewal Issues

```bash
# Test certificate renewal
sudo certbot renew --dry-run

# Check certificate expiration
sudo certbot certificates

# Manual renewal
sudo systemctl stop postfix
sudo certbot renew
sudo systemctl start postfix
```

#### SMTP Authentication Failing

```bash
# Check Dovecot is running
sudo systemctl status dovecot

# Check auth socket exists
ls -la /var/spool/postfix/private/auth

# Should show: srw-rw---- 1 postfix postfix

# Restart both services
sudo systemctl restart dovecot
sudo systemctl restart postfix
```

---

## Quick Reference

### Important Commands

**On Mail Server (SSH):**

```bash
# Connect to mail server
ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@[MAIL_IP]

# Check services status
sudo systemctl status postfix
sudo systemctl status opendkim
sudo systemctl status dovecot

# View logs
sudo tail -f /var/log/postfix.log
sudo journalctl -u opendkim -f
sudo journalctl -u dovecot -f

# Check mail queue
mailq

# Process stuck queue
sudo postqueue -f

# Test SMTP
telnet localhost 587

# Test TLS
openssl s_client -starttls smtp -connect mail-va.tazzi.com:587

# View certificate
sudo certbot certificates

# Restart services
sudo systemctl restart postfix
sudo systemctl restart opendkim
sudo systemctl restart dovecot
```

**On Local Machine:**

```bash
# Test DNS records
dig MX tazzi.com +short
dig A mail-va.tazzi.com +short
dig TXT tazzi.com +short  # SPF
dig TXT mail._domainkey.tazzi.com +short  # DKIM
dig TXT _dmarc.tazzi.com +short  # DMARC

# Test reverse DNS
dig -x [MAIL_IP] +short

# Send test email via API
curl -X POST https://api.tazzi.com/v1/email/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com",
    "subject": "Test",
    "html": "<p>Test</p>",
    "provider": "custom-smtp"
  }'
```

### Important Files & Paths

**Mail Server:**
```
/etc/postfix/main.cf              # Main Postfix config
/etc/postfix/master.cf            # Postfix services config
/etc/opendkim/opendkim.conf       # OpenDKIM config
/etc/opendkim/keys/tazzi.com/     # DKIM keys
/var/log/postfix.log              # Postfix logs
/var/spool/postfix/               # Mail queue
/etc/letsencrypt/live/mail-va.tazzi.com/  # SSL certificates
~/irisx-smtp-creds.txt            # SMTP password (keep secure!)
```

**IRISX API:**
```
/Users/gamer/Documents/GitHub/IRISX/api/src/services/email-providers/custom-smtp.js
/Users/gamer/Documents/GitHub/IRISX/api/src/services/email-service.js
```

### Key Variables

Save these after setup:

```bash
# Virginia Mail Server
HOSTED_ZONE_ID="[YOUR_ROUTE53_ZONE_ID]"
VPC_ID="[YOUR_VPC_ID]"
MAIL_SG_ID="[YOUR_SECURITY_GROUP_ID]"
INSTANCE_ID="[YOUR_EC2_INSTANCE_ID]"
ALLOCATION_ID="[YOUR_EIP_ALLOCATION_ID]"
MAIL_IP="[YOUR_ELASTIC_IP]"
SMTP_PASSWORD="[FROM ~/irisx-smtp-creds.txt]"
```

### Provider Configuration

**Database Record (messaging_providers table):**
```json
{
  "provider_name": "custom-smtp",
  "provider_type": "email",
  "is_active": true,
  "config": {
    "display_name": "IRISX Mail Server Virginia",
    "smtp_host": "mail-va.tazzi.com",
    "smtp_port": 587,
    "smtp_secure": false,
    "from_email": "noreply@tazzi.com",
    "from_name": "IRISX Platform"
  },
  "credentials": "[ENCRYPTED]"
}
```

### Monitoring & Maintenance

**Daily:**
- Check `mailq` is empty
- Verify API health: `curl https://api.tazzi.com/health`

**Weekly:**
- Review Postfix logs for errors
- Check deliverability score at mail-tester.com
- Verify certificate expiration: `sudo certbot certificates`

**Monthly:**
- Review sender reputation (Gmail Postmaster Tools)
- Check disk space: `df -h`
- Update system: `sudo apt update && sudo apt upgrade`

**Quarterly:**
- Rotate SMTP password
- Review DNS records
- Test disaster recovery

---

## Next Steps (When Mirroring to Oregon)

When you're ready to mirror to Oregon:

1. Use the comprehensive multi-region guide: [MAIL_SERVER_SETUP_GUIDE.md](MAIL_SERVER_SETUP_GUIDE.md)
2. Set up identical infrastructure in us-west-2
3. Add load balancing between regions
4. Update DNS to use both mail servers:
   ```
   MX 10 mail-va.tazzi.com.
   MX 20 mail-or.tazzi.com.
   ```
5. Configure failover in IRISX provider abstraction layer

---

## Summary

You now have:

✅ **Postfix mail server** running in Virginia (us-east-1)
✅ **DKIM signing** configured with OpenDKIM
✅ **SSL/TLS encryption** via Let's Encrypt
✅ **DNS records** (MX, SPF, DMARC, DKIM)
✅ **IRISX integration** via CustomSMTPProvider
✅ **Full control** - no third-party email provider needed

**Cost:** ~$15-20/month (just the EC2 t3.small instance)

**Capacity:**
- t3.small can handle ~10,000 emails/day
- Upgrade to t3.medium for ~50,000 emails/day
- Add second region (Oregon) for redundancy

**Your clients can now:**
- Send emails via IRISX API
- Use your infrastructure (not Elastic Email or SendGrid)
- Benefit from your sender reputation
- Pay you instead of third-party providers

---

**Setup Complete!** 🎉

Total time: 4-6 hours
Monthly cost: ~$15-20
Email capacity: 10,000/day (scales to millions)

When you're ready to scale to Oregon, we'll mirror this entire setup using the multi-region guide.