-- Migration 013: Call Recordings System
-- Creates tables for managing call recordings with S3 storage integration

-- =====================================================
-- CALL RECORDINGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS call_recordings (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Relationships
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  call_id BIGINT REFERENCES calls(id) ON DELETE SET NULL,
  call_uuid UUID,

  -- Recording metadata
  recording_url TEXT NOT NULL,
  s3_bucket VARCHAR(255),
  s3_key VARCHAR(500),
  file_format VARCHAR(10) DEFAULT 'wav',  -- wav, mp3, ogg
  duration_seconds INTEGER,
  file_size_bytes BIGINT,

  -- Recording settings
  recording_mode VARCHAR(50) DEFAULT 'full',  -- full, inbound_only, outbound_only
  channels INTEGER DEFAULT 1,  -- 1 = mono, 2 = stereo
  sample_rate INTEGER DEFAULT 8000,  -- Hz

  -- Status tracking
  status VARCHAR(50) DEFAULT 'processing',  -- processing, available, failed, deleted
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Encryption (for future use - Week 32)
  is_encrypted BOOLEAN DEFAULT FALSE,
  encryption_key_id VARCHAR(255),

  -- Compliance
  retention_until DATE,  -- Auto-delete after this date
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  delete_reason TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_recordings_tenant_id ON call_recordings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_call_id ON call_recordings(call_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_call_uuid ON call_recordings(call_uuid);
CREATE INDEX IF NOT EXISTS idx_call_recordings_status ON call_recordings(status);
CREATE INDEX IF NOT EXISTS idx_call_recordings_created_at ON call_recordings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_recordings_retention_until ON call_recordings(retention_until) WHERE is_deleted = FALSE;

-- =====================================================
-- RECORDING TRANSCRIPTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS recording_transcriptions (
  id BIGSERIAL PRIMARY KEY,

  -- Relationships
  recording_id BIGINT NOT NULL REFERENCES call_recordings(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Transcription data
  transcript_text TEXT,
  transcript_json JSONB,  -- Detailed transcript with timestamps, speaker labels
  language VARCHAR(10) DEFAULT 'en-US',
  confidence_score DECIMAL(5, 4),  -- 0.0000 to 1.0000

  -- Provider info
  provider VARCHAR(50),  -- aws_transcribe, google_speech, deepgram, assembly_ai
  provider_job_id VARCHAR(255),

  -- Status
  status VARCHAR(50) DEFAULT 'queued',  -- queued, processing, completed, failed
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Costs
  cost_cents INTEGER DEFAULT 0,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recording_transcriptions_recording_id ON recording_transcriptions(recording_id);
CREATE INDEX IF NOT EXISTS idx_recording_transcriptions_tenant_id ON recording_transcriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recording_transcriptions_status ON recording_transcriptions(status);

-- =====================================================
-- RECORDING SETTINGS PER TENANT
-- =====================================================
CREATE TABLE IF NOT EXISTS tenant_recording_settings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,

  -- Global recording settings
  record_all_calls BOOLEAN DEFAULT FALSE,
  record_inbound BOOLEAN DEFAULT TRUE,
  record_outbound BOOLEAN DEFAULT TRUE,

  -- Format settings
  file_format VARCHAR(10) DEFAULT 'wav',  -- wav, mp3, ogg
  channels INTEGER DEFAULT 1,  -- 1 = mono, 2 = stereo (dual-channel)
  sample_rate INTEGER DEFAULT 8000,  -- 8000, 16000, 44100, 48000

  -- Storage settings
  s3_bucket VARCHAR(255),
  retention_days INTEGER DEFAULT 90,  -- Keep recordings for X days
  auto_delete_after_retention BOOLEAN DEFAULT FALSE,

  -- Encryption
  enable_encryption BOOLEAN DEFAULT FALSE,
  encryption_key_id VARCHAR(255),

  -- Transcription
  auto_transcribe BOOLEAN DEFAULT FALSE,
  transcription_provider VARCHAR(50) DEFAULT 'aws_transcribe',
  transcription_language VARCHAR(10) DEFAULT 'en-US',

  -- Compliance
  require_recording_consent BOOLEAN DEFAULT FALSE,
  play_beep BOOLEAN DEFAULT FALSE,
  announcement_text TEXT,  -- "This call may be recorded for quality purposes"

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_recording_settings_tenant_id ON tenant_recording_settings(tenant_id);

-- =====================================================
-- UPDATE TRIGGER FOR updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_recording_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER call_recordings_updated_at
  BEFORE UPDATE ON call_recordings
  FOR EACH ROW
  EXECUTE FUNCTION update_recording_updated_at();

CREATE TRIGGER recording_transcriptions_updated_at
  BEFORE UPDATE ON recording_transcriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_recording_updated_at();

CREATE TRIGGER tenant_recording_settings_updated_at
  BEFORE UPDATE ON tenant_recording_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_recording_updated_at();

-- =====================================================
-- AUTOMATIC RECORDING CLEANUP (future use with cron)
-- =====================================================
-- Function to mark recordings for deletion based on retention policy
CREATE OR REPLACE FUNCTION mark_expired_recordings()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    UPDATE call_recordings
    SET
      is_deleted = TRUE,
      deleted_at = NOW(),
      delete_reason = 'Retention period expired'
    WHERE
      is_deleted = FALSE
      AND retention_until < CURRENT_DATE
      AND status = 'available'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INSERT DEFAULT RECORDING SETTINGS FOR EXISTING TENANTS
-- =====================================================
INSERT INTO tenant_recording_settings (tenant_id, record_all_calls, file_format, retention_days)
SELECT id, FALSE, 'wav', 90
FROM tenants
WHERE id NOT IN (SELECT tenant_id FROM tenant_recording_settings)
ON CONFLICT (tenant_id) DO NOTHING;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
-- These would be uncommented in production with proper user roles
-- GRANT SELECT, INSERT, UPDATE, DELETE ON call_recordings TO irisx_api_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON recording_transcriptions TO irisx_api_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_recording_settings TO irisx_api_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO irisx_api_user;

COMMIT;
