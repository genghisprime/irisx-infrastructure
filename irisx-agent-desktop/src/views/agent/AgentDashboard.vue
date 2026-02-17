<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Header -->
    <header class="bg-white shadow">
      <div class="mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div class="flex items-center justify-between">
          <!-- Logo and Title -->
          <div class="flex items-center">
            <h1 class="text-2xl font-bold text-gray-900">Tazzi Agent Desktop</h1>
          </div>

          <!-- Status and User Menu -->
          <div class="flex items-center space-x-4">
            <!-- Agent Status Selector -->
            <AgentStatusSelector
              v-model="agentStatus"
              @status-changed="handleStatusChange"
            />

            <!-- User Info and Actions -->
            <div class="flex items-center space-x-3 border-l border-gray-300 pl-4">
              <div class="text-right">
                <p class="text-sm font-medium text-gray-700">{{ authStore.user?.email || 'Agent' }}</p>
                <p class="text-xs text-gray-500">{{ authStore.user?.role || 'Agent' }}</p>
              </div>
              <!-- Settings Button -->
              <button
                @click="showSettingsPanel = true"
                class="text-gray-600 hover:text-gray-900 transition-colors"
                title="Settings"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <!-- Logout Button -->
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
      <!-- Channel Tabs -->
      <div class="flex border-b border-gray-200 mb-6">
        <button
          v-for="tab in channelTabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
            activeTab === tab.id
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          ]"
        >
          <component :is="tab.icon" class="w-4 h-4" />
          {{ tab.name }}
          <span v-if="tab.count" class="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
            {{ tab.count }}
          </span>
        </button>
      </div>

      <!-- Voice Tab -->
      <div v-show="activeTab === 'voice'" class="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <!-- Left Column: Softphone + Queue Display (takes 1/4 on large screens) -->
        <div class="lg:col-span-1 space-y-6">
          <div class="bg-white rounded-lg shadow p-4">
            <h2 class="text-lg font-semibold text-gray-900 mb-4">Softphone</h2>
            <Softphone
              ref="softphoneRef"
              @call-started="handleCallStarted"
              @call-ended="handleCallEnded"
              @call-muted="handleCallMuted"
              @call-held="handleCallHeld"
              @call-transferred="handleCallTransferred"
            />
          </div>

          <!-- Queue Display -->
          <QueueDisplay :agent-id="authStore.user?.id || 1" />
        </div>

        <!-- Middle Column: Call History and Customer Info (takes 2/4 on large screens) -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Customer Info + Script Panel (shown during active call) -->
          <div v-if="currentCall" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="h-[400px]">
              <CustomerInfoPanel
                :phone-number="currentCall.number"
                :call-sid="currentCall.callSid"
                @customer-loaded="handleCustomerLoaded"
                @note-saved="handleNoteSaved"
                @contact-created="handleContactCreated"
              />
            </div>
            <div class="h-[400px]">
              <ScriptDisplay
                :token="authStore.token"
                :call-context="currentCall"
                :campaign-id="currentCall.campaignId"
                :queue-id="currentCall.queueId"
                :customer-data="currentCustomer"
                @step-completed="handleScriptStepCompleted"
                @script-completed="handleScriptCompleted"
                @data-collected="handleScriptDataCollected"
              />
            </div>
          </div>

          <!-- Live Transcript (during active call) -->
          <div v-if="currentCall" class="h-[300px]">
            <LiveTranscript
              :call-id="currentCall.callSid"
              :agent-name="authStore.user?.name || 'Agent'"
              @transcript-updated="handleTranscriptUpdated"
              @keyword-detected="handleKeywordDetected"
            />
          </div>

          <!-- Active Call Banner (compact view when customer panel is showing) -->
          <div v-if="currentCall" class="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-lg shadow flex items-center justify-between">
            <div class="flex items-center gap-3">
              <svg class="text-blue-500 w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              <div>
                <span class="text-sm font-medium text-blue-900">{{ currentCall.number }}</span>
                <span class="text-xs text-blue-600 ml-2">{{ currentCall.startTime }}</span>
              </div>
            </div>
            <span class="text-xs text-blue-600 animate-pulse">On Call</span>
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

        <!-- Right Column: Performance Widget + Knowledge Base (takes 1/4 on large screens) -->
        <div class="lg:col-span-1 space-y-6">
          <AgentPerformanceWidget :agent-id="authStore.user?.id || 1" />

          <!-- Knowledge Base Widget -->
          <KnowledgeBaseWidget
            :token="authStore.token"
            :call-context="currentCall ? { queueName: currentCall.queueName, ivrPath: currentCall.ivrPath } : null"
            @article-selected="handleArticleSelected"
            @send-to-customer="handleSendArticleToCustomer"
          />
        </div>
      </div>

      <!-- Inbox Tab (Omnichannel) -->
      <div v-show="activeTab === 'inbox'" class="h-[calc(100vh-200px)]">
        <UnifiedInbox
          :agent-id="authStore.user?.id"
          :token="authStore.token"
          @conversation-selected="handleConversationSelected"
          @message-sent="handleMessageSent"
        />
      </div>
    </main>

    <!-- Call Disposition Modal -->
    <CallDispositionModal
      :is-open="showDispositionModal"
      :call-data="callToDispose"
      @close="showDispositionModal = false"
      @saved="handleDispositionSaved"
    />

    <!-- Agent Settings Panel -->
    <AgentSettingsPanel
      :is-open="showSettingsPanel"
      :agent-id="authStore.user?.id || 1"
      @close="showSettingsPanel = false"
      @saved="handleSettingsSaved"
    />

    <!-- Keyboard Shortcuts Modal -->
    <div v-if="showShortcutsModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" @click.self="showShortcutsModal = false">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div class="flex items-center justify-between px-6 py-4 border-b">
          <h2 class="text-lg font-semibold text-gray-900">Keyboard Shortcuts</h2>
          <button @click="showShortcutsModal = false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
          <div v-for="(actions, category) in shortcutCategories" :key="category" class="mb-6 last:mb-0">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">{{ category }}</h3>
            <div class="space-y-2">
              <div
                v-for="actionId in actions"
                :key="actionId"
                class="flex items-center justify-between py-2 px-3 bg-gray-50 rounded"
              >
                <span class="text-sm text-gray-700">{{ shortcuts[actionId]?.description }}</span>
                <kbd class="px-2 py-1 text-xs font-mono bg-gray-200 rounded text-gray-700">
                  {{ formatShortcutKey(shortcuts[actionId]) }}
                </kbd>
              </div>
            </div>
          </div>
        </div>
        <div class="px-6 py-4 border-t bg-gray-50">
          <p class="text-xs text-gray-500 text-center">Press <kbd class="px-1.5 py-0.5 bg-gray-200 rounded text-gray-700 font-mono">Shift + ?</kbd> anytime to show this help</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useFirebase } from '../../composables/useFirebase'
import { useKeyboardShortcuts, shortcutCategories } from '../../composables/useKeyboardShortcuts'
import Softphone from '../../components/Softphone.vue'
import AgentStatusSelector from '../../components/AgentStatusSelector.vue'
import UnifiedInbox from '../../components/UnifiedInbox.vue'
import CallDispositionModal from '../../components/CallDispositionModal.vue'
import QueueDisplay from '../../components/QueueDisplay.vue'
import AgentPerformanceWidget from '../../components/AgentPerformanceWidget.vue'
import AgentSettingsPanel from '../../components/AgentSettingsPanel.vue'
import CustomerInfoPanel from '../../components/CustomerInfoPanel.vue'
import KnowledgeBaseWidget from '../../components/KnowledgeBaseWidget.vue'
import ScriptDisplay from '../../components/ScriptDisplay.vue'
import LiveTranscript from '../../components/LiveTranscript.vue'

const router = useRouter()
const authStore = useAuthStore()
const { initialize: initializeFirebase, updatePresence, presenceStatus, onlineAgents } = useFirebase()

// Keyboard shortcuts
const softphoneRef = ref(null)
const { shortcuts, showShortcutsModal, getShortcutsList } = useKeyboardShortcuts({
  onAction: handleShortcutAction,
})

function handleShortcutAction(action, event) {
  switch (action) {
    // Call Controls
    case 'answer_call':
      softphoneRef.value?.answerCall?.()
      break
    case 'end_call':
      softphoneRef.value?.endCall?.()
      break
    case 'mute_toggle':
      softphoneRef.value?.toggleMute?.()
      break
    case 'hold_toggle':
      softphoneRef.value?.toggleHold?.()
      break
    case 'transfer':
      softphoneRef.value?.openTransfer?.()
      break

    // Agent Status
    case 'status_available':
      agentStatus.value = 'available'
      handleStatusChange('available')
      break
    case 'status_busy':
      agentStatus.value = 'on_call'
      handleStatusChange('on_call')
      break
    case 'status_break':
      agentStatus.value = 'break'
      handleStatusChange('break')
      break
    case 'status_away':
      agentStatus.value = 'offline'
      handleStatusChange('offline')
      break

    // Navigation
    case 'tab_voice':
      activeTab.value = 'voice'
      break
    case 'tab_inbox':
      activeTab.value = 'inbox'
      break
    case 'open_dialpad':
      softphoneRef.value?.openDialpad?.()
      break
    case 'focus_search':
      document.querySelector('[data-search-input]')?.focus()
      break

    // Quick Actions
    case 'quick_note':
      if (currentCall.value) {
        // Open quick note for current call
        alert('Quick note: ' + currentCall.value.number)
      }
      break
    case 'copy_number':
      if (currentCall.value) {
        navigator.clipboard.writeText(currentCall.value.number)
      }
      break
    case 'open_contact':
      // Would open CRM contact in real implementation
      break

    // Wrap-up
    case 'select_disposition':
      if (callToDispose.value) {
        showDispositionModal.value = true
      }
      break
    case 'submit_wrapup':
      // Would submit the wrap-up form
      break

    default:
      console.log('Unhandled shortcut action:', action)
  }
}

// State
const agentStatus = ref('available')
const currentCall = ref(null)
const callHistory = ref([])
const showDispositionModal = ref(false)
const callToDispose = ref(null)
const showSettingsPanel = ref(false)

// Stats
const stats = ref({
  callsToday: 0,
  talkTime: 0,
  avgDuration: 0
})

// Channel tabs
const activeTab = ref('voice')
const inboxCount = ref(0)

// Tab icons as inline components
const PhoneIcon = {
  render: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' })
  ])
}

const InboxIcon = {
  render: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' })
  ])
}

const channelTabs = computed(() => [
  { id: 'voice', name: 'Voice', icon: PhoneIcon, count: null },
  { id: 'inbox', name: 'Inbox', icon: InboxIcon, count: inboxCount.value || null },
])

// Omnichannel handlers
const handleConversationSelected = (convo) => {
  console.log('Conversation selected:', convo)
}

const handleMessageSent = (message) => {
  console.log('Message sent:', message)
}

// Knowledge Base handlers
const handleArticleSelected = (article) => {
  console.log('KB article selected:', article.title)
}

const handleSendArticleToCustomer = (articleData) => {
  console.log('Sending article to customer:', articleData.title)
  // In a real implementation, this would:
  // 1. For chat/SMS/email: Insert the article link into the message composer
  // 2. For voice: Could read a summary using TTS or send follow-up SMS/email
  if (currentCall.value) {
    // Could trigger sending a follow-up SMS with the article link
    alert(`Would send article "${articleData.title}" to customer via SMS/email after call`)
  }
}

// Script Display handlers
const currentCustomer = ref({})

const handleScriptStepCompleted = (stepData) => {
  console.log('Script step completed:', stepData)
  // Track progress for reporting/analytics
}

const handleScriptCompleted = (completionData) => {
  console.log('Script completed:', completionData)
  // Could auto-populate disposition fields based on script outcome
}

const handleScriptDataCollected = (data) => {
  console.log('Script data collected:', data)
  if (data.action === 'add_note') {
    // Focus note input or open note modal
  } else if (data.action === 'schedule_callback') {
    // Open callback scheduler
  }
}

// Live Transcript handlers
const handleTranscriptUpdated = (transcript) => {
  // Could use transcript for real-time analytics, AI suggestions, etc.
  console.log('Transcript updated:', transcript.length, 'lines')
}

const handleKeywordDetected = (keywords) => {
  // Could trigger alerts, highlight keywords, or provide agent assist
  console.log('Keywords detected:', keywords)
  // Example: Show notification for important keywords
  if (keywords.includes('escalate') || keywords.includes('manager')) {
    console.log('Escalation keyword detected!')
  }
}

// Initialize Firebase on mount
onMounted(async () => {
  console.log('[AgentDashboard] Initializing Firebase...')
  await initializeFirebase()
})

// Methods
async function handleStatusChange(status) {
  console.log('Agent status changed to:', status)

  // Map agent status to Firebase presence status
  const firebaseStatus = {
    'available': 'online',
    'on_call': 'busy',
    'break': 'away',
    'offline': 'offline'
  }[status] || 'online'

  // Sync to Firebase Realtime DB
  await updatePresence(firebaseStatus)
}

async function handleLogout() {
  // Set presence to offline before logout
  await updatePresence('offline')
  await authStore.logout()
  router.push('/login')
}

function handleCallStarted(data) {
  console.log('Call started:', data)
  currentCall.value = {
    number: data.number,
    callSid: data.callSid || 'demo-' + Date.now(),
    startTime: new Date().toLocaleTimeString(),
    customerName: null // Will be populated by CustomerInfoPanel
  }
}

// Customer Info Panel handlers
function handleCustomerLoaded(customer) {
  currentCustomer.value = customer || {}
  if (customer && currentCall.value) {
    currentCall.value.customerName = customer.name
    console.log('Customer loaded:', customer.name)
  }
}

function handleNoteSaved(note) {
  console.log('Note saved:', note)
}

function handleContactCreated(contact) {
  console.log('Contact created:', contact)
  if (currentCall.value) {
    currentCall.value.customerName = contact.name
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

function handleSettingsSaved(newSettings) {
  console.log('Settings saved:', newSettings)
  // Apply settings that need immediate effect
  // e.g., theme changes, notification permissions, etc.
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

function formatShortcutKey(config) {
  if (!config) return ''
  const parts = []
  if (config.ctrl) parts.push('Ctrl')
  if (config.alt) parts.push('Alt')
  if (config.shift) parts.push('Shift')
  parts.push(config.key.toUpperCase())
  return parts.join(' + ')
}
</script>
