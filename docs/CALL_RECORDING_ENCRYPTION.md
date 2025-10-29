# Call Recording Encryption Implementation
## AES-256-GCM + AWS KMS (Week 32 - Security & Compliance)

---

## 🎯 Overview

Implement end-to-end encryption for all call recordings to meet SOC 2, HIPAA, and GDPR compliance requirements.

**Encryption Standard:** AES-256-GCM (Galois/Counter Mode)
**Key Management:** AWS KMS (Key Management Service)
**Scope:** All recordings encrypted before S3 upload

---

## 📋 Architecture

```
┌──────────────┐
│ FreeSWITCH   │
│ (Records WAV)│
└──────┬───────┘
       │ Raw audio file
       ▼
┌──────────────────┐
│ Recording Worker │
│ 1. Read file     │
│ 2. Generate DEK  │ ← Data Encryption Key (per recording)
│ 3. Encrypt AES   │
│ 4. Encrypt DEK   │ ← AWS KMS (per tenant)
│ 5. Upload S3     │
└──────┬───────────┘
       │
       ▼
┌────────────────────┐
│ AWS S3             │
│ - Encrypted file   │
│ - Encrypted DEK    │
│ - Metadata         │
└────────────────────┘
```

**Encryption Flow:**
1. FreeSWITCH records call → WAV file
2. Worker generates random DEK (Data Encryption Key)
3. Worker encrypts audio with DEK using AES-256-GCM
4. Worker encrypts DEK with AWS KMS (tenant-specific CMK)
5. Worker uploads encrypted file + encrypted DEK to S3
6. Database stores S3 path + encrypted DEK

**Decryption Flow:**
1. User requests recording playback
2. API retrieves encrypted DEK from database
3. API decrypts DEK using AWS KMS
4. API generates presigned S3 URL with decryption key
5. Browser streams and decrypts audio on-the-fly

---

## 1️⃣ AWS KMS Setup

### **A. Create Customer Master Key (CMK) per Tenant**

```bash
# Create KMS key for Tenant 1
aws kms create-key \
  --description "IRIS Recording Encryption - Tenant 1" \
  --key-usage ENCRYPT_DECRYPT \
  --region us-east-1 \
  --tags TagKey=tenant_id,TagValue=1 TagKey=purpose,TagValue=recording_encryption

# Output: Key ID (e.g., 1234abcd-12ab-34cd-56ef-1234567890ab)

# Create alias for easy reference
aws kms create-alias \
  --alias-name alias/irisx-tenant-1-recordings \
  --target-key-id 1234abcd-12ab-34cd-56ef-1234567890ab

# Grant API server permission to use key
aws kms create-grant \
  --key-id 1234abcd-12ab-34cd-56ef-1234567890ab \
  --grantee-principal arn:aws:iam::123456789012:role/irisx-api-server \
  --operations Encrypt Decrypt GenerateDataKey
```

### **B. Store KMS Key ID in Database**

```sql
-- Add KMS key column to tenants table
ALTER TABLE tenants
ADD COLUMN kms_key_id VARCHAR(255),
ADD COLUMN kms_key_alias VARCHAR(255);

-- Update tenant with KMS key
UPDATE tenants
SET
  kms_key_id = '1234abcd-12ab-34cd-56ef-1234567890ab',
  kms_key_alias = 'alias/irisx-tenant-1-recordings'
WHERE id = 1;
```

---

## 2️⃣ Database Schema Updates

### **Migration: Add Encryption Fields**

```sql
-- database/migrations/023_add_recording_encryption.sql

ALTER TABLE call_recordings
ADD COLUMN encrypted BOOLEAN DEFAULT false,
ADD COLUMN encryption_algorithm VARCHAR(50) DEFAULT 'AES-256-GCM',
ADD COLUMN encrypted_dek TEXT, -- Encrypted Data Encryption Key
ADD COLUMN encryption_iv VARCHAR(100), -- Initialization Vector
ADD COLUMN encryption_auth_tag VARCHAR(100), -- Authentication Tag (GCM)
ADD COLUMN kms_key_id VARCHAR(255), -- AWS KMS key used
ADD COLUMN encryption_metadata JSONB; -- Additional metadata

-- Index for searching encrypted recordings
CREATE INDEX idx_call_recordings_encrypted ON call_recordings(encrypted);
CREATE INDEX idx_call_recordings_kms_key ON call_recordings(kms_key_id);

-- Log all encryption/decryption operations
CREATE TABLE IF NOT EXISTS recording_access_logs (
  id BIGSERIAL PRIMARY KEY,
  recording_id BIGINT REFERENCES call_recordings(id) ON DELETE CASCADE,
  tenant_id BIGINT REFERENCES tenants(id),
  user_id BIGINT REFERENCES users(id),
  action VARCHAR(50) NOT NULL, -- 'encrypt', 'decrypt', 'download', 'stream'
  ip_address INET,
  user_agent TEXT,
  decryption_duration_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recording_access_tenant ON recording_access_logs(tenant_id, accessed_at);
CREATE INDEX idx_recording_access_user ON recording_access_logs(user_id, accessed_at);
```

---

## 3️⃣ Encryption Service

### **Create `src/services/recordingEncryption.js`**

```javascript
import crypto from 'crypto';
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { query } from '../db/connection.js';
import fs from 'fs';
import stream from 'stream';
import { promisify } from 'util';

const pipeline = promisify(stream.pipeline);

const kmsClient = new KMSClient({ region: 'us-east-1' });
const s3Client = new S3Client({ region: 'us-east-1' });

class RecordingEncryptionService {
  /**
   * Encrypt recording file and upload to S3
   */
  async encryptAndUpload(filePath, recording) {
    const { id: recordingId, tenant_id, call_id } = recording;

    try {
      console.log(`[Encryption] Starting encryption for recording ${recordingId}`);

      // 1. Get tenant's KMS key
      const tenantResult = await query(
        'SELECT kms_key_id, kms_key_alias FROM tenants WHERE id = $1',
        [tenant_id]
      );

      if (!tenantResult.rows[0]?.kms_key_id) {
        throw new Error(`Tenant ${tenant_id} has no KMS key configured`);
      }

      const kmsKeyId = tenantResult.rows[0].kms_key_id;

      // 2. Generate Data Encryption Key (DEK) using KMS
      const dataKeyCommand = new GenerateDataKeyCommand({
        KeyId: kmsKeyId,
        KeySpec: 'AES_256', // 256-bit key
      });

      const dataKeyResponse = await kmsClient.send(dataKeyCommand);
      const plaintextDEK = Buffer.from(dataKeyResponse.Plaintext); // Plaintext DEK (32 bytes)
      const encryptedDEK = Buffer.from(dataKeyResponse.CiphertextBlob).toString('base64'); // Encrypted DEK

      // 3. Generate random IV (Initialization Vector)
      const iv = crypto.randomBytes(16); // 128-bit IV for AES-GCM

      // 4. Encrypt file with AES-256-GCM
      const cipher = crypto.createCipheriv('aes-256-gcm', plaintextDEK, iv);

      const inputStream = fs.createReadStream(filePath);
      const encryptedChunks = [];

      for await (const chunk of inputStream) {
        encryptedChunks.push(cipher.update(chunk));
      }
      encryptedChunks.push(cipher.final());

      const encryptedData = Buffer.concat(encryptedChunks);
      const authTag = cipher.getAuthTag(); // GCM authentication tag

      // 5. Upload encrypted file to S3
      const s3Key = `recordings/${tenant_id}/${call_id}/${recordingId}.encrypted`;
      const uploadCommand = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        Body: encryptedData,
        ContentType: 'application/octet-stream',
        Metadata: {
          'x-amz-iv': iv.toString('base64'),
          'x-amz-tag': authTag.toString('base64'),
          'x-amz-key-id': kmsKeyId,
          'original-format': 'audio/wav',
          'encrypted': 'true',
        },
        ServerSideEncryption: 'AES256', // S3 SSE (additional layer)
      });

      await s3Client.send(uploadCommand);

      // 6. Update database with encryption metadata
      await query(`
        UPDATE call_recordings
        SET
          encrypted = true,
          encryption_algorithm = 'AES-256-GCM',
          encrypted_dek = $1,
          encryption_iv = $2,
          encryption_auth_tag = $3,
          kms_key_id = $4,
          s3_path = $5,
          file_size_bytes = $6,
          encryption_metadata = $7
        WHERE id = $8
      `, [
        encryptedDEK,
        iv.toString('base64'),
        authTag.toString('base64'),
        kmsKeyId,
        s3Key,
        encryptedData.length,
        JSON.stringify({
          algorithm: 'AES-256-GCM',
          key_bits: 256,
          iv_bits: 128,
          encrypted_at: new Date().toISOString(),
        }),
        recordingId,
      ]);

      // 7. Log encryption event
      await query(`
        INSERT INTO recording_access_logs (recording_id, tenant_id, action, success)
        VALUES ($1, $2, 'encrypt', true)
      `, [recordingId, tenant_id]);

      // 8. Delete plaintext file
      fs.unlinkSync(filePath);

      console.log(`[Encryption] ✅ Recording ${recordingId} encrypted and uploaded`);

      return {
        success: true,
        s3_key: s3Key,
        encrypted_size: encryptedData.length,
      };
    } catch (error) {
      console.error(`[Encryption] ❌ Failed to encrypt recording ${recordingId}:`, error);

      // Log failed encryption
      await query(`
        INSERT INTO recording_access_logs (recording_id, tenant_id, action, success, error_message)
        VALUES ($1, $2, 'encrypt', false, $3)
      `, [recordingId, tenant_id, error.message]);

      throw error;
    }
  }

  /**
   * Generate presigned URL for streaming encrypted recording
   */
  async generatePlaybackUrl(recordingId, userId, ipAddress) {
    const startTime = Date.now();

    try {
      // 1. Get recording details
      const recordingResult = await query(
        `SELECT r.*, t.kms_key_id
         FROM call_recordings r
         JOIN tenants t ON t.id = r.tenant_id
         WHERE r.id = $1`,
        [recordingId]
      );

      const recording = recordingResult.rows[0];
      if (!recording) {
        throw new Error('Recording not found');
      }

      if (!recording.encrypted) {
        // If not encrypted, return standard presigned URL
        return await this.generateStandardPresignedUrl(recording);
      }

      // 2. Decrypt DEK using KMS
      const decryptCommand = new DecryptCommand({
        CiphertextBlob: Buffer.from(recording.encrypted_dek, 'base64'),
        KeyId: recording.kms_key_id,
      });

      const decryptResponse = await kmsClient.send(decryptCommand);
      const plaintextDEK = Buffer.from(decryptResponse.Plaintext);

      // 3. Generate presigned URL with decryption parameters
      const getObjectCommand = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: recording.s3_path,
        ResponseContentType: 'audio/wav',
        ResponseContentDisposition: `inline; filename="recording-${recordingId}.wav"`,
      });

      const presignedUrl = await getSignedUrl(s3Client, getObjectCommand, {
        expiresIn: 900, // 15 minutes
      });

      // 4. Return URL with decryption metadata (client-side decryption)
      // OR perform server-side decryption and stream
      const decryptionMetadata = {
        iv: recording.encryption_iv,
        authTag: recording.encryption_auth_tag,
        algorithm: 'AES-256-GCM',
      };

      // 5. Log access
      const duration = Date.now() - startTime;
      await query(`
        INSERT INTO recording_access_logs
          (recording_id, tenant_id, user_id, action, ip_address, decryption_duration_ms, success)
        VALUES ($1, $2, $3, 'decrypt', $4, $5, true)
      `, [recordingId, recording.tenant_id, userId, ipAddress, duration]);

      return {
        url: presignedUrl,
        encrypted: true,
        decryption: decryptionMetadata,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
    } catch (error) {
      console.error(`[Encryption] Failed to generate playback URL for recording ${recordingId}:`, error);

      // Log failed decryption
      await query(`
        INSERT INTO recording_access_logs (recording_id, user_id, action, success, error_message, ip_address)
        VALUES ($1, $2, 'decrypt', false, $3, $4)
      `, [recordingId, userId, error.message, ipAddress]);

      throw error;
    }
  }

  /**
   * Stream decrypted recording (server-side decryption)
   */
  async streamDecrypted(recordingId, userId, ipAddress, res) {
    try {
      // 1. Get recording details
      const recordingResult = await query(
        `SELECT r.*, t.kms_key_id
         FROM call_recordings r
         JOIN tenants t ON t.id = r.tenant_id
         WHERE r.id = $1`,
        [recordingId]
      );

      const recording = recordingResult.rows[0];
      if (!recording || !recording.encrypted) {
        throw new Error('Recording not found or not encrypted');
      }

      // 2. Decrypt DEK
      const decryptCommand = new DecryptCommand({
        CiphertextBlob: Buffer.from(recording.encrypted_dek, 'base64'),
        KeyId: recording.kms_key_id,
      });

      const decryptResponse = await kmsClient.send(decryptCommand);
      const plaintextDEK = Buffer.from(decryptResponse.Plaintext);

      // 3. Get encrypted file from S3
      const getObjectCommand = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: recording.s3_path,
      });

      const s3Object = await s3Client.send(getObjectCommand);

      // 4. Create decipher
      const iv = Buffer.from(recording.encryption_iv, 'base64');
      const authTag = Buffer.from(recording.encryption_auth_tag, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', plaintextDEK, iv);
      decipher.setAuthTag(authTag);

      // 5. Stream decrypted audio to client
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Disposition', `inline; filename="recording-${recordingId}.wav"`);

      await pipeline(
        s3Object.Body,
        decipher,
        res
      );

      // 6. Log successful stream
      await query(`
        INSERT INTO recording_access_logs
          (recording_id, tenant_id, user_id, action, ip_address, success)
        VALUES ($1, $2, $3, 'stream', $4, true)
      `, [recordingId, recording.tenant_id, userId, ipAddress]);

      console.log(`[Encryption] ✅ Streamed decrypted recording ${recordingId}`);
    } catch (error) {
      console.error(`[Encryption] ❌ Failed to stream recording ${recordingId}:`, error);

      // Log failed stream
      await query(`
        INSERT INTO recording_access_logs (recording_id, user_id, action, success, error_message, ip_address)
        VALUES ($1, $2, 'stream', false, $3, $4)
      `, [recordingId, userId, error.message, ipAddress]);

      throw error;
    }
  }

  /**
   * Rotate encryption keys (re-encrypt with new KMS key)
   */
  async rotateKeys(tenantId, newKmsKeyId) {
    console.log(`[Encryption] Starting key rotation for tenant ${tenantId}`);

    // Get all encrypted recordings for tenant
    const recordings = await query(
      'SELECT id, encrypted_dek, s3_path FROM call_recordings WHERE tenant_id = $1 AND encrypted = true',
      [tenantId]
    );

    let rotated = 0;
    let failed = 0;

    for (const recording of recordings.rows) {
      try {
        // 1. Decrypt old DEK
        const decryptCommand = new DecryptCommand({
          CiphertextBlob: Buffer.from(recording.encrypted_dek, 'base64'),
        });
        const decryptResponse = await kmsClient.send(decryptCommand);
        const plaintextDEK = Buffer.from(decryptResponse.Plaintext);

        // 2. Encrypt DEK with new KMS key
        const encryptCommand = new EncryptCommand({
          KeyId: newKmsKeyId,
          Plaintext: plaintextDEK,
        });
        const encryptResponse = await kmsClient.send(encryptCommand);
        const newEncryptedDEK = Buffer.from(encryptResponse.CiphertextBlob).toString('base64');

        // 3. Update database
        await query(
          'UPDATE call_recordings SET encrypted_dek = $1, kms_key_id = $2 WHERE id = $3',
          [newEncryptedDEK, newKmsKeyId, recording.id]
        );

        rotated++;
      } catch (error) {
        console.error(`Failed to rotate key for recording ${recording.id}:`, error);
        failed++;
      }
    }

    console.log(`[Encryption] Key rotation complete: ${rotated} rotated, ${failed} failed`);

    return { rotated, failed };
  }
}

export default new RecordingEncryptionService();
```

---

## 4️⃣ API Integration

### **Update `/v1/recordings/:id/playback` Endpoint**

```javascript
import recordingEncryption from '../services/recordingEncryption.js';

// GET /v1/recordings/:id/playback
app.get('/:id/playback', async (c) => {
  const recordingId = parseInt(c.req.param('id'));
  const userId = c.get('user').id; // From auth middleware
  const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip');

  try {
    const playbackUrl = await recordingEncryption.generatePlaybackUrl(
      recordingId,
      userId,
      ipAddress
    );

    return c.json({
      success: true,
      data: playbackUrl,
    });
  } catch (error) {
    console.error('Playback error:', error);
    return c.json({
      success: false,
      error: 'Failed to generate playback URL',
    }, 500);
  }
});

// GET /v1/recordings/:id/stream (server-side decryption)
app.get('/:id/stream', async (c) => {
  const recordingId = parseInt(c.req.param('id'));
  const userId = c.get('user').id;
  const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip');

  try {
    await recordingEncryption.streamDecrypted(
      recordingId,
      userId,
      ipAddress,
      c.res
    );
  } catch (error) {
    console.error('Stream error:', error);
    return c.json({
      success: false,
      error: 'Failed to stream recording',
    }, 500);
  }
});
```

---

## 5️⃣ Worker Integration

### **Update Recording Worker**

```javascript
// src/workers/recording-worker.js
import recordingEncryption from '../services/recordingEncryption.js';

async function processRecording(recordingId) {
  // 1. Wait for FreeSWITCH to finish recording
  const recording = await getRecording(recordingId);
  const filePath = recording.local_file_path;

  // 2. Encrypt and upload
  await recordingEncryption.encryptAndUpload(filePath, recording);

  console.log(`Recording ${recordingId} encrypted and uploaded`);
}
```

---

## 6️⃣ Compliance & Auditing

### **SOC 2 Requirements**
- ✅ Encryption at rest (AES-256-GCM)
- ✅ Encryption in transit (HTTPS/TLS)
- ✅ Key rotation capability
- ✅ Access logging (all decrypt operations)
- ✅ Least privilege access (KMS policies)

### **HIPAA Requirements**
- ✅ PHI encrypted at rest
- ✅ Access controls and audit logs
- ✅ 6-year retention policy
- ✅ Secure key management (AWS KMS)

### **GDPR Requirements**
- ✅ Right to erasure (delete recordings + keys)
- ✅ Data minimization (only store necessary metadata)
- ✅ Consent tracking (opt-in recording)

---

## 7️⃣ Testing

### **Test Encryption/Decryption**

```bash
# 1. Upload test recording
curl -X POST http://localhost:3000/v1/recordings/test \
  -H "X-API-Key: YOUR_KEY" \
  -F "file=@test-audio.wav" \
  -F "call_id=123" \
  -F "tenant_id=1"

# 2. Verify encryption in database
psql -d irisx_prod -c "
SELECT id, encrypted, encryption_algorithm, LENGTH(encrypted_dek) as dek_length
FROM call_recordings WHERE id = 1;
"

# 3. Request playback URL
curl http://localhost:3000/v1/recordings/1/playback \
  -H "X-API-Key: YOUR_KEY"

# 4. Stream recording
curl http://localhost:3000/v1/recordings/1/stream \
  -H "X-API-Key: YOUR_KEY" \
  -o decrypted-test.wav

# 5. Verify decrypted audio plays correctly
ffplay decrypted-test.wav
```

---

## ✅ Success Criteria

- [ ] All new recordings encrypted with AES-256-GCM
- [ ] KMS keys configured per tenant
- [ ] Playback URLs work with decryption
- [ ] Server-side streaming works
- [ ] Access logs capture all decrypt operations
- [ ] Key rotation tested successfully
- [ ] Performance: Encryption adds <2s latency
- [ ] Security audit passed

---

**Estimated Time:** 3-4 days
**Priority:** High (Week 32 - Security & Compliance)
**Dependencies:** AWS KMS, S3, PostgreSQL
