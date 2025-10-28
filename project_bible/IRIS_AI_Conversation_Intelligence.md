# IRIS AI Conversation Intelligence

> **GPT-powered call analysis with real-time transcription, sentiment analysis, summarization, and coaching insights**

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Real-Time Transcription](#real-time-transcription)
4. [AI Analysis Features](#ai-analysis-features)
5. [Database Schema](#database-schema)
6. [API Implementation](#api-implementation)
7. [Dashboard & UI](#dashboard--ui)
8. [Agent Coaching](#agent-coaching)
9. [Cost Model](#cost-model)

---

## Overview

### Why Conversation Intelligence Matters

**Market Reality:**
- Gong.io, Chorus.ai (acquired by ZoomInfo for $575M) dominate sales intelligence
- Five9, Talkdesk, Genesys all integrate conversation intelligence
- Contact centers use AI to coach agents, identify training needs, reduce QA time by 80%
- Sales teams use AI insights to replicate top performers

**Business Impact:**
- Modern contact centers expect AI-powered insights
- Manual QA is too slow (5-10 calls/day vs 100% with AI)
- Revenue intelligence: Identify upsell opportunities, churn risk
- Compliance: Flag profanity, unauthorized promises, regulatory violations

**Competitive Necessity:**
- Without AI insights, cannot compete in modern contact center market
- 50% higher close rate vs competitors without AI features
- Enterprise RFPs require conversation intelligence

### Solution Overview

**Core Features:**
- ✅ Real-time transcription (OpenAI Whisper, Deepgram)
- ✅ Post-call summarization (GPT-4)
- ✅ Sentiment analysis (positive, neutral, negative)
- ✅ Topic extraction & categorization
- ✅ Action item detection ("I'll call you back tomorrow")
- ✅ Question detection & answer quality scoring
- ✅ Talk-to-listen ratio (agent vs customer speaking time)
- ✅ Keyword & phrase detection (compliance, competitors)
- ✅ Automated call scoring (CSAT prediction)
- ✅ Agent coaching recommendations
- ✅ Trend analysis across thousands of calls

**Use Cases:**
- **Sales**: Identify objections, track competitor mentions, coach reps
- **Support**: Reduce handle time, improve CSAT, identify knowledge gaps
- **QA**: Automated quality assurance, compliance monitoring
- **Product**: Identify feature requests, pain points, churn signals

---

## Architecture

### High-Level Flow

```
┌─────────────────┐
│  Call Happens   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Real-Time Transcription        │
│  (Deepgram WebSocket)           │
│  - Interim results every 200ms  │
│  - Final results with punctuation│
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Store Transcript Segments      │
│  (PostgreSQL)                   │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Call Ends                      │
└────────┬────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  AI Analysis Pipeline (Bun Worker)   │
│                                      │
│  1. Combine transcript segments      │
│  2. Send to GPT-4 for analysis       │
│  3. Extract:                         │
│     - Summary                        │
│     - Sentiment                      │
│     - Topics                         │
│     - Action items                   │
│     - Key moments                    │
│     - Coaching insights              │
│  4. Store analysis results           │
│  5. Calculate call score             │
│  6. Send webhook to customer         │
└────────┬─────────────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Dashboard          │
│  - Transcript       │
│  - Summary          │
│  - Insights         │
│  - Coaching tips    │
└─────────────────────┘
```

### Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Real-Time STT** | Deepgram or OpenAI Whisper | Live transcription during call |
| **AI Analysis** | OpenAI GPT-4 | Summarization, sentiment, insights |
| **Sentiment** | GPT-4 + VADER (fallback) | Emotion detection |
| **Topic Extraction** | GPT-4 | Categorize call topics |
| **Action Items** | GPT-4 + Regex | Detect commitments, follow-ups |
| **Speaker Diarization** | Deepgram | Identify who said what |
| **Database** | PostgreSQL + pgvector | Store transcripts + embeddings |
| **Search** | pgvector | Semantic search across calls |

---

## Real-Time Transcription

### Deepgram Integration (Preferred)

**Why Deepgram?**
- Faster than Whisper (200ms latency vs 1-2 seconds)
- Speaker diarization built-in
- Real-time WebSocket streaming
- $0.0043/min (vs Whisper $0.006/min)

```typescript
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY!);

async function transcribeCallRealTime(callId: string, audioStream: ReadableStream) {
  const connection = deepgramClient.listen.live({
    model: 'nova-2',
    language: 'en',
    smart_format: true,
    punctuate: true,
    diarize: true, // Speaker identification
    interim_results: true,
  });

  connection.on(LiveTranscriptionEvents.Open, () => {
    console.log(`🎙️ Transcription started for call ${callId}`);
  });

  connection.on(LiveTranscriptionEvents.Transcript, async (data) => {
    const transcript = data.channel.alternatives[0].transcript;

    if (!transcript) return;

    const isFinal = data.is_final;
    const speaker = data.channel.alternatives[0].words?.[0]?.speaker || 0;
    const startTime = data.start;
    const duration = data.duration;

    // Store interim results in Redis (overwrite until final)
    if (!isFinal) {
      await redis.set(
        `transcript:interim:${callId}`,
        JSON.stringify({ transcript, speaker, startTime }),
        'EX',
        10
      );

      // Broadcast to dashboard
      await broadcastTranscriptUpdate(callId, transcript, speaker, false);
    } else {
      // Store final result in database
      await db.query(`
        INSERT INTO call_transcript_segments (
          call_id, speaker, start_time, duration, text, is_final
        )
        VALUES ($1, $2, $3, $4, $5, TRUE)
      `, [callId, speaker, startTime, duration, transcript]);

      // Broadcast final transcript
      await broadcastTranscriptUpdate(callId, transcript, speaker, true);

      // Delete interim result
      await redis.del(`transcript:interim:${callId}`);
    }
  });

  connection.on(LiveTranscriptionEvents.Error, (error) => {
    console.error(`❌ Transcription error for call ${callId}:`, error);
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    console.log(`🎙️ Transcription ended for call ${callId}`);
  });

  // Stream audio to Deepgram
  const reader = audioStream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    connection.send(value);
  }

  connection.finish();
}

async function broadcastTranscriptUpdate(
  callId: string,
  transcript: string,
  speaker: number,
  isFinal: boolean
) {
  await nc.publish(`transcript.${callId}`, JSON.stringify({
    type: 'transcript_update',
    call_id: callId,
    transcript,
    speaker,
    is_final: isFinal,
    timestamp: new Date().toISOString(),
  }));
}
```

### Connect to FreeSWITCH Audio

```typescript
// Hook into FreeSWITCH media stream
import { Client as ESLClient } from 'esl';

const esl = new ESLClient();

esl.on('esl::event::CHANNEL_ANSWER', async (event: any) => {
  const callId = event.getHeader('Unique-ID');

  // Start recording to pipe audio to transcription
  await esl.execute('uuid_record', callId, [
    `/tmp/transcription_pipe_${callId}`,
    'start',
  ]);

  // Stream audio to Deepgram
  const audioStream = createReadStreamFromPipe(`/tmp/transcription_pipe_${callId}`);
  await transcribeCallRealTime(callId, audioStream);
});
```

---

## AI Analysis Features

### 1. Call Summarization

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function analyzeCall(callId: string): Promise<CallAnalysis> {
  // Get full transcript
  const segments = await db.query(`
    SELECT speaker, text, start_time
    FROM call_transcript_segments
    WHERE call_id = $1
    ORDER BY start_time ASC
  `, [callId]);

  // Combine into full transcript with speaker labels
  const transcript = segments.rows
    .map(s => `Speaker ${s.speaker}: ${s.text}`)
    .join('\n');

  // Get call metadata
  const call = await db.query(`
    SELECT direction, from_number, to_number, duration, tags
    FROM calls
    WHERE id = $1
  `, [callId]);

  const callMeta = call.rows[0];

  // Prepare GPT-4 prompt
  const prompt = `
You are an expert call analyst. Analyze the following ${callMeta.direction} call transcript and provide detailed insights.

Call Duration: ${callMeta.duration} seconds
Direction: ${callMeta.direction}
Tags: ${callMeta.tags?.join(', ') || 'None'}

TRANSCRIPT:
${transcript}

Provide a JSON response with the following structure:
{
  "summary": "2-3 sentence summary of the call",
  "sentiment": "positive" | "neutral" | "negative",
  "sentiment_score": 0.0 to 1.0,
  "topics": ["topic1", "topic2", ...],
  "key_moments": [
    { "timestamp": 0, "description": "...", "importance": "high|medium|low" }
  ],
  "action_items": [
    { "speaker": 0, "text": "I'll call you back tomorrow", "timestamp": 45 }
  ],
  "questions_asked": [
    { "speaker": 0, "question": "What's your pricing?", "answered": true }
  ],
  "objections": ["objection1", "objection2"],
  "competitor_mentions": ["CompanyX", "ProductY"],
  "pain_points": ["pain1", "pain2"],
  "talk_ratio": {
    "speaker_0": 0.6,
    "speaker_1": 0.4
  },
  "call_outcome": "successful" | "unsuccessful" | "follow_up_needed",
  "predicted_csat": 1-5,
  "coaching_insights": [
    { "agent_speaker": 0, "insight": "...", "category": "active_listening|closing|objection_handling" }
  ]
}
`.trim();

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'You are an expert call analyst specializing in sales and customer support conversations.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const analysis = JSON.parse(response.choices[0].message.content!);

  // Store analysis in database
  await db.query(`
    INSERT INTO call_analyses (
      call_id, summary, sentiment, sentiment_score,
      topics, key_moments, action_items, questions_asked,
      objections, competitor_mentions, pain_points,
      talk_ratio, call_outcome, predicted_csat, coaching_insights,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
  `, [
    callId,
    analysis.summary,
    analysis.sentiment,
    analysis.sentiment_score,
    JSON.stringify(analysis.topics),
    JSON.stringify(analysis.key_moments),
    JSON.stringify(analysis.action_items),
    JSON.stringify(analysis.questions_asked),
    JSON.stringify(analysis.objections),
    JSON.stringify(analysis.competitor_mentions),
    JSON.stringify(analysis.pain_points),
    JSON.stringify(analysis.talk_ratio),
    analysis.call_outcome,
    analysis.predicted_csat,
    JSON.stringify(analysis.coaching_insights),
  ]);

  console.log(`✅ Call analysis complete for ${callId}`);

  return analysis;
}

interface CallAnalysis {
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  sentiment_score: number;
  topics: string[];
  key_moments: Array<{
    timestamp: number;
    description: string;
    importance: 'high' | 'medium' | 'low';
  }>;
  action_items: Array<{
    speaker: number;
    text: string;
    timestamp: number;
  }>;
  questions_asked: Array<{
    speaker: number;
    question: string;
    answered: boolean;
  }>;
  objections: string[];
  competitor_mentions: string[];
  pain_points: string[];
  talk_ratio: Record<string, number>;
  call_outcome: 'successful' | 'unsuccessful' | 'follow_up_needed';
  predicted_csat: number;
  coaching_insights: Array<{
    agent_speaker: number;
    insight: string;
    category: string;
  }>;
}
```

### 2. Sentiment Analysis (Real-Time)

```typescript
// Real-time sentiment using simpler model (VADER fallback)
import Sentiment from 'sentiment';

const sentimentAnalyzer = new Sentiment();

function analyzeSentimentRealTime(text: string): {
  score: number;
  sentiment: 'positive' | 'neutral' | 'negative';
} {
  const result = sentimentAnalyzer.analyze(text);

  let sentiment: 'positive' | 'neutral' | 'negative';
  if (result.score > 2) sentiment = 'positive';
  else if (result.score < -2) sentiment = 'negative';
  else sentiment = 'neutral';

  return {
    score: result.score,
    sentiment,
  };
}

// Update transcript broadcast to include sentiment
async function broadcastTranscriptWithSentiment(
  callId: string,
  transcript: string,
  speaker: number,
  isFinal: boolean
) {
  const sentiment = analyzeSentimentRealTime(transcript);

  await nc.publish(`transcript.${callId}`, JSON.stringify({
    type: 'transcript_update',
    call_id: callId,
    transcript,
    speaker,
    is_final: isFinal,
    sentiment: sentiment.sentiment,
    sentiment_score: sentiment.score,
    timestamp: new Date().toISOString(),
  }));
}
```

### 3. Keyword Detection (Compliance)

```typescript
const COMPLIANCE_KEYWORDS = {
  profanity: ['fuck', 'shit', 'damn', 'ass', 'bitch'],
  unauthorized_promises: [
    'i guarantee',
    'i promise',
    '100% guaranteed',
    'no risk',
    'risk-free',
  ],
  competitor_mentions: [
    'twilio',
    'vonage',
    'plivo',
    'ringcentral',
    'five9',
  ],
  payment_info: [
    'credit card',
    'card number',
    'cvv',
    'social security',
    'ssn',
  ],
};

function detectKeywords(transcript: string): {
  profanity: string[];
  unauthorized_promises: string[];
  competitor_mentions: string[];
  payment_info: string[];
} {
  const lower = transcript.toLowerCase();
  const detected: any = {
    profanity: [],
    unauthorized_promises: [],
    competitor_mentions: [],
    payment_info: [],
  };

  for (const [category, keywords] of Object.entries(COMPLIANCE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        detected[category].push(keyword);
      }
    }
  }

  return detected;
}

// Trigger compliance alert
async function checkCompliance(callId: string, transcript: string) {
  const keywords = detectKeywords(transcript);

  const violations = [
    ...keywords.profanity,
    ...keywords.unauthorized_promises,
  ];

  if (violations.length > 0) {
    await db.query(`
      INSERT INTO compliance_alerts (
        call_id, alert_type, keywords_detected, severity
      )
      VALUES ($1, 'compliance_violation', $2, 'high')
    `, [callId, JSON.stringify(violations)]);

    // Send alert to supervisor
    await nc.publish(`alerts.compliance`, JSON.stringify({
      type: 'compliance_violation',
      call_id: callId,
      keywords: violations,
    }));
  }
}
```

### 4. Topic Clustering (Batch)

```typescript
// Use pgvector for semantic search
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return response.data[0].embedding;
}

async function storeCallEmbedding(callId: string, summary: string) {
  const embedding = await generateEmbedding(summary);

  await db.query(`
    UPDATE call_analyses
    SET embedding = $1
    WHERE call_id = $2
  `, [JSON.stringify(embedding), callId]);
}

// Find similar calls
async function findSimilarCalls(callId: string, limit = 10): Promise<any[]> {
  const result = await db.query(`
    SELECT
      ca2.call_id,
      ca2.summary,
      ca2.sentiment,
      ca2.topics,
      1 - (ca1.embedding <=> ca2.embedding) AS similarity
    FROM call_analyses ca1
    JOIN call_analyses ca2 ON ca1.call_id != ca2.call_id
    WHERE ca1.call_id = $1
    ORDER BY similarity DESC
    LIMIT $2
  `, [callId, limit]);

  return result.rows;
}
```

---

## Database Schema

```sql
-- Call transcript segments (real-time)
CREATE TABLE call_transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,

  speaker INTEGER NOT NULL, -- 0, 1, 2, etc.
  start_time NUMERIC(10,3) NOT NULL, -- Seconds from call start
  duration NUMERIC(10,3) NOT NULL, -- Segment duration in seconds
  text TEXT NOT NULL,
  is_final BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transcript_segments_call ON call_transcript_segments(call_id, start_time);

-- Call analyses (post-call)
CREATE TABLE call_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE UNIQUE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Summary
  summary TEXT NOT NULL,

  -- Sentiment
  sentiment TEXT NOT NULL CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  sentiment_score NUMERIC(3,2) CHECK (sentiment_score >= 0 AND sentiment_score <= 1),

  -- Extracted data (JSONB)
  topics JSONB, -- ["billing", "technical_support"]
  key_moments JSONB, -- [{ timestamp, description, importance }]
  action_items JSONB, -- [{ speaker, text, timestamp }]
  questions_asked JSONB, -- [{ speaker, question, answered }]
  objections JSONB, -- ["price_too_high", "competitor_comparison"]
  competitor_mentions JSONB, -- ["Twilio", "Vonage"]
  pain_points JSONB, -- ["slow_response_time", "lack_of_features"]

  -- Metrics
  talk_ratio JSONB, -- { "speaker_0": 0.6, "speaker_1": 0.4 }
  call_outcome TEXT CHECK (call_outcome IN ('successful', 'unsuccessful', 'follow_up_needed')),
  predicted_csat INTEGER CHECK (predicted_csat >= 1 AND predicted_csat <= 5),

  -- Coaching
  coaching_insights JSONB, -- [{ agent_speaker, insight, category }]

  -- Embeddings (for similarity search)
  embedding vector(1536), -- OpenAI text-embedding-3-small

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_analyses_call ON call_analyses(call_id);
CREATE INDEX idx_call_analyses_tenant ON call_analyses(tenant_id);
CREATE INDEX idx_call_analyses_sentiment ON call_analyses(sentiment);
CREATE INDEX idx_call_analyses_outcome ON call_analyses(call_outcome);
CREATE INDEX idx_call_analyses_embedding ON call_analyses USING ivfflat (embedding vector_cosine_ops);

-- Compliance alerts
CREATE TABLE compliance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  alert_type TEXT NOT NULL, -- compliance_violation, competitor_mention, payment_info
  keywords_detected JSONB,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_alerts_call ON compliance_alerts(call_id);
CREATE INDEX idx_compliance_alerts_tenant ON compliance_alerts(tenant_id, created_at DESC);
CREATE INDEX idx_compliance_alerts_unacknowledged ON compliance_alerts(tenant_id)
  WHERE acknowledged = FALSE;

-- Agent performance metrics (aggregated)
CREATE TABLE agent_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Call volume
  total_calls INTEGER NOT NULL DEFAULT 0,

  -- Quality
  avg_sentiment_score NUMERIC(3,2),
  avg_predicted_csat NUMERIC(3,2),

  -- Outcomes
  successful_calls INTEGER DEFAULT 0,
  unsuccessful_calls INTEGER DEFAULT 0,
  follow_up_needed INTEGER DEFAULT 0,

  -- Talk metrics
  avg_talk_ratio NUMERIC(3,2), -- Agent speaking time

  -- Coaching areas
  coaching_categories JSONB, -- { "active_listening": 5, "closing": 3, "objection_handling": 2 }

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(agent_id, period_start, period_end)
);

CREATE INDEX idx_agent_perf_agent ON agent_performance_metrics(agent_id, period_start DESC);
CREATE INDEX idx_agent_perf_tenant ON agent_performance_metrics(tenant_id);
```

---

## API Implementation

### Get Call Analysis

```typescript
// GET /v1/calls/:id/analysis
async function getCallAnalysis(req: Request): Promise<Response> {
  const callId = req.params.id;
  const tenantId = req.user.tenant_id;

  const analysis = await db.query(`
    SELECT * FROM call_analyses
    WHERE call_id = $1 AND tenant_id = $2
  `, [callId, tenantId]);

  if (analysis.rows.length === 0) {
    return Response.json({ error: 'Analysis not found' }, { status: 404 });
  }

  return Response.json({ analysis: analysis.rows[0] });
}
```

### Get Transcript

```typescript
// GET /v1/calls/:id/transcript
async function getCallTranscript(req: Request): Promise<Response> {
  const callId = req.params.id;
  const tenantId = req.user.tenant_id;

  // Verify access
  const call = await db.query(`
    SELECT id FROM calls WHERE id = $1 AND tenant_id = $2
  `, [callId, tenantId]);

  if (call.rows.length === 0) {
    return Response.json({ error: 'Call not found' }, { status: 404 });
  }

  const segments = await db.query(`
    SELECT speaker, start_time, duration, text
    FROM call_transcript_segments
    WHERE call_id = $1
    ORDER BY start_time ASC
  `, [callId]);

  return Response.json({ transcript: segments.rows });
}
```

### Search Calls by Topic

```typescript
// GET /v1/calls/search?q=pricing+questions
async function searchCalls(req: Request): Promise<Response> {
  const query = req.query.q;
  const tenantId = req.user.tenant_id;

  // Generate embedding for search query
  const queryEmbedding = await generateEmbedding(query);

  // Semantic search using pgvector
  const results = await db.query(`
    SELECT
      ca.call_id,
      c.created_at,
      ca.summary,
      ca.sentiment,
      ca.topics,
      1 - (ca.embedding <=> $1::vector) AS similarity
    FROM call_analyses ca
    JOIN calls c ON c.id = ca.call_id
    WHERE ca.tenant_id = $2
      AND 1 - (ca.embedding <=> $1::vector) > 0.7
    ORDER BY similarity DESC
    LIMIT 50
  `, [JSON.stringify(queryEmbedding), tenantId]);

  return Response.json({ calls: results.rows });
}
```

---

## Dashboard & UI

### Call Analysis Dashboard (React)

```tsx
import { useEffect, useState } from 'react';

interface CallAnalysis {
  summary: string;
  sentiment: string;
  sentiment_score: number;
  topics: string[];
  key_moments: Array<{ timestamp: number; description: string; importance: string }>;
  action_items: Array<{ speaker: number; text: string; timestamp: number }>;
  predicted_csat: number;
  coaching_insights: Array<{ agent_speaker: number; insight: string; category: string }>;
}

export function CallAnalysisDashboard({ callId }: { callId: string }) {
  const [analysis, setAnalysis] = useState<CallAnalysis | null>(null);
  const [transcript, setTranscript] = useState<any[]>([]);

  useEffect(() => {
    fetchAnalysis();
    fetchTranscript();
  }, [callId]);

  async function fetchAnalysis() {
    const response = await fetch(`/v1/calls/${callId}/analysis`);
    const data = await response.json();
    setAnalysis(data.analysis);
  }

  async function fetchTranscript() {
    const response = await fetch(`/v1/calls/${callId}/transcript`);
    const data = await response.json();
    setTranscript(data.transcript);
  }

  if (!analysis) return <div>Loading...</div>;

  return (
    <div className="call-analysis">
      <div className="summary-section">
        <h2>Call Summary</h2>
        <p>{analysis.summary}</p>

        <div className="metrics">
          <div className="metric">
            <span className="label">Sentiment:</span>
            <span className={`badge ${analysis.sentiment}`}>
              {analysis.sentiment.toUpperCase()}
            </span>
          </div>

          <div className="metric">
            <span className="label">Predicted CSAT:</span>
            <span className="value">{analysis.predicted_csat}/5</span>
          </div>

          <div className="metric">
            <span className="label">Topics:</span>
            <div className="tags">
              {analysis.topics.map((topic, i) => (
                <span key={i} className="tag">{topic}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="key-moments">
        <h3>Key Moments</h3>
        {analysis.key_moments.map((moment, i) => (
          <div key={i} className={`moment ${moment.importance}`}>
            <span className="timestamp">{formatTime(moment.timestamp)}</span>
            <span className="description">{moment.description}</span>
          </div>
        ))}
      </div>

      <div className="action-items">
        <h3>Action Items</h3>
        {analysis.action_items.map((item, i) => (
          <div key={i} className="action-item">
            <input type="checkbox" />
            <span className="text">{item.text}</span>
            <span className="speaker">Speaker {item.speaker}</span>
          </div>
        ))}
      </div>

      <div className="coaching-insights">
        <h3>Coaching Insights</h3>
        {analysis.coaching_insights.map((insight, i) => (
          <div key={i} className="insight">
            <span className="category">{insight.category}</span>
            <p>{insight.insight}</p>
          </div>
        ))}
      </div>

      <div className="transcript">
        <h3>Full Transcript</h3>
        {transcript.map((segment, i) => (
          <div key={i} className="transcript-line">
            <span className="speaker">Speaker {segment.speaker}:</span>
            <span className="text">{segment.text}</span>
            <span className="time">{formatTime(segment.start_time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

---

## Agent Coaching

### Weekly Performance Report

```typescript
// Generate weekly coaching report for agent
async function generateCoachingReport(agentId: string, startDate: Date, endDate: Date) {
  // Get all calls for agent in period
  const calls = await db.query(`
    SELECT
      ca.call_id,
      ca.summary,
      ca.sentiment,
      ca.predicted_csat,
      ca.coaching_insights,
      ca.objections,
      ca.talk_ratio
    FROM call_analyses ca
    JOIN calls c ON c.id = ca.call_id
    WHERE c.agent_id = $1
      AND c.created_at >= $2
      AND c.created_at <= $3
  `, [agentId, startDate, endDate]);

  // Aggregate metrics
  const totalCalls = calls.rows.length;
  const avgCSAT = calls.rows.reduce((sum, c) => sum + c.predicted_csat, 0) / totalCalls;

  const sentimentCounts = {
    positive: calls.rows.filter(c => c.sentiment === 'positive').length,
    neutral: calls.rows.filter(c => c.sentiment === 'neutral').length,
    negative: calls.rows.filter(c => c.sentiment === 'negative').length,
  };

  // Collect coaching categories
  const coachingCategories: Record<string, number> = {};
  for (const call of calls.rows) {
    for (const insight of call.coaching_insights || []) {
      coachingCategories[insight.category] = (coachingCategories[insight.category] || 0) + 1;
    }
  }

  // Top 3 areas for improvement
  const topAreas = Object.entries(coachingCategories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, count]) => ({ category, count }));

  // Store report
  await db.query(`
    INSERT INTO agent_performance_metrics (
      agent_id, tenant_id, period_start, period_end,
      total_calls, avg_predicted_csat, coaching_categories
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    agentId,
    req.user.tenant_id,
    startDate,
    endDate,
    totalCalls,
    avgCSAT,
    JSON.stringify(coachingCategories),
  ]);

  return {
    agent_id: agentId,
    period: { start: startDate, end: endDate },
    total_calls: totalCalls,
    avg_csat: avgCSAT,
    sentiment_distribution: sentimentCounts,
    top_coaching_areas: topAreas,
  };
}
```

---

## Cost Model

### OpenAI Costs

**Transcription (Whisper):**
- $0.006/minute
- 1M minutes/month = $6,000/month

**Transcription (Deepgram - Preferred):**
- $0.0043/minute
- 1M minutes/month = $4,300/month
- **Save $1,700/month vs Whisper**

**GPT-4 Analysis:**
- GPT-4 Turbo: $0.01/1K input tokens + $0.03/1K output tokens
- Avg call: 5 minutes = 750 words = 1,000 tokens input
- Analysis output: ~500 tokens
- Cost per call: (1K × $0.01) + (0.5K × $0.03) = **$0.025/call**
- 1M calls/month = $25,000/month

**Embeddings:**
- text-embedding-3-small: $0.02/1M tokens
- 200 tokens per summary × 1M calls = 200M tokens
- Cost: 200 × $0.02 = **$4/month**

**Total AI Costs (1M calls/month):**
- Transcription: $4,300
- Analysis: $25,000
- Embeddings: $4
- **Total: $29,304/month**

**Per-Call Cost: $0.029** (2.9¢)

**Pricing Model:**
- Charge: $0.10/call (10¢) for AI features
- Cost: $0.029/call (2.9¢)
- **Margin: 71%** 🚀

**Alternative (Budget Tier):**
- Skip GPT-4 analysis (offer basic transcription only)
- Charge: $0.02/call (2¢)
- Cost: $0.0043/call (0.4¢)
- **Margin: 78%**

---

## Summary

✅ **Real-time transcription** with Deepgram (200ms latency)
✅ **GPT-4 analysis** for summaries, sentiment, insights
✅ **Action item detection** & follow-up tracking
✅ **Agent coaching** with performance reports
✅ **Semantic search** across all calls (pgvector)
✅ **Compliance monitoring** (profanity, unauthorized promises)
✅ **71% gross margin** at scale

**Ready to compete with Gong & Chorus! 🤖✨**
