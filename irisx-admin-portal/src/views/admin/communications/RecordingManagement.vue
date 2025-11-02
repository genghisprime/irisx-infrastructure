<template>
  <div>
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Call Recordings</h1>

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600">Total Recordings</p>
        <p class="text-2xl font-bold text-gray-900 mt-2">{{ stats.total || 0 }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600">Total Duration</p>
        <p class="text-2xl font-bold text-gray-900 mt-2">{{ formatDuration(stats.total_duration) }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600">Storage Used</p>
        <p class="text-2xl font-bold text-gray-900 mt-2">{{ formatBytes(stats.storage_bytes) }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600">This Month</p>
        <p class="text-2xl font-bold text-gray-900 mt-2">{{ stats.this_month || 0 }}</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <input
          v-model="filters.search"
          type="text"
          placeholder="Search by call ID..."
          class="px-3 py-2 border rounded-md"
        />
        <input
          v-model="filters.date_from"
          type="date"
          class="px-3 py-2 border rounded-md"
        />
        <input
          v-model="filters.date_to"
          type="date"
          class="px-3 py-2 border rounded-md"
        />
        <button
          @click="applyFilters"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Apply
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <svg class="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4">
      <p class="text-red-600">{{ error }}</p>
    </div>

    <!-- Recordings Table -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Call ID
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Tenant
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              From/To
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Duration
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Size
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Date
            </th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="rec in recordings" :key="rec.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm font-medium text-gray-900">
              {{ rec.call_id }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ rec.tenant_name }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              <div>
                <p>{{ rec.from_number }}</p>
                <p class="text-gray-500">→ {{ rec.to_number }}</p>
              </div>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ formatDuration(rec.duration_seconds) }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ formatBytes(rec.file_size) }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ formatDate(rec.created_at) }}
            </td>
            <td class="px-6 py-4 text-right text-sm space-x-2">
              <button
                @click="playRecording(rec)"
                class="text-blue-600 hover:text-blue-800"
              >
                Play
              </button>
              <button
                @click="downloadRecording(rec)"
                class="text-green-600 hover:text-green-800"
              >
                Download
              </button>
              <button
                v-if="authStore.isSuperAdmin"
                @click="deleteRecording(rec)"
                class="text-red-600 hover:text-red-800"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Empty State -->
      <div v-if="recordings.length === 0" class="text-center py-12">
        <p class="text-gray-500">No recordings found</p>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="px-6 py-4 border-t flex justify-between">
        <div class="text-sm text-gray-700">
          Showing {{ (currentPage - 1) * 20 + 1 }} to {{ Math.min(currentPage * 20, total) }} of {{ total }}
        </div>
        <div class="flex space-x-2">
          <button
            @click="changePage(currentPage - 1)"
            :disabled="currentPage === 1"
            class="px-3 py-1 border rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            @click="changePage(currentPage + 1)"
            :disabled="currentPage === totalPages"
            class="px-3 py-1 border rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- Audio Player Modal -->
    <div
      v-if="playingRecording"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="playingRecording = null"
    >
      <div class="bg-white rounded-lg p-6 max-w-lg w-full mx-4" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Play Recording</h3>
        <audio
          v-if="audioUrl"
          controls
          autoplay
          class="w-full"
          :src="audioUrl"
        ></audio>
        <p class="text-sm text-gray-500 mt-4">
          Call ID: {{ playingRecording.call_id }}
        </p>
        <button
          @click="playingRecording = null"
          class="mt-4 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 w-full"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAdminAuthStore } from '../../../stores/adminAuth'
import { adminAPI } from '../../../utils/api'

const authStore = useAdminAuthStore()

const loading = ref(true)
const error = ref(null)
const recordings = ref([])
const stats = ref({})
const total = ref(0)
const currentPage = ref(1)
const playingRecording = ref(null)
const audioUrl = ref(null)

const filters = ref({
  search: '',
  date_from: '',
  date_to: ''
})

const totalPages = computed(() => Math.ceil(total.value / 20))

onMounted(() => {
  fetchRecordings()
  fetchStats()
})

async function fetchRecordings() {
  loading.value = true
  error.value = null

  try {
    const params = {
      page: currentPage.value,
      limit: 20,
      ...filters.value
    }

    const response = await adminAPI.recordings.list(params)
    recordings.value = response.data.recordings || []
    total.value = response.data.total || 0
  } catch (err) {
    console.error('Failed to fetch recordings:', err)
    error.value = 'Failed to load recordings'
  } finally {
    loading.value = false
  }
}

async function fetchStats() {
  try {
    const response = await adminAPI.recordings.getStats()
    stats.value = response.data
  } catch (err) {
    console.error('Failed to fetch stats:', err)
  }
}

function applyFilters() {
  currentPage.value = 1
  fetchRecordings()
}

function changePage(page) {
  currentPage.value = page
  fetchRecordings()
}

async function playRecording(rec) {
  try {
    const response = await adminAPI.recordings.getPresignedUrl(rec.id)
    audioUrl.value = response.data.url
    playingRecording.value = rec
  } catch (err) {
    console.error('Failed to get recording URL:', err)
    alert('Failed to load recording')
  }
}

async function downloadRecording(rec) {
  try {
    const response = await adminAPI.recordings.getPresignedUrl(rec.id)
    window.open(response.data.url, '_blank')
  } catch (err) {
    console.error('Failed to download recording:', err)
    alert('Failed to download recording')
  }
}

async function deleteRecording(rec) {
  if (!confirm(`Delete recording for call ${rec.call_id}? This cannot be undone.`)) return

  try {
    await adminAPI.recordings.delete(rec.id)
    await fetchRecordings()
    await fetchStats()
  } catch (err) {
    console.error('Failed to delete recording:', err)
    alert('Failed to delete recording')
  }
}

function formatDuration(seconds) {
  if (!seconds) return '0s'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDate(dateString) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString()
}
</script>
