<template>
  <div class="p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">Video Calling</h1>
        <p class="text-zinc-400 mt-1">Create and manage video meetings with your team and customers</p>
      </div>
      <div class="flex items-center gap-3">
        <button @click="showJoinModal = true" class="px-4 py-2 text-zinc-300 border border-zinc-700 rounded-lg hover:bg-zinc-800">
          Join with Code
        </button>
        <button @click="createInstantRoom" class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700">
          Start Instant Meeting
        </button>
        <button @click="showScheduleModal = true" class="px-4 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600">
          Schedule Meeting
        </button>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-zinc-800 rounded-lg p-4">
        <p class="text-sm text-zinc-400">Active Meetings</p>
        <p class="text-2xl font-bold text-violet-400">{{ stats.activeRooms || 0 }}</p>
      </div>
      <div class="bg-zinc-800 rounded-lg p-4">
        <p class="text-sm text-zinc-400">This Month</p>
        <p class="text-2xl font-bold text-emerald-400">{{ stats.monthlyRooms || 0 }}</p>
      </div>
      <div class="bg-zinc-800 rounded-lg p-4">
        <p class="text-sm text-zinc-400">Total Minutes</p>
        <p class="text-2xl font-bold text-blue-400">{{ stats.totalMinutes || 0 }}</p>
      </div>
      <div class="bg-zinc-800 rounded-lg p-4">
        <p class="text-sm text-zinc-400">Recordings</p>
        <p class="text-2xl font-bold text-orange-400">{{ stats.recordingCount || 0 }}</p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="bg-zinc-800 rounded-lg">
      <div class="border-b border-zinc-700">
        <nav class="flex -mb-px">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            :class="[
              'px-6 py-4 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
            ]"
          >
            {{ tab.name }}
          </button>
        </nav>
      </div>

      <div class="p-6">
        <!-- Active Meetings -->
        <div v-if="activeTab === 'active'">
          <div v-if="activeRooms.length === 0" class="text-center py-12">
            <VideoCameraIcon class="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <p class="text-zinc-400">No active meetings</p>
            <p class="text-sm text-zinc-500 mt-1">Start a new meeting or schedule one for later</p>
          </div>
          <div v-else class="space-y-4">
            <div
              v-for="room in activeRooms"
              :key="room.id"
              class="flex items-center justify-between p-4 bg-zinc-700/50 rounded-lg"
            >
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 bg-violet-600/20 rounded-lg flex items-center justify-center">
                  <VideoCameraIcon class="h-6 w-6 text-violet-400" />
                </div>
                <div>
                  <p class="font-medium text-white">{{ room.name }}</p>
                  <p class="text-sm text-zinc-400">
                    {{ room.participantCount }} participant{{ room.participantCount !== 1 ? 's' : '' }}
                    <span class="mx-2">·</span>
                    Started {{ formatTimeAgo(room.startedAt) }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
                  {{ room.roomCode }}
                </span>
                <button
                  @click="joinRoom(room)"
                  class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Scheduled Meetings -->
        <div v-if="activeTab === 'scheduled'">
          <div v-if="scheduledRooms.length === 0" class="text-center py-12">
            <CalendarIcon class="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <p class="text-zinc-400">No scheduled meetings</p>
            <button @click="showScheduleModal = true" class="mt-4 text-violet-400 hover:text-violet-300">
              Schedule a meeting
            </button>
          </div>
          <div v-else class="space-y-4">
            <div
              v-for="room in scheduledRooms"
              :key="room.id"
              class="flex items-center justify-between p-4 bg-zinc-700/50 rounded-lg"
            >
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 bg-blue-600/20 rounded-lg flex items-center justify-center">
                  <CalendarIcon class="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <p class="font-medium text-white">{{ room.name }}</p>
                  <p class="text-sm text-zinc-400">
                    {{ formatDate(room.scheduledAt) }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="px-3 py-1 bg-zinc-600 text-zinc-300 rounded-full text-sm">
                  {{ room.roomCode }}
                </span>
                <button
                  @click="copyInviteLink(room)"
                  class="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded"
                  title="Copy Invite Link"
                >
                  <LinkIcon class="h-5 w-5" />
                </button>
                <button
                  @click="startScheduledRoom(room)"
                  class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
                >
                  Start Now
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Past Meetings -->
        <div v-if="activeTab === 'past'">
          <div v-if="pastRooms.length === 0" class="text-center py-12">
            <ClockIcon class="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <p class="text-zinc-400">No past meetings</p>
          </div>
          <div v-else class="overflow-x-auto">
            <table class="min-w-full">
              <thead>
                <tr class="text-left text-xs text-zinc-500 uppercase">
                  <th class="px-4 py-3">Meeting</th>
                  <th class="px-4 py-3">Date</th>
                  <th class="px-4 py-3">Duration</th>
                  <th class="px-4 py-3">Participants</th>
                  <th class="px-4 py-3">Recording</th>
                  <th class="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-700">
                <tr v-for="room in pastRooms" :key="room.id">
                  <td class="px-4 py-3">
                    <p class="text-white">{{ room.name }}</p>
                    <p class="text-sm text-zinc-500">{{ room.roomCode }}</p>
                  </td>
                  <td class="px-4 py-3 text-zinc-400">{{ formatDate(room.endedAt) }}</td>
                  <td class="px-4 py-3 text-zinc-400">{{ formatDuration(room.durationSeconds) }}</td>
                  <td class="px-4 py-3 text-zinc-400">{{ room.participantCount }}</td>
                  <td class="px-4 py-3">
                    <span v-if="room.hasRecording" class="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                      Available
                    </span>
                    <span v-else class="text-zinc-500 text-sm">None</span>
                  </td>
                  <td class="px-4 py-3">
                    <button
                      v-if="room.hasRecording"
                      @click="viewRecordings(room)"
                      class="text-violet-400 hover:text-violet-300 text-sm"
                    >
                      View Recording
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Recordings -->
        <div v-if="activeTab === 'recordings'">
          <div v-if="recordings.length === 0" class="text-center py-12">
            <FilmIcon class="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <p class="text-zinc-400">No recordings yet</p>
          </div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="recording in recordings"
              :key="recording.id"
              class="bg-zinc-700/50 rounded-lg overflow-hidden"
            >
              <div class="aspect-video bg-zinc-900 flex items-center justify-center relative">
                <img v-if="recording.thumbnailUrl" :src="recording.thumbnailUrl" class="w-full h-full object-cover" />
                <VideoCameraIcon v-else class="h-12 w-12 text-zinc-600" />
                <div class="absolute bottom-2 right-2 px-2 py-1 bg-black/70 rounded text-xs text-white">
                  {{ formatDuration(recording.durationSeconds) }}
                </div>
              </div>
              <div class="p-4">
                <p class="font-medium text-white truncate">{{ recording.roomName }}</p>
                <p class="text-sm text-zinc-400">{{ formatDate(recording.createdAt) }}</p>
                <div class="flex items-center justify-between mt-3">
                  <span class="text-xs text-zinc-500">{{ formatFileSize(recording.fileSize) }}</span>
                  <button
                    @click="downloadRecording(recording)"
                    class="text-violet-400 hover:text-violet-300 text-sm"
                  >
                    Download
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Settings -->
        <div v-if="activeTab === 'settings'">
          <div class="max-w-2xl space-y-6">
            <div class="bg-zinc-700/50 rounded-lg p-6">
              <h3 class="font-medium text-white mb-4">Default Meeting Settings</h3>
              <div class="space-y-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-white">Enable Video by Default</p>
                    <p class="text-sm text-zinc-400">Start meetings with camera on</p>
                  </div>
                  <button
                    @click="settings.defaultVideoEnabled = !settings.defaultVideoEnabled"
                    :class="[
                      'w-12 h-6 rounded-full transition-colors',
                      settings.defaultVideoEnabled ? 'bg-violet-600' : 'bg-zinc-600'
                    ]"
                  >
                    <div
                      :class="[
                        'w-5 h-5 bg-white rounded-full transition-transform mx-0.5',
                        settings.defaultVideoEnabled ? 'translate-x-6' : 'translate-x-0'
                      ]"
                    ></div>
                  </button>
                </div>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-white">Waiting Room</p>
                    <p class="text-sm text-zinc-400">Participants wait for host to admit them</p>
                  </div>
                  <button
                    @click="settings.waitingRoomEnabled = !settings.waitingRoomEnabled"
                    :class="[
                      'w-12 h-6 rounded-full transition-colors',
                      settings.waitingRoomEnabled ? 'bg-violet-600' : 'bg-zinc-600'
                    ]"
                  >
                    <div
                      :class="[
                        'w-5 h-5 bg-white rounded-full transition-transform mx-0.5',
                        settings.waitingRoomEnabled ? 'translate-x-6' : 'translate-x-0'
                      ]"
                    ></div>
                  </button>
                </div>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-white">Auto-Record Meetings</p>
                    <p class="text-sm text-zinc-400">Automatically record all meetings</p>
                  </div>
                  <button
                    @click="settings.autoRecord = !settings.autoRecord"
                    :class="[
                      'w-12 h-6 rounded-full transition-colors',
                      settings.autoRecord ? 'bg-violet-600' : 'bg-zinc-600'
                    ]"
                  >
                    <div
                      :class="[
                        'w-5 h-5 bg-white rounded-full transition-transform mx-0.5',
                        settings.autoRecord ? 'translate-x-6' : 'translate-x-0'
                      ]"
                    ></div>
                  </button>
                </div>
              </div>
            </div>

            <div class="bg-zinc-700/50 rounded-lg p-6">
              <h3 class="font-medium text-white mb-4">Video Quality</h3>
              <select
                v-model="settings.defaultQuality"
                class="w-full px-4 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-white"
              >
                <option value="low">Low (360p) - Best for slow connections</option>
                <option value="sd">Standard (480p)</option>
                <option value="hd">HD (720p) - Recommended</option>
                <option value="fhd">Full HD (1080p) - Best quality</option>
              </select>
            </div>

            <button
              @click="saveSettings"
              class="px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Join Room Modal -->
    <div v-if="showJoinModal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div class="bg-zinc-800 rounded-lg shadow-xl max-w-md w-full m-4">
        <div class="p-6 border-b border-zinc-700">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-white">Join Meeting</h3>
            <button @click="showJoinModal = false" class="text-zinc-400 hover:text-white">
              <XMarkIcon class="h-5 w-5" />
            </button>
          </div>
        </div>
        <div class="p-6">
          <div class="mb-4">
            <label class="block text-sm font-medium text-zinc-300 mb-2">Meeting Code</label>
            <input
              v-model="joinCode"
              type="text"
              placeholder="XXX-XXX-XXX"
              class="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-zinc-300 mb-2">Your Name</label>
            <input
              v-model="displayName"
              type="text"
              placeholder="Enter your name"
              class="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <button
            @click="joinWithCode"
            :disabled="!joinCode || !displayName"
            class="w-full px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Join Meeting
          </button>
        </div>
      </div>
    </div>

    <!-- Schedule Modal -->
    <div v-if="showScheduleModal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div class="bg-zinc-800 rounded-lg shadow-xl max-w-md w-full m-4">
        <div class="p-6 border-b border-zinc-700">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-white">Schedule Meeting</h3>
            <button @click="showScheduleModal = false" class="text-zinc-400 hover:text-white">
              <XMarkIcon class="h-5 w-5" />
            </button>
          </div>
        </div>
        <div class="p-6">
          <div class="mb-4">
            <label class="block text-sm font-medium text-zinc-300 mb-2">Meeting Name</label>
            <input
              v-model="newRoom.name"
              type="text"
              placeholder="Team standup"
              class="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500"
            />
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-zinc-300 mb-2">Date & Time</label>
            <input
              v-model="newRoom.scheduledAt"
              type="datetime-local"
              class="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white"
            />
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-zinc-300 mb-2">Max Participants</label>
            <select
              v-model="newRoom.maxParticipants"
              class="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white"
            >
              <option :value="5">5 participants</option>
              <option :value="10">10 participants</option>
              <option :value="25">25 participants</option>
              <option :value="50">50 participants</option>
            </select>
          </div>
          <button
            @click="scheduleRoom"
            :disabled="!newRoom.name || !newRoom.scheduledAt"
            class="w-full px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Schedule Meeting
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/utils/api';
import {
  VideoCameraIcon,
  CalendarIcon,
  ClockIcon,
  FilmIcon,
  LinkIcon,
  XMarkIcon
} from '@heroicons/vue/24/outline';

const router = useRouter();

const stats = ref({});
const rooms = ref([]);
const recordings = ref([]);
const settings = ref({
  defaultVideoEnabled: true,
  waitingRoomEnabled: false,
  autoRecord: false,
  defaultQuality: 'hd'
});
const activeTab = ref('active');
const showJoinModal = ref(false);
const showScheduleModal = ref(false);
const joinCode = ref('');
const displayName = ref('');
const newRoom = ref({
  name: '',
  scheduledAt: '',
  maxParticipants: 10
});

const tabs = ref([
  { id: 'active', name: 'Active' },
  { id: 'scheduled', name: 'Scheduled' },
  { id: 'past', name: 'Past Meetings' },
  { id: 'recordings', name: 'Recordings' },
  { id: 'settings', name: 'Settings' }
]);

const activeRooms = computed(() => rooms.value.filter(r => r.status === 'active'));
const scheduledRooms = computed(() => rooms.value.filter(r => r.status === 'waiting' && r.scheduledAt));
const pastRooms = computed(() => rooms.value.filter(r => r.status === 'ended'));

onMounted(() => {
  loadData();
});

async function loadData() {
  await Promise.all([
    loadRooms(),
    loadRecordings(),
    loadSettings(),
    loadStats()
  ]);
}

async function loadStats() {
  try {
    const response = await api.get('/v1/video-calls/analytics');
    stats.value = {
      activeRooms: activeRooms.value.length,
      monthlyRooms: response.data.analytics.totalRooms,
      totalMinutes: response.data.analytics.totalDurationMinutes,
      recordingCount: response.data.analytics.totalRecordings
    };
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

async function loadRooms() {
  try {
    const response = await api.get('/v1/video-calls/rooms');
    rooms.value = response.data.rooms;
  } catch (error) {
    console.error('Failed to load rooms:', error);
  }
}

async function loadRecordings() {
  try {
    // Load recordings from all ended rooms
    const roomsResponse = await api.get('/v1/video-calls/rooms', { params: { status: 'ended' } });
    const allRecordings = [];

    for (const room of roomsResponse.data.rooms.slice(0, 10)) {
      try {
        const recResponse = await api.get(`/v1/video-calls/rooms/${room.id}/recordings`);
        allRecordings.push(...recResponse.data.recordings.map(r => ({
          ...r,
          roomName: room.name
        })));
      } catch (e) {
        // Ignore errors for individual rooms
      }
    }

    recordings.value = allRecordings;
  } catch (error) {
    console.error('Failed to load recordings:', error);
  }
}

async function loadSettings() {
  try {
    const response = await api.get('/v1/video-calls/settings');
    if (response.data.settings) {
      settings.value = {
        defaultVideoEnabled: response.data.settings.videoEnabled,
        waitingRoomEnabled: false,
        autoRecord: false,
        defaultQuality: response.data.settings.defaultVideoQuality || 'hd'
      };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

async function createInstantRoom() {
  try {
    const response = await api.post('/v1/video-calls/rooms', {
      name: `Meeting ${new Date().toLocaleString()}`,
      roomType: 'instant'
    });

    const room = response.data.room;
    router.push(`/video/call/${room.id}`);
  } catch (error) {
    console.error('Failed to create room:', error);
    alert('Failed to create meeting');
  }
}

async function scheduleRoom() {
  try {
    await api.post('/v1/video-calls/rooms', {
      name: newRoom.value.name,
      roomType: 'scheduled',
      scheduledAt: newRoom.value.scheduledAt,
      maxParticipants: newRoom.value.maxParticipants
    });

    showScheduleModal.value = false;
    newRoom.value = { name: '', scheduledAt: '', maxParticipants: 10 };
    await loadRooms();
  } catch (error) {
    console.error('Failed to schedule room:', error);
    alert('Failed to schedule meeting');
  }
}

async function joinWithCode() {
  try {
    const response = await api.get(`/v1/video-calls/rooms/code/${joinCode.value}`);
    if (response.data.room) {
      router.push({
        path: `/video/call/${response.data.room.id}`,
        query: { displayName: displayName.value }
      });
    }
  } catch (error) {
    console.error('Failed to join room:', error);
    alert('Invalid meeting code');
  }
}

function joinRoom(room) {
  router.push(`/video/call/${room.id}`);
}

function startScheduledRoom(room) {
  router.push(`/video/call/${room.id}`);
}

function copyInviteLink(room) {
  const link = `${window.location.origin}/video/join?code=${room.roomCode}`;
  navigator.clipboard.writeText(link);
  alert('Invite link copied to clipboard');
}

function viewRecordings(room) {
  activeTab.value = 'recordings';
}

async function downloadRecording(recording) {
  try {
    const response = await api.get(`/v1/video-calls/recordings/${recording.id}/download`);
    if (response.data.downloadUrl) {
      window.open(response.data.downloadUrl, '_blank');
    }
  } catch (error) {
    console.error('Failed to get download URL:', error);
  }
}

async function saveSettings() {
  try {
    await api.patch('/v1/video-calls/settings', {
      videoEnabled: settings.value.defaultVideoEnabled,
      defaultVideoQuality: settings.value.defaultQuality
    });
    alert('Settings saved');
  } catch (error) {
    console.error('Failed to save settings:', error);
    alert('Failed to save settings');
  }
}

function formatDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString();
}

function formatTimeAgo(date) {
  if (!date) return 'N/A';
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs}:${remainMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
</script>
