<template>
  <div class="h-screen bg-zinc-900 flex flex-col">
    <!-- Loading State -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mx-auto mb-4"></div>
        <p class="text-zinc-400">Connecting to meeting...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <XCircleIcon class="h-12 w-12 text-red-500 mx-auto mb-4" />
        <p class="text-white text-lg mb-2">{{ error }}</p>
        <button @click="$router.push('/video')" class="text-violet-400 hover:text-violet-300">
          Back to Video Rooms
        </button>
      </div>
    </div>

    <!-- Video Call UI -->
    <div v-else class="flex-1 flex flex-col">
      <!-- Top Bar -->
      <div class="flex items-center justify-between px-4 py-3 bg-zinc-800/80 backdrop-blur">
        <div class="flex items-center gap-4">
          <h1 class="text-white font-medium">{{ room?.name }}</h1>
          <span class="px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-sm">{{ room?.roomCode }}</span>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-zinc-400 text-sm">{{ formatCallDuration(callDuration) }}</span>
          <div class="flex items-center gap-2">
            <span :class="['w-2 h-2 rounded-full', isConnected ? 'bg-green-500' : 'bg-yellow-500']"></span>
            <span class="text-zinc-400 text-sm">{{ participants.length }} participant{{ participants.length !== 1 ? 's' : '' }}</span>
          </div>
          <button v-if="isRecording" class="flex items-center gap-2 px-3 py-1 bg-red-500/20 text-red-400 rounded">
            <span class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            Recording
          </button>
        </div>
      </div>

      <!-- Video Grid -->
      <div class="flex-1 p-4 overflow-hidden">
        <div :class="[
          'h-full grid gap-4',
          gridLayout
        ]">
          <!-- Local Video -->
          <div
            v-if="localVideoEnabled || localScreenshareEnabled"
            class="relative bg-zinc-800 rounded-lg overflow-hidden"
          >
            <video
              ref="localVideo"
              autoplay
              muted
              playsinline
              class="w-full h-full object-cover"
            ></video>
            <div class="absolute bottom-3 left-3 flex items-center gap-2">
              <span class="px-2 py-1 bg-black/60 text-white text-sm rounded">You</span>
              <span v-if="!localAudioEnabled" class="p-1 bg-red-500/80 rounded">
                <MicrophoneIcon class="h-4 w-4 text-white" />
              </span>
            </div>
          </div>

          <!-- Placeholder when video is off -->
          <div
            v-else
            class="relative bg-zinc-800 rounded-lg overflow-hidden flex items-center justify-center"
          >
            <div class="w-20 h-20 bg-violet-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
              {{ currentUser?.displayName?.charAt(0) || 'Y' }}
            </div>
            <div class="absolute bottom-3 left-3 flex items-center gap-2">
              <span class="px-2 py-1 bg-black/60 text-white text-sm rounded">You</span>
              <span v-if="!localAudioEnabled" class="p-1 bg-red-500/80 rounded">
                <MicrophoneIcon class="h-4 w-4 text-white" />
              </span>
            </div>
          </div>

          <!-- Remote Participants -->
          <div
            v-for="participant in remoteParticipants"
            :key="participant.id"
            class="relative bg-zinc-800 rounded-lg overflow-hidden"
          >
            <video
              v-if="participant.isVideoEnabled"
              :ref="el => setRemoteVideoRef(participant.id, el)"
              autoplay
              playsinline
              class="w-full h-full object-cover"
            ></video>
            <div v-else class="w-full h-full flex items-center justify-center">
              <div class="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                {{ participant.displayName?.charAt(0) || '?' }}
              </div>
            </div>
            <div class="absolute bottom-3 left-3 flex items-center gap-2">
              <span class="px-2 py-1 bg-black/60 text-white text-sm rounded">{{ participant.displayName }}</span>
              <span v-if="!participant.isAudioEnabled" class="p-1 bg-red-500/80 rounded">
                <MicrophoneIcon class="h-4 w-4 text-white" />
              </span>
              <span v-if="participant.isScreensharing" class="p-1 bg-blue-500/80 rounded">
                <ComputerDesktopIcon class="h-4 w-4 text-white" />
              </span>
            </div>
            <div v-if="participant.isHandRaised" class="absolute top-3 right-3 p-2 bg-yellow-500 rounded-full">
              <HandRaisedIcon class="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Controls -->
      <div class="flex items-center justify-center gap-4 py-4 bg-zinc-800/80 backdrop-blur">
        <!-- Audio Toggle -->
        <button
          @click="toggleAudio"
          :class="[
            'p-4 rounded-full transition-colors',
            localAudioEnabled ? 'bg-zinc-700 hover:bg-zinc-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
          ]"
          :title="localAudioEnabled ? 'Mute' : 'Unmute'"
        >
          <MicrophoneIcon v-if="localAudioEnabled" class="h-6 w-6" />
          <MicrophoneSlashIcon v-else class="h-6 w-6" />
        </button>

        <!-- Video Toggle -->
        <button
          @click="toggleVideo"
          :class="[
            'p-4 rounded-full transition-colors',
            localVideoEnabled ? 'bg-zinc-700 hover:bg-zinc-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
          ]"
          :title="localVideoEnabled ? 'Stop Video' : 'Start Video'"
        >
          <VideoCameraIcon v-if="localVideoEnabled" class="h-6 w-6" />
          <VideoCameraSlashIcon v-else class="h-6 w-6" />
        </button>

        <!-- Screen Share -->
        <button
          @click="toggleScreenShare"
          :class="[
            'p-4 rounded-full transition-colors',
            localScreenshareEnabled ? 'bg-violet-500 hover:bg-violet-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-white'
          ]"
          title="Share Screen"
        >
          <ComputerDesktopIcon class="h-6 w-6" />
        </button>

        <!-- Raise Hand -->
        <button
          @click="toggleHandRaise"
          :class="[
            'p-4 rounded-full transition-colors',
            handRaised ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-white'
          ]"
          title="Raise Hand"
        >
          <HandRaisedIcon class="h-6 w-6" />
        </button>

        <!-- Chat -->
        <button
          @click="showChat = !showChat"
          :class="[
            'p-4 rounded-full transition-colors relative',
            showChat ? 'bg-violet-500 hover:bg-violet-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-white'
          ]"
          title="Chat"
        >
          <ChatBubbleLeftRightIcon class="h-6 w-6" />
          <span v-if="unreadMessages > 0" class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
            {{ unreadMessages }}
          </span>
        </button>

        <!-- Participants -->
        <button
          @click="showParticipants = !showParticipants"
          :class="[
            'p-4 rounded-full transition-colors',
            showParticipants ? 'bg-violet-500 hover:bg-violet-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-white'
          ]"
          title="Participants"
        >
          <UsersIcon class="h-6 w-6" />
        </button>

        <!-- Recording (Host Only) -->
        <button
          v-if="isHost"
          @click="toggleRecording"
          :class="[
            'p-4 rounded-full transition-colors',
            isRecording ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600 text-white'
          ]"
          :title="isRecording ? 'Stop Recording' : 'Start Recording'"
        >
          <span v-if="isRecording" class="w-4 h-4 bg-white rounded"></span>
          <span v-else class="w-4 h-4 bg-red-500 rounded-full"></span>
        </button>

        <!-- More Options -->
        <div class="relative">
          <button
            @click="showMoreOptions = !showMoreOptions"
            class="p-4 rounded-full bg-zinc-700 hover:bg-zinc-600 text-white"
            title="More"
          >
            <EllipsisHorizontalIcon class="h-6 w-6" />
          </button>
          <div v-if="showMoreOptions" class="absolute bottom-full mb-2 right-0 bg-zinc-800 rounded-lg shadow-xl py-2 w-48">
            <button @click="copyMeetingLink" class="w-full px-4 py-2 text-left text-white hover:bg-zinc-700">
              Copy Invite Link
            </button>
            <button @click="openSettings" class="w-full px-4 py-2 text-left text-white hover:bg-zinc-700">
              Settings
            </button>
            <button v-if="isHost" @click="endMeeting" class="w-full px-4 py-2 text-left text-red-400 hover:bg-zinc-700">
              End Meeting for All
            </button>
          </div>
        </div>

        <!-- Leave Call -->
        <button
          @click="leaveCall"
          class="p-4 rounded-full bg-red-500 hover:bg-red-600 text-white"
          title="Leave"
        >
          <PhoneXMarkIcon class="h-6 w-6" />
        </button>
      </div>
    </div>

    <!-- Participants Sidebar -->
    <div
      v-if="showParticipants"
      class="fixed right-0 top-0 bottom-0 w-80 bg-zinc-800 shadow-xl z-50"
    >
      <div class="flex items-center justify-between p-4 border-b border-zinc-700">
        <h3 class="font-medium text-white">Participants ({{ participants.length }})</h3>
        <button @click="showParticipants = false" class="text-zinc-400 hover:text-white">
          <XMarkIcon class="h-5 w-5" />
        </button>
      </div>
      <div class="p-4 space-y-3 overflow-y-auto max-h-[calc(100vh-60px)]">
        <div
          v-for="p in participants"
          :key="p.id"
          class="flex items-center justify-between p-3 bg-zinc-700/50 rounded-lg"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-violet-600 rounded-full flex items-center justify-center text-white font-medium">
              {{ p.displayName?.charAt(0) }}
            </div>
            <div>
              <p class="text-white text-sm">{{ p.displayName }}</p>
              <p v-if="p.role === 'host'" class="text-xs text-violet-400">Host</p>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <span :class="p.isAudioEnabled ? 'text-green-400' : 'text-red-400'">
              <MicrophoneIcon class="h-4 w-4" />
            </span>
            <span :class="p.isVideoEnabled ? 'text-green-400' : 'text-red-400'">
              <VideoCameraIcon class="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Chat Sidebar -->
    <div
      v-if="showChat"
      class="fixed right-0 top-0 bottom-0 w-80 bg-zinc-800 shadow-xl z-50 flex flex-col"
    >
      <div class="flex items-center justify-between p-4 border-b border-zinc-700">
        <h3 class="font-medium text-white">Chat</h3>
        <button @click="showChat = false; unreadMessages = 0" class="text-zinc-400 hover:text-white">
          <XMarkIcon class="h-5 w-5" />
        </button>
      </div>
      <div ref="chatContainer" class="flex-1 p-4 space-y-3 overflow-y-auto">
        <div
          v-for="msg in chatMessages"
          :key="msg.id"
          :class="[
            'max-w-[85%]',
            msg.participantId === myParticipantId ? 'ml-auto' : ''
          ]"
        >
          <div :class="[
            'rounded-lg p-3',
            msg.participantId === myParticipantId ? 'bg-violet-600 text-white' : 'bg-zinc-700 text-white'
          ]">
            <p class="text-xs font-medium mb-1">{{ msg.displayName }}</p>
            <p class="text-sm">{{ msg.message }}</p>
          </div>
          <p class="text-xs text-zinc-500 mt-1">{{ formatTime(msg.timestamp) }}</p>
        </div>
      </div>
      <div class="p-4 border-t border-zinc-700">
        <div class="flex gap-2">
          <input
            v-model="chatInput"
            @keyup.enter="sendChat"
            type="text"
            placeholder="Type a message..."
            class="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500"
          />
          <button
            @click="sendChat"
            :disabled="!chatInput.trim()"
            class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/api';
import {
  MicrophoneIcon,
  VideoCameraIcon,
  ComputerDesktopIcon,
  HandRaisedIcon,
  ChatBubbleLeftRightIcon,
  UsersIcon,
  PhoneXMarkIcon,
  EllipsisHorizontalIcon,
  XMarkIcon,
  XCircleIcon
} from '@heroicons/vue/24/outline';
import {
  MicrophoneIcon as MicrophoneSlashIcon,
  VideoCameraIcon as VideoCameraSlashIcon
} from '@heroicons/vue/24/solid';

const route = useRoute();
const router = useRouter();

// State
const loading = ref(true);
const error = ref(null);
const room = ref(null);
const participants = ref([]);
const chatMessages = ref([]);
const isConnected = ref(false);
const myParticipantId = ref(null);
const currentUser = ref(null);

// Media State
const localAudioEnabled = ref(true);
const localVideoEnabled = ref(false);
const localScreenshareEnabled = ref(false);
const handRaised = ref(false);
const isRecording = ref(false);

// UI State
const showChat = ref(false);
const showParticipants = ref(false);
const showMoreOptions = ref(false);
const unreadMessages = ref(0);
const chatInput = ref('');
const callDuration = ref(0);

// Refs
const localVideo = ref(null);
const chatContainer = ref(null);
const remoteVideoRefs = ref({});

// WebSocket
let ws = null;
let localStream = null;
let screenStream = null;
let durationInterval = null;

// Computed
const isHost = computed(() => room.value?.createdBy === currentUser.value?.id);

const remoteParticipants = computed(() =>
  participants.value.filter(p => p.id !== myParticipantId.value)
);

const gridLayout = computed(() => {
  const count = participants.value.length;
  if (count <= 1) return 'grid-cols-1';
  if (count <= 2) return 'grid-cols-2';
  if (count <= 4) return 'grid-cols-2 grid-rows-2';
  if (count <= 6) return 'grid-cols-3 grid-rows-2';
  return 'grid-cols-3 grid-rows-3';
});

// Lifecycle
onMounted(async () => {
  await initializeCall();
});

onUnmounted(() => {
  cleanup();
});

watch(showChat, (val) => {
  if (val) {
    unreadMessages.value = 0;
    nextTick(() => {
      if (chatContainer.value) {
        chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
      }
    });
  }
});

// Methods
async function initializeCall() {
  try {
    loading.value = true;

    // Get room details
    const roomId = route.params.roomId;
    const roomResponse = await api.get(`/v1/video-calls/rooms/${roomId}`);
    room.value = roomResponse.data.room;
    participants.value = roomResponse.data.participants;

    // Get user info
    const userResponse = await api.get('/v1/auth/me');
    currentUser.value = userResponse.data.user;

    // Connect to WebSocket for signaling
    await connectWebSocket();

    // Start duration counter
    durationInterval = setInterval(() => {
      callDuration.value++;
    }, 1000);

    loading.value = false;
  } catch (err) {
    console.error('Failed to initialize call:', err);
    error.value = err.response?.data?.error || 'Failed to join meeting';
    loading.value = false;
  }
}

async function connectWebSocket() {
  const token = localStorage.getItem('token');
  const roomId = route.params.roomId;
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/video?token=${token}&roomId=${roomId}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[Video] WebSocket connected');
    isConnected.value = true;
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleWebSocketMessage(message);
  };

  ws.onclose = () => {
    console.log('[Video] WebSocket closed');
    isConnected.value = false;
  };

  ws.onerror = (err) => {
    console.error('[Video] WebSocket error:', err);
  };
}

function handleWebSocketMessage(message) {
  switch (message.type) {
    case 'joinedRoom':
      myParticipantId.value = message.participantId;
      participants.value = message.participants;
      break;

    case 'participantJoined':
      participants.value.push(message.participant);
      break;

    case 'participantLeft':
      participants.value = participants.value.filter(p => p.id !== message.participantId);
      break;

    case 'mediaStateChanged':
      const participant = participants.value.find(p => p.id === message.participantId);
      if (participant) {
        if (message.isAudioEnabled !== undefined) participant.isAudioEnabled = message.isAudioEnabled;
        if (message.isVideoEnabled !== undefined) participant.isVideoEnabled = message.isVideoEnabled;
        if (message.isScreensharing !== undefined) participant.isScreensharing = message.isScreensharing;
      }
      break;

    case 'handRaised':
      const p = participants.value.find(p => p.id === message.participantId);
      if (p) p.isHandRaised = message.raised;
      break;

    case 'chatMessage':
      chatMessages.value.push(message);
      if (!showChat.value) {
        unreadMessages.value++;
      }
      nextTick(() => {
        if (chatContainer.value) {
          chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
        }
      });
      break;

    case 'kicked':
      alert(message.reason || 'You have been removed from the meeting');
      router.push('/video');
      break;

    case 'error':
      console.error('[Video] Error:', message.error);
      break;
  }
}

function sendWebSocketMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

async function toggleAudio() {
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

async function toggleVideo() {
  localVideoEnabled.value = !localVideoEnabled.value;

  if (localVideoEnabled.value) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: localAudioEnabled.value
      });

      if (localVideo.value) {
        localVideo.value.srcObject = localStream;
      }
    } catch (err) {
      console.error('Failed to get video:', err);
      localVideoEnabled.value = false;
      return;
    }
  } else if (localStream) {
    localStream.getVideoTracks().forEach(track => {
      track.stop();
    });
  }

  sendWebSocketMessage({
    type: 'updateMediaState',
    isVideoEnabled: localVideoEnabled.value
  });
}

async function toggleScreenShare() {
  if (localScreenshareEnabled.value) {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      screenStream = null;
    }
    localScreenshareEnabled.value = false;
  } else {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      screenStream.getVideoTracks()[0].onended = () => {
        localScreenshareEnabled.value = false;
        sendWebSocketMessage({
          type: 'updateMediaState',
          isScreensharing: false
        });
      };

      localScreenshareEnabled.value = true;
    } catch (err) {
      console.error('Failed to share screen:', err);
      return;
    }
  }

  sendWebSocketMessage({
    type: 'updateMediaState',
    isScreensharing: localScreenshareEnabled.value
  });
}

function toggleHandRaise() {
  handRaised.value = !handRaised.value;
  sendWebSocketMessage({
    type: 'raiseHand',
    raised: handRaised.value
  });
}

async function toggleRecording() {
  try {
    if (isRecording.value) {
      await api.post(`/v1/video-calls/rooms/${room.value.id}/recording/stop`);
      isRecording.value = false;
    } else {
      await api.post(`/v1/video-calls/rooms/${room.value.id}/recording/start`);
      isRecording.value = true;
    }
  } catch (err) {
    console.error('Failed to toggle recording:', err);
  }
}

function sendChat() {
  if (!chatInput.value.trim()) return;

  sendWebSocketMessage({
    type: 'chat',
    message: chatInput.value.trim()
  });

  chatInput.value = '';
}

function copyMeetingLink() {
  const link = `${window.location.origin}/video/join?code=${room.value.roomCode}`;
  navigator.clipboard.writeText(link);
  showMoreOptions.value = false;
  alert('Meeting link copied!');
}

function openSettings() {
  showMoreOptions.value = false;
  // TODO: Open settings modal
}

async function endMeeting() {
  if (!confirm('End meeting for all participants?')) return;

  try {
    await api.post(`/v1/video-calls/rooms/${room.value.id}/end`);
    router.push('/video');
  } catch (err) {
    console.error('Failed to end meeting:', err);
  }
}

function leaveCall() {
  sendWebSocketMessage({ type: 'leaveRoom' });
  cleanup();
  router.push('/video');
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
}

function setRemoteVideoRef(participantId, el) {
  if (el) {
    remoteVideoRefs.value[participantId] = el;
  }
}

function formatCallDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
</script>
