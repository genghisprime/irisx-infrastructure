<template>
  <div class="fixed inset-y-0 right-0 w-96 bg-white shadow-xl z-40 transform transition-transform duration-300"
       :class="isOpen ? 'translate-x-0' : 'translate-x-full'">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
      <h2 class="text-lg font-semibold text-gray-900">Settings</h2>
      <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Settings Tabs -->
    <div class="flex border-b border-gray-200">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="[
          'flex-1 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
          activeTab === tab.id
            ? 'border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'
        ]"
      >
        {{ tab.name }}
      </button>
    </div>

    <!-- Settings Content -->
    <div class="overflow-y-auto h-[calc(100vh-120px)] p-4">
      <!-- Audio Settings -->
      <div v-show="activeTab === 'audio'" class="space-y-6">
        <!-- Input Device -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Microphone</label>
          <select v-model="settings.audioInput" class="w-full border-gray-300 rounded-md shadow-sm">
            <option v-for="device in audioInputDevices" :key="device.deviceId" :value="device.deviceId">
              {{ device.label || 'Microphone ' + device.deviceId.slice(0, 8) }}
            </option>
          </select>
        </div>

        <!-- Output Device -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Speaker</label>
          <select v-model="settings.audioOutput" class="w-full border-gray-300 rounded-md shadow-sm">
            <option v-for="device in audioOutputDevices" :key="device.deviceId" :value="device.deviceId">
              {{ device.label || 'Speaker ' + device.deviceId.slice(0, 8) }}
            </option>
          </select>
        </div>

        <!-- Ringtone Device -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Ringtone Speaker</label>
          <select v-model="settings.ringtoneOutput" class="w-full border-gray-300 rounded-md shadow-sm">
            <option value="">Same as Speaker</option>
            <option v-for="device in audioOutputDevices" :key="device.deviceId" :value="device.deviceId">
              {{ device.label || 'Speaker ' + device.deviceId.slice(0, 8) }}
            </option>
          </select>
        </div>

        <!-- Test Audio -->
        <div class="flex gap-2">
          <button
            @click="testMicrophone"
            class="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Test Mic
          </button>
          <button
            @click="testSpeaker"
            class="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Test Speaker
          </button>
        </div>

        <!-- Volume Controls -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Ringtone Volume: {{ settings.ringtoneVolume }}%
          </label>
          <input
            type="range"
            v-model.number="settings.ringtoneVolume"
            min="0"
            max="100"
            class="w-full"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Call Volume: {{ settings.callVolume }}%
          </label>
          <input
            type="range"
            v-model.number="settings.callVolume"
            min="0"
            max="100"
            class="w-full"
          />
        </div>
      </div>

      <!-- Notifications -->
      <div v-show="activeTab === 'notifications'" class="space-y-4">
        <div class="flex items-center justify-between py-2">
          <div>
            <p class="text-sm font-medium text-gray-700">Desktop Notifications</p>
            <p class="text-xs text-gray-500">Show browser notifications for calls</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" v-model="settings.desktopNotifications" class="sr-only peer">
            <div class="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
          </label>
        </div>

        <div class="flex items-center justify-between py-2">
          <div>
            <p class="text-sm font-medium text-gray-700">Sound Alerts</p>
            <p class="text-xs text-gray-500">Play sound for incoming messages</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" v-model="settings.soundAlerts" class="sr-only peer">
            <div class="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
          </label>
        </div>

        <div class="flex items-center justify-between py-2">
          <div>
            <p class="text-sm font-medium text-gray-700">Queue Alerts</p>
            <p class="text-xs text-gray-500">Alert when queue threshold reached</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" v-model="settings.queueAlerts" class="sr-only peer">
            <div class="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
          </label>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Queue Alert Threshold</label>
          <select v-model.number="settings.queueAlertThreshold" class="w-full border-gray-300 rounded-md shadow-sm">
            <option :value="3">3 calls waiting</option>
            <option :value="5">5 calls waiting</option>
            <option :value="10">10 calls waiting</option>
            <option :value="15">15 calls waiting</option>
          </select>
        </div>

        <div class="flex items-center justify-between py-2">
          <div>
            <p class="text-sm font-medium text-gray-700">SLA Warning</p>
            <p class="text-xs text-gray-500">Alert when SLA drops below threshold</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" v-model="settings.slaWarning" class="sr-only peer">
            <div class="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
          </label>
        </div>
      </div>

      <!-- Preferences -->
      <div v-show="activeTab === 'preferences'" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Default Tab</label>
          <select v-model="settings.defaultTab" class="w-full border-gray-300 rounded-md shadow-sm">
            <option value="voice">Voice</option>
            <option value="inbox">Inbox</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Theme</label>
          <select v-model="settings.theme" class="w-full border-gray-300 rounded-md shadow-sm">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </div>

        <div class="flex items-center justify-between py-2">
          <div>
            <p class="text-sm font-medium text-gray-700">Auto-answer Calls</p>
            <p class="text-xs text-gray-500">Automatically answer incoming calls</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" v-model="settings.autoAnswer" class="sr-only peer">
            <div class="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
          </label>
        </div>

        <div v-if="settings.autoAnswer">
          <label class="block text-sm font-medium text-gray-700 mb-2">Auto-answer Delay</label>
          <select v-model.number="settings.autoAnswerDelay" class="w-full border-gray-300 rounded-md shadow-sm">
            <option :value="0">Immediately</option>
            <option :value="1">1 second</option>
            <option :value="2">2 seconds</option>
            <option :value="3">3 seconds</option>
          </select>
        </div>

        <div class="flex items-center justify-between py-2">
          <div>
            <p class="text-sm font-medium text-gray-700">Show Caller ID Popup</p>
            <p class="text-xs text-gray-500">Display popup with caller info</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" v-model="settings.callerIdPopup" class="sr-only peer">
            <div class="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
          </label>
        </div>

        <div class="flex items-center justify-between py-2">
          <div>
            <p class="text-sm font-medium text-gray-700">Compact View</p>
            <p class="text-xs text-gray-500">Use smaller UI elements</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" v-model="settings.compactView" class="sr-only peer">
            <div class="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
          </label>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Wrap-up Time Reminder</label>
          <select v-model.number="settings.wrapUpReminder" class="w-full border-gray-300 rounded-md shadow-sm">
            <option :value="15">15 seconds before limit</option>
            <option :value="30">30 seconds before limit</option>
            <option :value="60">60 seconds before limit</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="absolute bottom-0 left-0 right-0 px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-between">
      <button
        @click="resetSettings"
        class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
      >
        Reset to Defaults
      </button>
      <button
        @click="saveSettings"
        :disabled="saving"
        class="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
      >
        {{ saving ? 'Saving...' : 'Save Changes' }}
      </button>
    </div>
  </div>

  <!-- Backdrop -->
  <div
    v-if="isOpen"
    class="fixed inset-0 bg-black bg-opacity-25 z-30"
    @click="$emit('close')"
  ></div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  agentId: {
    type: [String, Number],
    required: true
  }
})

const emit = defineEmits(['close', 'saved'])

const tabs = [
  { id: 'audio', name: 'Audio' },
  { id: 'notifications', name: 'Alerts' },
  { id: 'preferences', name: 'Preferences' }
]

const activeTab = ref('audio')
const saving = ref(false)

const audioInputDevices = ref([])
const audioOutputDevices = ref([])

const defaultSettings = {
  // Audio
  audioInput: 'default',
  audioOutput: 'default',
  ringtoneOutput: '',
  ringtoneVolume: 80,
  callVolume: 100,
  // Notifications
  desktopNotifications: true,
  soundAlerts: true,
  queueAlerts: true,
  queueAlertThreshold: 5,
  slaWarning: true,
  // Preferences
  defaultTab: 'voice',
  theme: 'light',
  autoAnswer: false,
  autoAnswerDelay: 2,
  callerIdPopup: true,
  compactView: false,
  wrapUpReminder: 30
}

const settings = reactive({ ...defaultSettings })

onMounted(async () => {
  await loadAudioDevices()
  loadSettings()
})

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    loadSettings()
    loadAudioDevices()
  }
})

async function loadAudioDevices() {
  try {
    // Request permission first
    await navigator.mediaDevices.getUserMedia({ audio: true })
    const devices = await navigator.mediaDevices.enumerateDevices()

    audioInputDevices.value = devices.filter(d => d.kind === 'audioinput')
    audioOutputDevices.value = devices.filter(d => d.kind === 'audiooutput')
  } catch (err) {
    console.error('Failed to enumerate audio devices:', err)
    // Add default option
    audioInputDevices.value = [{ deviceId: 'default', label: 'Default Microphone' }]
    audioOutputDevices.value = [{ deviceId: 'default', label: 'Default Speaker' }]
  }
}

function loadSettings() {
  const saved = localStorage.getItem(`agent_settings_${props.agentId}`)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      Object.assign(settings, { ...defaultSettings, ...parsed })
    } catch (e) {
      console.error('Failed to parse saved settings')
    }
  }
}

async function saveSettings() {
  saving.value = true
  try {
    // Save to localStorage
    localStorage.setItem(`agent_settings_${props.agentId}`, JSON.stringify(settings))

    // In production, also save to API
    // await apiClient.put(`/v1/agents/${props.agentId}/settings`, settings)

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300))

    emit('saved', { ...settings })
    emit('close')
  } catch (err) {
    console.error('Failed to save settings:', err)
  } finally {
    saving.value = false
  }
}

function resetSettings() {
  Object.assign(settings, defaultSettings)
}

function testMicrophone() {
  // In production, would start recording and playback
  alert('Microphone test: Please speak into your microphone...')
}

function testSpeaker() {
  // In production, would play a test tone
  alert('Speaker test: You should hear a test tone...')
}
</script>
