# CloudWatch Monitoring Setup Guide

**Date:** November 2, 2025
**Purpose:** Configure AWS CloudWatch alarms for IRISX production infrastructure
**Estimated Time:** 30 minutes

---

## Overview

This guide walks through setting up CloudWatch monitoring and alarms for the IRISX platform infrastructure to ensure proactive issue detection and system reliability.

---

## Prerequisites

- AWS CLI configured with appropriate credentials
- Access to AWS Console
- IRISX infrastructure deployed (EC2, RDS, ElastiCache)

---

## Infrastructure IDs

From `aws-infrastructure-ids.txt`:

```
API_INSTANCE_ID=i-032d6844d393bdef4
FREESWITCH_INSTANCE_ID=i-00b4b8ad65f1f32c1
RDS_INSTANCE_ID=irisx-prod-db (lookup required)
ELASTICACHE_CLUSTER_ID=irisx-prod-cache (lookup required)
```

---

## Section 1: EC2 Instance Alarms

### API Server (i-032d6844d393bdef4)

**1. High CPU Utilization (Critical)**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-API-High-CPU" \
  --alarm-description "Alert when API server CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=InstanceId,Value=i-032d6844d393bdef4 \
  --treat-missing-data notBreaching
```

**2. High Memory Utilization (Warning)**
*Requires CloudWatch agent installation*

```bash
# Install CloudWatch agent on EC2 instance
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i -E ./amazon-cloudwatch-agent.deb

# Create alarm for memory
aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-API-High-Memory" \
  --alarm-description "Alert when API server memory exceeds 85%" \
  --metric-name mem_used_percent \
  --namespace CWAgent \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 85 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=InstanceId,Value=i-032d6844d393bdef4
```

**3. High Disk Usage (Critical)**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-API-High-Disk" \
  --alarm-description "Alert when disk usage exceeds 80%" \
  --metric-name disk_used_percent \
  --namespace CWAgent \
  --statistic Average \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=InstanceId,Value=i-032d6844d393bdef4,Name=path,Value=/,Name=fstype,Value=ext4
```

**4. Status Check Failed (Critical)**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-API-Status-Check-Failed" \
  --alarm-description "Alert when EC2 status checks fail" \
  --metric-name StatusCheckFailed \
  --namespace AWS/EC2 \
  --statistic Maximum \
  --period 60 \
  --evaluation-periods 2 \
  --threshold 0 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=InstanceId,Value=i-032d6844d393bdef4
```

### FreeSWITCH Server (i-00b4b8ad65f1f32c1)

**1. High CPU Utilization**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-FreeSWITCH-High-CPU" \
  --alarm-description "Alert when FreeSWITCH CPU exceeds 75%" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 75 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=InstanceId,Value=i-00b4b8ad65f1f32c1
```

**2. Status Check Failed**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-FreeSWITCH-Status-Check-Failed" \
  --alarm-description "Alert when FreeSWITCH status checks fail" \
  --metric-name StatusCheckFailed \
  --namespace AWS/EC2 \
  --statistic Maximum \
  --period 60 \
  --evaluation-periods 2 \
  --threshold 0 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=InstanceId,Value=i-00b4b8ad65f1f32c1
```

---

## Section 2: RDS Database Alarms

**1. High CPU Utilization**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-RDS-High-CPU" \
  --alarm-description "Alert when RDS CPU exceeds 75%" \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 75 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=DBInstanceIdentifier,Value=irisx-prod-db
```

**2. Low Free Storage Space**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-RDS-Low-Storage" \
  --alarm-description "Alert when RDS free storage falls below 2GB" \
  --metric-name FreeStorageSpace \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 2147483648 \
  --comparison-operator LessThanThreshold \
  --dimensions Name=DBInstanceIdentifier,Value=irisx-prod-db
```

**3. High Database Connections**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-RDS-High-Connections" \
  --alarm-description "Alert when DB connections exceed 80% of max" \
  --metric-name DatabaseConnections \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=DBInstanceIdentifier,Value=irisx-prod-db
```

**4. Read/Write Latency**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-RDS-High-Read-Latency" \
  --alarm-description "Alert when read latency exceeds 100ms" \
  --metric-name ReadLatency \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 0.1 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=DBInstanceIdentifier,Value=irisx-prod-db
```

---

## Section 3: ElastiCache Redis Alarms

**1. High CPU Utilization**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-Redis-High-CPU" \
  --alarm-description "Alert when Redis CPU exceeds 75%" \
  --metric-name CPUUtilization \
  --namespace AWS/ElastiCache \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 75 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=CacheClusterId,Value=irisx-prod-cache
```

**2. High Memory Usage**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-Redis-High-Memory" \
  --alarm-description "Alert when Redis memory exceeds 80%" \
  --metric-name DatabaseMemoryUsagePercentage \
  --namespace AWS/ElastiCache \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=CacheClusterId,Value=irisx-prod-cache
```

**3. Evictions**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "IRISX-Redis-Evictions" \
  --alarm-description "Alert when Redis is evicting keys" \
  --metric-name Evictions \
  --namespace AWS/ElastiCache \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 0 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=CacheClusterId,Value=irisx-prod-cache
```

---

## Section 4: SNS Topic for Email Alerts

**1. Create SNS Topic**
```bash
aws sns create-topic --name IRISX-Production-Alerts
```

**2. Subscribe Email Address**
```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:IRISX-Production-Alerts \
  --protocol email \
  --notification-endpoint ops@yourcompany.com
```

**3. Add SNS Topic to All Alarms**

Update each alarm with the `--alarm-actions` parameter:

```bash
--alarm-actions arn:aws:sns:us-east-1:ACCOUNT_ID:IRISX-Production-Alerts
```

---

## Section 5: CloudWatch Dashboard

**Create Dashboard**

```bash
aws cloudwatch put-dashboard \
  --dashboard-name IRISX-Production \
  --dashboard-body file://dashboard-config.json
```

**dashboard-config.json:**
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/EC2", "CPUUtilization", {"stat": "Average", "label": "API CPU"}],
          ["...", {"stat": "Average", "label": "FreeSWITCH CPU"}]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "EC2 CPU Utilization",
        "yAxis": {
          "left": {
            "min": 0,
            "max": 100
          }
        }
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/RDS", "CPUUtilization", {"stat": "Average"}],
          [".", "DatabaseConnections", {"stat": "Average"}],
          [".", "FreeStorageSpace", {"stat": "Average"}]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "RDS Metrics"
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ElastiCache", "CPUUtilization", {"stat": "Average"}],
          [".", "DatabaseMemoryUsagePercentage", {"stat": "Average"}]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "Redis Metrics"
      }
    }
  ]
}
```

---

## Section 6: Verification

**Check Alarm Status:**
```bash
aws cloudwatch describe-alarms --alarm-names \
  IRISX-API-High-CPU \
  IRISX-API-High-Memory \
  IRISX-API-High-Disk \
  IRISX-RDS-High-CPU \
  IRISX-RDS-Low-Storage \
  IRISX-Redis-High-CPU \
  IRISX-Redis-High-Memory
```

**Test Alarm:**
```bash
aws cloudwatch set-alarm-state \
  --alarm-name IRISX-API-High-CPU \
  --state-value ALARM \
  --state-reason "Testing alarm notification"
```

---

## Monitoring Checklist

- [ ] EC2 API server CPU alarm created
- [ ] EC2 API server memory alarm created (requires agent)
- [ ] EC2 API server disk alarm created (requires agent)
- [ ] EC2 API server status check alarm created
- [ ] EC2 FreeSWITCH CPU alarm created
- [ ] EC2 FreeSWITCH status check alarm created
- [ ] RDS CPU alarm created
- [ ] RDS storage alarm created
- [ ] RDS connections alarm created
- [ ] RDS latency alarm created
- [ ] Redis CPU alarm created
- [ ] Redis memory alarm created
- [ ] Redis evictions alarm created
- [ ] SNS topic created for email alerts
- [ ] Email subscription confirmed
- [ ] All alarms configured with SNS actions
- [ ] CloudWatch dashboard created
- [ ] Alarms tested and verified

---

## Estimated Costs

- **CloudWatch Alarms:** $0.10/alarm/month × 13 alarms = **$1.30/month**
- **CloudWatch Dashboard:** $3.00/month for 1 dashboard = **$3.00/month**
- **SNS:** First 1,000 emails free, $2/100,000 thereafter = **~$0/month** (low volume)
- **CloudWatch Agent:** Included with EC2 = **$0/month**

**Total:** ~$4.30/month

---

## Next Steps

1. Install CloudWatch agent on both EC2 instances for memory/disk metrics
2. Create all alarms using the commands above
3. Set up SNS topic and email subscription
4. Create CloudWatch dashboard
5. Test alarms by triggering state changes
6. Document alarm response procedures in Operations Runbook

---

## Related Documentation

- [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) - Incident response procedures
- [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md) - Diagnostic steps
- [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) - Infrastructure overview
