<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Header -->
    <header class="bg-white shadow">
      <div class="mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div class="flex items-center justify-between">
          <!-- Logo and Title -->
          <div class="flex items-center">
            <h1 class="text-2xl font-bold text-gray-900">IRISX Agent Desktop</h1>
          </div>

          <!-- Status and User Menu -->
          <div class="flex items-center space-x-4">
            <!-- Agent Status Selector -->
            <AgentStatusSelector
              v-model="agentStatus"
              @status-changed="handleStatusChange"
            />

            <!-- User Info and Logout -->
            <div class="flex items-center space-x-3 border-l border-gray-300 pl-4">
              <div class="text-right">
                <p class="text-sm font-medium text-gray-700">{{ authStore.user?.email || 'Agent' }}</p>
                <p class="text-xs text-gray-500">{{ authStore.user?.role || 'Agent' }}</p>
              </div>
              <button
                @click="handleLogout"
                class="text-gray-600 hover:text-gray-900 transition-colors"
                title="Logout"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left Column: Softphone (takes 1/3 on large screens) -->
        <div class="lg:col-span-1">
          <div class="bg-white rounded-lg shadow p-4">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">Softphone</h2>
            <Softphone
              @call-started="handleCallStarted"
              @call-ended="handleCallEnded"
              @call-muted="handleCallMuted"
              @call-held="handleCallHeld"
              @call-transferred="handleCallTransferred"
            />
          </div>
        </div>

        <!-- Right Column: Call History and Info (takes 2/3 on large screens) -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Current Call Info -->
          <div v-if="currentCall" class="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg shadow">
            <div class="flex items-start">
              <div class="flex-shrink-0">
                <svg class="text-blue-500" fill="currentColor" viewBox="0 0 20 20" style="width: 20px !important; height: 20px !important; min-width: 20px !important; min-height: 20px !important; max-width: 20px !important; max-height: 20px !important;">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
              </div>
              <div class="ml-3 flex-1">
                <h3 class="text-sm font-medium text-blue-900">Active Call</h3>
                <div class="mt-2 text-sm text-blue-800">
                  <p><strong>Number:</strong> {{ currentCall.number }}</p>
                  <p><strong>Started:</strong> {{ currentCall.startTime }}</p>
                  <p v-if="currentCall.customerName"><strong>Customer:</strong> {{ currentCall.customerName }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Call History -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-4 py-3 border-b border-gray-200">
              <h2 class="text-lg font-semibold text-gray-900">Recent Calls</h2>
            </div>
            <div class="p-4">
              <!-- Empty State -->
              <div v-if="callHistory.length === 0" class="text-center py-8">
                <svg class="mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 48px !important; height: 48px !important; min-width: 48px !important; min-height: 48px !important; max-width: 48px !important; max-height: 48px !important;">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <p class="mt-2 text-sm text-gray-600">No calls yet</p>
                <p class="text-xs text-gray-500 mt-1">Your call history will appear here</p>
              </div>

              <!-- Call History List -->
              <div v-else class="space-y-3">
                <div
                  v-for="call in callHistory"
                  :key="call.id"
                  class="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div class="flex items-center space-x-3">
                    <!-- Call Icon with Status Color -->
                    <div
                      class="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center"
                      :class="{
                        'bg-green-100': call.outcome === 'completed',
                        'bg-yellow-100': call.outcome === 'no_answer' || call.outcome === 'voicemail',
                        'bg-red-100': call.outcome === 'disconnected',
                        'bg-gray-100': !call.outcome
                      }"
                    >
                      <svg
                        :class="{
                          'text-green-600': call.outcome === 'completed',
                          'text-yellow-600': call.outcome === 'no_answer' || call.outcome === 'voicemail',
                          'text-red-600': call.outcome === 'disconnected',
                          'text-gray-600': !call.outcome
                        }"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        style="width: 18px !important; height: 18px !important; min-width: 18px !important; min-height: 18px !important; max-width: 18px !important; max-height: 18px !important;"
                      >
                        <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                      </svg>
                    </div>

                    <!-- Call Details -->
                    <div>
                      <p class="text-sm font-medium text-gray-900">{{ call.number }}</p>
                      <p class="text-xs text-gray-500">
                        {{ call.startTime }} • {{ formatDuration(call.duration) }}
                      </p>
                      <p v-if="call.outcome" class="text-xs text-gray-600 mt-1">
                        {{ formatOutcome(call.outcome) }}
                      </p>
                    </div>
                  </div>

                  <!-- View Notes Button -->
                  <button
                    v-if="call.notes"
                    @click="viewCallNotes(call)"
                    class="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                  >
                    View Notes
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Stats -->
          <div class="grid grid-cols-3 gap-4">
            <div class="bg-white rounded-lg shadow p-4">
              <p class="text-sm text-gray-600">Calls Today</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ stats.callsToday }}</p>
            </div>
            <div class="bg-white rounded-lg shadow p-4">
              <p class="text-sm text-gray-600">Talk Time</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ formatDuration(stats.talkTime) }}</p>
            </div>
            <div class="bg-white rounded-lg shadow p-4">
              <p class="text-sm text-gray-600">Avg Duration</p>
              <p class="text-2xl font-bold text-gray-900 mt-1">{{ formatDuration(stats.avgDuration) }}</p>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Call Disposition Modal -->
    <CallDispositionModal
      :is-open="showDispositionModal"
      :call-data="callToDispose"
      @close="showDispositionModal = false"
      @saved="handleDispositionSaved"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import Softphone from '../../components/Softphone.vue'
import AgentStatusSelector from '../../components/AgentStatusSelector.vue'
import CallDispositionModal from '../../components/CallDispositionModal.vue'

const router = useRouter()
const authStore = useAuthStore()

// State
const agentStatus = ref('available')
const currentCall = ref(null)
const callHistory = ref([])
const showDispositionModal = ref(false)
const callToDispose = ref(null)

// Stats
const stats = ref({
  callsToday: 0,
  talkTime: 0,
  avgDuration: 0
})

// Methods
function handleStatusChange(status) {
  console.log('Agent status changed to:', status)
  // In Phase 3, this would sync to Firebase Realtime DB
}

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}

function handleCallStarted(data) {
  console.log('Call started:', data)
  currentCall.value = {
    number: data.number,
    startTime: new Date().toLocaleTimeString(),
    customerName: null // Would be fetched from CRM in real app
  }
}

function handleCallEnded(data) {
  console.log('Call ended:', data)

  // Prepare call data for disposition
  callToDispose.value = {
    number: data.number,
    duration: data.duration,
    startTime: new Date(),
    callSid: 'demo-' + Date.now()
  }

  // Show disposition modal
  showDispositionModal.value = true

  // Clear current call
  currentCall.value = null
}

function handleCallMuted(data) {
  console.log('Call muted:', data.muted)
}

function handleCallHeld(data) {
  console.log('Call on hold:', data.onHold)
}

function handleCallTransferred() {
  console.log('Call transfer initiated')
}

function handleDispositionSaved(data) {
  console.log('Disposition saved:', data)

  // Add to call history
  callHistory.value.unshift({
    id: Date.now(),
    number: data.call_sid,
    startTime: new Date().toLocaleTimeString(),
    duration: callToDispose.value.duration,
    outcome: data.outcome,
    notes: data.notes
  })

  // Update stats
  stats.value.callsToday++
  stats.value.talkTime += callToDispose.value.duration

  if (stats.value.callsToday > 0) {
    stats.value.avgDuration = Math.floor(stats.value.talkTime / stats.value.callsToday)
  }
}

function viewCallNotes(call) {
  alert(`Notes for ${call.number}:\n\n${call.notes}`)
  // In real app, this would open a modal or side panel
}

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatOutcome(outcome) {
  const outcomes = {
    completed: 'Completed',
    no_answer: 'No Answer',
    voicemail: 'Left Voicemail',
    busy: 'Busy',
    callback_requested: 'Callback Requested',
    transferred: 'Transferred',
    disconnected: 'Disconnected',
    wrong_number: 'Wrong Number'
  }
  return outcomes[outcome] || outcome
}
</script>
