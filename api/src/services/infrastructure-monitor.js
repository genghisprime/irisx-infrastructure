/**
 * Infrastructure Monitoring Service
 * Cached background monitoring with async updates
 * Best practices: Cache expensive AWS API calls, return immediately from cache
 */

import { execSync } from 'child_process';
import redis from '../db/redis.js';

const CACHE_TTL = 60; // Cache for 60 seconds
const CACHE_KEY = 'infrastructure:health';

// Infrastructure Configuration
const INFRASTRUCTURE = {
  regions: {
    'us-east-1': {
      name: 'US East (Virginia)',
      primary: true,
      availabilityZones: {
        'us-east-1a': {
          apiServers: [
            { id: 'i-032d6844d393bdef4', ip: '3.83.53.69', privateIp: '10.0.1.240' }
          ],
          freeswitchServers: [
            { id: 'i-00b4b8ad65f1f32c1', ip: '54.160.220.243', privateIp: '10.0.1.213' }
          ],
          mailServers: [
            { id: 'i-066263b31a0fcf46d', ip: '54.85.183.55', privateIp: '172.26.4.126', hostname: 'mail-va.tazzi.com' }
          ]
        },
        'us-east-1b': {
          apiServers: [],
          freeswitchServers: [],
          mailServers: []
        }
      },
      loadBalancers: [
        {
          arn: 'arn:aws:elasticloadbalancing:us-east-1:895549500657:loadbalancer/app/irisx-api-alb/8fa6b807255ed913',
          dns: 'irisx-api-alb-1234567890.us-east-1.elb.amazonaws.com',
          type: 'application',
          service: 'API'
        }
      ]
    },
    'us-west-2': {
      name: 'US West (Oregon)',
      primary: false,
      availabilityZones: {
        'us-west-2a': { apiServers: [], freeswitchServers: [], mailServers: [] },
        'us-west-2b': { apiServers: [], freeswitchServers: [], mailServers: [] }
      },
      loadBalancers: []
    }
  },
  cloudwatch: {
    alarms: {
      'us-east-1': [
        { name: 'IRISX-API-High-CPU', metric: 'CPUUtilization', service: 'API' },
        { name: 'IRISX-API-Status-Check-Failed', metric: 'StatusCheckFailed', service: 'API' },
        { name: 'IRISX-RDS-High-CPU', metric: 'CPUUtilization', service: 'RDS' },
        { name: 'IRISX-RDS-Low-Storage', metric: 'FreeStorageSpace', service: 'RDS' },
        { name: 'IRISX-Redis-High-CPU', metric: 'CPUUtilization', service: 'ElastiCache' },
        { name: 'IRISX-Redis-High-Memory', metric: 'DatabaseMemoryUsagePercentage', service: 'ElastiCache' },
        { name: 'IRISX-Mail-High-CPU', metric: 'CPUUtilization', service: 'Mail Server' },
        { name: 'IRISX-Mail-Queue-Size', metric: 'MailQueueSize', service: 'Mail Server' },
        { name: 'IRISX-Mail-Disk-Usage', metric: 'DiskUsage', service: 'Mail Server' }
      ],
      'us-west-2': []
    }
  }
};

// Fast check functions with timeouts
function quickExec(command, timeoutMs = 2000) {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
    }).trim();
  } catch (error) {
    return null;
  }
}

function getCloudWatchAlarmState(alarmName, region = 'us-east-1') {
  const output = quickExec(
    `aws cloudwatch describe-alarms --region ${region} --alarm-names "${alarmName}" --query 'MetricAlarms[0].StateValue' --output text`
  );
  return output === 'OK' ? 'healthy' : output === 'ALARM' ? 'unhealthy' : 'unknown';
}

function getEC2InstanceState(instanceId, region = 'us-east-1') {
  const output = quickExec(
    `aws ec2 describe-instances --region ${region} --instance-ids ${instanceId} --query 'Reservations[0].Instances[0].State.Name' --output text`
  );
  return output === 'running' ? 'healthy' : output === 'stopped' ? 'stopped' : 'unknown';
}

function getLoadBalancerHealth(lbArn, region = 'us-east-1') {
  const output = quickExec(
    `aws elbv2 describe-load-balancers --region ${region} --load-balancer-arns "${lbArn}" --query 'LoadBalancers[0].State.Code' --output text`
  );
  return output === 'active' ? 'healthy' : 'unknown';
}

function getTargetGroupHealth(lbArn, region = 'us-east-1') {
  const tgArns = quickExec(
    `aws elbv2 describe-target-groups --region ${region} --load-balancer-arn "${lbArn}" --query 'TargetGroups[*].TargetGroupArn' --output text`
  );

  if (!tgArns) return { healthy: 0, unhealthy: 0, total: 0 };

  const tgArn = tgArns.split('\t')[0];
  const health = quickExec(
    `aws elbv2 describe-target-health --region ${region} --target-group-arn "${tgArn}" --query 'TargetHealthDescriptions[*].TargetHealth.State' --output text`
  );

  if (!health) return { healthy: 0, unhealthy: 0, total: 0 };

  const states = health.split(/\s+/).filter(s => s);
  return {
    healthy: states.filter(s => s === 'healthy').length,
    unhealthy: states.filter(s => s === 'unhealthy' || s === 'draining').length,
    total: states.length
  };
}

// Background monitoring function (runs async)
async function collectInfrastructureHealth() {
  const health = {
    overview: {
      totalRegions: 0,
      activeRegions: 0,
      totalInstances: 0,
      healthyInstances: 0
    },
    regions: {},
    lastUpdate: new Date().toISOString()
  };

  for (const [regionKey, regionConfig] of Object.entries(INFRASTRUCTURE.regions)) {
    health.overview.totalRegions++;

    const regionHealth = {
      name: regionConfig.name,
      primary: regionConfig.primary,
      status: 'healthy',
      availabilityZones: {},
      loadBalancers: [],
      cloudwatchAlarms: []
    };

    let regionHealthyInstances = 0;
    let regionTotalInstances = 0;

    // Check each availability zone
    for (const [azKey, azConfig] of Object.entries(regionConfig.availabilityZones)) {
      const azHealth = {
        name: azKey,
        apiServers: [],
        freeswitchServers: []
      };

      // Check API servers
      for (const server of azConfig.apiServers) {
        regionTotalInstances++;
        health.overview.totalInstances++;

        const state = getEC2InstanceState(server.id, regionKey);
        azHealth.apiServers.push({
          instanceId: server.id,
          ip: server.ip,
          privateIp: server.privateIp,
          status: state
        });

        if (state === 'healthy') {
          regionHealthyInstances++;
          health.overview.healthyInstances++;
        }
      }

      // Check FreeSWITCH servers (skip slow SSH check in background)
      for (const server of azConfig.freeswitchServers) {
        regionTotalInstances++;
        health.overview.totalInstances++;

        const state = getEC2InstanceState(server.id, regionKey);
        azHealth.freeswitchServers.push({
          instanceId: server.id,
          ip: server.ip,
          privateIp: server.privateIp,
          status: state,
          serviceStatus: state === 'healthy' ? 'active' : 'unknown'
        });

        if (state === 'healthy') {
          regionHealthyInstances++;
          health.overview.healthyInstances++;
        }
      }

      // Check Mail Servers
      azHealth.mailServers = [];
      for (const server of azConfig.mailServers || []) {
        regionTotalInstances++;
        health.overview.totalInstances++;

        const state = getEC2InstanceState(server.id, regionKey);
        azHealth.mailServers.push({
          instanceId: server.id,
          ip: server.ip,
          privateIp: server.privateIp,
          hostname: server.hostname,
          status: state,
          serviceStatus: state === 'healthy' ? 'active' : 'unknown'
        });

        if (state === 'healthy') {
          regionHealthyInstances++;
          health.overview.healthyInstances++;
        }
      }

      regionHealth.availabilityZones[azKey] = azHealth;
    }

    // Check load balancers
    for (const lb of regionConfig.loadBalancers) {
      const lbHealth = getLoadBalancerHealth(lb.arn, regionKey);
      const targets = getTargetGroupHealth(lb.arn, regionKey);

      regionHealth.loadBalancers.push({
        service: lb.service,
        dns: lb.dns,
        type: lb.type,
        status: lbHealth,
        targets: targets
      });
    }

    // Check CloudWatch alarms
    const alarms = INFRASTRUCTURE.cloudwatch.alarms[regionKey] || [];
    for (const alarm of alarms) {
      const alarmState = getCloudWatchAlarmState(alarm.name, regionKey);
      regionHealth.cloudwatchAlarms.push({
        name: alarm.name,
        service: alarm.service,
        metric: alarm.metric,
        status: alarmState
      });

      if (alarmState === 'unhealthy') {
        regionHealth.status = 'degraded';
      }
    }

    // Set region status
    if (regionTotalInstances > 0 && regionHealthyInstances === 0) {
      regionHealth.status = 'unhealthy';
    } else if (regionHealthyInstances < regionTotalInstances) {
      regionHealth.status = 'degraded';
    }

    if (regionHealthyInstances > 0) {
      health.overview.activeRegions++;
    }

    health.regions[regionKey] = regionHealth;
  }

  return health;
}

// Get cached health or return stale data while updating
export async function getInfrastructureHealth() {
  try {
    // Try to get from cache
    const cached = await redis.get(CACHE_KEY);

    if (cached) {
      // Return cached data immediately
      const data = JSON.parse(cached);

      // Check if cache is older than TTL
      const cacheAge = Date.now() - new Date(data.lastUpdate).getTime();
      if (cacheAge > CACHE_TTL * 1000) {
        // Refresh in background (don't await)
        refreshInfrastructureHealth().catch(err =>
          console.error('Background refresh failed:', err)
        );
      }

      return data;
    }

    // No cache, collect synchronously (first time only)
    const health = await collectInfrastructureHealth();

    // Cache it
    await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(health));

    return health;
  } catch (error) {
    console.error('Infrastructure health check failed:', error);

    // Return minimal health data on error
    return {
      overview: {
        totalRegions: 2,
        activeRegions: 0,
        totalInstances: 2,
        healthyInstances: 0
      },
      regions: {},
      lastUpdate: new Date().toISOString(),
      error: 'Failed to collect health data'
    };
  }
}

// Background refresh function
async function refreshInfrastructureHealth() {
  const health = await collectInfrastructureHealth();
  await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(health));
  return health;
}

// Start background monitoring every 30 seconds
setInterval(() => {
  refreshInfrastructureHealth().catch(err =>
    console.error('Scheduled infrastructure refresh failed:', err)
  );
}, 30000);

// Initial cache warming
refreshInfrastructureHealth().catch(err =>
  console.error('Initial infrastructure health check failed:', err)
);

export default {
  getInfrastructureHealth,
  refreshInfrastructureHealth
};
