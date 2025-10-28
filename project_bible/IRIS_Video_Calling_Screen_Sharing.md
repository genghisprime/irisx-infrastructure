# IRIS Video Calling & Screen Sharing

> **WebRTC-based video conferencing with screen sharing, recording, and collaboration features**

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [WebRTC Implementation](#webrtc-implementation)
4. [Video Call Features](#video-call-features)
5. [Screen Sharing](#screen-sharing)
6. [Recording & Storage](#recording--storage)
7. [Database Schema](#database-schema)
8. [API Implementation](#api-implementation)
9. [Client SDKs](#client-sdks)
10. [Scaling & Infrastructure](#scaling--infrastructure)
11. [Cost Model](#cost-model)

---

## Overview

### Why Video Calling Matters

**Market Reality:**
- RingCentral, Zoom, Microsoft Teams dominate with video
- Contact centers use video for remote agent onboarding, training
- Visual support reduces ticket resolution time by 40%
- Video KYC (Know Your Customer) for banking, healthcare

**Business Impact:**
- Cannot compete in UCaaS market without video
- $50B unified communications market requires video
- 70% of enterprise RFPs require video conferencing
- Screen sharing critical for technical support

### Solution Overview

**Core Features:**
- ✅ 1-on-1 video calls
- ✅ Multi-party video conferences (up to 50 participants)
- ✅ Screen sharing (full screen or application window)
- ✅ Video recording with encryption
- ✅ Live transcription (STT integration)
- ✅ Virtual backgrounds (blur, image replacement)
- ✅ Waiting rooms & admission control
- ✅ Breakout rooms for large meetings
- ✅ Chat & file sharing during calls
- ✅ Mobile SDKs (iOS/Android)

**Technology Stack:**
- **WebRTC**: Core video/audio transport
- **Jitsi Meet**: Open-source video conferencing infrastructure (optional)
- **Daily.co**: Managed WebRTC platform (alternative)
- **MediaSoup**: SFU (Selective Forwarding Unit) for multi-party
- **Coturn**: TURN server for NAT traversal
- **Kurento**: Media server for recording/transcoding

---

## Architecture

### High-Level Flow

```
┌────────────────┐        ┌────────────────┐
│   Browser A    │        │   Browser B    │
│   (WebRTC)     │        │   (WebRTC)     │
└───────┬────────┘        └────────┬───────┘
        │                          │
        │   Signaling (WebSocket)  │
        ├─────────┬────────────────┤
        │         │                │
        ▼         ▼                ▼
    ┌───────────────────────────────┐
    │  IRIS Signaling Server        │
    │  (Hono + WebSocket)           │
    │  - ICE candidates exchange    │
    │  - SDP offer/answer           │
    │  - Room management            │
    └──────────┬────────────────────┘
               │
               ▼
    ┌───────────────────────────────┐
    │  MediaSoup SFU                │
    │  - Routes video streams       │
    │  - Adaptive bitrate           │
    │  - Simulcast support          │
    └──────────┬────────────────────┘
               │
               ▼
    ┌───────────────────────────────┐
    │  Coturn (TURN Server)         │
    │  - NAT traversal              │
    │  - Relays for firewalls       │
    └───────────────────────────────┘
```

### Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Signaling** | Hono + WebSocket | Coordinate WebRTC connections |
| **SFU** | MediaSoup | Route video streams efficiently |
| **TURN Server** | Coturn | NAT traversal for restricted networks |
| **Recording** | Kurento or FFmpeg | Record video calls |
| **Storage** | R2 + CloudFront | Store recordings |
| **Client SDK** | JavaScript, iOS, Android | Embed video in apps |

---

## WebRTC Implementation

### Signaling Protocol

**WebSocket Messages:**
```typescript
// Join room
{
  type: 'join',
  room_id: 'abc-123',
  user_id: 'user-456',
  media: { audio: true, video: true, screen: false }
}

// SDP Offer
{
  type: 'offer',
  sdp: '...',
  room_id: 'abc-123',
  from_user_id: 'user-456'
}

// SDP Answer
{
  type: 'answer',
  sdp: '...',
  room_id: 'abc-123',
  to_user_id: 'user-456'
}

// ICE Candidate
{
  type: 'ice-candidate',
  candidate: { ... },
  room_id: 'abc-123',
  from_user_id: 'user-456'
}
```

### Signaling Server (Hono)

```typescript
import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/cloudflare-workers';

const app = new Hono();

// WebSocket signaling endpoint
app.get('/ws/video/:room_id', upgradeWebSocket((c) => {
  const roomId = c.req.param('room_id');
  const userId = c.req.query('user_id');

  return {
    async onOpen(evt, ws) {
      console.log(`📹 User ${userId} joined room ${roomId}`);

      // Add user to room
      await redis.sadd(`room:${roomId}:users`, userId);

      // Notify other participants
      const otherUsers = await redis.smembers(`room:${roomId}:users`);
      for (const otherUserId of otherUsers) {
        if (otherUserId !== userId) {
          await sendToUser(otherUserId, {
            type: 'user-joined',
            user_id: userId,
            room_id: roomId,
          });
        }
      }

      // Send existing participants to new user
      ws.send(JSON.stringify({
        type: 'room-state',
        users: otherUsers.filter(u => u !== userId),
      }));
    },

    async onMessage(evt, ws) {
      const message = JSON.parse(evt.data as string);

      switch (message.type) {
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          // Forward signaling messages to peer
          await sendToUser(message.to_user_id, {
            ...message,
            from_user_id: userId,
          });
          break;

        case 'toggle-audio':
        case 'toggle-video':
        case 'start-screen-share':
        case 'stop-screen-share':
          // Broadcast media state changes
          await broadcastToRoom(roomId, {
            ...message,
            user_id: userId,
          }, userId);
          break;
      }
    },

    async onClose(evt, ws) {
      console.log(`📹 User ${userId} left room ${roomId}`);

      // Remove user from room
      await redis.srem(`room:${roomId}:users`, userId);

      // Notify other participants
      await broadcastToRoom(roomId, {
        type: 'user-left',
        user_id: userId,
      });

      // Clean up empty rooms
      const userCount = await redis.scard(`room:${roomId}:users`);
      if (userCount === 0) {
        await redis.del(`room:${roomId}:users`);
        console.log(`🧹 Room ${roomId} cleaned up`);
      }
    },
  };
}));

async function sendToUser(userId: string, message: any) {
  await nc.publish(`video.user.${userId}`, JSON.stringify(message));
}

async function broadcastToRoom(roomId: string, message: any, excludeUserId?: string) {
  const users = await redis.smembers(`room:${roomId}:users`);
  for (const userId of users) {
    if (userId !== excludeUserId) {
      await sendToUser(userId, message);
    }
  }
}
```

### Client Implementation (JavaScript)

```typescript
class VideoCall {
  private peerConnection: RTCPeerConnection;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private ws: WebSocket;

  constructor(private roomId: string, private userId: string) {
    // Create peer connection
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.iris.com:3478' },
        {
          urls: 'turn:turn.iris.com:3478',
          username: 'iris',
          credential: 'secret',
        },
      ],
    });

    // Connect to signaling server
    this.ws = new WebSocket(`wss://api.iris.com/ws/video/${roomId}?user_id=${userId}`);

    this.setupWebSocket();
    this.setupPeerConnection();
  }

  private setupWebSocket() {
    this.ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'room-state':
          // Create offers for existing users
          for (const userId of message.users) {
            await this.createOffer(userId);
          }
          break;

        case 'user-joined':
          // New user joined, create offer
          await this.createOffer(message.user_id);
          break;

        case 'offer':
          await this.handleOffer(message);
          break;

        case 'answer':
          await this.handleAnswer(message);
          break;

        case 'ice-candidate':
          await this.handleIceCandidate(message);
          break;

        case 'user-left':
          this.handleUserLeft(message.user_id);
          break;
      }
    };
  }

  private setupPeerConnection() {
    // Send ICE candidates to peer
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate,
          room_id: this.roomId,
        }));
      }
    };

    // Receive remote stream
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      this.onRemoteStream(this.remoteStream);
    };
  }

  async startCall(audioEnabled = true, videoEnabled = true) {
    // Get local media stream
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: audioEnabled,
      video: videoEnabled ? { width: 1280, height: 720 } : false,
    });

    // Add tracks to peer connection
    this.localStream.getTracks().forEach((track) => {
      this.peerConnection.addTrack(track, this.localStream!);
    });

    this.onLocalStream(this.localStream);
  }

  private async createOffer(toUserId: string) {
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    this.ws.send(JSON.stringify({
      type: 'offer',
      sdp: offer.sdp,
      room_id: this.roomId,
      to_user_id: toUserId,
    }));
  }

  private async handleOffer(message: any) {
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription({ type: 'offer', sdp: message.sdp })
    );

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.ws.send(JSON.stringify({
      type: 'answer',
      sdp: answer.sdp,
      room_id: this.roomId,
      to_user_id: message.from_user_id,
    }));
  }

  private async handleAnswer(message: any) {
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription({ type: 'answer', sdp: message.sdp })
    );
  }

  private async handleIceCandidate(message: any) {
    await this.peerConnection.addIceCandidate(
      new RTCIceCandidate(message.candidate)
    );
  }

  async toggleAudio(enabled: boolean) {
    const audioTrack = this.localStream?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = enabled;
    }
  }

  async toggleVideo(enabled: boolean) {
    const videoTrack = this.localStream?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = enabled;
    }
  }

  async startScreenShare() {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: false,
    });

    const screenTrack = screenStream.getVideoTracks()[0];
    const sender = this.peerConnection
      .getSenders()
      .find((s) => s.track?.kind === 'video');

    if (sender) {
      await sender.replaceTrack(screenTrack);
    }

    // Notify peer
    this.ws.send(JSON.stringify({
      type: 'start-screen-share',
      room_id: this.roomId,
    }));
  }

  async stopScreenShare() {
    const videoTrack = this.localStream?.getVideoTracks()[0];
    const sender = this.peerConnection
      .getSenders()
      .find((s) => s.track?.kind === 'video');

    if (sender && videoTrack) {
      await sender.replaceTrack(videoTrack);
    }

    this.ws.send(JSON.stringify({
      type: 'stop-screen-share',
      room_id: this.roomId,
    }));
  }

  endCall() {
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.peerConnection.close();
    this.ws.close();
  }

  // Callbacks
  onLocalStream(stream: MediaStream) {
    // Override in implementation
  }

  onRemoteStream(stream: MediaStream) {
    // Override in implementation
  }

  handleUserLeft(userId: string) {
    // Override in implementation
  }
}
```

### Usage Example

```typescript
const videoCall = new VideoCall('room-abc-123', 'user-456');

// Set up video elements
videoCall.onLocalStream = (stream) => {
  const localVideo = document.getElementById('local-video') as HTMLVideoElement;
  localVideo.srcObject = stream;
};

videoCall.onRemoteStream = (stream) => {
  const remoteVideo = document.getElementById('remote-video') as HTMLVideoElement;
  remoteVideo.srcObject = stream;
};

// Start call
await videoCall.startCall(true, true);

// Toggle audio
document.getElementById('mute-btn').onclick = () => {
  const enabled = !videoCall.isAudioEnabled();
  videoCall.toggleAudio(enabled);
};

// Start screen share
document.getElementById('share-screen-btn').onclick = () => {
  videoCall.startScreenShare();
};

// End call
document.getElementById('end-call-btn').onclick = () => {
  videoCall.endCall();
};
```

---

## Video Call Features

### Virtual Backgrounds

```typescript
// Use TensorFlow.js BodyPix for background segmentation
import * as bodyPix from '@tensorflow-models/body-pix';

async function applyVirtualBackground(
  videoTrack: MediaStreamTrack,
  backgroundImage: HTMLImageElement
): Promise<MediaStream> {
  const net = await bodyPix.load();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const video = document.createElement('video');
  video.srcObject = new MediaStream([videoTrack]);

  canvas.width = 1280;
  canvas.height = 720;

  async function processFrame() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Segment person from background
    const segmentation = await net.segmentPerson(video);

    // Draw background image
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);

    // Mask person
    ctx.globalCompositeOperation = 'source-over';
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (segmentation.data[i / 4] === 0) {
        imageData.data[i + 3] = 0; // Make background transparent
      }
    }
    ctx.putImageData(imageData, 0, 0);

    requestAnimationFrame(processFrame);
  }

  processFrame();

  return canvas.captureStream(30); // 30 FPS
}
```

### Waiting Room

```typescript
// POST /v1/video/rooms/:room_id/admit
async function admitUser(req: Request): Promise<Response> {
  const roomId = req.params.room_id;
  const { user_id } = await req.json();

  // Check if requester is host
  const room = await db.query(`
    SELECT host_user_id FROM video_rooms WHERE id = $1
  `, [roomId]);

  if (room.rows[0].host_user_id !== req.user.id) {
    return Response.json({ error: 'Only host can admit users' }, { status: 403 });
  }

  // Move user from waiting room to active room
  await redis.srem(`room:${roomId}:waiting`, user_id);
  await redis.sadd(`room:${roomId}:users`, user_id);

  // Notify user they've been admitted
  await nc.publish(`video.user.${user_id}`, JSON.stringify({
    type: 'admitted',
    room_id: roomId,
  }));

  return Response.json({ success: true });
}
```

---

## Screen Sharing

### Implementation

Already covered in client code above using `getDisplayMedia()`.

### Co-Browsing (Remote Control)

For advanced use cases, integrate third-party services:
- **Surfly**: Co-browsing with remote control
- **Upscope**: Screen sharing for customer support
- **LogRocket**: Session replay with screen sharing

```typescript
// Example: Surfly integration
async function startCoBrowsing(sessionId: string) {
  const response = await fetch('https://api.surfly.com/v2/sessions/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SURFLY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: 'https://your-app.com',
      agent_id: sessionId,
    }),
  });

  const { session_url } = await response.json();
  return session_url; // Send to customer
}
```

---

## Recording & Storage

### Server-Side Recording (Kurento)

```typescript
import { MediaPipeline, RecorderEndpoint } from 'kurento-client';

async function startRecording(roomId: string, userId: string) {
  const pipeline = await MediaPipeline.create();
  const recorder = await RecorderEndpoint.create(pipeline, {
    uri: `file:///tmp/recordings/${roomId}-${userId}.webm`,
    mediaProfile: 'WEBM',
  });

  // Connect WebRTC endpoint to recorder
  const webRtcEndpoint = await getWebRtcEndpoint(userId);
  await webRtcEndpoint.connect(recorder);

  // Start recording
  await recorder.record();

  console.log(`🎥 Started recording for user ${userId} in room ${roomId}`);

  return recorder;
}

async function stopRecording(recorder: RecorderEndpoint, roomId: string) {
  await recorder.stop();
  await recorder.release();

  // Upload to R2 (same as call recording encryption)
  const localPath = `/tmp/recordings/${roomId}.webm`;
  await uploadAndEncryptRecording(localPath, roomId);
}
```

---

## Database Schema

```sql
-- Video rooms
CREATE TABLE video_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  host_user_id UUID NOT NULL REFERENCES users(id),

  -- Room settings
  name TEXT NOT NULL,
  room_type TEXT NOT NULL CHECK (room_type IN ('call', 'meeting', 'webinar')),
  max_participants INTEGER DEFAULT 50,
  require_password BOOLEAN DEFAULT FALSE,
  password_hash TEXT,
  waiting_room_enabled BOOLEAN DEFAULT FALSE,
  recording_enabled BOOLEAN DEFAULT TRUE,

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('scheduled', 'active', 'ended')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Video room participants
CREATE TABLE video_room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES video_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  guest_name TEXT, -- For anonymous participants

  -- Participant role
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('host', 'moderator', 'participant')),

  -- Media state
  audio_enabled BOOLEAN DEFAULT TRUE,
  video_enabled BOOLEAN DEFAULT TRUE,
  screen_sharing BOOLEAN DEFAULT FALSE,

  -- Join/leave times
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ
);

-- Video recordings
CREATE TABLE video_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES video_rooms(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,

  -- Recording details
  storage_key TEXT NOT NULL,
  encrypted_data_key BYTEA NOT NULL,
  encryption_iv BYTEA NOT NULL,
  encryption_auth_tag BYTEA NOT NULL,

  -- Metadata
  duration INTEGER, -- seconds
  format TEXT DEFAULT 'webm',
  size_bytes BIGINT,

  -- Status
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'available', 'deleted')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_video_rooms_tenant ON video_rooms(tenant_id);
CREATE INDEX idx_video_participants_room ON video_room_participants(room_id);
CREATE INDEX idx_video_recordings_room ON video_recordings(room_id);
```

---

## API Implementation

### Create Room

```typescript
// POST /v1/video/rooms
async function createRoom(req: Request): Promise<Response> {
  const {
    name,
    room_type = 'meeting',
    max_participants = 50,
    require_password = false,
    password,
    waiting_room_enabled = false,
    recording_enabled = true,
  } = await req.json();

  const tenantId = req.user.tenant_id;
  const hostUserId = req.user.id;

  const passwordHash = require_password
    ? await bcrypt.hash(password, 10)
    : null;

  const room = await db.query(`
    INSERT INTO video_rooms (
      tenant_id, host_user_id, name, room_type,
      max_participants, require_password, password_hash,
      waiting_room_enabled, recording_enabled, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled')
    RETURNING *
  `, [
    tenantId, hostUserId, name, room_type,
    max_participants, require_password, passwordHash,
    waiting_room_enabled, recording_enabled,
  ]);

  return Response.json({ room: room.rows[0] }, { status: 201 });
}
```

### Join Room

```typescript
// POST /v1/video/rooms/:room_id/join
async function joinRoom(req: Request): Promise<Response> {
  const roomId = req.params.room_id;
  const userId = req.user?.id;
  const { guest_name, password } = await req.json();

  // Verify room exists
  const room = await db.query(`
    SELECT * FROM video_rooms WHERE id = $1 AND status = 'active'
  `, [roomId]);

  if (room.rows.length === 0) {
    return Response.json({ error: 'Room not found or ended' }, { status: 404 });
  }

  // Check password
  if (room.rows[0].require_password) {
    const valid = await bcrypt.compare(password, room.rows[0].password_hash);
    if (!valid) {
      return Response.json({ error: 'Invalid password' }, { status: 403 });
    }
  }

  // Check participant limit
  const participantCount = await redis.scard(`room:${roomId}:users`);
  if (participantCount >= room.rows[0].max_participants) {
    return Response.json({ error: 'Room is full' }, { status: 403 });
  }

  // Add participant
  const participant = await db.query(`
    INSERT INTO video_room_participants (room_id, user_id, guest_name)
    VALUES ($1, $2, $3)
    RETURNING *
  `, [roomId, userId, guest_name]);

  return Response.json({
    success: true,
    participant: participant.rows[0],
    websocket_url: `wss://api.iris.com/ws/video/${roomId}?user_id=${userId || participant.rows[0].id}`,
  });
}
```

---

## Client SDKs

### React Component

```tsx
import { useEffect, useRef, useState } from 'react';
import { VideoCall } from '@iris/video-sdk';

export function VideoCallComponent({ roomId, userId }: { roomId: string; userId: string }) {
  const [videoCall, setVideoCall] = useState<VideoCall | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const call = new VideoCall(roomId, userId);

    call.onLocalStream = (stream) => {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    };

    call.onRemoteStream = (stream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    call.startCall(true, true);
    setVideoCall(call);

    return () => {
      call.endCall();
    };
  }, [roomId, userId]);

  const toggleAudio = () => {
    videoCall?.toggleAudio(!isAudioEnabled);
    setIsAudioEnabled(!isAudioEnabled);
  };

  const toggleVideo = () => {
    videoCall?.toggleVideo(!isVideoEnabled);
    setIsVideoEnabled(!isVideoEnabled);
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await videoCall?.stopScreenShare();
    } else {
      await videoCall?.startScreenShare();
    }
    setIsScreenSharing(!isScreenSharing);
  };

  const endCall = () => {
    videoCall?.endCall();
  };

  return (
    <div className="video-call">
      <div className="video-container">
        <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
        <video ref={localVideoRef} autoPlay playsInline muted className="local-video" />
      </div>

      <div className="controls">
        <button onClick={toggleAudio}>{isAudioEnabled ? 'Mute' : 'Unmute'}</button>
        <button onClick={toggleVideo}>{isVideoEnabled ? 'Stop Video' : 'Start Video'}</button>
        <button onClick={toggleScreenShare}>
          {isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
        </button>
        <button onClick={endCall} className="end-call">End Call</button>
      </div>
    </div>
  );
}
```

---

## Scaling & Infrastructure

### Coturn (TURN Server) Setup

```bash
# Install coturn
apt-get install coturn

# Configure /etc/turnserver.conf
listening-port=3478
fingerprint
lt-cred-mech
user=iris:secret
realm=iris.com
total-quota=100
stale-nonce=600
cert=/etc/letsencrypt/live/turn.iris.com/cert.pem
pkey=/etc/letsencrypt/live/turn.iris.com/privkey.pem
```

### MediaSoup SFU (Multi-Party)

```typescript
// Server-side MediaSoup setup
import * as mediasoup from 'mediasoup';

const worker = await mediasoup.createWorker({
  logLevel: 'warn',
  rtcMinPort: 10000,
  rtcMaxPort: 10100,
});

const router = await worker.createRouter({
  mediaCodecs: [
    { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
    { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
  ],
});
```

---

## Cost Model

**Infrastructure (Startup):**
- Signaling server: $0 (Cloudflare Workers)
- TURN server: $30/month (t3.medium EC2)
- Recording storage: $0.015/GB/month (R2)

**Infrastructure (Scale - 1000 concurrent participants):**
- Signaling: $5/month (Workers)
- TURN: $120/month (c6i.2xlarge)
- SFU (MediaSoup): $240/month (c6i.4xlarge × 2)
- Total: **$365/month**

**Per-Minute Cost:**
- TURN bandwidth: $0.09/GB × 1.5 MB/min = **$0.000135/min** (0.01¢)
- Recording storage: 10 MB/min × $0.015/GB = **$0.00015/min** (0.02¢)

**Pricing Model:**
- Charge: $0.01/min/participant (1¢)
- Cost: $0.0002/min/participant (0.02¢)
- **Margin: 98%** 🚀

---

## Summary

✅ **WebRTC video calling** with screen sharing
✅ **Multi-party conferences** (up to 50 participants)
✅ **Encrypted recording** (same as call recording)
✅ **Virtual backgrounds** with TensorFlow.js
✅ **Waiting rooms** & admission control
✅ **Client SDKs** (JavaScript, React, Vue)
✅ **98% gross margin** at scale

**Ready to compete with RingCentral & Zoom! 📹✨**
