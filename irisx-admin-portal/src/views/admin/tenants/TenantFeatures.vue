<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Feature Access Control</h1>
        <p class="text-gray-500 mt-1">Manage feature access for {{ tenant?.company_name }}</p>
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
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <p class="text-red-600">{{ error }}</p>
    </div>

    <!-- Success Message -->
    <div v-if="successMessage" class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
      <p class="text-green-600">{{ successMessage }}</p>
    </div>

    <!-- Features Grid -->
    <div v-if="!loading && features" class="space-y-6">
      <!-- Core Communication Features -->
      <div class="bg-white rounded-lg shadow">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="text-lg font-semibold">Core Communication Features</h2>
        </div>
        <div class="p-6 space-y-4">
          <div v-for="feature in coreFeatures" :key="feature.key" class="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
            <div class="flex-1">
              <div class="flex items-center">
                <component :is="feature.icon" class="w-5 h-5 mr-3" :class="features[feature.key] ? 'text-green-600' : 'text-gray-400'" />
                <div>
                  <h3 class="text-sm font-medium text-gray-900">{{ feature.title }}</h3>
                  <p class="text-sm text-gray-500">{{ feature.description }}</p>
                </div>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                v-model="features[feature.key]"
                :disabled="!authStore.isAdmin"
                class="sr-only peer"
              />
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      <!-- Marketing & Engagement Features -->
      <div class="bg-white rounded-lg shadow">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="text-lg font-semibold">Marketing & Engagement</h2>
        </div>
        <div class="p-6 space-y-4">
          <div v-for="feature in marketingFeatures" :key="feature.key" class="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
            <div class="flex-1">
              <div class="flex items-center">
                <component :is="feature.icon" class="w-5 h-5 mr-3" :class="features[feature.key] ? 'text-green-600' : 'text-gray-400'" />
                <div>
                  <h3 class="text-sm font-medium text-gray-900">{{ feature.title }}</h3>
                  <p class="text-sm text-gray-500">{{ feature.description }}</p>
                </div>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                v-model="features[feature.key]"
                :disabled="!authStore.isAdmin"
                class="sr-only peer"
              />
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      <!-- Advanced Features -->
      <div class="bg-white rounded-lg shadow">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="text-lg font-semibold">Advanced Features</h2>
        </div>
        <div class="p-6 space-y-4">
          <div v-for="feature in advancedFeatures" :key="feature.key" class="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
            <div class="flex-1">
              <div class="flex items-center">
                <component :is="feature.icon" class="w-5 h-5 mr-3" :class="features[feature.key] ? 'text-green-600' : 'text-gray-400'" />
                <div>
                  <h3 class="text-sm font-medium text-gray-900">{{ feature.title }}</h3>
                  <p class="text-sm text-gray-500">{{ feature.description }}</p>
                </div>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                v-model="features[feature.key]"
                :disabled="!authStore.isAdmin"
                class="sr-only peer"
              />
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      <!-- Save Button -->
      <div v-if="authStore.isAdmin" class="flex justify-end">
        <button
          @click="saveFeatures"
          :disabled="saving"
          class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {{ saving ? 'Saving...' : 'Save Changes' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAdminAuthStore } from '../../../stores/adminAuth'
import { adminAPI } from '../../../utils/api'

// Simple icon components
const PhoneIcon = { template: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>' }
const ChatIcon = { template: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>' }
const MailIcon = { template: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>' }
const SocialIcon = { template: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" /></svg>' }
const BotIcon = { template: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>' }
const CampaignIcon = { template: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>' }
const AnalyticsIcon = { template: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>' }
const IVRIcon = { template: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>' }
const RecordingIcon = { template: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>' }
const APIIcon = { template: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>' }
const WebhookIcon = { template: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>' }

const route = useRoute()
const authStore = useAdminAuthStore()

const loading = ref(true)
const saving = ref(false)
const error = ref(null)
const successMessage = ref(null)
const tenant = ref(null)
const features = ref({
  // Core Communication
  voice_calling: false,
  sms_messaging: false,
  email_automation: false,
  whatsapp: false,
  live_chat: false,
  social_media: false,
  // Marketing & Engagement
  campaigns: false,
  email_campaigns: false,
  sms_campaigns: false,
  drip_campaigns: false,
  ab_testing: false,
  // Advanced
  ai_agents: false,
  ivr_system: false,
  call_recording: false,
  analytics_reporting: false,
  api_access: false,
  webhooks: false,
  custom_integrations: false
})

const coreFeatures = [
  { key: 'voice_calling', icon: PhoneIcon, title: 'Voice Calling', description: 'Inbound and outbound voice calls via SIP/WebRTC' },
  { key: 'sms_messaging', icon: ChatIcon, title: 'SMS Messaging', description: 'Send and receive SMS messages' },
  { key: 'email_automation', icon: MailIcon, title: 'Email Automation', description: 'Automated email sending and tracking' },
  { key: 'whatsapp', icon: SocialIcon, title: 'WhatsApp Business', description: 'WhatsApp Business API integration' },
  { key: 'live_chat', icon: ChatIcon, title: 'Live Chat', description: 'Real-time website chat widget' },
  { key: 'social_media', icon: SocialIcon, title: 'Social Media', description: 'Facebook, Instagram, Twitter integration' }
]

const marketingFeatures = [
  { key: 'campaigns', icon: CampaignIcon, title: 'Campaign Management', description: 'Create and manage multi-channel campaigns' },
  { key: 'email_campaigns', icon: MailIcon, title: 'Email Campaigns', description: 'Bulk email marketing campaigns' },
  { key: 'sms_campaigns', icon: ChatIcon, title: 'SMS Campaigns', description: 'Mass SMS marketing campaigns' },
  { key: 'drip_campaigns', icon: CampaignIcon, title: 'Drip Campaigns', description: 'Automated drip marketing sequences' },
  { key: 'ab_testing', icon: AnalyticsIcon, title: 'A/B Testing', description: 'Campaign A/B testing and optimization' }
]

const advancedFeatures = [
  { key: 'ai_agents', icon: BotIcon, title: 'AI Agents', description: 'AI-powered virtual agents and chatbots' },
  { key: 'ivr_system', icon: IVRIcon, title: 'IVR System', description: 'Interactive Voice Response menus' },
  { key: 'call_recording', icon: RecordingIcon, title: 'Call Recording', description: 'Automatic call recording and storage' },
  { key: 'analytics_reporting', icon: AnalyticsIcon, title: 'Analytics & Reporting', description: 'Advanced analytics and custom reports' },
  { key: 'api_access', icon: APIIcon, title: 'API Access', description: 'Full REST API access for integrations' },
  { key: 'webhooks', icon: WebhookIcon, title: 'Webhooks', description: 'Real-time event webhooks' },
  { key: 'custom_integrations', icon: APIIcon, title: 'Custom Integrations', description: 'Build custom integrations with platform' }
]

onMounted(() => {
  fetchTenant()
  fetchFeatures()
})

async function fetchTenant() {
  try {
    const response = await adminAPI.tenants.get(route.params.id)
    tenant.value = response.data
  } catch (err) {
    console.error('Failed to fetch tenant:', err)
  }
}

async function fetchFeatures() {
  loading.value = true
  error.value = null

  try {
    const response = await adminAPI.settings.getFeatures(route.params.id)
    if (response.data) {
      features.value = { ...features.value, ...response.data }
    }
  } catch (err) {
    console.error('Failed to fetch features:', err)
    error.value = 'Failed to load feature settings'
  } finally {
    loading.value = false
  }
}

async function saveFeatures() {
  saving.value = true
  error.value = null
  successMessage.value = null

  try {
    await adminAPI.settings.updateFeatures(route.params.id, features.value)
    successMessage.value = 'Feature settings saved successfully!'
    setTimeout(() => successMessage.value = null, 3000)
  } catch (err) {
    console.error('Failed to save features:', err)
    error.value = 'Failed to save feature settings'
  } finally {
    saving.value = false
  }
}
</script>
