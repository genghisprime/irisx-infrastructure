-- Video Calling & Screen Share with MediaSoup SFU
-- Extends existing WebRTC infrastructure (075_webrtc_streaming.sql)

-- MediaSoup worker instances (SFU workers)
CREATE TABLE IF NOT EXISTS mediasoup_workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id VARCHAR(100) NOT NULL UNIQUE,
    pid INTEGER,
    hostname VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    cpu_usage DECIMAL(5, 2),
    memory_usage BIGINT,
    active_routers INTEGER DEFAULT 0,
    max_routers INTEGER DEFAULT 100,
    rtp_port_range_start INTEGER DEFAULT 10000,
    rtp_port_range_end INTEGER DEFAULT 59999,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_heartbeat_at TIMESTAMPTZ DEFAULT NOW()
);

-- MediaSoup routers (one per video room)
CREATE TABLE IF NOT EXISTS mediasoup_routers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    router_id VARCHAR(100) NOT NULL UNIQUE,
    worker_id UUID NOT NULL REFERENCES mediasoup_workers(id) ON DELETE CASCADE,
    video_room_id UUID NOT NULL,
    media_codecs JSONB DEFAULT '[
        {"kind": "audio", "mimeType": "audio/opus", "clockRate": 48000, "channels": 2},
        {"kind": "video", "mimeType": "video/VP8", "clockRate": 90000},
        {"kind": "video", "mimeType": "video/VP9", "clockRate": 90000},
        {"kind": "video", "mimeType": "video/H264", "clockRate": 90000, "parameters": {"packetization-mode": 1, "profile-level-id": "42e01f", "level-asymmetry-allowed": 1}}
    ]',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

-- Video rooms (conference sessions)
CREATE TABLE IF NOT EXISTS video_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    room_code VARCHAR(20) UNIQUE,
    room_type VARCHAR(50) DEFAULT 'instant',
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    max_participants INTEGER DEFAULT 10,
    max_video_participants INTEGER DEFAULT 6,
    status VARCHAR(50) DEFAULT 'waiting',
    settings JSONB DEFAULT '{
        "video_enabled": true,
        "audio_enabled": true,
        "screenshare_enabled": true,
        "recording_enabled": false,
        "chat_enabled": true,
        "waiting_room_enabled": false,
        "require_authentication": true,
        "allow_anonymous_join": false,
        "max_duration_minutes": 120,
        "auto_record": false,
        "simulcast_enabled": true,
        "svc_enabled": false
    }',
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Video room participants
CREATE TABLE IF NOT EXISTS video_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_room_id UUID NOT NULL REFERENCES video_rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    participant_type VARCHAR(50) DEFAULT 'user',
    display_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(50) DEFAULT 'participant',
    status VARCHAR(50) DEFAULT 'joining',
    is_audio_enabled BOOLEAN DEFAULT true,
    is_video_enabled BOOLEAN DEFAULT false,
    is_screensharing BOOLEAN DEFAULT false,
    is_hand_raised BOOLEAN DEFAULT false,
    is_speaking BOOLEAN DEFAULT false,
    audio_level DECIMAL(5, 4) DEFAULT 0,
    device_info JSONB DEFAULT '{}',
    network_quality INTEGER DEFAULT 5,
    connection_id VARCHAR(100),
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    kick_reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- MediaSoup transports (WebRTC transports per participant)
CREATE TABLE IF NOT EXISTS mediasoup_transports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transport_id VARCHAR(100) NOT NULL UNIQUE,
    router_id UUID NOT NULL REFERENCES mediasoup_routers(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES video_participants(id) ON DELETE CASCADE,
    transport_type VARCHAR(50) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    ice_parameters JSONB,
    ice_candidates JSONB,
    dtls_parameters JSONB,
    sctp_parameters JSONB,
    status VARCHAR(50) DEFAULT 'new',
    ice_state VARCHAR(50) DEFAULT 'new',
    dtls_state VARCHAR(50) DEFAULT 'new',
    local_address VARCHAR(255),
    remote_address VARCHAR(255),
    bytes_sent BIGINT DEFAULT 0,
    bytes_received BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    connected_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);

-- MediaSoup producers (media senders)
CREATE TABLE IF NOT EXISTS mediasoup_producers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producer_id VARCHAR(100) NOT NULL UNIQUE,
    transport_id UUID NOT NULL REFERENCES mediasoup_transports(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES video_participants(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL,
    rtp_parameters JSONB NOT NULL,
    media_type VARCHAR(50) NOT NULL,
    is_paused BOOLEAN DEFAULT false,
    score JSONB,
    codec VARCHAR(50),
    spatial_layers INTEGER,
    temporal_layers INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

-- MediaSoup consumers (media receivers)
CREATE TABLE IF NOT EXISTS mediasoup_consumers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id VARCHAR(100) NOT NULL UNIQUE,
    transport_id UUID NOT NULL REFERENCES mediasoup_transports(id) ON DELETE CASCADE,
    producer_id UUID NOT NULL REFERENCES mediasoup_producers(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES video_participants(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL,
    rtp_parameters JSONB NOT NULL,
    is_paused BOOLEAN DEFAULT false,
    preferred_layers JSONB,
    current_layers JSONB,
    score JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

-- Video stream statistics (extends webrtc_stream_stats for video)
CREATE TABLE IF NOT EXISTS video_stream_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_room_id UUID NOT NULL REFERENCES video_rooms(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES video_participants(id) ON DELETE CASCADE,
    producer_id UUID REFERENCES mediasoup_producers(id) ON DELETE SET NULL,
    consumer_id UUID REFERENCES mediasoup_consumers(id) ON DELETE SET NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stat_type VARCHAR(20) NOT NULL,
    kind VARCHAR(20) NOT NULL,
    codec VARCHAR(50),
    bitrate INTEGER,
    packets_sent BIGINT DEFAULT 0,
    packets_received BIGINT DEFAULT 0,
    packets_lost BIGINT DEFAULT 0,
    bytes_sent BIGINT DEFAULT 0,
    bytes_received BIGINT DEFAULT 0,
    jitter_ms DECIMAL(10, 4),
    round_trip_time_ms DECIMAL(10, 4),
    fraction_lost DECIMAL(5, 4),
    frame_width INTEGER,
    frame_height INTEGER,
    frames_per_second DECIMAL(5, 2),
    frames_encoded INTEGER,
    frames_decoded INTEGER,
    frames_dropped INTEGER,
    key_frames_encoded INTEGER,
    pli_count INTEGER,
    fir_count INTEGER,
    nack_count INTEGER,
    quality_limitation_reason VARCHAR(50),
    cpu_limited_resolution BOOLEAN DEFAULT false,
    bandwidth_limited_resolution BOOLEAN DEFAULT false,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Video recordings
CREATE TABLE IF NOT EXISTS video_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_room_id UUID NOT NULL REFERENCES video_rooms(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recording_type VARCHAR(50) DEFAULT 'composite',
    status VARCHAR(50) DEFAULT 'recording',
    format VARCHAR(20) DEFAULT 'mp4',
    resolution VARCHAR(20) DEFAULT '1280x720',
    framerate INTEGER DEFAULT 30,
    bitrate INTEGER DEFAULT 2500000,
    s3_bucket VARCHAR(255),
    s3_key TEXT,
    s3_url TEXT,
    presigned_url TEXT,
    presigned_url_expires_at TIMESTAMPTZ,
    file_size BIGINT,
    duration_seconds DECIMAL(10, 2),
    thumbnail_url TEXT,
    transcription_status VARCHAR(50),
    transcription_text TEXT,
    metadata JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    stopped_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Video recording segments (for individual participant recordings)
CREATE TABLE IF NOT EXISTS video_recording_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_id UUID NOT NULL REFERENCES video_recordings(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES video_participants(id) ON DELETE CASCADE,
    segment_type VARCHAR(50) NOT NULL,
    s3_key TEXT,
    s3_url TEXT,
    file_size BIGINT,
    duration_seconds DECIMAL(10, 2),
    start_offset_seconds DECIMAL(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Video call invitations
CREATE TABLE IF NOT EXISTS video_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_room_id UUID NOT NULL REFERENCES video_rooms(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    invited_email VARCHAR(255),
    invited_phone VARCHAR(50),
    invitation_type VARCHAR(50) DEFAULT 'email',
    status VARCHAR(50) DEFAULT 'pending',
    token VARCHAR(255) UNIQUE NOT NULL,
    message TEXT,
    sent_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Video room chat messages
CREATE TABLE IF NOT EXISTS video_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_room_id UUID NOT NULL REFERENCES video_rooms(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES video_participants(id) ON DELETE CASCADE,
    message_type VARCHAR(50) DEFAULT 'text',
    content TEXT NOT NULL,
    reply_to_id UUID REFERENCES video_chat_messages(id) ON DELETE SET NULL,
    is_private BOOLEAN DEFAULT false,
    private_to_id UUID REFERENCES video_participants(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

-- Video call quality alerts
CREATE TABLE IF NOT EXISTS video_quality_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_room_id UUID NOT NULL REFERENCES video_rooms(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES video_participants(id) ON DELETE SET NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    metric_name VARCHAR(100),
    metric_value DECIMAL(15, 4),
    threshold_value DECIMAL(15, 4),
    resolved_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant video settings
CREATE TABLE IF NOT EXISTS tenant_video_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    video_enabled BOOLEAN DEFAULT true,
    max_concurrent_rooms INTEGER DEFAULT 10,
    max_room_participants INTEGER DEFAULT 25,
    max_room_duration_minutes INTEGER DEFAULT 240,
    default_video_quality VARCHAR(20) DEFAULT 'hd',
    simulcast_enabled BOOLEAN DEFAULT true,
    recording_enabled BOOLEAN DEFAULT true,
    recording_storage_provider VARCHAR(50) DEFAULT 's3',
    recording_retention_days INTEGER DEFAULT 90,
    transcription_enabled BOOLEAN DEFAULT false,
    ai_summary_enabled BOOLEAN DEFAULT false,
    branding JSONB DEFAULT '{
        "logo_url": null,
        "background_color": "#1a1a1a",
        "primary_color": "#3b82f6",
        "waiting_room_message": "Please wait, the host will let you in shortly."
    }',
    ice_servers JSONB DEFAULT '[
        {"urls": ["stun:stun.l.google.com:19302"]},
        {"urls": ["stun:stun1.l.google.com:19302"]}
    ]',
    turn_servers JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Platform video configuration (admin-managed)
CREATE TABLE IF NOT EXISTS platform_video_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value JSONB NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default platform video configuration
INSERT INTO platform_video_config (config_key, config_value, description) VALUES
('mediasoup_settings', '{
    "numWorkers": 4,
    "workerSettings": {
        "logLevel": "warn",
        "logTags": ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
        "rtcMinPort": 10000,
        "rtcMaxPort": 59999
    },
    "routerMediaCodecs": [
        {"kind": "audio", "mimeType": "audio/opus", "clockRate": 48000, "channels": 2},
        {"kind": "video", "mimeType": "video/VP8", "clockRate": 90000},
        {"kind": "video", "mimeType": "video/VP9", "clockRate": 90000},
        {"kind": "video", "mimeType": "video/H264", "clockRate": 90000, "parameters": {"packetization-mode": 1, "profile-level-id": "42e01f", "level-asymmetry-allowed": 1}}
    ],
    "webRtcTransportOptions": {
        "listenIps": [{"ip": "0.0.0.0", "announcedIp": null}],
        "enableUdp": true,
        "enableTcp": true,
        "preferUdp": true,
        "initialAvailableOutgoingBitrate": 1000000,
        "minimumAvailableOutgoingBitrate": 600000,
        "maxSctpMessageSize": 262144,
        "maxIncomingBitrate": 1500000
    }
}', 'MediaSoup server configuration'),
('video_quality_presets', '{
    "low": {"width": 640, "height": 360, "frameRate": 15, "bitrate": 500000},
    "sd": {"width": 854, "height": 480, "frameRate": 24, "bitrate": 1000000},
    "hd": {"width": 1280, "height": 720, "frameRate": 30, "bitrate": 2500000},
    "fhd": {"width": 1920, "height": 1080, "frameRate": 30, "bitrate": 4000000}
}', 'Video quality presets'),
('recording_settings', '{
    "format": "mp4",
    "codec": "h264",
    "audioCodec": "aac",
    "compositeLayout": "grid",
    "thumbnailInterval": 60,
    "segmentDuration": 30
}', 'Video recording configuration'),
('ice_servers', '{
    "stun": [
        {"urls": ["stun:stun.l.google.com:19302"]},
        {"urls": ["stun:stun1.l.google.com:19302"]},
        {"urls": ["stun:stun2.l.google.com:19302"]}
    ],
    "turn": []
}', 'ICE/STUN/TURN server configuration')
ON CONFLICT (config_key) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mediasoup_workers_status ON mediasoup_workers(status);
CREATE INDEX IF NOT EXISTS idx_mediasoup_routers_worker ON mediasoup_routers(worker_id);
CREATE INDEX IF NOT EXISTS idx_mediasoup_routers_room ON mediasoup_routers(video_room_id);
CREATE INDEX IF NOT EXISTS idx_video_rooms_tenant ON video_rooms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_video_rooms_status ON video_rooms(status);
CREATE INDEX IF NOT EXISTS idx_video_rooms_code ON video_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_video_rooms_created_by ON video_rooms(created_by);
CREATE INDEX IF NOT EXISTS idx_video_rooms_scheduled ON video_rooms(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_video_participants_room ON video_participants(video_room_id);
CREATE INDEX IF NOT EXISTS idx_video_participants_user ON video_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_video_participants_status ON video_participants(status);
CREATE INDEX IF NOT EXISTS idx_mediasoup_transports_router ON mediasoup_transports(router_id);
CREATE INDEX IF NOT EXISTS idx_mediasoup_transports_participant ON mediasoup_transports(participant_id);
CREATE INDEX IF NOT EXISTS idx_mediasoup_producers_transport ON mediasoup_producers(transport_id);
CREATE INDEX IF NOT EXISTS idx_mediasoup_producers_participant ON mediasoup_producers(participant_id);
CREATE INDEX IF NOT EXISTS idx_mediasoup_consumers_transport ON mediasoup_consumers(transport_id);
CREATE INDEX IF NOT EXISTS idx_mediasoup_consumers_producer ON mediasoup_consumers(producer_id);
CREATE INDEX IF NOT EXISTS idx_video_stream_stats_room ON video_stream_stats(video_room_id);
CREATE INDEX IF NOT EXISTS idx_video_stream_stats_participant ON video_stream_stats(participant_id);
CREATE INDEX IF NOT EXISTS idx_video_stream_stats_recorded ON video_stream_stats(recorded_at);
CREATE INDEX IF NOT EXISTS idx_video_recordings_room ON video_recordings(video_room_id);
CREATE INDEX IF NOT EXISTS idx_video_recordings_tenant ON video_recordings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_video_recordings_status ON video_recordings(status);
CREATE INDEX IF NOT EXISTS idx_video_invitations_room ON video_invitations(video_room_id);
CREATE INDEX IF NOT EXISTS idx_video_invitations_token ON video_invitations(token);
CREATE INDEX IF NOT EXISTS idx_video_chat_room ON video_chat_messages(video_room_id);
CREATE INDEX IF NOT EXISTS idx_video_quality_alerts_room ON video_quality_alerts(video_room_id);
CREATE INDEX IF NOT EXISTS idx_video_quality_alerts_tenant ON video_quality_alerts(tenant_id);

-- Comments
COMMENT ON TABLE mediasoup_workers IS 'MediaSoup SFU worker instances for video processing';
COMMENT ON TABLE mediasoup_routers IS 'MediaSoup routers - one per video room for media routing';
COMMENT ON TABLE video_rooms IS 'Video calling rooms/sessions';
COMMENT ON TABLE video_participants IS 'Participants in video rooms';
COMMENT ON TABLE mediasoup_transports IS 'WebRTC transports for each participant';
COMMENT ON TABLE mediasoup_producers IS 'Media producers (senders) in MediaSoup';
COMMENT ON TABLE mediasoup_consumers IS 'Media consumers (receivers) in MediaSoup';
COMMENT ON TABLE video_stream_stats IS 'Video stream quality statistics';
COMMENT ON TABLE video_recordings IS 'Video call recordings';
COMMENT ON TABLE video_recording_segments IS 'Individual participant recording segments';
COMMENT ON TABLE video_invitations IS 'Video call invitations';
COMMENT ON TABLE video_chat_messages IS 'In-call chat messages';
COMMENT ON TABLE video_quality_alerts IS 'Video call quality alerts and warnings';
COMMENT ON TABLE tenant_video_settings IS 'Per-tenant video calling configuration';
COMMENT ON TABLE platform_video_config IS 'Platform-wide video configuration (admin managed)';

COMMENT ON COLUMN video_rooms.room_type IS 'instant, scheduled, recurring, webinar';
COMMENT ON COLUMN video_rooms.status IS 'waiting, active, ended, cancelled';
COMMENT ON COLUMN video_participants.participant_type IS 'user, guest, agent, supervisor';
COMMENT ON COLUMN video_participants.role IS 'host, co-host, participant, viewer';
COMMENT ON COLUMN video_participants.status IS 'joining, connected, reconnecting, disconnected, kicked';
COMMENT ON COLUMN mediasoup_transports.transport_type IS 'webrtc, plain, pipe';
COMMENT ON COLUMN mediasoup_transports.direction IS 'send, recv';
COMMENT ON COLUMN mediasoup_producers.kind IS 'audio, video';
COMMENT ON COLUMN mediasoup_producers.media_type IS 'camera, screenshare, mic';
COMMENT ON COLUMN video_recordings.recording_type IS 'composite (single video), individual (per-participant)';
COMMENT ON COLUMN video_quality_alerts.severity IS 'info, warning, critical';
