/**
 * Initialize NATS JetStream Streams
 * Run this once to create the required streams for workers
 */

import { connect, StringCodec } from 'nats';

const NATS_URL = process.env.NATS_URL || 'localhost:4222';
const NATS_TOKEN = process.env.NATS_TOKEN || 'irisx-nats-prod-token-2025';

async function initStreams() {
  console.log('[NATS Init] Connecting to NATS server...');

  const nc = await connect({
    servers: NATS_URL,
    token: NATS_TOKEN
  });

  console.log('[NATS Init] ✅ Connected to NATS');

  const jsm = await nc.jetstreamManager();

  // Define streams - PRODUCTION SCALE
  // Total: 90GB fits within 100GB server limit
  // Supports 1000+ companies with 7-day retention
  const streams = [
    {
      name: 'SMS',
      subjects: ['sms.send', 'sms.status'],
      retention: 'limits',
      max_age: 7 * 24 * 60 * 60 * 1000000000, // 7 days in nanoseconds
      max_msgs: 10000000,  // 10M messages
      max_bytes: 32212254720, // 30GB - handles 60M SMS at ~500 bytes each
      storage: 'file',
      discard: 'old'
    },
    {
      name: 'EMAIL',
      subjects: ['email.send', 'email.status'],
      retention: 'limits',
      max_age: 7 * 24 * 60 * 60 * 1000000000,
      max_msgs: 10000000,  // 10M messages
      max_bytes: 42949672960, // 40GB - handles 8M emails at ~5KB each
      storage: 'file',
      discard: 'old'
    },
    {
      name: 'WEBHOOKS',
      subjects: ['webhooks.deliver', 'webhooks.retry'],
      retention: 'limits',
      max_age: 7 * 24 * 60 * 60 * 1000000000,
      max_msgs: 10000000,  // 10M messages
      max_bytes: 21474836480, // 20GB - handles 10M webhooks at ~2KB each
      storage: 'file',
      discard: 'old'
    }
  ];

  // Create streams
  for (const streamConfig of streams) {
    try {
      console.log(`[NATS Init] Creating stream: ${streamConfig.name}...`);

      // Try to get existing stream first
      try {
        const existing = await jsm.streams.info(streamConfig.name);
        console.log(`[NATS Init] ⚠️  Stream ${streamConfig.name} already exists, deleting...`);
        await jsm.streams.delete(streamConfig.name);
      } catch (err) {
        // Stream doesn't exist, that's fine
      }

      // Create stream
      await jsm.streams.add(streamConfig);
      console.log(`[NATS Init] ✅ Created stream: ${streamConfig.name}`);

      // Verify stream
      const info = await jsm.streams.info(streamConfig.name);
      console.log(`[NATS Init]    Subjects: ${info.config.subjects.join(', ')}`);
      console.log(`[NATS Init]    Storage: ${info.config.storage}, Retention: ${info.config.retention}`);

    } catch (error) {
      console.error(`[NATS Init] ❌ Failed to create stream ${streamConfig.name}:`, error.message);
      throw error;
    }
  }

  // List all streams
  console.log('\n[NATS Init] All streams:');
  const lister = await jsm.streams.list();
  for await (const stream of lister) {
    console.log(`  - ${stream.config.name} (${stream.state.messages} messages)`);
  }

  await nc.close();
  console.log('\n[NATS Init] ✅ Stream initialization complete!');
}

initStreams().catch(err => {
  console.error('[NATS Init] Fatal error:', err);
  process.exit(1);
});
