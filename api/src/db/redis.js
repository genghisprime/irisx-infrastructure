import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Redis client configuration
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false
});

redis.on('connect', () => {
  console.log('✓ Connected to Redis cache');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// Helper functions
export const setCache = async (key, value, ttl = 3600) => {
  try {
    if (typeof value === 'object') {
      value = JSON.stringify(value);
    }
    if (ttl) {
      await redis.set(key, value, 'EX', ttl);
    } else {
      await redis.set(key, value);
    }
    return true;
  } catch (error) {
    console.error('Redis set error:', error);
    return false;
  }
};

export const getCache = async (key) => {
  try {
    const value = await redis.get(key);
    if (!value) return null;
    
    // Try to parse as JSON
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
};

export const deleteCache = async (key) => {
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.error('Redis delete error:', error);
    return false;
  }
};

export const closeRedis = async () => {
  await redis.quit();
  console.log('Redis connection closed');
};

export default redis;
