<template>
  <div class="bg-zinc-800 rounded-lg overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 bg-zinc-700/50 border-b border-zinc-700">
      <div class="flex items-center gap-3">
        <VideoCameraIcon class="h-5 w-5 text-violet-400" />
        <span class="font-medium text-white">Video Call</span>
        <span v-if="isConnected" class="flex items-center gap-1.5 text-xs text-emerald-400">
          <span class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
          Connected
        </span>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="callDuration > 0" class="text-sm text-zinc-400">{{ formatDuration(callDuration) }}</span>
        <button
          v-if="!isInCall"
          @click="startVideoCall"
          class="px-3 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700"
        >
          Start Video
        </button>
        <button
          v-else
          @click="toggleExpand"
          class="p-1.5 text-zinc-400 hover:text-white rounded"
        >
          <ArrowsPointingOutIcon v-if="!expanded" class="h-4 w-4" />
          <ArrowsPointingInIcon v-else class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- Video Area -->
    <div v-if="isInCall" :class="['relative', expanded ? 'h-96' : 'h-48']">
      <!-- Remote Video (Main) -->
      <video
        ref="remoteVideo"
        autoplay
        playsinline
        class="w-full h-full object-cover bg-zinc-900"
      ></video>

      <!-- No Video Placeholder -->
      <div
        v-if="!remoteVideoEnabled"
        class="absolute inset-0 flex items-center justify-center bg-zinc-900"
      >
        <div class="text-center">
          <div class="w-16 h-16 bg-zinc-700 rounded-full flex items-center justify-center mx-auto mb-2">
            <UserIcon class="h-8 w-8 text-zinc-500" />
          </div>
          <p class="text-zinc-400 text-sm">{{ remoteName || 'Customer' }}</p>
          <p class="text-zinc-500 text-xs">Camera off</p>
        </div>
      </div>

      <!-- Local Video (PiP) -->
      <div class="absolute bottom-3 right-3 w-32 h-24 rounded-lg overflow-hidden shadow-lg">
        <video
          ref="localVideo"
          autoplay
          muted
          playsinline
          class="w-full h-full object-cover bg-zinc-800"
        ></video>
        <div
          v-if="!localVideoEnabled"
          class="absolute inset-0 flex items-center justify-center bg-zinc-800"
        >
          <VideoCameraSlashIcon class="h-6 w-6 text-zinc-500" />
        </div>
      </div>

      <!-- Recording Indicator -->
      <div v-if="isRecording" class="absolute top-3 left-3 flex items-center gap-2 px-2 py-1 bg-red-500/80 rounded">
        <span class="w-2 h-2 bg-white rounded-full animate-pulse"></span>
        <span class="text-white text-xs">REC</span>
      </div>

      <!-- Customer Name Badge -->
      <div class="absolute bottom-3 left-3 px-2 py-1 bg-black/60 rounded text-white text-sm">
        {{ remoteName || 'Customer' }}
      </div>
    </div>

    <!-- No Call State -->
    <div v-else class="h-32 flex items-center justify-center">
      <div class="text-center">
        <VideoCameraIcon class="h-10 w-10 text-zinc-600 mx-auto mb-2" />
        <p class="text-zinc-400 text-sm">No video call active</p>
        <p class="text-zinc-500 text-xs mt-1">Start a video call to connect with the customer</p>
      </div>
    </div>

    <!-- Controls -->
    <div v-if="isInCall" class="flex items-center justify-center gap-3 py-3 bg-zinc-700/50">
      <!-- Mute -->
      <button
        @click="toggleAudio"
        :class="[
          'p-2.5 rounded-full transition-colors',
          localAudioEnabled ? 'bg-zinc-600 hover:bg-zinc-500 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
        ]"
        :title="localAudioEnabled ? 'Mute' : 'Unmute'"
      >
        <MicrophoneIcon v-if="localAudioEnabled" class="h-5 w-5" />
        <MicrophoneSlashIcon v-else class="h-5 w-5" />
      </button>

      <!-- Video -->
      <button
        @click="toggleVideo"
        :class="[
          'p-2.5 rounded-full transition-colors',
          localVideoEnabled ? 'bg-zinc-600 hover:bg-zinc-500 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
        ]"
        :title="localVideoEnabled ? 'Stop Video' : 'Start Video'"
      >
        <VideoCameraIcon v-if="localVideoEnabled" class="h-5 w-5" />
        <VideoCameraSlashIcon v-else class="h-5 w-5" />
      </button>

      <!-- Screen Share -->
      <button
        @click="toggleScreenShare"
        :class="[
          'p-2.5 rounded-full transition-colors',
          isScreenSharing ? 'bg-violet-500 hover:bg-violet-600 text-white' : 'bg-zinc-600 hover:bg-zinc-500 text-white'
        ]"
        title="Share Screen"
      >
        <ComputerDesktopIcon class="h-5 w-5" />
      </button>

      <!-- Record -->
      <button
        @click="toggleRecording"
        :class="[
          'p-2.5 rounded-full transition-colors',
          isRecording ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-zinc-600 hover:bg-zinc-500 text-white'
        ]"
        :title="isRecording ? 'Stop Recording' : 'Start Recording'"
      >
        <span v-if="isRecording" class="w-4 h-4 bg-white rounded"></span>
        <span v-else class="w-4 h-4 bg-red-500 rounded-full"></span>
      </button>

      <!-- End Call -->
      <button
        @click="endVideoCall"
        class="p-2.5 rounded-full bg-red-500 hover:bg-red-600 text-white"
        title="End Video Call"
      >
        <PhoneXMarkIcon class="h-5 w-5" />
      </button>
    </div>

    <!-- Quality Indicator -->
    <div v-if="isInCall && networkQuality" class="px-4 py-2 border-t border-zinc-700">
      <div class="flex items-center justify-between text-xs">
        <span class="text-zinc-500">Connection Quality</span>
        <div class="flex items-center gap-1">
          <div
            v-for="i in 5"
            :key="i"
            :class="[
              'w-1.5 h-3 rounded-sm',
              i <= networkQuality ? 'bg-emerald-400' : 'bg-zinc-600'
            ]"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import {
  VideoCameraIcon,
  MicrophoneIcon,
  ComputerDesktopIcon,
  PhoneXMarkIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  UserIcon
} from '@heroicons/vue/24/outline';
import {
  VideoCameraIcon as VideoCameraSlashIcon,
  MicrophoneIcon as MicrophoneSlashIcon
} from '@heroicons/vue/24/solid';

const props = defineProps({
  callId: { type: String, default: null },
  customerId: { type: String, default: null },
  customerName: { type: String, default: null },
  customerPhone: { type: String, default: null }
});

const emit = defineEmits(['call-started', 'call-ended', 'error']);

// State
const isInCall = ref(false);
const isConnected = ref(false);
const expanded = ref(false);
const callDuration = ref(0);
const roomId = ref(null);

// Media State
const localAudioEnabled = ref(true);
const localVideoEnabled = ref(true);
const isScreenSharing = ref(false);
const isRecording = ref(false);
const remoteVideoEnabled = ref(false);
const remoteName = ref(null);
const networkQuality = ref(5);

// Refs
const localVideo = ref(null);
const remoteVideo = ref(null);

// Streams
let localStream = null;
let screenStream = null;
let ws = null;
let durationInterval = null;

// API URL
const API_URL = import.meta.env.VITE_API_URL || '';

onMounted(() => {
  // Initialize if there's an active call that needs video
});

onUnmounted(() => {
  cleanup();
});

watch(() => props.callId, (newCallId) => {
  if (!newCallId && isInCall.value) {
    endVideoCall();
  }
});

async function startVideoCall() {
  try {
    // Get local media
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    if (localVideo.value) {
      localVideo.value.srcObject = localStream;
    }

    // Create video room via API
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/v1/video-calls/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: `Call with ${props.customerName || 'Customer'}`,
        roomType: 'instant',
        maxParticipants: 2,
        settings: {
          recording_enabled: true
        }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create video room');
    }

    const data = await response.json();
    roomId.value = data.room.id;

    // Connect to WebSocket
    await connectWebSocket(data.room.id);

    isInCall.value = true;
    localVideoEnabled.value = true;
    localAudioEnabled.value = true;

    // Start duration counter
    durationInterval = setInterval(() => {
      callDuration.value++;
    }, 1000);

    emit('call-started', {
      roomId: roomId.value,
      roomCode: data.room.roomCode
    });

    // Send invite to customer (would integrate with SMS/notification service)
    console.log('[VideoCall] Room created:', data.room.roomCode);

  } catch (error) {
    console.error('[VideoCall] Failed to start:', error);
    emit('error', error.message);
    cleanup();
  }
}

async function connectWebSocket(roomId) {
  const token = localStorage.getItem('token');
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = import.meta.env.VITE_WS_HOST || window.location.host;
  const wsUrl = `${wsProtocol}//${wsHost}/ws/video?token=${token}&roomId=${roomId}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[VideoCall] WebSocket connected');
    isConnected.value = true;
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleWebSocketMessage(message);
  };

  ws.onclose = () => {
    console.log('[VideoCall] WebSocket closed');
    isConnected.value = false;
  };

  ws.onerror = (error) => {
    console.error('[VideoCall] WebSocket error:', error);
  };
}

function handleWebSocketMessage(message) {
  switch (message.type) {
    case 'joinedRoom':
      console.log('[VideoCall] Joined room');
      break;

    case 'participantJoined':
      remoteName.value = message.participant.displayName;
      remoteVideoEnabled.value = message.participant.isVideoEnabled;
      break;

    case 'participantLeft':
      remoteName.value = null;
      remoteVideoEnabled.value = false;
      break;

    case 'mediaStateChanged':
      if (message.isVideoEnabled !== undefined) {
        remoteVideoEnabled.value = message.isVideoEnabled;
      }
      break;

    case 'newProducer':
      // Handle new media from remote participant
      // This would integrate with MediaSoup client to receive media
      break;

    case 'error':
      console.error('[VideoCall] Error:', message.error);
      emit('error', message.error);
      break;
  }
}

function sendWebSocketMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function toggleAudio() {
  localAudioEnabled.value = !localAudioEnabled.value;

  if (localStream) {
    localStream.getAudioTracks().forEach(track => {
      track.enabled = localAudioEnabled.value;
    });
  }

  sendWebSocketMessage({
    type: 'updateMediaState',
    isAudioEnabled: localAudioEnabled.value
  });
}

function toggleVideo() {
  localVideoEnabled.value = !localVideoEnabled.value;

  if (localStream) {
    localStream.getVideoTracks().forEach(track => {
      track.enabled = localVideoEnabled.value;
    });
  }

  sendWebSocketMessage({
    type: 'updateMediaState',
    isVideoEnabled: localVideoEnabled.value
  });
}

async function toggleScreenShare() {
  if (isScreenSharing.value) {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      screenStream = null;
    }
    isScreenSharing.value = false;
  } else {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      screenStream.getVideoTracks()[0].onended = () => {
        isScreenSharing.value = false;
        sendWebSocketMessage({
          type: 'updateMediaState',
          isScreensharing: false
        });
      };

      isScreenSharing.value = true;
    } catch (error) {
      console.error('[VideoCall] Screen share failed:', error);
      return;
    }
  }

  sendWebSocketMessage({
    type: 'updateMediaState',
    isScreensharing: isScreenSharing.value
  });
}

async function toggleRecording() {
  const token = localStorage.getItem('token');

  try {
    if (isRecording.value) {
      await fetch(`${API_URL}/v1/video-calls/rooms/${roomId.value}/recording/stop`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      isRecording.value = false;
    } else {
      await fetch(`${API_URL}/v1/video-calls/rooms/${roomId.value}/recording/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      isRecording.value = true;
    }
  } catch (error) {
    console.error('[VideoCall] Recording toggle failed:', error);
  }
}

function toggleExpand() {
  expanded.value = !expanded.value;
}

async function endVideoCall() {
  const token = localStorage.getItem('token');

  try {
    if (roomId.value) {
      await fetch(`${API_URL}/v1/video-calls/rooms/${roomId.value}/end`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
  } catch (error) {
    console.error('[VideoCall] Failed to end room:', error);
  }

  cleanup();
  emit('call-ended', { duration: callDuration.value });
}

function cleanup() {
  if (ws) {
    ws.close();
    ws = null;
  }

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }

  isInCall.value = false;
  isConnected.value = false;
  callDuration.value = 0;
  roomId.value = null;
  remoteName.value = null;
  remoteVideoEnabled.value = false;
  isRecording.value = false;
  isScreenSharing.value = false;
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
</script>
