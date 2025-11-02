<template>
  <div>
    <h1 class="text-2xl font-bold text-gray-900 mb-6">System Settings</h1>

    <!-- Alert for Superadmin Only -->
    <div v-if="!authStore.isSuperAdmin" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
      <p class="text-yellow-800">You are viewing system settings in read-only mode. Only superadmins can modify these settings.</p>
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

    <!-- Settings Sections -->
    <div v-else class="space-y-6">
      <!-- Platform Configuration -->
      <div class="bg-white rounded-lg shadow">
        <div class="p-6 border-b">
          <h2 class="text-lg font-semibold text-gray-900">Platform Configuration</h2>
          <p class="text-sm text-gray-600 mt-1">Core platform settings and limits</p>
        </div>
        <div class="p-6 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Max Tenants</label>
              <input
                v-model="settings.max_tenants"
                type="number"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Max Users Per Tenant</label>
              <input
                v-model="settings.max_users_per_tenant"
                type="number"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Max Agents Per Tenant</label>
              <input
                v-model="settings.max_agents_per_tenant"
                type="number"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Trial Period (days)</label>
              <input
                v-model="settings.trial_period_days"
                type="number"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- API Rate Limits -->
      <div class="bg-white rounded-lg shadow">
        <div class="p-6 border-b">
          <h2 class="text-lg font-semibold text-gray-900">API Rate Limits</h2>
          <p class="text-sm text-gray-600 mt-1">Configure rate limiting for API requests</p>
        </div>
        <div class="p-6 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Requests Per Minute (Free)</label>
              <input
                v-model="settings.rate_limit_free"
                type="number"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Requests Per Minute (Starter)</label>
              <input
                v-model="settings.rate_limit_starter"
                type="number"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Requests Per Minute (Professional)</label>
              <input
                v-model="settings.rate_limit_professional"
                type="number"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Requests Per Minute (Enterprise)</label>
              <input
                v-model="settings.rate_limit_enterprise"
                type="number"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Feature Flags -->
      <div class="bg-white rounded-lg shadow">
        <div class="p-6 border-b">
          <h2 class="text-lg font-semibold text-gray-900">Platform Feature Flags</h2>
          <p class="text-sm text-gray-600 mt-1">Enable or disable features platform-wide</p>
        </div>
        <div class="p-6 space-y-4">
          <div v-for="flag in featureFlags" :key="flag.key" class="flex items-center justify-between p-4 border rounded-lg">
            <div class="flex-1">
              <h3 class="text-sm font-medium text-gray-900">{{ flag.name }}</h3>
              <p class="text-xs text-gray-600 mt-1">{{ flag.description }}</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                v-model="flag.enabled"
                :disabled="!authStore.isSuperAdmin"
                class="sr-only peer"
              />
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
            </label>
          </div>
        </div>
      </div>

      <!-- Email Configuration -->
      <div class="bg-white rounded-lg shadow">
        <div class="p-6 border-b">
          <h2 class="text-lg font-semibold text-gray-900">Email Configuration</h2>
          <p class="text-sm text-gray-600 mt-1">SMTP settings for transactional emails</p>
        </div>
        <div class="p-6 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">SMTP Host</label>
              <input
                v-model="settings.smtp_host"
                type="text"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">SMTP Port</label>
              <input
                v-model="settings.smtp_port"
                type="number"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">From Email</label>
              <input
                v-model="settings.smtp_from_email"
                type="email"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">From Name</label>
              <input
                v-model="settings.smtp_from_name"
                type="text"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Storage Configuration -->
      <div class="bg-white rounded-lg shadow">
        <div class="p-6 border-b">
          <h2 class="text-lg font-semibold text-gray-900">Storage Configuration</h2>
          <p class="text-sm text-gray-600 mt-1">S3 and file storage settings</p>
        </div>
        <div class="p-6 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">S3 Bucket</label>
              <input
                v-model="settings.s3_bucket"
                type="text"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">S3 Region</label>
              <input
                v-model="settings.s3_region"
                type="text"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Max File Size (MB)</label>
              <input
                v-model="settings.max_file_size_mb"
                type="number"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Recording Retention (days)</label>
              <input
                v-model="settings.recording_retention_days"
                type="number"
                :disabled="!authStore.isSuperAdmin"
                class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Maintenance Mode -->
      <div class="bg-white rounded-lg shadow">
        <div class="p-6 border-b">
          <h2 class="text-lg font-semibold text-gray-900">Maintenance Mode</h2>
          <p class="text-sm text-gray-600 mt-1">Control platform availability</p>
        </div>
        <div class="p-6">
          <div class="flex items-center justify-between p-4 border rounded-lg">
            <div class="flex-1">
              <h3 class="text-sm font-medium text-gray-900">Enable Maintenance Mode</h3>
              <p class="text-xs text-gray-600 mt-1">When enabled, only superadmins can access the platform</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                v-model="settings.maintenance_mode"
                :disabled="!authStore.isSuperAdmin"
                class="sr-only peer"
              />
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
            </label>
          </div>
          <div v-if="settings.maintenance_mode" class="mt-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Maintenance Message</label>
            <textarea
              v-model="settings.maintenance_message"
              :disabled="!authStore.isSuperAdmin"
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
              placeholder="We're currently performing maintenance. Please check back soon."
            ></textarea>
          </div>
        </div>
      </div>

      <!-- Save Button -->
      <div v-if="authStore.isSuperAdmin" class="flex justify-end space-x-3">
        <button
          @click="resetSettings"
          class="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          Reset Changes
        </button>
        <button
          @click="saveSettings"
          :disabled="saving"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span v-if="saving">Saving...</span>
          <span v-else>Save Settings</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAdminAuthStore } from '../../../stores/adminAuth'
import { adminAPI } from '../../../utils/api'

const authStore = useAdminAuthStore()

const loading = ref(true)
const error = ref(null)
const saving = ref(false)

const settings = ref({
  max_tenants: 1000,
  max_users_per_tenant: 100,
  max_agents_per_tenant: 50,
  trial_period_days: 14,
  rate_limit_free: 10,
  rate_limit_starter: 60,
  rate_limit_professional: 300,
  rate_limit_enterprise: 1000,
  smtp_host: '',
  smtp_port: 587,
  smtp_from_email: '',
  smtp_from_name: 'IRISX',
  s3_bucket: '',
  s3_region: 'us-east-1',
  max_file_size_mb: 50,
  recording_retention_days: 90,
  maintenance_mode: false,
  maintenance_message: ''
})

const featureFlags = ref([
  { key: 'voice_calls', name: 'Voice Calls', description: 'Enable voice calling functionality', enabled: true },
  { key: 'sms', name: 'SMS Messaging', description: 'Enable SMS messaging', enabled: true },
  { key: 'whatsapp', name: 'WhatsApp Integration', description: 'Enable WhatsApp Business API', enabled: true },
  { key: 'social_media', name: 'Social Media', description: 'Enable Facebook/Instagram integrations', enabled: false },
  { key: 'ai_agents', name: 'AI Agents', description: 'Enable AI-powered conversational agents', enabled: true },
  { key: 'call_recording', name: 'Call Recording', description: 'Enable call recording for all tenants', enabled: true },
  { key: 'analytics', name: 'Advanced Analytics', description: 'Enable advanced analytics dashboard', enabled: true },
  { key: 'webhooks', name: 'Webhooks', description: 'Enable webhook integrations', enabled: true },
  { key: 'api_access', name: 'API Access', description: 'Enable REST API access for tenants', enabled: true },
  { key: 'custom_branding', name: 'Custom Branding', description: 'Allow tenants to customize branding', enabled: false }
])

let originalSettings = {}
let originalFlags = []

onMounted(() => {
  fetchSettings()
})

async function fetchSettings() {
  loading.value = true
  error.value = null

  try {
    const response = await adminAPI.settings.get()
    settings.value = response.data.settings || settings.value

    if (response.data.feature_flags) {
      featureFlags.value.forEach(flag => {
        const savedFlag = response.data.feature_flags.find(f => f.key === flag.key)
        if (savedFlag) flag.enabled = savedFlag.enabled
      })
    }

    // Store originals for reset
    originalSettings = JSON.parse(JSON.stringify(settings.value))
    originalFlags = JSON.parse(JSON.stringify(featureFlags.value))
  } catch (err) {
    console.error('Failed to fetch settings:', err)
    error.value = 'Failed to load settings'
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  saving.value = true

  try {
    await adminAPI.settings.update({
      settings: settings.value,
      feature_flags: featureFlags.value
    })

    // Update originals after successful save
    originalSettings = JSON.parse(JSON.stringify(settings.value))
    originalFlags = JSON.parse(JSON.stringify(featureFlags.value))

    alert('Settings saved successfully!')
  } catch (err) {
    console.error('Failed to save settings:', err)
    alert('Failed to save settings')
  } finally {
    saving.value = false
  }
}

function resetSettings() {
  settings.value = JSON.parse(JSON.stringify(originalSettings))
  featureFlags.value = JSON.parse(JSON.stringify(originalFlags))
}
</script>
