<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Call Recordings</h1>
        <p class="text-sm text-gray-600 mt-1">Listen, download, and search call recordings</p>
      </div>
      <div class="text-sm text-gray-600">
        Total: {{ recordings.length }} recordings
      </div>
    </div>

    <!-- Search and Filters -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Search</label>
          <input
            v-model="searchQuery"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Caller, agent, or phone..."
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
          <input
            v-model="startDate"
            type="date"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">End Date</label>
          <input
            v-model="endDate"
            type="date"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Duration</label>
          <select
            v-model="durationFilter"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">All Durations</option>
            <option value="short">Short (< 1 min)</option>
            <option value="medium">Medium (1-5 min)</option>
            <option value="long">Long (> 5 min)</option>
          </select>
        </div>
      </div>
      <div class="mt-4 flex justify-between items-center">
        <button
          @click="clearFilters"
          class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
        >
          Clear Filters
        </button>
        <div class="text-sm text-gray-600">
          Showing {{ filteredRecordings.length }} of {{ recordings.length }} recordings
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class=" animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <!-- Recordings List -->
    <div v-else class="space-y-4">
      <div
        v-for="recording in paginatedRecordings"
        :key="recording.id"
        class="bg-white rounded-lg shadow p-6"
      >
        <div class="flex items-start justify-between mb-4">
          <div class="flex-1">
            <div class="flex items-center space-x-3 mb-2">
              <h3 class="text-lg font-semibold text-gray-900">
                {{ recording.caller_id || 'Unknown Caller' }} → {{ recording.agent_name || 'No Agent' }}
              </h3>
              <span
                class="px-2 py-1 text-xs font-medium rounded-full"
                :class="getStatusColor(recording.status)"
              >
                {{ recording.status }}
              </span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
              <div>
                <span class="font-medium">Date:</span> {{ formatDateTime(recording.created_at) }}
              </div>
              <div>
                <span class="font-medium">Duration:</span> {{ formatDuration(recording.duration) }}
              </div>
              <div>
                <span class="font-medium">Size:</span> {{ formatFileSize(recording.file_size) }}
              </div>
              <div>
                <span class="font-medium">Call ID:</span> {{ recording.call_id }}
              </div>
            </div>
          </div>
        </div>

        <!-- Audio Player -->
        <div v-if="playingRecording?.id === recording.id" class="mb-4 p-4 bg-gray-50 rounded-lg">
          <div class="flex items-center space-x-4">
            <button
              @click="togglePlayPause"
              class="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700"
            >
              <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class=" w-5 h-5" v-if="!isPlaying"  fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/>
              </svg>
              <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class=" w-5 h-5" v-else  fill="currentColor" viewBox="0 0 20 20">
                <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z"/>
              </svg>
            </button>

            <div class="flex-1">
              <div class="flex items-center space-x-2 mb-1">
                <span class="text-sm text-gray-600">{{ formatTime(currentTime) }}</span>
                <input
                  type="range"
                  :value="currentTime"
                  :max="audioDuration"
                  @input="seekAudio"
                  class="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <span class="text-sm text-gray-600">{{ formatTime(audioDuration) }}</span>
              </div>
              <audio
                ref="audioPlayer"
                :src="audioUrl"
                @timeupdate="updateProgress"
                @loadedmetadata="updateDuration"
                @ended="audioEnded"
              ></audio>
            </div>

            <button
              @click="changeSpeed"
              class="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              {{ playbackSpeed }}x
            </button>
          </div>
        </div>

        <!-- Transcription (if available) -->
        <div v-if="recording.transcription" class="mb-4 p-4 bg-blue-50 rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-sm font-semibold text-blue-900">Transcription</h4>
            <button
              @click="toggleTranscription(recording.id)"
              class="text-xs text-blue-600 hover:text-blue-800"
            >
              {{ expandedTranscriptions.includes(recording.id) ? 'Hide' : 'Show' }}
            </button>
          </div>
          <p
            v-if="expandedTranscriptions.includes(recording.id)"
            class="text-sm text-blue-800 whitespace-pre-wrap"
          >
            {{ recording.transcription }}
          </p>
        </div>

        <!-- Actions -->
        <div class="flex space-x-2">
          <button
            @click="playRecording(recording)"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {{ playingRecording?.id === recording.id ? 'Stop' : 'Play' }}
          </button>
          <button
            @click="downloadRecording(recording)"
            class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Download
          </button>
          <button
            v-if="recording.transcription"
            @click="copyTranscription(recording)"
            class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Copy Transcription
          </button>
          <button
            @click="deleteRecording(recording)"
            class="px-4 py-2 text-red-600 hover:text-red-800"
          >
            Delete
          </button>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="filteredRecordings.length === 0" class="bg-white rounded-lg shadow p-12 text-center">
        <svg style="width: 48px; height: 48px; min-width: 48px; min-height: 48px; max-width: 48px; max-height: 48px;" class="mx-auto  text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
        </svg>
        <p class="text-gray-500">No recordings found matching your filters</p>
      </div>

      <!-- Pagination -->
      <div v-if="filteredRecordings.length > pageSize" class="flex justify-between items-center bg-white rounded-lg shadow p-4">
        <div class="text-sm text-gray-600">
          Showing {{ (currentPage - 1) * pageSize + 1 }} to {{ Math.min(currentPage * pageSize, filteredRecordings.length) }} of {{ filteredRecordings.length }}
        </div>
        <div class="flex space-x-2">
          <button
            @click="currentPage--"
            :disabled="currentPage === 1"
            class="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            @click="currentPage++"
            :disabled="currentPage >= totalPages"
            class="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { apiClient } from '../utils/api'

const loading = ref(true)
const recordings = ref([])
const searchQuery = ref('')
const startDate = ref('')
const endDate = ref('')
const durationFilter = ref('')
const playingRecording = ref(null)
const audioPlayer = ref(null)
const audioUrl = ref('')
const isPlaying = ref(false)
const currentTime = ref(0)
const audioDuration = ref(0)
const playbackSpeed = ref(1)
const expandedTranscriptions = ref([])
const currentPage = ref(1)
const pageSize = 10

const filteredRecordings = computed(() => {
  let filtered = recordings.value

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(r =>
      r.caller_id?.toLowerCase().includes(query) ||
      r.agent_name?.toLowerCase().includes(query) ||
      r.call_id?.toLowerCase().includes(query)
    )
  }

  // Date range filter
  if (startDate.value) {
    filtered = filtered.filter(r => new Date(r.created_at) >= new Date(startDate.value))
  }
  if (endDate.value) {
    filtered = filtered.filter(r => new Date(r.created_at) <= new Date(endDate.value))
  }

  // Duration filter
  if (durationFilter.value === 'short') {
    filtered = filtered.filter(r => r.duration < 60)
  } else if (durationFilter.value === 'medium') {
    filtered = filtered.filter(r => r.duration >= 60 && r.duration <= 300)
  } else if (durationFilter.value === 'long') {
    filtered = filtered.filter(r => r.duration > 300)
  }

  return filtered
})

const totalPages = computed(() => Math.ceil(filteredRecordings.value.length / pageSize))

const paginatedRecordings = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  const end = start + pageSize
  return filteredRecordings.value.slice(start, end)
})

onMounted(() => {
  fetchRecordings()
})

onUnmounted(() => {
  stopAudio()
})

async function fetchRecordings() {
  loading.value = true
  try {
    const response = await apiClient.get('/v1/recordings')
    recordings.value = response.data.recordings || []
  } catch (error) {
    console.error('Failed to fetch recordings:', error)
  } finally {
    loading.value = false
  }
}

async function playRecording(recording) {
  if (playingRecording.value?.id === recording.id) {
    stopAudio()
    return
  }

  try {
    // Get presigned URL from backend
    const response = await apiClient.get(`/v1/recordings/${recording.id}/presigned-url`)
    audioUrl.value = response.data.url
    playingRecording.value = recording

    // Wait for audio element to be ready
    await new Promise(resolve => setTimeout(resolve, 100))
    if (audioPlayer.value) {
      audioPlayer.value.play()
      isPlaying.value = true
    }
  } catch (error) {
    console.error('Failed to play recording:', error)
    alert('Failed to load recording')
  }
}

function togglePlayPause() {
  if (!audioPlayer.value) return

  if (isPlaying.value) {
    audioPlayer.value.pause()
  } else {
    audioPlayer.value.play()
  }
  isPlaying.value = !isPlaying.value
}

function stopAudio() {
  if (audioPlayer.value) {
    audioPlayer.value.pause()
    audioPlayer.value.currentTime = 0
  }
  playingRecording.value = null
  isPlaying.value = false
  currentTime.value = 0
}

function updateProgress() {
  if (audioPlayer.value) {
    currentTime.value = audioPlayer.value.currentTime
  }
}

function updateDuration() {
  if (audioPlayer.value) {
    audioDuration.value = audioPlayer.value.duration
  }
}

function seekAudio(event) {
  if (audioPlayer.value) {
    audioPlayer.value.currentTime = event.target.value
  }
}

function changeSpeed() {
  const speeds = [1, 1.25, 1.5, 1.75, 2]
  const currentIndex = speeds.indexOf(playbackSpeed.value)
  playbackSpeed.value = speeds[(currentIndex + 1) % speeds.length]
  if (audioPlayer.value) {
    audioPlayer.value.playbackRate = playbackSpeed.value
  }
}

function audioEnded() {
  isPlaying.value = false
  currentTime.value = 0
}

async function downloadRecording(recording) {
  try {
    const response = await apiClient.get(`/v1/recordings/${recording.id}/presigned-url`)
    const link = document.createElement('a')
    link.href = response.data.url
    link.download = `recording-${recording.call_id}-${new Date(recording.created_at).toISOString()}.wav`
    link.click()
  } catch (error) {
    console.error('Failed to download recording:', error)
    alert('Failed to download recording')
  }
}

function toggleTranscription(id) {
  const index = expandedTranscriptions.value.indexOf(id)
  if (index > -1) {
    expandedTranscriptions.value.splice(index, 1)
  } else {
    expandedTranscriptions.value.push(id)
  }
}

function copyTranscription(recording) {
  navigator.clipboard.writeText(recording.transcription)
  alert('Transcription copied to clipboard!')
}

async function deleteRecording(recording) {
  if (!confirm(`Delete recording from ${recording.caller_id}?`)) return
  try {
    await apiClient.delete(`/v1/recordings/${recording.id}`)
    await fetchRecordings()
    if (playingRecording.value?.id === recording.id) {
      stopAudio()
    }
  } catch (error) {
    alert('Failed to delete recording')
  }
}

function clearFilters() {
  searchQuery.value = ''
  startDate.value = ''
  endDate.value = ''
  durationFilter.value = ''
  currentPage.value = 1
}

function getStatusColor(status) {
  const colors = {
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    processing: 'bg-yellow-100 text-yellow-800'
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

function formatDateTime(dateString) {
  return new Date(dateString).toLocaleString()
}

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}
</script>

<style scoped>
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #2563eb;
  cursor: pointer;
}

input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #2563eb;
  cursor: pointer;
  border: none;
}
</style>
