<template>
  <div class="p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Voice Assistants</h1>
        <p class="text-gray-500 mt-1">Create and manage AI-powered voice bots for IVR and outbound calls</p>
      </div>
      <button @click="showCreateModal = true" class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 flex items-center gap-2">
        <PlusIcon class="h-5 w-5" />
        Create Assistant
      </button>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">Active Assistants</p>
        <p class="text-2xl font-bold text-violet-600">{{ stats.active || 0 }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">Total Conversations</p>
        <p class="text-2xl font-bold text-emerald-600">{{ stats.total_conversations || 0 }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">Completion Rate</p>
        <p class="text-2xl font-bold text-blue-600">{{ stats.completion_rate || 0 }}%</p>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">This Month Cost</p>
        <p class="text-2xl font-bold text-orange-600">${{ (stats.monthly_cost || 0).toFixed(2) }}</p>
      </div>
    </div>

    <!-- Assistants List -->
    <div class="bg-white rounded-lg shadow">
      <div class="p-4 border-b">
        <div class="flex items-center gap-4">
          <select v-model="filters.status" @change="loadAssistants" class="px-3 py-2 border rounded-lg text-sm">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="paused">Paused</option>
          </select>
          <select v-model="filters.assistant_type" @change="loadAssistants" class="px-3 py-2 border rounded-lg text-sm">
            <option value="">All Types</option>
            <option value="ivr_bot">IVR Bot</option>
            <option value="outbound_agent">Outbound Agent</option>
            <option value="survey_bot">Survey Bot</option>
            <option value="appointment_scheduler">Appointment Scheduler</option>
            <option value="payment_collector">Payment Collector</option>
          </select>
        </div>
      </div>

      <div class="divide-y">
        <div v-for="assistant in assistants" :key="assistant.id" class="p-4 hover:bg-gray-50">
          <div class="flex items-start justify-between">
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 bg-violet-100 rounded-lg flex items-center justify-center">
                <ChatBubbleLeftRightIcon class="h-6 w-6 text-violet-600" />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="font-semibold text-gray-900">{{ assistant.name }}</h3>
                  <span :class="getStatusClass(assistant.status)">{{ assistant.status }}</span>
                </div>
                <p class="text-sm text-gray-500 mt-1">{{ assistant.description || 'No description' }}</p>
                <div class="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span class="flex items-center gap-1">
                    <SpeakerWaveIcon class="h-4 w-4" />
                    {{ assistant.voice_name || 'Default Voice' }}
                  </span>
                  <span class="flex items-center gap-1">
                    <GlobeAltIcon class="h-4 w-4" />
                    {{ assistant.language || 'en-US' }}
                  </span>
                  <span class="flex items-center gap-1">
                    <PhoneIcon class="h-4 w-4" />
                    {{ assistant.total_conversations || 0 }} calls
                  </span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button @click="testAssistant(assistant)" class="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
                Test
              </button>
              <button @click="editAssistant(assistant)" class="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
                Edit
              </button>
              <button
                v-if="assistant.status === 'draft'"
                @click="publishAssistant(assistant)"
                class="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Publish
              </button>
              <button
                v-else-if="assistant.status === 'active'"
                @click="pauseAssistant(assistant)"
                class="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
              >
                Pause
              </button>
            </div>
          </div>
        </div>

        <div v-if="assistants.length === 0" class="p-8 text-center text-gray-500">
          <ChatBubbleLeftRightIcon class="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p>No voice assistants yet</p>
          <p class="text-sm">Create your first AI voice bot to get started</p>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showCreateModal || showEditModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8 mx-4">
        <div class="p-4 border-b flex items-center justify-between">
          <h3 class="font-semibold text-lg">{{ showEditModal ? 'Edit Voice Assistant' : 'Create Voice Assistant' }}</h3>
          <button @click="closeModal" class="text-gray-500 hover:text-gray-700">
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>

        <div class="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <!-- Basic Info -->
          <div>
            <h4 class="font-medium text-gray-900 mb-3">Basic Information</h4>
            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input v-model="form.name" class="w-full px-3 py-2 border rounded-lg" placeholder="Customer Support Bot" />
              </div>
              <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea v-model="form.description" rows="2" class="w-full px-3 py-2 border rounded-lg" placeholder="Handles common customer inquiries..."></textarea>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select v-model="form.assistant_type" class="w-full px-3 py-2 border rounded-lg">
                  <option value="ivr_bot">IVR Bot</option>
                  <option value="outbound_agent">Outbound Agent</option>
                  <option value="survey_bot">Survey Bot</option>
                  <option value="appointment_scheduler">Appointment Scheduler</option>
                  <option value="payment_collector">Payment Collector</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Language</label>
                <select v-model="form.language" class="w-full px-3 py-2 border rounded-lg">
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="es-ES">Spanish (Spain)</option>
                  <option value="es-MX">Spanish (Mexico)</option>
                  <option value="fr-FR">French</option>
                  <option value="de-DE">German</option>
                  <option value="it-IT">Italian</option>
                  <option value="pt-BR">Portuguese (Brazil)</option>
                  <option value="ja-JP">Japanese</option>
                  <option value="zh-CN">Chinese (Simplified)</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Voice Settings -->
          <div>
            <h4 class="font-medium text-gray-900 mb-3">Voice Settings</h4>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">TTS Provider</label>
                <select v-model="form.tts_provider_id" class="w-full px-3 py-2 border rounded-lg">
                  <option value="">Select provider...</option>
                  <option v-for="p in ttsProviders" :key="p.id" :value="p.id">{{ p.display_name }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">STT Provider</label>
                <select v-model="form.stt_provider_id" class="w-full px-3 py-2 border rounded-lg">
                  <option value="">Select provider...</option>
                  <option v-for="p in sttProviders" :key="p.id" :value="p.id">{{ p.display_name }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Voice</label>
                <select v-model="form.voice_id" class="w-full px-3 py-2 border rounded-lg">
                  <option value="alloy">Alloy (Neutral)</option>
                  <option value="echo">Echo (Male)</option>
                  <option value="fable">Fable (British)</option>
                  <option value="onyx">Onyx (Deep Male)</option>
                  <option value="nova">Nova (Female)</option>
                  <option value="shimmer">Shimmer (Soft Female)</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Speaking Rate</label>
                <div class="flex items-center gap-2">
                  <input v-model.number="form.speaking_rate" type="range" min="0.5" max="2" step="0.1" class="flex-1" />
                  <span class="text-sm text-gray-600 w-12">{{ form.speaking_rate }}x</span>
                </div>
              </div>
            </div>
          </div>

          <!-- AI Settings -->
          <div>
            <h4 class="font-medium text-gray-900 mb-3">AI Configuration</h4>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
                <textarea v-model="form.system_prompt" rows="4" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="You are a helpful customer service assistant for [Company Name]. You help customers with..."></textarea>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Temperature</label>
                  <div class="flex items-center gap-2">
                    <input v-model.number="form.temperature" type="range" min="0" max="1" step="0.1" class="flex-1" />
                    <span class="text-sm text-gray-600 w-12">{{ form.temperature }}</span>
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Max Response Tokens</label>
                  <input v-model.number="form.max_response_tokens" type="number" min="50" max="2000" class="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
            </div>
          </div>

          <!-- Messages -->
          <div>
            <h4 class="font-medium text-gray-900 mb-3">Messages</h4>
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Initial Greeting</label>
                <input v-model="form.initial_greeting" class="w-full px-3 py-2 border rounded-lg" placeholder="Hello! Thank you for calling. How can I help you today?" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Fallback Message</label>
                <input v-model="form.fallback_message" class="w-full px-3 py-2 border rounded-lg" placeholder="I'm sorry, I didn't understand that. Could you please repeat?" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Goodbye Message</label>
                <input v-model="form.goodbye_message" class="w-full px-3 py-2 border rounded-lg" placeholder="Thank you for calling. Have a great day!" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Transfer Message</label>
                <input v-model="form.transfer_message" class="w-full px-3 py-2 border rounded-lg" placeholder="Let me transfer you to an agent who can better assist you." />
              </div>
            </div>
          </div>

          <!-- Behavior Settings -->
          <div>
            <h4 class="font-medium text-gray-900 mb-3">Behavior Settings</h4>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Max Silence (seconds)</label>
                <input v-model.number="form.max_silence_seconds" type="number" min="1" max="30" class="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Max Conversation (minutes)</label>
                <input v-model.number="form.max_conversation_minutes" type="number" min="1" max="60" class="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Max No-Input Retries</label>
                <input v-model.number="form.max_no_input_retries" type="number" min="1" max="10" class="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Max No-Match Retries</label>
                <input v-model.number="form.max_no_match_retries" type="number" min="1" max="10" class="w-full px-3 py-2 border rounded-lg" />
              </div>
            </div>
          </div>

          <!-- Features -->
          <div>
            <h4 class="font-medium text-gray-900 mb-3">Features</h4>
            <div class="grid grid-cols-2 gap-3">
              <label class="flex items-center gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input type="checkbox" v-model="form.sentiment_analysis_enabled" class="rounded" />
                <span class="text-sm text-gray-700">Sentiment Analysis</span>
              </label>
              <label class="flex items-center gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input type="checkbox" v-model="form.call_recording_enabled" class="rounded" />
                <span class="text-sm text-gray-700">Call Recording</span>
              </label>
              <label class="flex items-center gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input type="checkbox" v-model="form.transcription_enabled" class="rounded" />
                <span class="text-sm text-gray-700">Transcription</span>
              </label>
              <label class="flex items-center gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input type="checkbox" v-model="form.summarization_enabled" class="rounded" />
                <span class="text-sm text-gray-700">Call Summarization</span>
              </label>
            </div>
          </div>
        </div>

        <div class="p-4 border-t flex justify-end gap-3">
          <button @click="closeModal" class="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button @click="saveAssistant" :disabled="saving" class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
            {{ saving ? 'Saving...' : (showEditModal ? 'Update' : 'Create') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, h } from 'vue'
import api from '@/utils/api'

// Icons
const PlusIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-5 h-5' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M12 4.5v15m7.5-7.5h-15' })]) }
const ChatBubbleLeftRightIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-6 h-6' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155' })]) }
const SpeakerWaveIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-4 h-4' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z' })]) }
const GlobeAltIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-4 h-4' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418' })]) }
const PhoneIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-4 h-4' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z' })]) }
const XMarkIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-5 h-5' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M6 18L18 6M6 6l12 12' })]) }

const assistants = ref([])
const providers = ref([])
const stats = ref({})
const showCreateModal = ref(false)
const showEditModal = ref(false)
const saving = ref(false)
const editingId = ref(null)

const filters = reactive({ status: '', assistant_type: '' })

const form = reactive({
  name: '',
  description: '',
  assistant_type: 'ivr_bot',
  tts_provider_id: null,
  stt_provider_id: null,
  voice_id: 'nova',
  voice_name: 'Nova',
  language: 'en-US',
  speaking_rate: 1.0,
  pitch: 0.0,
  system_prompt: '',
  temperature: 0.7,
  max_response_tokens: 500,
  initial_greeting: 'Hello! Thank you for calling. How can I help you today?',
  fallback_message: "I'm sorry, I didn't understand that. Could you please repeat?",
  goodbye_message: 'Thank you for calling. Have a great day!',
  transfer_message: 'Let me transfer you to an agent who can better assist you.',
  max_silence_seconds: 5,
  max_conversation_minutes: 10,
  max_no_input_retries: 3,
  max_no_match_retries: 3,
  sentiment_analysis_enabled: false,
  call_recording_enabled: true,
  transcription_enabled: true,
  summarization_enabled: false
})

const ttsProviders = computed(() => providers.value.filter(p => p.provider_type === 'tts' || p.provider_type === 'both'))
const sttProviders = computed(() => providers.value.filter(p => p.provider_type === 'stt' || p.provider_type === 'both'))

onMounted(async () => {
  await Promise.all([loadAssistants(), loadProviders(), loadStats()])
})

async function loadAssistants() {
  try {
    const params = new URLSearchParams()
    if (filters.status) params.append('status', filters.status)
    if (filters.assistant_type) params.append('assistant_type', filters.assistant_type)
    const { data } = await api.get(`/voice/assistants?${params}`)
    assistants.value = data.assistants || []
  } catch (error) {
    console.error('Failed to load assistants:', error)
  }
}

async function loadProviders() {
  try {
    const { data } = await api.get('/voice/providers')
    providers.value = data.providers || []
  } catch (error) {
    console.error('Failed to load providers:', error)
  }
}

async function loadStats() {
  try {
    const { data } = await api.get('/voice/usage')
    stats.value = {
      active: assistants.value.filter(a => a.status === 'active').length,
      total_conversations: data.usage?.total_calls || 0,
      completion_rate: 85, // Calculate from data
      monthly_cost: data.usage?.total_cost || 0
    }
  } catch (error) {
    console.error('Failed to load stats:', error)
  }
}

async function saveAssistant() {
  if (!form.name) return
  saving.value = true
  try {
    if (showEditModal.value && editingId.value) {
      await api.put(`/voice/assistants/${editingId.value}`, form)
    } else {
      await api.post('/voice/assistants', form)
    }
    await loadAssistants()
    closeModal()
  } catch (error) {
    console.error('Failed to save assistant:', error)
  } finally {
    saving.value = false
  }
}

function editAssistant(assistant) {
  editingId.value = assistant.id
  Object.assign(form, assistant)
  showEditModal.value = true
}

async function publishAssistant(assistant) {
  try {
    await api.post(`/voice/assistants/${assistant.id}/publish`)
    await loadAssistants()
  } catch (error) {
    console.error('Failed to publish:', error)
  }
}

async function pauseAssistant(assistant) {
  try {
    await api.put(`/voice/assistants/${assistant.id}`, { status: 'paused' })
    await loadAssistants()
  } catch (error) {
    console.error('Failed to pause:', error)
  }
}

function testAssistant(assistant) {
  // TODO: Implement test call functionality
  alert('Test call feature coming soon!')
}

function closeModal() {
  showCreateModal.value = false
  showEditModal.value = false
  editingId.value = null
  resetForm()
}

function resetForm() {
  Object.assign(form, {
    name: '',
    description: '',
    assistant_type: 'ivr_bot',
    tts_provider_id: null,
    stt_provider_id: null,
    voice_id: 'nova',
    voice_name: 'Nova',
    language: 'en-US',
    speaking_rate: 1.0,
    pitch: 0.0,
    system_prompt: '',
    temperature: 0.7,
    max_response_tokens: 500,
    initial_greeting: 'Hello! Thank you for calling. How can I help you today?',
    fallback_message: "I'm sorry, I didn't understand that. Could you please repeat?",
    goodbye_message: 'Thank you for calling. Have a great day!',
    transfer_message: 'Let me transfer you to an agent who can better assist you.',
    max_silence_seconds: 5,
    max_conversation_minutes: 10,
    max_no_input_retries: 3,
    max_no_match_retries: 3,
    sentiment_analysis_enabled: false,
    call_recording_enabled: true,
    transcription_enabled: true,
    summarization_enabled: false
  })
}

function getStatusClass(status) {
  const classes = {
    active: 'px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs',
    draft: 'px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs',
    paused: 'px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs',
    archived: 'px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-xs'
  }
  return classes[status] || 'px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs'
}
</script>
