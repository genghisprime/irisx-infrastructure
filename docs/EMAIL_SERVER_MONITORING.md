# Email Server Monitoring Integration

## Overview

The IRISX platform now includes comprehensive monitoring for the self-hosted Postfix mail server (mail-va.tazzi.com). This document describes the monitoring architecture, health checks, alerting, and integration with the System Health dashboard.

## Mail Server Infrastructure

### Server Details
- **Hostname**: mail-va.tazzi.com
- **Public IP**: 54.85.183.55
- **Private IP**: 172.26.4.126
- **Instance ID**: i-066263b31a0fcf46d
- **Region**: us-east-1 (US East - Virginia)
- **Availability Zone**: us-east-1a

### Services Monitored
1. **Postfix** - SMTP mail transfer agent
2. **OpenDKIM** - DKIM signing service
3. **Dovecot** - SASL authentication

### Configuration
- SMTP Port: 587 (STARTTLS)
- Authentication: DKIM, SPF, DMARC
- SSH Access: ~/.ssh/irisx-prod-key.pem

## Monitoring Architecture

### Components

#### 1. Mail Server Monitor Service
**File**: [api/src/services/mail-server-monitor.js](api/src/services/mail-server-monitor.js)

This service performs comprehensive health checks on the mail server using SSH-based monitoring:

**Health Checks**:
- **EC2 Instance Status** - Verifies instance is running via AWS CLI
- **Service Status** - Checks if Postfix, OpenDKIM, Dovecot are active
- **Mail Queue Size** - Monitors Postfix mail queue via `mailq`
- **Recent Errors** - Counts errors in /var/log/mail.log
- **Disk Usage** - Checks root filesystem usage
- **SSL Certificate** - Monitors certificate expiration
- **Email Delivery Stats** - Queries database for 24h delivery metrics

**Caching Strategy**:
- 60-second Redis cache (key: `mail:server:health`)
- Background refresh when cache is stale
- Automatic refresh every 30 seconds
- 2-3 second SSH command timeouts to prevent blocking

**Health Status Logic**:
- `healthy` - All services running, queue < 100, disk < 80%, delivery rate ≥ 95%
- `degraded` - Some services down, queue 100-500, disk 80-90%, delivery rate 85-95%
- `unhealthy` - Instance down, queue > 500, disk > 90%, delivery rate < 85%
- `unknown` - Unable to collect health data

#### 2. System Status API Integration
**File**: [api/src/routes/system-status.js:98-131](api/src/routes/system-status.js#L98-L131)

The `/admin/system/health` endpoint now includes mail server health:

```javascript
{
  "components": {
    "mailServer": {
      "status": "healthy",
      "server": "mail-va.tazzi.com",
      "instance": "healthy",
      "services": {
        "postfix": "healthy",
        "opendkim": "healthy"
      },
      "queue": 0,
      "delivery": "98.5%",
      "certificate": "45d"
    }
  }
}
```

The overall system health status is affected by mail server health:
- Mail server `unhealthy` → System status `unhealthy`
- Mail server `degraded` → System status `degraded`

#### 3. Infrastructure Monitor Integration
**File**: [api/src/services/infrastructure-monitor.js:28-30](api/src/services/infrastructure-monitor.js#L28-L30)

The infrastructure monitor now includes mail servers in the us-east-1a availability zone configuration and checks mail server EC2 instance status during infrastructure health collection.

**CloudWatch Alarms**:
- `IRISX-Mail-High-CPU` - CPU utilization > 80%
- `IRISX-Mail-Queue-Size` - Mail queue size tracking
- `IRISX-Mail-Disk-Usage` - Disk usage > 90%

#### 4. System Health Dashboard UI
**File**: [irisx-admin-portal/src/views/admin/dashboard/SystemHealth.vue:313-349](irisx-admin-portal/src/views/admin/dashboard/SystemHealth.vue#L313-L349)

The Vue dashboard now displays mail server cards alongside API and FreeSWITCH servers:

**Displayed Information**:
- Server type indicator (MAIL)
- Health status badge
- Instance ID
- Hostname (mail-va.tazzi.com)
- Public IP
- Service status (active/unknown)

## Health Check Details

### SSH-Based Monitoring

All service checks use SSH with timeouts to prevent blocking:

```javascript
ssh -i ~/.ssh/irisx-prod-key.pem -o ConnectTimeout=3 ubuntu@54.85.183.55 "command"
```

**Service Status Check**:
```bash
sudo systemctl is-active postfix  # Returns: active, inactive, or error
```

**Mail Queue Size**:
```bash
mailq | tail -1 | awk '{print $5}'  # Returns: "X Requests" or "empty"
```

**Disk Usage**:
```bash
df -h / | tail -1 | awk '{print $5}' | sed 's/%//'  # Returns: percentage
```

**Certificate Expiration**:
```bash
echo | openssl s_client -connect mail-va.tazzi.com:587 -starttls smtp 2>/dev/null | \
  openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2
```

**Recent Errors**:
```bash
sudo grep -i "error\|warning\|reject" /var/log/mail.log | tail -10 | wc -l
```

### Database Queries

The monitor queries email delivery statistics from the `email_logs` table:

```sql
SELECT
  COUNT(*) as total_emails_24h,
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'bounced') as bounced
FROM email_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND provider = 'custom-smtp'
```

**Metrics Calculated**:
- Delivery Rate: (sent / total) * 100
- Bounce Rate: (bounced / total) * 100

## CloudWatch Alarms

### Created Alarms

1. **IRISX-Mail-High-CPU**
   - **Metric**: CPUUtilization
   - **Namespace**: AWS/EC2
   - **Threshold**: > 80%
   - **Evaluation**: 2 periods of 5 minutes
   - **Action**: Sends to SNS topic `IRISX-Alerts`

2. **IRISX-Mail-Disk-Usage**
   - **Metric**: disk_used_percent
   - **Namespace**: CWAgent
   - **Threshold**: > 90%
   - **Evaluation**: 2 periods of 5 minutes
   - **Action**: Sends to SNS topic `IRISX-Alerts`

### Viewing Alarms

```bash
aws cloudwatch describe-alarms \
  --alarm-names IRISX-Mail-High-CPU IRISX-Mail-Disk-Usage \
  --region us-east-1
```

### Alarm States
- `OK` - Metric is below threshold
- `ALARM` - Metric exceeded threshold
- `INSUFFICIENT_DATA` - Not enough data to evaluate

## API Endpoints

### Get Mail Server Health

**Endpoint**: `GET /admin/system/health`

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-12T18:30:00.000Z",
  "components": {
    "api": { ... },
    "database": { ... },
    "redis": { ... },
    "mailServer": {
      "status": "healthy",
      "server": "mail-va.tazzi.com",
      "instance": "healthy",
      "services": {
        "postfix": "healthy",
        "opendkim": "healthy"
      },
      "queue": 0,
      "delivery": "98.5%",
      "certificate": "45d"
    }
  }
}
```

### Health Status Codes

| Status | Description | Action Required |
|--------|-------------|-----------------|
| `healthy` | All systems operational | None |
| `degraded` | Some issues detected | Monitor closely |
| `unhealthy` | Critical issues | Immediate action required |
| `unknown` | Unable to determine status | Check monitoring service |

## Dashboard Access

### System Health Page

Navigate to: **Admin Portal > System Health**

The System Health dashboard displays:
- Real-time infrastructure status
- Regional breakdown (us-east-1, us-west-2)
- Availability zone view
- Server cards for API, FreeSWITCH, and Mail servers
- Load balancer status
- CloudWatch alarm states

### Mail Server Card

The mail server card shows:
- **Server Type**: MAIL badge
- **Status**: Colored badge (green/yellow/red)
- **Instance ID**: i-066263b31a0fcf46d
- **Hostname**: mail-va.tazzi.com
- **Public IP**: 54.85.183.55
- **Service Status**: Active/Unknown

## Monitoring Best Practices

### Health Check Frequency
- Cache TTL: 60 seconds
- Background refresh: 30 seconds
- On-demand checks: Return cached data immediately

### Performance Considerations
- SSH timeouts prevent blocking (2-3 seconds)
- Redis caching reduces load on mail server
- Background refresh updates cache without blocking requests
- Suppressed stderr output to avoid log noise

### Error Handling
- Graceful degradation on SSH failures
- Returns minimal health data on errors
- Logs errors without crashing service
- Cache serves stale data during outages

## Troubleshooting

### Mail Server Not Showing in Dashboard

1. Check if mail server monitor service is running:
   ```bash
   ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.85.183.55 "sudo systemctl status postfix"
   ```

2. Check Redis cache:
   ```bash
   redis-cli GET mail:server:health
   ```

3. Check API logs:
   ```bash
   tail -f /tmp/api-console.log | grep -i "mail"
   ```

### Services Showing as Unknown

1. Verify SSH key permissions:
   ```bash
   chmod 600 ~/.ssh/irisx-prod-key.pem
   ```

2. Test SSH connectivity:
   ```bash
   ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.85.183.55 "echo 'Connected'"
   ```

3. Check security group rules allow SSH from API server

### High Mail Queue Size

1. Check mail server logs:
   ```bash
   ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.85.183.55 \
     "sudo tail -100 /var/log/mail.log"
   ```

2. Check queue status:
   ```bash
   ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.85.183.55 "mailq"
   ```

3. Manually flush queue:
   ```bash
   ssh -i ~/.ssh/irisx-prod-key.pem ubuntu@54.85.183.55 \
     "sudo postqueue -f"
   ```

### Certificate Expiration Warning

1. Check current certificate:
   ```bash
   echo | openssl s_client -connect mail-va.tazzi.com:587 -starttls smtp 2>/dev/null | \
     openssl x509 -noout -dates
   ```

2. Renew certificate before expiration (30-day warning)
3. Update CloudWatch alarm thresholds if needed

## Testing

### Manual Health Check

Test the mail server health endpoint:

```bash
TOKEN="your-admin-jwt-token"
curl -s http://localhost:3000/admin/system/health \
  -H "Authorization: Bearer $TOKEN" | \
  jq '.components.mailServer'
```

### Test Mail Server Script

Run the test script:

```bash
node scripts/test-mail-server.js
```

This script:
1. Fetches custom-smtp provider from database
2. Decrypts credentials
3. Creates nodemailer transport
4. Verifies SMTP connection
5. Sends test email
6. Reports success/failure

### Verify Monitoring

1. Check that health data is cached:
   ```bash
   redis-cli GET mail:server:health | jq .
   ```

2. Verify CloudWatch metrics:
   ```bash
   aws cloudwatch get-metric-statistics \
     --namespace AWS/EC2 \
     --metric-name CPUUtilization \
     --dimensions Name=InstanceId,Value=i-066263b31a0fcf46d \
     --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
     --period 300 \
     --statistics Average \
     --region us-east-1
   ```

3. Check alarm states:
   ```bash
   aws cloudwatch describe-alarms \
     --alarm-name-prefix IRISX-Mail \
     --region us-east-1
   ```

## Maintenance

### Updating Configuration

To update mail server configuration, modify:

**api/src/services/mail-server-monitor.js**:
```javascript
const MAIL_SERVER = {
  host: '54.85.183.55',
  hostname: 'mail-va.tazzi.com',
  instanceId: 'i-066263b31a0fcf46d',
  region: 'us-east-1',
  services: ['postfix', 'opendkim', 'dovecot'],
  port: 587,
  sshKey: '~/.ssh/irisx-prod-key.pem'
};
```

**api/src/services/infrastructure-monitor.js**:
```javascript
mailServers: [
  { id: 'i-066263b31a0fcf46d', ip: '54.85.183.55',
    privateIp: '172.26.4.126', hostname: 'mail-va.tazzi.com' }
]
```

After updating, restart the API service.

### Cache Management

Clear mail server health cache:
```bash
redis-cli DEL mail:server:health
```

Set custom cache TTL:
```javascript
// In mail-server-monitor.js
const CACHE_TTL = 120; // 120 seconds instead of 60
```

### Adding New Health Checks

To add new health checks, update `collectMailServerHealth()` in mail-server-monitor.js:

```javascript
// Example: Check mail relay status
function getRelayStatus() {
  const result = sshExec(`sudo postconf -h relayhost`);
  return result ? result : 'none';
}

// Add to health object
health.relay = {
  host: getRelayStatus(),
  status: 'configured'
};
```

## Security Considerations

### SSH Key Management
- Store SSH key securely (~/.ssh/irisx-prod-key.pem)
- Set correct permissions (chmod 600)
- Never commit SSH keys to version control
- Rotate keys periodically

### Access Control
- Restrict SSH access to API server IP only
- Use security group rules to limit access
- Require JWT authentication for health endpoint
- Monitor failed SSH attempts

### Sensitive Data
- Mail server credentials are encrypted in database
- Use environment variables for encryption keys
- Audit access to mail server monitoring data
- Log all administrative actions

## Future Enhancements

### Planned Improvements
1. **Real-time Alerts** - WebSocket notifications for critical events
2. **Historical Metrics** - Store and visualize mail server metrics over time
3. **Predictive Monitoring** - Machine learning for anomaly detection
4. **Multi-Region Support** - Monitor mail servers in multiple regions
5. **Enhanced Dashboards** - Detailed mail server performance graphs
6. **Automated Remediation** - Auto-restart failed services
7. **Email Reputation Tracking** - Monitor sender reputation scores
8. **Deliverability Metrics** - Track open rates, click rates, and bounces

### Integration Opportunities
- Integrate with PagerDuty for on-call alerts
- Connect to Slack for team notifications
- Export metrics to Grafana dashboards
- Sync with incident management systems

## References

- [Mail Server Setup Guide](./MAIL_SERVER_SETUP.md)
- [Email Provider Configuration](./EMAIL_PROVIDERS.md)
- [System Health Dashboard](./SYSTEM_HEALTH.md)
- [CloudWatch Monitoring](./CLOUDWATCH_SETUP.md)
- [Infrastructure Overview](./INFRASTRUCTURE.md)

## Support

For issues related to email server monitoring:
1. Check this documentation first
2. Review API logs: `tail -f /tmp/api-console.log`
3. Check mail server logs: `sudo tail -f /var/log/mail.log`
4. Verify CloudWatch alarms are configured correctly
5. Contact DevOps team for infrastructure issues

---

**Last Updated**: January 12, 2025
**Version**: 1.0.0
**Maintained By**: IRISX DevOps Team
