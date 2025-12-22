/**
 * WebRTC Audio Streaming Service
 *
 * Full WebRTC audio streaming implementation for real-time communications
 * - Browser-to-FreeSWITCH audio streaming
 * - Real-time audio processing
 * - Audio capture and recording
 * - Stream quality monitoring
 * - Multi-party audio conferencing support
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { query } from '../db/connection.js';

// STUN/TURN server configuration
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

// Audio codec preferences
const AUDIO_CODECS = {
  OPUS: { mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  PCMU: { mimeType: 'audio/PCMU', clockRate: 8000, channels: 1 },
  PCMA: { mimeType: 'audio/PCMA', clockRate: 8000, channels: 1 },
  G722: { mimeType: 'audio/G722', clockRate: 16000, channels: 1 }
};

// Stream states
const STREAM_STATES = {
  INITIALIZING: 'initializing',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  STREAMING: 'streaming',
  PAUSED: 'paused',
  DISCONNECTED: 'disconnected',
  ERROR: 'error'
};

/**
 * WebRTC Audio Stream
 * Represents a single audio stream connection
 */
class WebRTCAudioStream extends EventEmitter {
  constructor(options) {
    super();

    this.id = crypto.randomUUID();
    this.tenantId = options.tenantId;
    this.userId = options.userId;
    this.callId = options.callId;
    this.direction = options.direction || 'bidirectional';
    this.state = STREAM_STATES.INITIALIZING;
    this.codec = options.codec || 'opus';
    this.sampleRate = options.sampleRate || 48000;
    this.channels = options.channels || 2;
    this.bitrate = options.bitrate || 64000;

    this.stats = {
      packetsReceived: 0,
      packetsSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
      packetsLost: 0,
      jitter: 0,
      roundTripTime: 0,
      audioLevel: 0,
      startedAt: null,
      lastActivityAt: null
    };

    this.audioBuffer = [];
    this.recordingBuffer = [];
    this.isRecording = false;

    this.createdAt = new Date();
    this.connectedAt = null;
  }

  /**
   * Update stream state
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.emit('stateChange', { oldState, newState, streamId: this.id });

    if (newState === STREAM_STATES.CONNECTED) {
      this.connectedAt = new Date();
      this.stats.startedAt = this.connectedAt;
    }
  }

  /**
   * Process incoming audio data
   */
  processAudioData(data) {
    this.stats.packetsReceived++;
    this.stats.bytesReceived += data.length;
    this.stats.lastActivityAt = new Date();

    // Calculate audio level (RMS)
    if (data.length > 0) {
      let sum = 0;
      for (let i = 0; i < data.length; i += 2) {
        const sample = data.readInt16LE(i);
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / (data.length / 2));
      this.stats.audioLevel = Math.min(1, rms / 32768);
    }

    // Add to buffer for processing
    this.audioBuffer.push({
      data,
      timestamp: Date.now()
    });

    // Keep buffer manageable (last 10 seconds)
    while (this.audioBuffer.length > 500) {
      this.audioBuffer.shift();
    }

    // Recording
    if (this.isRecording) {
      this.recordingBuffer.push(data);
    }

    this.emit('audioData', { streamId: this.id, data, level: this.stats.audioLevel });
  }

  /**
   * Send audio data
   */
  sendAudioData(data) {
    this.stats.packetsSent++;
    this.stats.bytesSent += data.length;
    this.stats.lastActivityAt = new Date();

    this.emit('sendAudio', { streamId: this.id, data });
  }

  /**
   * Update stream statistics
   */
  updateStats(newStats) {
    Object.assign(this.stats, newStats);
    this.emit('statsUpdate', { streamId: this.id, stats: this.stats });
  }

  /**
   * Start recording
   */
  startRecording() {
    this.isRecording = true;
    this.recordingBuffer = [];
    this.emit('recordingStarted', { streamId: this.id });
  }

  /**
   * Stop recording and return buffer
   */
  stopRecording() {
    this.isRecording = false;
    const recording = Buffer.concat(this.recordingBuffer);
    this.recordingBuffer = [];
    this.emit('recordingStopped', { streamId: this.id, size: recording.length });
    return recording;
  }

  /**
   * Get stream info
   */
  getInfo() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      userId: this.userId,
      callId: this.callId,
      direction: this.direction,
      state: this.state,
      codec: this.codec,
      sampleRate: this.sampleRate,
      channels: this.channels,
      bitrate: this.bitrate,
      stats: this.stats,
      isRecording: this.isRecording,
      createdAt: this.createdAt,
      connectedAt: this.connectedAt,
      duration: this.connectedAt
        ? Math.floor((Date.now() - this.connectedAt.getTime()) / 1000)
        : 0
    };
  }

  /**
   * Close stream
   */
  close() {
    this.setState(STREAM_STATES.DISCONNECTED);
    this.removeAllListeners();
  }
}

/**
 * WebRTC Audio Streaming Service
 */
class WebRTCStreamingService extends EventEmitter {
  constructor() {
    super();

    this.streams = new Map();
    this.rooms = new Map();
    this.sessions = new Map();

    // Configuration
    this.config = {
      iceServers: ICE_SERVERS,
      preferredCodec: 'opus',
      maxStreamsPerUser: 5,
      maxRoomParticipants: 50,
      heartbeatInterval: 5000,
      sessionTimeout: 300000 // 5 minutes
    };

    // Add TURN server if configured
    if (process.env.TURN_SERVER_URL) {
      this.config.iceServers.push({
        urls: process.env.TURN_SERVER_URL,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL
      });
    }

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  // ============================================
  // Stream Management
  // ============================================

  /**
   * Create a new audio stream
   */
  createStream(options) {
    const {
      tenantId,
      userId,
      callId,
      direction = 'bidirectional',
      codec = 'opus',
      sampleRate = 48000,
      channels = 2,
      bitrate = 64000
    } = options;

    // Check stream limits
    const userStreams = Array.from(this.streams.values())
      .filter(s => s.userId === userId && s.state !== STREAM_STATES.DISCONNECTED);

    if (userStreams.length >= this.config.maxStreamsPerUser) {
      throw new Error(`Maximum streams per user (${this.config.maxStreamsPerUser}) exceeded`);
    }

    const stream = new WebRTCAudioStream({
      tenantId,
      userId,
      callId,
      direction,
      codec,
      sampleRate,
      channels,
      bitrate
    });

    // Set up event forwarding
    stream.on('stateChange', (data) => this.emit('streamStateChange', data));
    stream.on('audioData', (data) => this.emit('streamAudioData', data));
    stream.on('statsUpdate', (data) => this.emit('streamStatsUpdate', data));

    this.streams.set(stream.id, stream);

    console.log(`[WebRTC Streaming] Created stream ${stream.id} for user ${userId}`);

    return stream;
  }

  /**
   * Get stream by ID
   */
  getStream(streamId) {
    return this.streams.get(streamId);
  }

  /**
   * Get streams for a call
   */
  getCallStreams(callId) {
    return Array.from(this.streams.values())
      .filter(s => s.callId === callId);
  }

  /**
   * Get streams for a user
   */
  getUserStreams(userId) {
    return Array.from(this.streams.values())
      .filter(s => s.userId === userId);
  }

  /**
   * Close a stream
   */
  closeStream(streamId) {
    const stream = this.streams.get(streamId);
    if (stream) {
      stream.close();
      this.streams.delete(streamId);
      console.log(`[WebRTC Streaming] Closed stream ${streamId}`);
    }
  }

  // ============================================
  // Session Management
  // ============================================

  /**
   * Create streaming session (for SDP exchange)
   */
  async createSession(options) {
    const {
      tenantId,
      userId,
      callId,
      offerSdp,
      audioConfig = {}
    } = options;

    const sessionId = crypto.randomUUID();

    // Create stream
    const stream = this.createStream({
      tenantId,
      userId,
      callId,
      ...audioConfig
    });

    // Generate SDP answer (simplified - real implementation would use WebRTC library)
    const answerSdp = this.generateSdpAnswer(offerSdp, stream);

    const session = {
      id: sessionId,
      streamId: stream.id,
      tenantId,
      userId,
      callId,
      offerSdp,
      answerSdp,
      iceGatheringState: 'new',
      iceCandidates: [],
      localCandidates: [],
      state: 'new',
      createdAt: new Date()
    };

    this.sessions.set(sessionId, session);

    // Store session in database
    await this.saveSession(session);

    return {
      sessionId,
      streamId: stream.id,
      answerSdp,
      iceServers: this.config.iceServers
    };
  }

  /**
   * Generate SDP answer (simplified)
   */
  generateSdpAnswer(offerSdp, stream) {
    // This is a simplified SDP answer generator
    // Real implementation would parse the offer and generate proper answer
    const sessionId = crypto.randomBytes(8).toString('hex');

    return `v=0
o=- ${sessionId} 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE 0
a=extmap-allow-mixed
a=msid-semantic: WMS
m=audio 9 UDP/TLS/RTP/SAVPF 111 63 103 104 9 0 8 106 105 13 110 112 113 126
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:${crypto.randomBytes(4).toString('hex')}
a=ice-pwd:${crypto.randomBytes(16).toString('base64')}
a=ice-options:trickle
a=fingerprint:sha-256 ${this.generateFingerprint()}
a=setup:active
a=mid:0
a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level
a=extmap:2 http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time
a=recvonly
a=rtcp-mux
a=rtpmap:111 opus/48000/2
a=rtcp-fb:111 transport-cc
a=fmtp:111 minptime=10;useinbandfec=1
a=rtpmap:9 G722/8000
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000`;
  }

  /**
   * Generate fingerprint for DTLS
   */
  generateFingerprint() {
    const bytes = crypto.randomBytes(32);
    return bytes.toString('hex').match(/.{2}/g).join(':').toUpperCase();
  }

  /**
   * Add ICE candidate to session
   */
  async addIceCandidate(sessionId, candidate) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.iceCandidates.push(candidate);

    // Check if we can start connection
    if (session.iceCandidates.length > 0 && session.state === 'new') {
      session.state = 'connecting';
      const stream = this.streams.get(session.streamId);
      if (stream) {
        stream.setState(STREAM_STATES.CONNECTING);
      }
    }

    return { success: true };
  }

  /**
   * Get session info
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Save session to database
   */
  async saveSession(session) {
    try {
      await query(`
        INSERT INTO webrtc_streaming_sessions (
          id, stream_id, tenant_id, user_id, call_id,
          state, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        session.id, session.streamId, session.tenantId,
        session.userId, session.callId, session.state, session.createdAt
      ]);
    } catch (error) {
      console.error('[WebRTC Streaming] Error saving session:', error);
    }
  }

  // ============================================
  // Audio Room Management (Conferences)
  // ============================================

  /**
   * Create audio room for conferencing
   */
  createRoom(options) {
    const {
      tenantId,
      name,
      callId,
      maxParticipants = 10,
      recordRoom = false
    } = options;

    const roomId = crypto.randomUUID();

    const room = {
      id: roomId,
      tenantId,
      name,
      callId,
      maxParticipants: Math.min(maxParticipants, this.config.maxRoomParticipants),
      participants: new Map(),
      recordRoom,
      recordingBuffer: recordRoom ? [] : null,
      state: 'active',
      createdAt: new Date()
    };

    this.rooms.set(roomId, room);

    console.log(`[WebRTC Streaming] Created room ${roomId}: ${name}`);

    return room;
  }

  /**
   * Join audio room
   */
  async joinRoom(roomId, streamId, options = {}) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.state !== 'active') {
      throw new Error('Room is not active');
    }

    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error('Stream not found');
    }

    if (room.participants.size >= room.maxParticipants) {
      throw new Error('Room is full');
    }

    const participant = {
      streamId,
      userId: stream.userId,
      displayName: options.displayName || `User ${stream.userId}`,
      muted: options.muted || false,
      joinedAt: new Date()
    };

    room.participants.set(streamId, participant);

    // Set up audio mixing
    stream.on('audioData', (data) => {
      if (!participant.muted) {
        this.mixAudioToRoom(room, streamId, data.data);
      }
    });

    console.log(`[WebRTC Streaming] Stream ${streamId} joined room ${roomId}`);

    return {
      roomId,
      streamId,
      participantCount: room.participants.size
    };
  }

  /**
   * Leave audio room
   */
  leaveRoom(roomId, streamId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.participants.delete(streamId);

    console.log(`[WebRTC Streaming] Stream ${streamId} left room ${roomId}`);

    // Close room if empty
    if (room.participants.size === 0) {
      this.closeRoom(roomId);
    }
  }

  /**
   * Mix audio to all room participants
   */
  mixAudioToRoom(room, sourceStreamId, audioData) {
    for (const [streamId, participant] of room.participants) {
      if (streamId !== sourceStreamId && !participant.muted) {
        const stream = this.streams.get(streamId);
        if (stream && stream.state === STREAM_STATES.STREAMING) {
          stream.sendAudioData(audioData);
        }
      }
    }

    // Room recording
    if (room.recordRoom && room.recordingBuffer) {
      room.recordingBuffer.push({
        sourceStreamId,
        data: audioData,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Mute/unmute participant in room
   */
  setParticipantMute(roomId, streamId, muted) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    const participant = room.participants.get(streamId);
    if (!participant) {
      throw new Error('Participant not found');
    }

    participant.muted = muted;
    return { success: true, muted };
  }

  /**
   * Get room participants
   */
  getRoomParticipants(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    return Array.from(room.participants.values()).map(p => ({
      ...p,
      stream: this.streams.get(p.streamId)?.getInfo()
    }));
  }

  /**
   * Close audio room
   */
  closeRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Disconnect all participants
    for (const streamId of room.participants.keys()) {
      this.leaveRoom(roomId, streamId);
    }

    room.state = 'closed';
    this.rooms.delete(roomId);

    console.log(`[WebRTC Streaming] Closed room ${roomId}`);

    return room.recordingBuffer;
  }

  // ============================================
  // Audio Processing
  // ============================================

  /**
   * Apply audio processing to stream
   */
  async processStreamAudio(streamId, processing) {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error('Stream not found');
    }

    const { noiseSuppression, echoCancellation, autoGainControl } = processing;

    // Store processing settings
    stream.processing = { noiseSuppression, echoCancellation, autoGainControl };

    return { success: true, processing: stream.processing };
  }

  /**
   * Get audio levels for stream
   */
  getAudioLevels(streamId) {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error('Stream not found');
    }

    return {
      streamId,
      audioLevel: stream.stats.audioLevel,
      lastActivityAt: stream.stats.lastActivityAt
    };
  }

  /**
   * Capture audio segment from stream
   */
  captureAudioSegment(streamId, durationMs = 5000) {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error('Stream not found');
    }

    // Get last N milliseconds of audio from buffer
    const cutoff = Date.now() - durationMs;
    const segments = stream.audioBuffer.filter(s => s.timestamp >= cutoff);

    if (segments.length === 0) {
      return null;
    }

    return Buffer.concat(segments.map(s => s.data));
  }

  // ============================================
  // Statistics and Monitoring
  // ============================================

  /**
   * Get stream statistics
   */
  getStreamStats(streamId) {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error('Stream not found');
    }

    return stream.getInfo();
  }

  /**
   * Get all active streams
   */
  getActiveStreams(tenantId = null) {
    let streams = Array.from(this.streams.values())
      .filter(s => s.state !== STREAM_STATES.DISCONNECTED);

    if (tenantId) {
      streams = streams.filter(s => s.tenantId === tenantId);
    }

    return streams.map(s => s.getInfo());
  }

  /**
   * Get service statistics
   */
  getServiceStats() {
    const activeStreams = Array.from(this.streams.values())
      .filter(s => s.state !== STREAM_STATES.DISCONNECTED);

    const streamingStreams = activeStreams.filter(s => s.state === STREAM_STATES.STREAMING);

    return {
      totalStreams: this.streams.size,
      activeStreams: activeStreams.length,
      streamingStreams: streamingStreams.length,
      totalRooms: this.rooms.size,
      activeRooms: Array.from(this.rooms.values()).filter(r => r.state === 'active').length,
      totalSessions: this.sessions.size,
      byState: {
        initializing: activeStreams.filter(s => s.state === STREAM_STATES.INITIALIZING).length,
        connecting: activeStreams.filter(s => s.state === STREAM_STATES.CONNECTING).length,
        connected: activeStreams.filter(s => s.state === STREAM_STATES.CONNECTED).length,
        streaming: streamingStreams.length,
        paused: activeStreams.filter(s => s.state === STREAM_STATES.PAUSED).length
      }
    };
  }

  // ============================================
  // Cleanup
  // ============================================

  /**
   * Cleanup stale streams and sessions
   */
  cleanup() {
    const now = Date.now();

    // Clean up stale sessions
    for (const [sessionId, session] of this.sessions) {
      if (now - session.createdAt.getTime() > this.config.sessionTimeout) {
        this.sessions.delete(sessionId);
        console.log(`[WebRTC Streaming] Cleaned up stale session ${sessionId}`);
      }
    }

    // Clean up disconnected streams
    for (const [streamId, stream] of this.streams) {
      if (stream.state === STREAM_STATES.DISCONNECTED) {
        this.streams.delete(streamId);
      } else if (stream.stats.lastActivityAt) {
        // Disconnect streams with no activity for 5 minutes
        if (now - stream.stats.lastActivityAt.getTime() > 300000) {
          stream.close();
          this.streams.delete(streamId);
          console.log(`[WebRTC Streaming] Cleaned up inactive stream ${streamId}`);
        }
      }
    }
  }

  /**
   * Shutdown service
   */
  shutdown() {
    clearInterval(this.cleanupInterval);

    // Close all streams
    for (const stream of this.streams.values()) {
      stream.close();
    }
    this.streams.clear();

    // Close all rooms
    for (const roomId of this.rooms.keys()) {
      this.closeRoom(roomId);
    }

    this.sessions.clear();

    console.log('[WebRTC Streaming] Service shutdown complete');
  }
}

// Singleton instance
const webrtcStreamingService = new WebRTCStreamingService();

export default webrtcStreamingService;
export { WebRTCAudioStream, STREAM_STATES, AUDIO_CODECS };
