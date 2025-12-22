-- Migration: Add Call Transcripts and AI Analysis tables
-- Based on: IRIS_AI_Conversation_Intelligence.md
-- Features: Real-time transcription, sentiment analysis, GPT-4 call analysis

-- Call transcript segments (real-time transcription)
CREATE TABLE IF NOT EXISTS call_transcript_segments (
  id SERIAL PRIMARY KEY,
  call_id VARCHAR(100) NOT NULL, -- UUID or call reference
  tenant_id INTEGER NOT NULL,

  speaker INTEGER NOT NULL DEFAULT 0, -- 0 = agent, 1 = customer, etc.
  start_time NUMERIC(10,3) NOT NULL, -- Seconds from call start
  duration NUMERIC(10,3) NOT NULL DEFAULT 0, -- Segment duration in seconds
  text TEXT NOT NULL,
  is_final BOOLEAN DEFAULT TRUE,

  -- Real-time sentiment (quick analysis)
  sentiment VARCHAR(20), -- positive, neutral, negative
  sentiment_score NUMERIC(5,2), -- -5 to +5 scale

  -- Metadata
  confidence NUMERIC(4,3), -- Transcription confidence 0-1
  language VARCHAR(10) DEFAULT 'en',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcript_segments_call ON call_transcript_segments(call_id, start_time);
CREATE INDEX IF NOT EXISTS idx_transcript_segments_tenant ON call_transcript_segments(tenant_id, created_at DESC);

-- Call analyses (post-call GPT-4 analysis)
CREATE TABLE IF NOT EXISTS call_analyses (
  id SERIAL PRIMARY KEY,
  call_id VARCHAR(100) NOT NULL UNIQUE,
  tenant_id INTEGER NOT NULL,

  -- Summary
  summary TEXT NOT NULL,

  -- Sentiment
  sentiment VARCHAR(20) NOT NULL CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  sentiment_score NUMERIC(3,2) CHECK (sentiment_score >= 0 AND sentiment_score <= 1),

  -- Extracted data (JSONB)
  topics JSONB DEFAULT '[]'::jsonb, -- ["billing", "technical_support"]
  key_moments JSONB DEFAULT '[]'::jsonb, -- [{ timestamp, description, importance }]
  action_items JSONB DEFAULT '[]'::jsonb, -- [{ speaker, text, timestamp }]
  questions_asked JSONB DEFAULT '[]'::jsonb, -- [{ speaker, question, answered }]
  objections JSONB DEFAULT '[]'::jsonb, -- ["price_too_high", "competitor_comparison"]
  competitor_mentions JSONB DEFAULT '[]'::jsonb, -- ["Twilio", "Vonage"]
  pain_points JSONB DEFAULT '[]'::jsonb, -- ["slow_response_time", "lack_of_features"]

  -- Metrics
  talk_ratio JSONB DEFAULT '{}'::jsonb, -- { "speaker_0": 0.6, "speaker_1": 0.4 }
  call_outcome VARCHAR(30) CHECK (call_outcome IN ('successful', 'unsuccessful', 'follow_up_needed', 'unknown')),
  predicted_csat INTEGER CHECK (predicted_csat >= 1 AND predicted_csat <= 5),

  -- Coaching
  coaching_insights JSONB DEFAULT '[]'::jsonb, -- [{ agent_speaker, insight, category }]

  -- Processing info
  model_used VARCHAR(50) DEFAULT 'gpt-4-turbo-preview',
  tokens_used INTEGER DEFAULT 0,
  processing_time_ms INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_analyses_call ON call_analyses(call_id);
CREATE INDEX IF NOT EXISTS idx_call_analyses_tenant ON call_analyses(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_analyses_sentiment ON call_analyses(sentiment);
CREATE INDEX IF NOT EXISTS idx_call_analyses_outcome ON call_analyses(call_outcome);

-- Compliance alerts (keyword detection)
CREATE TABLE IF NOT EXISTS compliance_alerts (
  id SERIAL PRIMARY KEY,
  call_id VARCHAR(100) NOT NULL,
  tenant_id INTEGER NOT NULL,

  alert_type VARCHAR(50) NOT NULL, -- compliance_violation, competitor_mention, payment_info, profanity
  keywords_detected JSONB DEFAULT '[]'::jsonb,
  severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  transcript_segment TEXT, -- The text that triggered the alert
  timestamp_in_call NUMERIC(10,3), -- When in the call this occurred

  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by INTEGER, -- user_id
  acknowledged_at TIMESTAMPTZ,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_alerts_call ON compliance_alerts(call_id);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_tenant ON compliance_alerts(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_unacknowledged ON compliance_alerts(tenant_id) WHERE acknowledged = FALSE;
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_type ON compliance_alerts(alert_type, created_at DESC);

-- Agent performance metrics (aggregated from AI analysis)
CREATE TABLE IF NOT EXISTS agent_ai_metrics (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL,
  tenant_id INTEGER NOT NULL,

  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Call volume
  total_calls INTEGER NOT NULL DEFAULT 0,
  analyzed_calls INTEGER NOT NULL DEFAULT 0,

  -- Quality
  avg_sentiment_score NUMERIC(3,2),
  avg_predicted_csat NUMERIC(3,2),

  -- Outcomes
  successful_calls INTEGER DEFAULT 0,
  unsuccessful_calls INTEGER DEFAULT 0,
  follow_up_needed INTEGER DEFAULT 0,

  -- Talk metrics
  avg_talk_ratio NUMERIC(3,2), -- Agent speaking time ratio

  -- Coaching areas (count of times each area flagged)
  coaching_categories JSONB DEFAULT '{}'::jsonb, -- { "active_listening": 5, "closing": 3 }

  -- Topics handled
  common_topics JSONB DEFAULT '[]'::jsonb, -- Most frequent topics

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(agent_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_agent_ai_metrics_agent ON agent_ai_metrics(agent_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_agent_ai_metrics_tenant ON agent_ai_metrics(tenant_id);

-- Transcription jobs queue
CREATE TABLE IF NOT EXISTS transcription_jobs (
  id SERIAL PRIMARY KEY,
  call_id VARCHAR(100) NOT NULL,
  tenant_id INTEGER NOT NULL,

  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  job_type VARCHAR(20) DEFAULT 'transcription' CHECK (job_type IN ('transcription', 'analysis', 'both')),

  -- Recording info
  recording_url TEXT,
  recording_duration_seconds INTEGER,

  -- Processing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Cost tracking
  transcription_cost NUMERIC(10,6) DEFAULT 0,
  analysis_cost NUMERIC(10,6) DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcription_jobs_status ON transcription_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_call ON transcription_jobs(call_id);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_tenant ON transcription_jobs(tenant_id);

-- Add transcription columns to calls table if it exists
DO $$
BEGIN
  -- Add has_transcript flag
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'calls') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'has_transcript') THEN
      ALTER TABLE calls ADD COLUMN has_transcript BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'has_analysis') THEN
      ALTER TABLE calls ADD COLUMN has_analysis BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'ai_sentiment') THEN
      ALTER TABLE calls ADD COLUMN ai_sentiment VARCHAR(20);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'ai_predicted_csat') THEN
      ALTER TABLE calls ADD COLUMN ai_predicted_csat INTEGER;
    END IF;
  END IF;
END$$;

-- Comments for documentation
COMMENT ON TABLE call_transcript_segments IS 'Real-time transcription segments from calls (Deepgram/Whisper)';
COMMENT ON TABLE call_analyses IS 'GPT-4 powered post-call analysis with insights';
COMMENT ON TABLE compliance_alerts IS 'AI-detected compliance violations and keyword alerts';
COMMENT ON TABLE agent_ai_metrics IS 'Aggregated AI-powered agent performance metrics';
COMMENT ON TABLE transcription_jobs IS 'Queue for transcription and analysis jobs';
