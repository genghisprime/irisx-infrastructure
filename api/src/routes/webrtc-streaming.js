/**
 * WebRTC Audio Streaming API Routes
 *
 * Endpoints for WebRTC audio streaming operations
 */

import { Router } from 'express';
import webrtcStreamingService, { STREAM_STATES, AUDIO_CODECS } from '../services/webrtc-streaming.js';

const router = Router();

// ============================================
// Stream Management
// ============================================

/**
 * POST /v1/webrtc/streams
 * Create a new audio stream
 */
router.post('/streams', async (req, res) => {
  try {
    const {
      tenant_id,
      call_id,
      direction = 'bidirectional',
      codec = 'opus',
      sample_rate = 48000,
      channels = 2,
      bitrate = 64000
    } = req.body;

    const tenantId = req.tenant?.id || tenant_id;
    const userId = req.user?.id || req.body.user_id;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'tenant_id and user_id are required' });
    }

    const stream = webrtcStreamingService.createStream({
      tenantId,
      userId,
      callId: call_id,
      direction,
      codec,
      sampleRate: sample_rate,
      channels,
      bitrate
    });

    res.status(201).json({
      stream_id: stream.id,
      state: stream.state,
      codec: stream.codec,
      sample_rate: stream.sampleRate,
      channels: stream.channels,
      bitrate: stream.bitrate
    });
  } catch (error) {
    console.error('Error creating stream:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /v1/webrtc/streams/:id
 * Get stream info
 */
router.get('/streams/:id', async (req, res) => {
  try {
    const stream = webrtcStreamingService.getStream(req.params.id);

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    res.json(stream.getInfo());
  } catch (error) {
    console.error('Error getting stream:', error);
    res.status(500).json({ error: 'Failed to get stream' });
  }
});

/**
 * GET /v1/webrtc/streams/:id/stats
 * Get stream statistics
 */
router.get('/streams/:id/stats', async (req, res) => {
  try {
    const stats = webrtcStreamingService.getStreamStats(req.params.id);
    res.json(stats);
  } catch (error) {
    console.error('Error getting stream stats:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /v1/webrtc/streams/:id/connect
 * Connect/start streaming
 */
router.post('/streams/:id/connect', async (req, res) => {
  try {
    const stream = webrtcStreamingService.getStream(req.params.id);

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    stream.setState(STREAM_STATES.CONNECTED);
    res.json({ success: true, state: stream.state });
  } catch (error) {
    console.error('Error connecting stream:', error);
    res.status(500).json({ error: 'Failed to connect stream' });
  }
});

/**
 * POST /v1/webrtc/streams/:id/start
 * Start streaming audio
 */
router.post('/streams/:id/start', async (req, res) => {
  try {
    const stream = webrtcStreamingService.getStream(req.params.id);

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    stream.setState(STREAM_STATES.STREAMING);
    res.json({ success: true, state: stream.state });
  } catch (error) {
    console.error('Error starting stream:', error);
    res.status(500).json({ error: 'Failed to start stream' });
  }
});

/**
 * POST /v1/webrtc/streams/:id/pause
 * Pause streaming
 */
router.post('/streams/:id/pause', async (req, res) => {
  try {
    const stream = webrtcStreamingService.getStream(req.params.id);

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    stream.setState(STREAM_STATES.PAUSED);
    res.json({ success: true, state: stream.state });
  } catch (error) {
    console.error('Error pausing stream:', error);
    res.status(500).json({ error: 'Failed to pause stream' });
  }
});

/**
 * DELETE /v1/webrtc/streams/:id
 * Close/delete stream
 */
router.delete('/streams/:id', async (req, res) => {
  try {
    webrtcStreamingService.closeStream(req.params.id);
    res.json({ success: true, deleted: true });
  } catch (error) {
    console.error('Error closing stream:', error);
    res.status(500).json({ error: 'Failed to close stream' });
  }
});

// ============================================
// Session/SDP Exchange
// ============================================

/**
 * POST /v1/webrtc/sessions
 * Create streaming session (SDP offer/answer exchange)
 */
router.post('/sessions', async (req, res) => {
  try {
    const {
      tenant_id,
      call_id,
      offer_sdp,
      audio_config = {}
    } = req.body;

    const tenantId = req.tenant?.id || tenant_id;
    const userId = req.user?.id || req.body.user_id;

    if (!tenantId || !userId) {
      return res.status(400).json({ error: 'tenant_id and user_id are required' });
    }

    if (!offer_sdp) {
      return res.status(400).json({ error: 'offer_sdp is required' });
    }

    const result = await webrtcStreamingService.createSession({
      tenantId,
      userId,
      callId: call_id,
      offerSdp: offer_sdp,
      audioConfig: audio_config
    });

    res.status(201).json({
      session_id: result.sessionId,
      stream_id: result.streamId,
      answer_sdp: result.answerSdp,
      ice_servers: result.iceServers
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /v1/webrtc/sessions/:id
 * Get session info
 */
router.get('/sessions/:id', async (req, res) => {
  try {
    const session = webrtcStreamingService.getSession(req.params.id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      id: session.id,
      stream_id: session.streamId,
      state: session.state,
      ice_gathering_state: session.iceGatheringState,
      ice_candidates_count: session.iceCandidates.length,
      created_at: session.createdAt
    });
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

/**
 * POST /v1/webrtc/sessions/:id/ice-candidates
 * Add ICE candidate to session
 */
router.post('/sessions/:id/ice-candidates', async (req, res) => {
  try {
    const { candidate, sdp_mid, sdp_mline_index } = req.body;

    if (!candidate) {
      return res.status(400).json({ error: 'candidate is required' });
    }

    const result = await webrtcStreamingService.addIceCandidate(req.params.id, {
      candidate,
      sdpMid: sdp_mid,
      sdpMLineIndex: sdp_mline_index
    });

    res.json(result);
  } catch (error) {
    console.error('Error adding ICE candidate:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// Room/Conference Management
// ============================================

/**
 * POST /v1/webrtc/rooms
 * Create audio room for conferencing
 */
router.post('/rooms', async (req, res) => {
  try {
    const {
      tenant_id,
      name,
      call_id,
      max_participants = 10,
      record_room = false
    } = req.body;

    const tenantId = req.tenant?.id || tenant_id;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const room = webrtcStreamingService.createRoom({
      tenantId,
      name,
      callId: call_id,
      maxParticipants: max_participants,
      recordRoom: record_room
    });

    res.status(201).json({
      room_id: room.id,
      name: room.name,
      max_participants: room.maxParticipants,
      recording_enabled: room.recordRoom,
      state: room.state
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /v1/webrtc/rooms/:id/join
 * Join audio room
 */
router.post('/rooms/:id/join', async (req, res) => {
  try {
    const { stream_id, display_name, muted = false } = req.body;

    if (!stream_id) {
      return res.status(400).json({ error: 'stream_id is required' });
    }

    const result = await webrtcStreamingService.joinRoom(req.params.id, stream_id, {
      displayName: display_name,
      muted
    });

    res.json(result);
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /v1/webrtc/rooms/:id/leave
 * Leave audio room
 */
router.post('/rooms/:id/leave', async (req, res) => {
  try {
    const { stream_id } = req.body;

    if (!stream_id) {
      return res.status(400).json({ error: 'stream_id is required' });
    }

    webrtcStreamingService.leaveRoom(req.params.id, stream_id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error leaving room:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /v1/webrtc/rooms/:id/participants
 * Get room participants
 */
router.get('/rooms/:id/participants', async (req, res) => {
  try {
    const participants = webrtcStreamingService.getRoomParticipants(req.params.id);
    res.json({ participants });
  } catch (error) {
    console.error('Error getting participants:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PATCH /v1/webrtc/rooms/:id/participants/:streamId/mute
 * Mute/unmute participant
 */
router.patch('/rooms/:id/participants/:streamId/mute', async (req, res) => {
  try {
    const { muted } = req.body;

    if (typeof muted !== 'boolean') {
      return res.status(400).json({ error: 'muted (boolean) is required' });
    }

    const result = webrtcStreamingService.setParticipantMute(
      req.params.id,
      req.params.streamId,
      muted
    );

    res.json(result);
  } catch (error) {
    console.error('Error setting mute:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /v1/webrtc/rooms/:id
 * Close room
 */
router.delete('/rooms/:id', async (req, res) => {
  try {
    const recording = webrtcStreamingService.closeRoom(req.params.id);
    res.json({
      success: true,
      deleted: true,
      has_recording: recording && recording.length > 0
    });
  } catch (error) {
    console.error('Error closing room:', error);
    res.status(500).json({ error: 'Failed to close room' });
  }
});

// ============================================
// Audio Processing
// ============================================

/**
 * PATCH /v1/webrtc/streams/:id/processing
 * Configure audio processing
 */
router.patch('/streams/:id/processing', async (req, res) => {
  try {
    const {
      noise_suppression,
      echo_cancellation,
      auto_gain_control
    } = req.body;

    const result = await webrtcStreamingService.processStreamAudio(req.params.id, {
      noiseSuppression: noise_suppression,
      echoCancellation: echo_cancellation,
      autoGainControl: auto_gain_control
    });

    res.json(result);
  } catch (error) {
    console.error('Error configuring processing:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /v1/webrtc/streams/:id/levels
 * Get audio levels
 */
router.get('/streams/:id/levels', async (req, res) => {
  try {
    const levels = webrtcStreamingService.getAudioLevels(req.params.id);
    res.json(levels);
  } catch (error) {
    console.error('Error getting audio levels:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /v1/webrtc/streams/:id/capture
 * Capture audio segment
 */
router.post('/streams/:id/capture', async (req, res) => {
  try {
    const { duration_ms = 5000 } = req.body;

    const audio = webrtcStreamingService.captureAudioSegment(
      req.params.id,
      duration_ms
    );

    if (!audio) {
      return res.status(404).json({ error: 'No audio available' });
    }

    res.setHeader('Content-Type', 'audio/raw');
    res.setHeader('Content-Length', audio.length);
    res.send(audio);
  } catch (error) {
    console.error('Error capturing audio:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// Recording
// ============================================

/**
 * POST /v1/webrtc/streams/:id/recording/start
 * Start recording stream
 */
router.post('/streams/:id/recording/start', async (req, res) => {
  try {
    const stream = webrtcStreamingService.getStream(req.params.id);

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    stream.startRecording();
    res.json({ success: true, recording: true });
  } catch (error) {
    console.error('Error starting recording:', error);
    res.status(500).json({ error: 'Failed to start recording' });
  }
});

/**
 * POST /v1/webrtc/streams/:id/recording/stop
 * Stop recording and get audio
 */
router.post('/streams/:id/recording/stop', async (req, res) => {
  try {
    const stream = webrtcStreamingService.getStream(req.params.id);

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    const recording = stream.stopRecording();

    if (req.query.format === 'binary') {
      res.setHeader('Content-Type', 'audio/raw');
      res.setHeader('Content-Length', recording.length);
      res.send(recording);
    } else {
      res.json({
        success: true,
        recording: false,
        size_bytes: recording.length,
        recording_base64: recording.toString('base64')
      });
    }
  } catch (error) {
    console.error('Error stopping recording:', error);
    res.status(500).json({ error: 'Failed to stop recording' });
  }
});

// ============================================
// Service Info
// ============================================

/**
 * GET /v1/webrtc/codecs
 * Get supported audio codecs
 */
router.get('/codecs', (req, res) => {
  res.json({
    codecs: AUDIO_CODECS,
    preferred: 'opus'
  });
});

/**
 * GET /v1/webrtc/stats
 * Get service statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = webrtcStreamingService.getServiceStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting service stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

/**
 * GET /v1/webrtc/active
 * Get active streams
 */
router.get('/active', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || req.query.tenant_id;
    const streams = webrtcStreamingService.getActiveStreams(tenantId);
    res.json({ streams });
  } catch (error) {
    console.error('Error getting active streams:', error);
    res.status(500).json({ error: 'Failed to get active streams' });
  }
});

export default router;
