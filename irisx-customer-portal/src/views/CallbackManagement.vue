<template>
  <div class="p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-zinc-100">Callback Management</h1>
        <p class="text-zinc-400">Schedule and manage customer callback requests</p>
      </div>
      <button
        @click="showCreateModal = true"
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Schedule Callback
      </button>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-zinc-400">Pending</p>
            <p class="text-xl font-bold text-zinc-100">{{ stats.pending || 0 }}</p>
          </div>
        </div>
      </div>
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-zinc-400">Scheduled</p>
            <p class="text-xl font-bold text-zinc-100">{{ stats.scheduled || 0 }}</p>
          </div>
        </div>
      </div>
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-zinc-400">Completed</p>
            <p class="text-xl font-bold text-zinc-100">{{ stats.completed || 0 }}</p>
          </div>
        </div>
      </div>
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <p class="text-sm text-zinc-400">Avg Attempts</p>
            <p class="text-xl font-bold text-zinc-100">{{ parseFloat(stats.avg_attempts || 0).toFixed(1) }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-zinc-700 mb-4">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="[
          'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
          activeTab === tab.id
            ? 'border-blue-500 text-blue-400'
            : 'border-transparent text-zinc-400 hover:text-zinc-200'
        ]"
      >
        {{ tab.name }}
      </button>
    </div>

    <!-- Callbacks Tab -->
    <div v-if="activeTab === 'callbacks'">
      <!-- Filters -->
      <div class="flex gap-4 mb-4">
        <select
          v-model="filters.status"
          @change="loadCallbacks"
          class="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          v-model="filters.queue_id"
          @change="loadCallbacks"
          class="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
        >
          <option value="">All Queues</option>
          <option v-for="queue in queues" :key="queue.id" :value="queue.id">{{ queue.name }}</option>
        </select>
      </div>

      <!-- Callbacks Table -->
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
        <table class="w-full">
          <thead class="bg-zinc-900">
            <tr>
              <th class="text-left px-4 py-3 text-sm font-medium text-zinc-400">Contact</th>
              <th class="text-left px-4 py-3 text-sm font-medium text-zinc-400">Phone</th>
              <th class="text-left px-4 py-3 text-sm font-medium text-zinc-400">Queue</th>
              <th class="text-left px-4 py-3 text-sm font-medium text-zinc-400">Scheduled</th>
              <th class="text-left px-4 py-3 text-sm font-medium text-zinc-400">Status</th>
              <th class="text-left px-4 py-3 text-sm font-medium text-zinc-400">Attempts</th>
              <th class="text-left px-4 py-3 text-sm font-medium text-zinc-400">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-700">
            <tr v-for="callback in callbacks" :key="callback.id" class="hover:bg-zinc-750">
              <td class="px-4 py-3">
                <div>
                  <p class="text-zinc-200">{{ callback.caller_name || callback.contact_name || 'Unknown' }}</p>
                  <p class="text-xs text-zinc-500">{{ callback.reason || 'No reason provided' }}</p>
                </div>
              </td>
              <td class="px-4 py-3 text-zinc-300">{{ callback.phone_number }}</td>
              <td class="px-4 py-3 text-zinc-300">{{ callback.queue_name || '-' }}</td>
              <td class="px-4 py-3 text-zinc-300">
                {{ callback.scheduled_time ? formatDateTime(callback.scheduled_time) : 'ASAP' }}
              </td>
              <td class="px-4 py-3">
                <span :class="getStatusClass(callback.status)">
                  {{ callback.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-zinc-300">
                {{ callback.attempt_count }} / {{ callback.max_attempts }}
              </td>
              <td class="px-4 py-3">
                <div class="flex gap-2">
                  <button
                    v-if="callback.status === 'pending' || callback.status === 'scheduled'"
                    @click="rescheduleCallback(callback)"
                    class="text-blue-400 hover:text-blue-300"
                    title="Reschedule"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    v-if="callback.status === 'pending' || callback.status === 'scheduled'"
                    @click="cancelCallbackRequest(callback)"
                    class="text-red-400 hover:text-red-300"
                    title="Cancel"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <button
                    @click="viewCallback(callback)"
                    class="text-zinc-400 hover:text-zinc-300"
                    title="View Details"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="callbacks.length === 0">
              <td colspan="7" class="px-4 py-8 text-center text-zinc-500">
                No callback requests found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Schedules Tab -->
    <div v-if="activeTab === 'schedules'">
      <div class="flex justify-end mb-4">
        <button
          @click="showScheduleModal = true"
          class="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create Schedule
        </button>
      </div>

      <div class="grid gap-4">
        <div
          v-for="schedule in schedules"
          :key="schedule.id"
          class="bg-zinc-800 border border-zinc-700 rounded-lg p-4"
        >
          <div class="flex items-start justify-between">
            <div>
              <h3 class="text-lg font-medium text-zinc-100">{{ schedule.name }}</h3>
              <p class="text-sm text-zinc-400">{{ schedule.description || 'No description' }}</p>
              <div class="flex gap-4 mt-2 text-sm text-zinc-500">
                <span>Queue: {{ schedule.queue_name || 'All Queues' }}</span>
                <span>Time Zone: {{ schedule.time_zone }}</span>
                <span>Slot Duration: {{ schedule.slot_duration_minutes }} min</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span :class="schedule.is_active ? 'text-green-400' : 'text-zinc-500'">
                {{ schedule.is_active ? 'Active' : 'Inactive' }}
              </span>
              <button
                @click="editSchedule(schedule)"
                class="p-2 text-zinc-400 hover:text-zinc-200"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Weekly Schedule Display -->
          <div v-if="schedule.weekly_schedule && schedule.weekly_schedule.length > 0" class="mt-4">
            <div class="flex gap-2 flex-wrap">
              <div
                v-for="day in schedule.weekly_schedule"
                :key="day.day"
                class="bg-zinc-700 rounded px-3 py-1 text-sm"
              >
                <span class="text-zinc-300">{{ getDayName(day.day) }}:</span>
                <span class="text-zinc-400 ml-1">{{ day.start }} - {{ day.end }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="schedules.length === 0" class="text-center py-8 text-zinc-500">
          No callback schedules configured
        </div>
      </div>
    </div>

    <!-- Rules Tab -->
    <div v-if="activeTab === 'rules'">
      <div class="flex justify-end mb-4">
        <button
          @click="showRuleModal = true"
          class="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create Rule
        </button>
      </div>

      <div class="grid gap-4">
        <div
          v-for="rule in rules"
          :key="rule.id"
          class="bg-zinc-800 border border-zinc-700 rounded-lg p-4"
        >
          <div class="flex items-start justify-between">
            <div>
              <h3 class="text-lg font-medium text-zinc-100">{{ rule.name }}</h3>
              <p class="text-sm text-zinc-400">{{ rule.description || 'No description' }}</p>
              <div class="flex gap-4 mt-2 text-sm">
                <span v-if="rule.auto_offer_callback" class="text-green-400">Auto-offer enabled</span>
                <span v-if="rule.callback_priority_boost" class="text-blue-400">
                  Priority boost: +{{ rule.callback_priority_boost }}
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span :class="rule.is_active ? 'text-green-400' : 'text-zinc-500'">
                {{ rule.is_active ? 'Active' : 'Inactive' }}
              </span>
              <button
                @click="editRule(rule)"
                class="p-2 text-zinc-400 hover:text-zinc-200"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div v-if="rules.length === 0" class="text-center py-8 text-zinc-500">
          No callback rules configured
        </div>
      </div>
    </div>

    <!-- Create Callback Modal -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="showCreateModal = false"
    >
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg w-full max-w-md p-6">
        <h2 class="text-xl font-bold text-zinc-100 mb-4">Schedule Callback</h2>

        <form @submit.prevent="createCallback" class="space-y-4">
          <div>
            <label class="block text-sm text-zinc-400 mb-1">Phone Number *</label>
            <input
              v-model="newCallback.phone_number"
              type="tel"
              required
              class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
              placeholder="+1234567890"
            />
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Caller Name</label>
            <input
              v-model="newCallback.caller_name"
              type="text"
              class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
              placeholder="John Doe"
            />
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Queue</label>
            <select
              v-model="newCallback.queue_id"
              class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
            >
              <option value="">No specific queue</option>
              <option v-for="queue in queues" :key="queue.id" :value="queue.id">{{ queue.name }}</option>
            </select>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Requested Time</label>
            <input
              v-model="newCallback.requested_time"
              type="datetime-local"
              class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
            />
            <p class="text-xs text-zinc-500 mt-1">Leave empty for ASAP</p>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Reason</label>
            <textarea
              v-model="newCallback.reason"
              rows="2"
              class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
              placeholder="Why does the customer need a callback?"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Priority (1-100)</label>
            <input
              v-model.number="newCallback.priority"
              type="number"
              min="1"
              max="100"
              class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
            />
          </div>

          <div class="flex gap-3 pt-4">
            <button
              type="button"
              @click="showCreateModal = false"
              class="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="creating"
              class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white disabled:opacity-50"
            >
              {{ creating ? 'Creating...' : 'Schedule' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- View Callback Modal -->
    <div
      v-if="selectedCallback"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="selectedCallback = null"
    >
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg w-full max-w-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-zinc-100">Callback Details</h2>
          <button @click="selectedCallback = null" class="text-zinc-400 hover:text-zinc-200">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="space-y-3">
          <div class="flex justify-between">
            <span class="text-zinc-400">Contact:</span>
            <span class="text-zinc-200">{{ selectedCallback.caller_name || selectedCallback.contact_name || 'Unknown' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-zinc-400">Phone:</span>
            <span class="text-zinc-200">{{ selectedCallback.phone_number }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-zinc-400">Queue:</span>
            <span class="text-zinc-200">{{ selectedCallback.queue_name || '-' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-zinc-400">Status:</span>
            <span :class="getStatusClass(selectedCallback.status)">{{ selectedCallback.status }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-zinc-400">Scheduled:</span>
            <span class="text-zinc-200">
              {{ selectedCallback.scheduled_time ? formatDateTime(selectedCallback.scheduled_time) : 'ASAP' }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-zinc-400">Attempts:</span>
            <span class="text-zinc-200">{{ selectedCallback.attempt_count }} / {{ selectedCallback.max_attempts }}</span>
          </div>
          <div v-if="selectedCallback.reason">
            <span class="text-zinc-400">Reason:</span>
            <p class="text-zinc-200 mt-1">{{ selectedCallback.reason }}</p>
          </div>
        </div>

        <!-- Attempts History -->
        <div v-if="selectedCallbackAttempts && selectedCallbackAttempts.length > 0" class="mt-6">
          <h3 class="text-lg font-medium text-zinc-100 mb-3">Attempt History</h3>
          <div class="space-y-2">
            <div
              v-for="attempt in selectedCallbackAttempts"
              :key="attempt.id"
              class="bg-zinc-900 rounded-lg p-3"
            >
              <div class="flex items-center justify-between">
                <span class="text-zinc-400">Attempt #{{ attempt.attempt_number }}</span>
                <span :class="getAttemptOutcomeClass(attempt.outcome)">{{ attempt.outcome }}</span>
              </div>
              <div class="text-xs text-zinc-500 mt-1">
                {{ formatDateTime(attempt.created_at) }}
                <span v-if="attempt.duration_seconds"> - {{ attempt.duration_seconds }}s</span>
                <span v-if="attempt.agent_name"> - {{ attempt.agent_name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()

// State
const activeTab = ref('callbacks')
const tabs = [
  { id: 'callbacks', name: 'Callbacks' },
  { id: 'schedules', name: 'Schedules' },
  { id: 'rules', name: 'Rules' },
]

const callbacks = ref([])
const schedules = ref([])
const rules = ref([])
const queues = ref([])
const stats = ref({})
const loading = ref(false)
const creating = ref(false)

const showCreateModal = ref(false)
const showScheduleModal = ref(false)
const showRuleModal = ref(false)
const selectedCallback = ref(null)
const selectedCallbackAttempts = ref([])

const filters = ref({
  status: '',
  queue_id: '',
})

const newCallback = ref({
  phone_number: '',
  caller_name: '',
  queue_id: '',
  requested_time: '',
  reason: '',
  priority: 50,
  source: 'web',
})

// Methods
const loadCallbacks = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (filters.value.status) params.set('status', filters.value.status)
    if (filters.value.queue_id) params.set('queue_id', filters.value.queue_id)
    params.set('limit', '50')

    const response = await fetch(`/api/v1/callbacks?${params}`, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })
    const data = await response.json()
    if (data.success) {
      callbacks.value = data.callbacks
    }
  } catch (error) {
    console.error('Failed to load callbacks:', error)
  } finally {
    loading.value = false
  }
}

const loadStats = async () => {
  try {
    const response = await fetch('/api/v1/callbacks/stats', {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })
    const data = await response.json()
    if (data.success) {
      stats.value = data.stats
    }
  } catch (error) {
    console.error('Failed to load stats:', error)
  }
}

const loadSchedules = async () => {
  try {
    const response = await fetch('/api/v1/callbacks/schedules', {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })
    const data = await response.json()
    if (data.success) {
      schedules.value = data.schedules
    }
  } catch (error) {
    console.error('Failed to load schedules:', error)
  }
}

const loadRules = async () => {
  try {
    const response = await fetch('/api/v1/callbacks/rules', {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })
    const data = await response.json()
    if (data.success) {
      rules.value = data.rules
    }
  } catch (error) {
    console.error('Failed to load rules:', error)
  }
}

const loadQueues = async () => {
  try {
    const response = await fetch('/api/v1/queues', {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })
    const data = await response.json()
    if (data.success) {
      queues.value = data.queues || []
    }
  } catch (error) {
    console.error('Failed to load queues:', error)
  }
}

const createCallback = async () => {
  creating.value = true
  try {
    const payload = {
      phone_number: newCallback.value.phone_number,
      caller_name: newCallback.value.caller_name || undefined,
      queue_id: newCallback.value.queue_id ? parseInt(newCallback.value.queue_id) : undefined,
      requested_time: newCallback.value.requested_time ? new Date(newCallback.value.requested_time).toISOString() : undefined,
      reason: newCallback.value.reason || undefined,
      priority: newCallback.value.priority,
      source: 'web',
    }

    const response = await fetch('/api/v1/callbacks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`
      },
      body: JSON.stringify(payload)
    })

    const data = await response.json()
    if (data.success) {
      showCreateModal.value = false
      newCallback.value = {
        phone_number: '',
        caller_name: '',
        queue_id: '',
        requested_time: '',
        reason: '',
        priority: 50,
        source: 'web',
      }
      await loadCallbacks()
      await loadStats()
    }
  } catch (error) {
    console.error('Failed to create callback:', error)
  } finally {
    creating.value = false
  }
}

const viewCallback = async (callback) => {
  selectedCallback.value = callback
  try {
    const response = await fetch(`/api/v1/callbacks/${callback.id}`, {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })
    const data = await response.json()
    if (data.success) {
      selectedCallbackAttempts.value = data.attempts || []
    }
  } catch (error) {
    console.error('Failed to load callback details:', error)
  }
}

const rescheduleCallback = async (callback) => {
  const newTime = prompt('Enter new scheduled time (YYYY-MM-DD HH:MM):')
  if (!newTime) return

  try {
    const response = await fetch(`/api/v1/callbacks/${callback.id}/reschedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`
      },
      body: JSON.stringify({ scheduled_time: new Date(newTime).toISOString() })
    })

    if (response.ok) {
      await loadCallbacks()
    }
  } catch (error) {
    console.error('Failed to reschedule callback:', error)
  }
}

const cancelCallbackRequest = async (callback) => {
  if (!confirm('Are you sure you want to cancel this callback?')) return

  try {
    const response = await fetch(`/api/v1/callbacks/${callback.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`
      },
      body: JSON.stringify({ reason: 'Cancelled by user' })
    })

    if (response.ok) {
      await loadCallbacks()
      await loadStats()
    }
  } catch (error) {
    console.error('Failed to cancel callback:', error)
  }
}

const editSchedule = (schedule) => {
  // TODO: Implement schedule editing
  console.log('Edit schedule:', schedule)
}

const editRule = (rule) => {
  // TODO: Implement rule editing
  console.log('Edit rule:', rule)
}

// Helpers
const formatDateTime = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString()
}

const getDayName = (day) => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return days[day]
}

const getStatusClass = (status) => {
  const classes = {
    pending: 'px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs',
    scheduled: 'px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs',
    in_progress: 'px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs',
    completed: 'px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs',
    failed: 'px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs',
    cancelled: 'px-2 py-1 bg-zinc-500/20 text-zinc-400 rounded text-xs',
  }
  return classes[status] || classes.pending
}

const getAttemptOutcomeClass = (outcome) => {
  const classes = {
    answered: 'text-green-400',
    no_answer: 'text-yellow-400',
    busy: 'text-orange-400',
    voicemail: 'text-blue-400',
    failed: 'text-red-400',
    cancelled: 'text-zinc-400',
  }
  return classes[outcome] || 'text-zinc-400'
}

// Lifecycle
onMounted(async () => {
  await Promise.all([
    loadCallbacks(),
    loadStats(),
    loadSchedules(),
    loadRules(),
    loadQueues(),
  ])
})
</script>
