/**
 * Mail Server Health Monitoring Service
 * Monitors the self-hosted mail server (mail-va.tazzi.com / 54.85.183.55)
 * Checks Postfix, OpenDKIM, Dovecot, queue size, disk space, and certificates
 */

import { execSync } from 'child_process';
import redis from '../db/redis.js';

const CACHE_TTL = 60; // Cache for 60 seconds
const CACHE_KEY = 'mail:server:health';

// Mail Server Configuration
const MAIL_SERVER = {
  host: '54.85.183.55',
  hostname: 'mail-va.tazzi.com',
  instanceId: 'i-066263b31a0fcf46d',
  region: 'us-east-1',
  services: ['postfix', 'opendkim', 'dovecot'],
  port: 587,
  sshKey: '~/.ssh/irisx-prod-key.pem'
};

/**
 * Execute SSH command on mail server with timeout
 */
function sshExec(command, timeoutMs = 3000) {
  try {
    const fullCommand = `ssh -i ${MAIL_SERVER.sshKey} -o ConnectTimeout=3 -o StrictHostKeyChecking=no ubuntu@${MAIL_SERVER.host} "${command}"`;

    const result = execSync(fullCommand, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();

    return result;
  } catch (error) {
    return null;
  }
}

/**
 * Execute AWS CLI command with timeout
 */
function awsExec(command, timeoutMs = 2000) {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
  } catch (error) {
    return null;
  }
}

/**
 * Check if a service is running on the mail server
 */
function checkServiceStatus(serviceName) {
  const result = sshExec(`sudo systemctl is-active ${serviceName}`);
  return result === 'active' ? 'healthy' : result === 'inactive' ? 'stopped' : 'unknown';
}

/**
 * Get Postfix mail queue size
 */
function getMailQueueSize() {
  const result = sshExec(`mailq | tail -1 | awk '{print $5}'`);

  if (!result || result === 'empty') {
    return 0;
  }

  // Parse "X Requests" or just number
  const match = result.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Get recent mail errors (last hour)
 */
function getRecentMailErrors() {
  const result = sshExec(`sudo grep -i "error\\|warning\\|reject" /var/log/mail.log | tail -10 | wc -l`);
  return result ? parseInt(result) : 0;
}

/**
 * Get disk space usage on mail server
 */
function getDiskSpace() {
  const result = sshExec(`df -h / | tail -1 | awk '{print $5}' | sed 's/%//'`);
  return result ? parseInt(result) : 0;
}

/**
 * Get SSL certificate expiration
 */
function getCertificateExpiry() {
  const result = sshExec(`echo | openssl s_client -connect ${MAIL_SERVER.hostname}:587 -starttls smtp 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2`);

  if (!result) return null;

  const expiryDate = new Date(result);
  const daysUntilExpiry = Math.floor((expiryDate - new Date()) / (1000 * 60 * 60 * 24));

  return {
    expiryDate: expiryDate.toISOString(),
    daysUntilExpiry,
    status: daysUntilExpiry < 7 ? 'critical' : daysUntilExpiry < 30 ? 'warning' : 'healthy'
  };
}

/**
 * Get EC2 instance status
 */
function getInstanceStatus() {
  const state = awsExec(
    `aws ec2 describe-instances --region ${MAIL_SERVER.region} --instance-ids ${MAIL_SERVER.instanceId} --query 'Reservations[0].Instances[0].State.Name' --output text`
  );

  return state === 'running' ? 'healthy' : state === 'stopped' ? 'stopped' : 'unknown';
}

/**
 * Get recent email delivery stats from database
 */
async function getEmailDeliveryStats(pool) {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_emails_24h,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'bounced') as bounced
      FROM email_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
        AND provider = 'custom-smtp'
    `).catch(() => ({ rows: [{ total_emails_24h: 0, sent: 0, failed: 0, bounced: 0 }] }));

    const stats = result.rows[0];
    const total = parseInt(stats.total_emails_24h) || 0;
    const sent = parseInt(stats.sent) || 0;
    const failed = parseInt(stats.failed) || 0;
    const bounced = parseInt(stats.bounced) || 0;

    const deliveryRate = total > 0 ? Math.round((sent / total) * 100) : 100;
    const bounceRate = total > 0 ? ((bounced / total) * 100).toFixed(2) : '0.00';

    return {
      total24h: total,
      sent,
      failed,
      bounced,
      deliveryRate: `${deliveryRate}%`,
      bounceRate: `${bounceRate}%`,
      status: deliveryRate >= 95 ? 'healthy' : deliveryRate >= 85 ? 'degraded' : 'unhealthy'
    };
  } catch (error) {
    return {
      total24h: 0,
      sent: 0,
      failed: 0,
      bounced: 0,
      deliveryRate: '100%',
      bounceRate: '0.00%',
      status: 'unknown'
    };
  }
}

/**
 * Collect complete mail server health
 */
export async function collectMailServerHealth(pool = null) {
  const health = {
    server: {
      host: MAIL_SERVER.host,
      hostname: MAIL_SERVER.hostname,
      instanceId: MAIL_SERVER.instanceId,
      region: MAIL_SERVER.region
    },
    status: 'healthy',
    instance: {},
    services: {},
    queue: {},
    resources: {},
    certificate: {},
    delivery: {},
    lastUpdate: new Date().toISOString()
  };

  // Check EC2 instance status
  const instanceStatus = getInstanceStatus();
  health.instance = {
    status: instanceStatus,
    running: instanceStatus === 'healthy'
  };

  if (instanceStatus !== 'healthy') {
    health.status = 'unhealthy';
    return health; // Don't check services if instance is down
  }

  // Check services (Postfix, OpenDKIM, Dovecot)
  for (const serviceName of MAIL_SERVER.services) {
    const status = checkServiceStatus(serviceName);
    health.services[serviceName] = {
      status,
      running: status === 'healthy'
    };

    if (status !== 'healthy') {
      health.status = 'degraded';
    }
  }

  // Check mail queue
  const queueSize = getMailQueueSize();
  health.queue = {
    size: queueSize,
    status: queueSize < 100 ? 'healthy' : queueSize < 500 ? 'warning' : 'critical'
  };

  if (queueSize >= 500) {
    health.status = 'degraded';
  }

  // Check recent errors
  const errorCount = getRecentMailErrors();
  health.queue.recentErrors = errorCount;

  // Check disk space
  const diskUsage = getDiskSpace();
  health.resources = {
    diskUsage: `${diskUsage}%`,
    diskUsagePercent: diskUsage,
    status: diskUsage < 80 ? 'healthy' : diskUsage < 90 ? 'warning' : 'critical'
  };

  if (diskUsage >= 90) {
    health.status = 'degraded';
  }

  // Check certificate expiry
  const certificate = getCertificateExpiry();
  health.certificate = certificate || {
    status: 'unknown',
    daysUntilExpiry: null
  };

  if (certificate && certificate.status === 'critical') {
    health.status = 'degraded';
  }

  // Get email delivery stats (if pool provided)
  if (pool) {
    health.delivery = await getEmailDeliveryStats(pool);

    if (health.delivery.status === 'unhealthy') {
      health.status = 'unhealthy';
    } else if (health.delivery.status === 'degraded') {
      health.status = 'degraded';
    }
  }

  return health;
}

/**
 * Get cached mail server health or refresh if stale
 */
export async function getMailServerHealth(pool = null) {
  try {
    // Try to get from cache
    const cached = await redis.get(CACHE_KEY);

    if (cached) {
      const data = JSON.parse(cached);

      // Check if cache is older than TTL
      const cacheAge = Date.now() - new Date(data.lastUpdate).getTime();
      if (cacheAge > CACHE_TTL * 1000) {
        // Refresh in background
        refreshMailServerHealth(pool).catch(err =>
          console.error('Background mail server refresh failed:', err)
        );
      }

      return data;
    }

    // No cache, collect synchronously
    const health = await collectMailServerHealth(pool);

    // Cache it
    await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(health));

    return health;
  } catch (error) {
    console.error('Mail server health check failed:', error);

    // Return minimal health data on error
    return {
      server: {
        host: MAIL_SERVER.host,
        hostname: MAIL_SERVER.hostname,
        instanceId: MAIL_SERVER.instanceId
      },
      status: 'unknown',
      instance: { status: 'unknown', running: false },
      services: {},
      queue: { size: 0, status: 'unknown' },
      resources: { diskUsage: '0%', status: 'unknown' },
      certificate: { status: 'unknown' },
      delivery: { status: 'unknown' },
      lastUpdate: new Date().toISOString(),
      error: 'Failed to collect health data'
    };
  }
}

/**
 * Background refresh function
 */
async function refreshMailServerHealth(pool = null) {
  const health = await collectMailServerHealth(pool);
  await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(health));
  return health;
}

// Start background monitoring every 30 seconds
setInterval(() => {
  refreshMailServerHealth().catch(err =>
    console.error('Scheduled mail server refresh failed:', err)
  );
}, 30000);

// Initial cache warming
refreshMailServerHealth().catch(err =>
  console.error('Initial mail server health check failed:', err)
);

export default {
  getMailServerHealth,
  refreshMailServerHealth,
  collectMailServerHealth
};
