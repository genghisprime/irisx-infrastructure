-- WebRTC Audio Streaming Tables
-- Full WebRTC audio streaming support

-- WebRTC streaming sessions
CREATE TABLE IF NOT EXISTS webrtc_streaming_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    state VARCHAR(50) DEFAULT 'new',
    ice_gathering_state VARCHAR(50) DEFAULT 'new',
    connection_state VARCHAR(50) DEFAULT 'new',
    offer_sdp TEXT,
    answer_sdp TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    connected_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ
);

-- WebRTC ICE candidates
CREATE TABLE IF NOT EXISTS webrtc_ice_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES webrtc_streaming_sessions(id) ON DELETE CASCADE,
    candidate TEXT NOT NULL,
    sdp_mid VARCHAR(50),
    sdp_mline_index INTEGER,
    direction VARCHAR(20) DEFAULT 'remote',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WebRTC audio rooms (conferences)
CREATE TABLE IF NOT EXISTS webrtc_audio_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    max_participants INTEGER DEFAULT 10,
    record_room BOOLEAN DEFAULT false,
    state VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

-- WebRTC room participants
CREATE TABLE IF NOT EXISTS webrtc_room_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES webrtc_audio_rooms(id) ON DELETE CASCADE,
    stream_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(255),
    muted BOOLEAN DEFAULT false,
    speaking BOOLEAN DEFAULT false,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ
);

-- WebRTC stream statistics (for monitoring)
CREATE TABLE IF NOT EXISTS webrtc_stream_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    packets_received BIGINT DEFAULT 0,
    packets_sent BIGINT DEFAULT 0,
    bytes_received BIGINT DEFAULT 0,
    bytes_sent BIGINT DEFAULT 0,
    packets_lost BIGINT DEFAULT 0,
    jitter_ms DECIMAL(10, 4),
    round_trip_time_ms DECIMAL(10, 4),
    audio_level DECIMAL(5, 4),
    codec VARCHAR(50),
    sample_rate INTEGER,
    channels INTEGER,
    bitrate INTEGER,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- WebRTC recordings
CREATE TABLE IF NOT EXISTS webrtc_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id UUID NOT NULL,
    room_id UUID REFERENCES webrtc_audio_rooms(id) ON DELETE SET NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    filepath TEXT,
    s3_url TEXT,
    duration_sec DECIMAL(10, 2),
    file_size BIGINT,
    format VARCHAR(20) DEFAULT 'wav',
    sample_rate INTEGER DEFAULT 48000,
    channels INTEGER DEFAULT 2,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_webrtc_sessions_tenant ON webrtc_streaming_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_sessions_user ON webrtc_streaming_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_sessions_stream ON webrtc_streaming_sessions(stream_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_sessions_state ON webrtc_streaming_sessions(state);
CREATE INDEX IF NOT EXISTS idx_webrtc_ice_session ON webrtc_ice_candidates(session_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_rooms_tenant ON webrtc_audio_rooms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_rooms_state ON webrtc_audio_rooms(state);
CREATE INDEX IF NOT EXISTS idx_webrtc_participants_room ON webrtc_room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_stats_stream ON webrtc_stream_stats(stream_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_stats_recorded ON webrtc_stream_stats(recorded_at);
CREATE INDEX IF NOT EXISTS idx_webrtc_recordings_tenant ON webrtc_recordings(tenant_id);

-- Comments
COMMENT ON TABLE webrtc_streaming_sessions IS 'WebRTC streaming session SDP exchange';
COMMENT ON TABLE webrtc_ice_candidates IS 'ICE candidates for WebRTC sessions';
COMMENT ON TABLE webrtc_audio_rooms IS 'Audio conference rooms';
COMMENT ON TABLE webrtc_room_participants IS 'Participants in audio rooms';
COMMENT ON TABLE webrtc_stream_stats IS 'Stream quality statistics';
COMMENT ON TABLE webrtc_recordings IS 'WebRTC stream recordings';

COMMENT ON COLUMN webrtc_streaming_sessions.state IS 'Session state: new, connecting, connected, failed, closed';
COMMENT ON COLUMN webrtc_audio_rooms.state IS 'Room state: active, closed';
