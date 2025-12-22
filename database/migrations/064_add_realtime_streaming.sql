-- Migration: 064_add_realtime_streaming.sql
-- Description: Real-time WebSocket streaming for transcripts and events
-- Date: December 16, 2025

-- ===========================================
-- STREAMING SESSIONS
-- ===========================================

-- Track active streaming sessions
CREATE TABLE IF NOT EXISTS streaming_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    connection_id VARCHAR(255), -- WebSocket connection identifier
    stream_types TEXT[] DEFAULT '{"transcript"}', -- transcript, metrics, events, quality
    call_id UUID REFERENCES cdrs(id), -- Optional: specific call to stream
    status VARCHAR(50) DEFAULT 'connected', -- connected, disconnected, reconnecting
    client_info JSONB DEFAULT '{}', -- User agent, IP, etc.
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    disconnected_at TIMESTAMP WITH TIME ZONE,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    bytes_sent BIGINT DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_streaming_sessions_tenant ON streaming_sessions(tenant_id);
CREATE INDEX idx_streaming_sessions_user ON streaming_sessions(user_id);
CREATE INDEX idx_streaming_sessions_token ON streaming_sessions(session_token);
CREATE INDEX idx_streaming_sessions_status ON streaming_sessions(status);
CREATE INDEX idx_streaming_sessions_call ON streaming_sessions(call_id);

-- ===========================================
-- TRANSCRIPT CHUNKS (Real-time streaming buffer)
-- ===========================================

-- Store transcript chunks for streaming and replay
CREATE TABLE IF NOT EXISTS transcript_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES cdrs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL, -- Ordering
    speaker VARCHAR(50) DEFAULT 'unknown', -- agent, customer, unknown
    text TEXT NOT NULL,
    confidence DECIMAL(5, 4), -- 0.0000 to 1.0000
    start_time_ms INTEGER NOT NULL, -- Milliseconds from call start
    end_time_ms INTEGER NOT NULL,
    is_final BOOLEAN DEFAULT false, -- Final vs interim transcript
    language VARCHAR(10) DEFAULT 'en-US',
    word_timestamps JSONB, -- [{word, start, end, confidence}]
    sentiment VARCHAR(20), -- positive, negative, neutral
    sentiment_score DECIMAL(5, 4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transcript_chunks_call ON transcript_chunks(call_id);
CREATE INDEX idx_transcript_chunks_tenant ON transcript_chunks(tenant_id);
CREATE INDEX idx_transcript_chunks_call_index ON transcript_chunks(call_id, chunk_index);
CREATE INDEX idx_transcript_chunks_created ON transcript_chunks(created_at);

-- ===========================================
-- STREAMING EVENTS
-- ===========================================

-- Generic event stream for real-time updates
CREATE TABLE IF NOT EXISTS streaming_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL, -- transcript.chunk, call.started, call.ended, quality.alert, agent.status
    entity_type VARCHAR(50), -- call, agent, queue, campaign
    entity_id UUID, -- The ID of the entity this event relates to
    payload JSONB NOT NULL DEFAULT '{}',
    priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, critical
    broadcast_scope VARCHAR(50) DEFAULT 'tenant', -- tenant, user, call, queue, global
    target_users UUID[], -- Specific users to receive (null = all in scope)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour')
);

CREATE INDEX idx_streaming_events_tenant ON streaming_events(tenant_id);
CREATE INDEX idx_streaming_events_type ON streaming_events(event_type);
CREATE INDEX idx_streaming_events_entity ON streaming_events(entity_type, entity_id);
CREATE INDEX idx_streaming_events_created ON streaming_events(created_at);
CREATE INDEX idx_streaming_events_expires ON streaming_events(expires_at);

-- ===========================================
-- STREAMING SUBSCRIPTIONS
-- ===========================================

-- Track what each session is subscribed to
CREATE TABLE IF NOT EXISTS streaming_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES streaming_sessions(id) ON DELETE CASCADE,
    subscription_type VARCHAR(50) NOT NULL, -- call, queue, agent, campaign, tenant
    subscription_id UUID, -- The specific entity ID (null = all of type)
    event_types TEXT[], -- Filter to specific event types (null = all)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_streaming_subs_session ON streaming_subscriptions(session_id);
CREATE INDEX idx_streaming_subs_type ON streaming_subscriptions(subscription_type, subscription_id);

-- ===========================================
-- CALL QUALITY METRICS STREAM
-- ===========================================

-- Real-time quality metrics for streaming
CREATE TABLE IF NOT EXISTS quality_metrics_stream (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES cdrs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    timestamp_ms INTEGER NOT NULL, -- Milliseconds from call start
    jitter_ms DECIMAL(10, 2),
    packet_loss_pct DECIMAL(5, 2),
    rtt_ms DECIMAL(10, 2), -- Round-trip time
    mos_score DECIMAL(3, 2),
    bitrate_kbps INTEGER,
    audio_level_db DECIMAL(5, 2),
    silence_pct DECIMAL(5, 2), -- Percentage of silence in this interval
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_quality_stream_call ON quality_metrics_stream(call_id);
CREATE INDEX idx_quality_stream_tenant ON quality_metrics_stream(tenant_id);
CREATE INDEX idx_quality_stream_timestamp ON quality_metrics_stream(call_id, timestamp_ms);

-- ===========================================
-- AGENT STATUS STREAM
-- ===========================================

-- Track agent status changes for real-time display
CREATE TABLE IF NOT EXISTS agent_status_stream (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL, -- available, busy, away, offline, on_call, wrap_up
    status_reason VARCHAR(255), -- Break, lunch, meeting, etc.
    call_id UUID REFERENCES cdrs(id), -- Current call if on_call
    queue_id UUID REFERENCES queues(id),
    duration_previous_ms INTEGER, -- How long they were in previous status
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agent_status_stream_tenant ON agent_status_stream(tenant_id);
CREATE INDEX idx_agent_status_stream_agent ON agent_status_stream(agent_id);
CREATE INDEX idx_agent_status_stream_created ON agent_status_stream(created_at);

-- ===========================================
-- STREAMING ANALYTICS
-- ===========================================

-- Track streaming usage and performance
CREATE TABLE IF NOT EXISTS streaming_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_sessions INTEGER DEFAULT 0,
    peak_concurrent INTEGER DEFAULT 0,
    total_messages BIGINT DEFAULT 0,
    total_bytes BIGINT DEFAULT 0,
    transcript_chunks_streamed INTEGER DEFAULT 0,
    quality_updates_streamed INTEGER DEFAULT 0,
    event_updates_streamed INTEGER DEFAULT 0,
    avg_latency_ms DECIMAL(10, 2),
    max_latency_ms DECIMAL(10, 2),
    connection_errors INTEGER DEFAULT 0,
    reconnections INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, date)
);

CREATE INDEX idx_streaming_analytics_tenant_date ON streaming_analytics(tenant_id, date);

-- ===========================================
-- FUNCTIONS FOR STREAMING
-- ===========================================

-- Function to publish streaming event
CREATE OR REPLACE FUNCTION publish_streaming_event(
    p_tenant_id UUID,
    p_event_type VARCHAR(100),
    p_entity_type VARCHAR(50),
    p_entity_id UUID,
    p_payload JSONB,
    p_priority VARCHAR(20) DEFAULT 'normal',
    p_broadcast_scope VARCHAR(50) DEFAULT 'tenant',
    p_target_users UUID[] DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
BEGIN
    INSERT INTO streaming_events (
        tenant_id, event_type, entity_type, entity_id, payload,
        priority, broadcast_scope, target_users
    )
    VALUES (
        p_tenant_id, p_event_type, p_entity_type, p_entity_id, p_payload,
        p_priority, p_broadcast_scope, p_target_users
    )
    RETURNING id INTO v_event_id;

    -- Notify listeners via PostgreSQL NOTIFY
    PERFORM pg_notify(
        'streaming_events',
        json_build_object(
            'event_id', v_event_id,
            'tenant_id', p_tenant_id,
            'event_type', p_event_type,
            'entity_type', p_entity_type,
            'entity_id', p_entity_id,
            'priority', p_priority,
            'scope', p_broadcast_scope
        )::text
    );

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get pending events for a session
CREATE OR REPLACE FUNCTION get_pending_events_for_session(
    p_session_id UUID,
    p_since TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    event_id UUID,
    event_type VARCHAR(100),
    entity_type VARCHAR(50),
    entity_id UUID,
    payload JSONB,
    priority VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    WITH session_info AS (
        SELECT
            ss.tenant_id,
            ss.user_id,
            array_agg(DISTINCT sub.subscription_type) as sub_types,
            array_agg(DISTINCT sub.subscription_id) FILTER (WHERE sub.subscription_id IS NOT NULL) as sub_ids
        FROM streaming_sessions ss
        LEFT JOIN streaming_subscriptions sub ON sub.session_id = ss.id
        WHERE ss.id = p_session_id
        GROUP BY ss.tenant_id, ss.user_id
    )
    SELECT
        e.id,
        e.event_type,
        e.entity_type,
        e.entity_id,
        e.payload,
        e.priority,
        e.created_at
    FROM streaming_events e
    JOIN session_info si ON (
        -- Match tenant scope
        (e.broadcast_scope = 'tenant' AND e.tenant_id = si.tenant_id)
        OR
        -- Match user scope
        (e.broadcast_scope = 'user' AND si.user_id = ANY(e.target_users))
        OR
        -- Match global scope
        (e.broadcast_scope = 'global')
        OR
        -- Match entity scope (subscriptions)
        (e.entity_type = ANY(si.sub_types) AND (e.entity_id = ANY(si.sub_ids) OR si.sub_ids IS NULL))
    )
    WHERE
        e.expires_at > CURRENT_TIMESTAMP
        AND (p_since IS NULL OR e.created_at > p_since)
    ORDER BY e.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to record transcript chunk
CREATE OR REPLACE FUNCTION record_transcript_chunk(
    p_call_id UUID,
    p_tenant_id UUID,
    p_speaker VARCHAR(50),
    p_text TEXT,
    p_confidence DECIMAL(5,4),
    p_start_time_ms INTEGER,
    p_end_time_ms INTEGER,
    p_is_final BOOLEAN,
    p_word_timestamps JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_chunk_id UUID;
    v_chunk_index INTEGER;
BEGIN
    -- Get next chunk index
    SELECT COALESCE(MAX(chunk_index), -1) + 1
    INTO v_chunk_index
    FROM transcript_chunks
    WHERE call_id = p_call_id;

    -- Insert chunk
    INSERT INTO transcript_chunks (
        call_id, tenant_id, chunk_index, speaker, text, confidence,
        start_time_ms, end_time_ms, is_final, word_timestamps
    )
    VALUES (
        p_call_id, p_tenant_id, v_chunk_index, p_speaker, p_text, p_confidence,
        p_start_time_ms, p_end_time_ms, p_is_final, p_word_timestamps
    )
    RETURNING id INTO v_chunk_id;

    -- Publish event
    PERFORM publish_streaming_event(
        p_tenant_id,
        'transcript.chunk',
        'call',
        p_call_id,
        json_build_object(
            'chunk_id', v_chunk_id,
            'chunk_index', v_chunk_index,
            'speaker', p_speaker,
            'text', p_text,
            'confidence', p_confidence,
            'start_time_ms', p_start_time_ms,
            'end_time_ms', p_end_time_ms,
            'is_final', p_is_final
        )::jsonb,
        'normal',
        'call'
    );

    RETURN v_chunk_id;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- CLEANUP PROCEDURES
-- ===========================================

-- Clean up old streaming data
CREATE OR REPLACE FUNCTION cleanup_streaming_data(
    p_retention_days INTEGER DEFAULT 7
)
RETURNS TABLE (
    expired_events INTEGER,
    old_sessions INTEGER,
    old_chunks INTEGER
) AS $$
DECLARE
    v_expired_events INTEGER;
    v_old_sessions INTEGER;
    v_old_chunks INTEGER;
BEGIN
    -- Delete expired events
    DELETE FROM streaming_events WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS v_expired_events = ROW_COUNT;

    -- Delete old disconnected sessions
    DELETE FROM streaming_sessions
    WHERE status = 'disconnected'
      AND disconnected_at < CURRENT_TIMESTAMP - (p_retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS v_old_sessions = ROW_COUNT;

    -- Delete old transcript chunks (keep longer)
    DELETE FROM transcript_chunks
    WHERE created_at < CURRENT_TIMESTAMP - (p_retention_days * 4 || ' days')::INTERVAL;
    GET DIAGNOSTICS v_old_chunks = ROW_COUNT;

    RETURN QUERY SELECT v_expired_events, v_old_sessions, v_old_chunks;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- INITIAL ANALYTICS ROW
-- ===========================================

-- Trigger to create daily analytics row
CREATE OR REPLACE FUNCTION ensure_streaming_analytics_exists()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO streaming_analytics (tenant_id, date)
    VALUES (NEW.tenant_id, CURRENT_DATE)
    ON CONFLICT (tenant_id, date) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ensure_streaming_analytics
    AFTER INSERT ON streaming_sessions
    FOR EACH ROW
    EXECUTE FUNCTION ensure_streaming_analytics_exists();

-- ===========================================
-- GRANTS
-- ===========================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO irisx_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO irisx_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO irisx_admin;
