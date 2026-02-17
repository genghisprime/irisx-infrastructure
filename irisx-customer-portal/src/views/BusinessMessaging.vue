<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-zinc-100">Business Messaging</h1>
        <p class="text-zinc-400 mt-1">Configure Apple Business Messages, Google Business Messages, and RCS</p>
      </div>
      <button
        @click="refreshData"
        :disabled="loading"
        class="flex items-center gap-2 px-4 py-2 bg-zinc-700 text-zinc-100 rounded-lg hover:bg-zinc-600 disabled:opacity-50"
      >
        <svg class="w-4 h-4" :class="{ 'animate-spin': loading }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Refresh
      </button>
    </div>

    <!-- Platform Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Apple Business Messages Card -->
      <div class="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-zinc-700 rounded-lg">
              <svg class="w-8 h-8 text-zinc-300" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-zinc-100">Apple Business Messages</h3>
              <p class="text-sm text-zinc-400">iMessage for Business</p>
            </div>
          </div>
          <div class="flex items-center">
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" v-model="settings.apple_enabled" @change="saveSettings" class="sr-only peer">
              <div class="w-11 h-6 bg-zinc-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex justify-between text-sm">
            <span class="text-zinc-400">Active Accounts</span>
            <span class="text-zinc-100">{{ overview.apple?.accounts || 0 }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-zinc-400">Conversations</span>
            <span class="text-zinc-100">{{ overview.apple?.conversations || 0 }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-zinc-400">Messages (24h)</span>
            <span class="text-green-400">{{ overview.apple?.messages_24h || 0 }}</span>
          </div>
        </div>

        <div class="mt-4 pt-4 border-t border-zinc-700">
          <div v-if="registrations.apple.length === 0">
            <button
              @click="showAppleRegistration = true"
              class="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Register with Apple
            </button>
          </div>
          <div v-else class="space-y-2">
            <div v-for="account in registrations.apple" :key="account.id" class="flex items-center justify-between">
              <div>
                <p class="text-sm text-zinc-100">{{ account.business_name }}</p>
                <p class="text-xs text-zinc-500">{{ account.business_id }}</p>
              </div>
              <span :class="getStatusClass(account.status)" class="text-xs px-2 py-1 rounded">
                {{ account.status }}
              </span>
            </div>
            <button
              @click="showAppleRegistration = true"
              class="w-full py-2 px-4 border border-zinc-600 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors text-sm"
            >
              Add Another Account
            </button>
          </div>
        </div>
      </div>

      <!-- Google Business Messages Card -->
      <div class="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-zinc-700 rounded-lg">
              <svg class="w-8 h-8 text-zinc-300" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"/>
              </svg>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-zinc-100">Google Business Messages</h3>
              <p class="text-sm text-zinc-400">Maps & Search Messaging</p>
            </div>
          </div>
          <div class="flex items-center">
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" v-model="settings.google_enabled" @change="saveSettings" class="sr-only peer">
              <div class="w-11 h-6 bg-zinc-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex justify-between text-sm">
            <span class="text-zinc-400">Active Agents</span>
            <span class="text-zinc-100">{{ overview.google?.agents || 0 }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-zinc-400">Locations</span>
            <span class="text-zinc-100">{{ overview.google?.locations || 0 }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-zinc-400">Messages (24h)</span>
            <span class="text-green-400">{{ overview.google?.messages_24h || 0 }}</span>
          </div>
        </div>

        <div class="mt-4 pt-4 border-t border-zinc-700">
          <div v-if="registrations.google.length === 0">
            <button
              @click="showGoogleRegistration = true"
              class="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Register with Google
            </button>
          </div>
          <div v-else class="space-y-2">
            <div v-for="agent in registrations.google" :key="agent.id" class="flex items-center justify-between">
              <div>
                <p class="text-sm text-zinc-100">{{ agent.agent_name }}</p>
                <p class="text-xs text-zinc-500">{{ agent.agent_id }}</p>
              </div>
              <span :class="getStatusClass(agent.status)" class="text-xs px-2 py-1 rounded">
                {{ agent.status }}
              </span>
            </div>
            <button
              @click="showGoogleRegistration = true"
              class="w-full py-2 px-4 border border-zinc-600 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors text-sm"
            >
              Add Another Agent
            </button>
          </div>
        </div>
      </div>

      <!-- RCS Card -->
      <div class="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-zinc-700 rounded-lg">
              <svg class="w-8 h-8 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-zinc-100">RCS Messaging</h3>
              <p class="text-sm text-zinc-400">Rich Communication Services</p>
            </div>
          </div>
          <div class="flex items-center">
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" v-model="settings.rcs_enabled" @change="saveSettings" class="sr-only peer">
              <div class="w-11 h-6 bg-zinc-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex justify-between text-sm">
            <span class="text-zinc-400">Active Agents</span>
            <span class="text-zinc-100">{{ overview.rcs?.agents || 0 }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-zinc-400">Conversations</span>
            <span class="text-zinc-100">{{ overview.rcs?.conversations || 0 }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-zinc-400">SMS Fallback</span>
            <span class="text-amber-400">{{ overview.rcs?.sms_fallback_count || 0 }}</span>
          </div>
        </div>

        <div class="mt-4 pt-4 border-t border-zinc-700">
          <div v-if="registrations.rcs.length === 0">
            <button
              @click="showRcsRegistration = true"
              class="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Register RCS Agent
            </button>
          </div>
          <div v-else class="space-y-2">
            <div v-for="agent in registrations.rcs" :key="agent.id" class="flex items-center justify-between">
              <div>
                <p class="text-sm text-zinc-100">{{ agent.agent_name }}</p>
                <p class="text-xs text-zinc-500">{{ agent.provider }}</p>
              </div>
              <span :class="getStatusClass(agent.status)" class="text-xs px-2 py-1 rounded">
                {{ agent.status }}
              </span>
            </div>
            <button
              @click="showRcsRegistration = true"
              class="w-full py-2 px-4 border border-zinc-600 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors text-sm"
            >
              Add Another Agent
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Settings Section -->
    <div class="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
      <h2 class="text-lg font-semibold text-zinc-100 mb-4">Auto-Reply Settings</h2>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Apple Auto-Reply -->
        <div class="space-y-4">
          <h3 class="text-sm font-medium text-zinc-300">Apple Business Messages</h3>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="settings.apple_auto_reply_enabled" @change="saveSettings" class="rounded bg-zinc-700 border-zinc-600">
            <span class="text-sm text-zinc-400">Enable auto-reply</span>
          </label>
          <textarea
            v-model="settings.apple_auto_reply_message"
            @blur="saveSettings"
            placeholder="Auto-reply message..."
            class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100 text-sm placeholder-zinc-500"
            rows="3"
            :disabled="!settings.apple_auto_reply_enabled"
          ></textarea>
        </div>

        <!-- Google Auto-Reply -->
        <div class="space-y-4">
          <h3 class="text-sm font-medium text-zinc-300">Google Business Messages</h3>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="settings.google_auto_reply_enabled" @change="saveSettings" class="rounded bg-zinc-700 border-zinc-600">
            <span class="text-sm text-zinc-400">Enable auto-reply</span>
          </label>
          <textarea
            v-model="settings.google_auto_reply_message"
            @blur="saveSettings"
            placeholder="Auto-reply message..."
            class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100 text-sm placeholder-zinc-500"
            rows="3"
            :disabled="!settings.google_auto_reply_enabled"
          ></textarea>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="settings.google_survey_enabled" @change="saveSettings" class="rounded bg-zinc-700 border-zinc-600">
            <span class="text-sm text-zinc-400">Enable CSAT surveys</span>
          </label>
        </div>

        <!-- RCS Auto-Reply -->
        <div class="space-y-4">
          <h3 class="text-sm font-medium text-zinc-300">RCS Messaging</h3>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="settings.rcs_auto_reply_enabled" @change="saveSettings" class="rounded bg-zinc-700 border-zinc-600">
            <span class="text-sm text-zinc-400">Enable auto-reply</span>
          </label>
          <textarea
            v-model="settings.rcs_auto_reply_message"
            @blur="saveSettings"
            placeholder="Auto-reply message..."
            class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100 text-sm placeholder-zinc-500"
            rows="3"
            :disabled="!settings.rcs_auto_reply_enabled"
          ></textarea>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="settings.rcs_fallback_to_sms" @change="saveSettings" class="rounded bg-zinc-700 border-zinc-600">
            <span class="text-sm text-zinc-400">Fallback to SMS</span>
          </label>
        </div>
      </div>
    </div>

    <!-- Business Hours -->
    <div class="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
      <h2 class="text-lg font-semibold text-zinc-100 mb-4">Business Hours & Response Time</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="space-y-4">
          <label class="block">
            <span class="text-sm text-zinc-400">Maximum Response Time (minutes)</span>
            <input
              type="number"
              v-model="settings.max_response_time_minutes"
              @blur="saveSettings"
              min="1"
              max="1440"
              class="mt-1 w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
            >
          </label>

          <label class="block">
            <span class="text-sm text-zinc-400">Out of Hours Message</span>
            <textarea
              v-model="settings.out_of_hours_message"
              @blur="saveSettings"
              placeholder="Message to send outside business hours..."
              class="mt-1 w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100 text-sm placeholder-zinc-500"
              rows="3"
            ></textarea>
          </label>
        </div>

        <div class="bg-zinc-900 rounded-lg p-4">
          <h4 class="text-sm font-medium text-zinc-300 mb-3">How Registration Works</h4>
          <div class="space-y-3 text-sm text-zinc-400">
            <div class="flex gap-2">
              <span class="text-blue-400">1.</span>
              <p>Submit your registration request through this portal</p>
            </div>
            <div class="flex gap-2">
              <span class="text-blue-400">2.</span>
              <p>Complete verification with the platform provider (Apple/Google/RCS)</p>
            </div>
            <div class="flex gap-2">
              <span class="text-blue-400">3.</span>
              <p>Platform admin will review and activate your account</p>
            </div>
            <div class="flex gap-2">
              <span class="text-blue-400">4.</span>
              <p>Start messaging customers through rich messaging channels</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Apple Registration Modal -->
    <div
      v-if="showAppleRegistration"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="showAppleRegistration = false"
    >
      <div class="bg-zinc-800 rounded-lg p-6 max-w-lg w-full mx-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-zinc-100">Register Apple Business Messages</h3>
          <button @click="showAppleRegistration = false" class="text-zinc-400 hover:text-zinc-200">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form @submit.prevent="submitAppleRegistration" class="space-y-4">
          <div>
            <label class="block text-sm text-zinc-400 mb-1">Business Name *</label>
            <input
              v-model="appleForm.business_name"
              type="text"
              required
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
              placeholder="Your Company Name"
            >
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Apple Business ID (if available)</label>
            <input
              v-model="appleForm.business_id"
              type="text"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
              placeholder="e.g., abc123-def456"
            >
            <p class="text-xs text-zinc-500 mt-1">Leave blank if you haven't registered with Apple yet</p>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Logo URL</label>
            <input
              v-model="appleForm.logo_url"
              type="url"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
              placeholder="https://..."
            >
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Primary Brand Color</label>
            <input
              v-model="appleForm.primary_color"
              type="text"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
              placeholder="#3B82F6"
            >
          </div>

          <div class="bg-zinc-900 rounded-lg p-4 text-sm text-zinc-400">
            <p class="font-medium text-zinc-300 mb-2">Next Steps After Registration:</p>
            <ul class="list-disc list-inside space-y-1">
              <li>Register at business.apple.com if not already done</li>
              <li>Complete Apple Business verification process</li>
              <li>Configure webhook URL in Apple Business Console</li>
            </ul>
          </div>

          <div class="flex gap-3">
            <button
              type="button"
              @click="showAppleRegistration = false"
              class="flex-1 py-2 px-4 border border-zinc-600 text-zinc-300 rounded-lg hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="submitting"
              class="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {{ submitting ? 'Submitting...' : 'Submit Registration' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Google Registration Modal -->
    <div
      v-if="showGoogleRegistration"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="showGoogleRegistration = false"
    >
      <div class="bg-zinc-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-zinc-100">Register Google Business Messages</h3>
          <button @click="showGoogleRegistration = false" class="text-zinc-400 hover:text-zinc-200">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form @submit.prevent="submitGoogleRegistration" class="space-y-4">
          <div>
            <label class="block text-sm text-zinc-400 mb-1">Agent Name *</label>
            <input
              v-model="googleForm.agent_name"
              type="text"
              required
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
              placeholder="Your Business Agent"
            >
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Brand ID (if available)</label>
            <input
              v-model="googleForm.brand_id"
              type="text"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
              placeholder="e.g., brands/12345"
            >
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Verification Email *</label>
            <input
              v-model="googleForm.verification_email"
              type="email"
              required
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
              placeholder="verification@company.com"
            >
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Business Phone</label>
            <input
              v-model="googleForm.phone_number"
              type="tel"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
              placeholder="+1234567890"
            >
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Privacy Policy URL *</label>
            <input
              v-model="googleForm.privacy_policy_url"
              type="url"
              required
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
              placeholder="https://yoursite.com/privacy"
            >
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Logo URL</label>
            <input
              v-model="googleForm.logo_url"
              type="url"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
              placeholder="https://..."
            >
          </div>

          <div class="bg-zinc-900 rounded-lg p-4 text-sm text-zinc-400">
            <p class="font-medium text-zinc-300 mb-2">Next Steps After Registration:</p>
            <ul class="list-disc list-inside space-y-1">
              <li>Register at business.google.com/businessmessages</li>
              <li>Complete Google brand verification</li>
              <li>Add business locations for Maps integration</li>
              <li>Configure entry points (Maps, Search, URLs)</li>
            </ul>
          </div>

          <div class="flex gap-3">
            <button
              type="button"
              @click="showGoogleRegistration = false"
              class="flex-1 py-2 px-4 border border-zinc-600 text-zinc-300 rounded-lg hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="submitting"
              class="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {{ submitting ? 'Submitting...' : 'Submit Registration' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- RCS Registration Modal -->
    <div
      v-if="showRcsRegistration"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="showRcsRegistration = false"
    >
      <div class="bg-zinc-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-zinc-100">Register RCS Agent</h3>
          <button @click="showRcsRegistration = false" class="text-zinc-400 hover:text-zinc-200">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form @submit.prevent="submitRcsRegistration" class="space-y-4">
          <div>
            <label class="block text-sm text-zinc-400 mb-1">Agent Name *</label>
            <input
              v-model="rcsForm.agent_name"
              type="text"
              required
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
              placeholder="Your RCS Agent"
            >
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Description</label>
            <textarea
              v-model="rcsForm.description"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
              rows="2"
              placeholder="Brief description of your RCS agent..."
            ></textarea>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">RCS Provider *</label>
            <select
              v-model="rcsForm.provider"
              required
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
            >
              <option value="">Select provider...</option>
              <option value="google_jibe">Google Jibe</option>
              <option value="sinch">Sinch</option>
              <option value="mavenir">Mavenir</option>
              <option value="bandwidth">Bandwidth</option>
            </select>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Sender Phone Number *</label>
            <input
              v-model="rcsForm.phone_number"
              type="tel"
              required
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
              placeholder="+1234567890"
            >
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-zinc-400 mb-1">Logo URL</label>
              <input
                v-model="rcsForm.logo_url"
                type="url"
                class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
                placeholder="https://..."
              >
            </div>
            <div>
              <label class="block text-sm text-zinc-400 mb-1">Banner URL</label>
              <input
                v-model="rcsForm.banner_url"
                type="url"
                class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
                placeholder="https://..."
              >
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-zinc-400 mb-1">Primary Color</label>
              <input
                v-model="rcsForm.primary_color"
                type="text"
                class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
                placeholder="#3B82F6"
              >
            </div>
            <div>
              <label class="block text-sm text-zinc-400 mb-1">Secondary Color</label>
              <input
                v-model="rcsForm.secondary_color"
                type="text"
                class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
                placeholder="#10B981"
              >
            </div>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Website URL</label>
            <input
              v-model="rcsForm.website_url"
              type="url"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
              placeholder="https://yoursite.com"
            >
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Privacy Policy URL *</label>
            <input
              v-model="rcsForm.privacy_policy_url"
              type="url"
              required
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100"
              placeholder="https://yoursite.com/privacy"
            >
          </div>

          <div class="bg-zinc-900 rounded-lg p-4 text-sm text-zinc-400">
            <p class="font-medium text-zinc-300 mb-2">Next Steps After Registration:</p>
            <ul class="list-disc list-inside space-y-1">
              <li>Register with your chosen RCS provider</li>
              <li>Complete business verification</li>
              <li>Upload branding assets</li>
              <li>Test with RCS-capable devices</li>
            </ul>
          </div>

          <div class="flex gap-3">
            <button
              type="button"
              @click="showRcsRegistration = false"
              class="flex-1 py-2 px-4 border border-zinc-600 text-zinc-300 rounded-lg hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="submitting"
              class="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {{ submitting ? 'Submitting...' : 'Submit Registration' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Success Toast -->
    <div
      v-if="showSuccess"
      class="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      {{ successMessage }}
    </div>

    <!-- Error Toast -->
    <div
      v-if="showError"
      class="fixed bottom-4 right-4 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const loading = ref(false)
const submitting = ref(false)
const showSuccess = ref(false)
const showError = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

// Modal states
const showAppleRegistration = ref(false)
const showGoogleRegistration = ref(false)
const showRcsRegistration = ref(false)

// Data
const settings = reactive({
  apple_enabled: false,
  google_enabled: false,
  rcs_enabled: false,
  rcs_fallback_to_sms: true,
  apple_auto_reply_enabled: false,
  apple_auto_reply_message: '',
  google_auto_reply_enabled: false,
  google_auto_reply_message: '',
  google_survey_enabled: true,
  rcs_auto_reply_enabled: false,
  rcs_auto_reply_message: '',
  max_response_time_minutes: 60,
  out_of_hours_message: ''
})

const overview = ref({
  apple: {},
  google: {},
  rcs: {}
})

const registrations = ref({
  apple: [],
  google: [],
  rcs: []
})

// Registration forms
const appleForm = reactive({
  business_name: '',
  business_id: '',
  logo_url: '',
  primary_color: '#3B82F6'
})

const googleForm = reactive({
  agent_name: '',
  brand_id: '',
  verification_email: '',
  phone_number: '',
  privacy_policy_url: '',
  logo_url: ''
})

const rcsForm = reactive({
  agent_name: '',
  description: '',
  provider: '',
  phone_number: '',
  logo_url: '',
  banner_url: '',
  primary_color: '#3B82F6',
  secondary_color: '#10B981',
  website_url: '',
  privacy_policy_url: ''
})

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

async function fetchWithAuth(url) {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Authorization': `Bearer ${authStore.token}`,
      'Content-Type': 'application/json'
    }
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function postWithAuth(url, data) {
  const response = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authStore.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function putWithAuth(url, data) {
  const response = await fetch(`${API_BASE}${url}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${authStore.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function loadSettings() {
  try {
    const data = await fetchWithAuth('/v1/business-messaging/settings')
    Object.assign(settings, data.settings)
  } catch (error) {
    console.error('Failed to load settings:', error)
  }
}

async function loadOverview() {
  try {
    const data = await fetchWithAuth('/v1/business-messaging/overview')
    overview.value = data
  } catch (error) {
    console.error('Failed to load overview:', error)
  }
}

async function loadRegistrations() {
  try {
    const data = await fetchWithAuth('/v1/business-messaging/registration-status')
    registrations.value = data
  } catch (error) {
    console.error('Failed to load registrations:', error)
  }
}

async function refreshData() {
  loading.value = true
  try {
    await Promise.all([
      loadSettings(),
      loadOverview(),
      loadRegistrations()
    ])
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  try {
    await putWithAuth('/v1/business-messaging/settings', settings)
    showToast('Settings saved successfully', 'success')
  } catch (error) {
    console.error('Failed to save settings:', error)
    showToast('Failed to save settings', 'error')
  }
}

async function submitAppleRegistration() {
  submitting.value = true
  try {
    const data = await postWithAuth('/v1/business-messaging/register/apple', appleForm)
    showToast(data.message || 'Registration submitted successfully', 'success')
    showAppleRegistration.value = false
    resetAppleForm()
    await loadRegistrations()
  } catch (error) {
    console.error('Failed to submit Apple registration:', error)
    showToast('Failed to submit registration', 'error')
  } finally {
    submitting.value = false
  }
}

async function submitGoogleRegistration() {
  submitting.value = true
  try {
    const data = await postWithAuth('/v1/business-messaging/register/google', googleForm)
    showToast(data.message || 'Registration submitted successfully', 'success')
    showGoogleRegistration.value = false
    resetGoogleForm()
    await loadRegistrations()
  } catch (error) {
    console.error('Failed to submit Google registration:', error)
    showToast('Failed to submit registration', 'error')
  } finally {
    submitting.value = false
  }
}

async function submitRcsRegistration() {
  submitting.value = true
  try {
    const data = await postWithAuth('/v1/business-messaging/register/rcs', rcsForm)
    showToast(data.message || 'Registration submitted successfully', 'success')
    showRcsRegistration.value = false
    resetRcsForm()
    await loadRegistrations()
  } catch (error) {
    console.error('Failed to submit RCS registration:', error)
    showToast('Failed to submit registration', 'error')
  } finally {
    submitting.value = false
  }
}

function resetAppleForm() {
  appleForm.business_name = ''
  appleForm.business_id = ''
  appleForm.logo_url = ''
  appleForm.primary_color = '#3B82F6'
}

function resetGoogleForm() {
  googleForm.agent_name = ''
  googleForm.brand_id = ''
  googleForm.verification_email = ''
  googleForm.phone_number = ''
  googleForm.privacy_policy_url = ''
  googleForm.logo_url = ''
}

function resetRcsForm() {
  rcsForm.agent_name = ''
  rcsForm.description = ''
  rcsForm.provider = ''
  rcsForm.phone_number = ''
  rcsForm.logo_url = ''
  rcsForm.banner_url = ''
  rcsForm.primary_color = '#3B82F6'
  rcsForm.secondary_color = '#10B981'
  rcsForm.website_url = ''
  rcsForm.privacy_policy_url = ''
}

function getStatusClass(status) {
  const classes = {
    active: 'bg-green-500/20 text-green-400',
    pending: 'bg-amber-500/20 text-amber-400',
    suspended: 'bg-red-500/20 text-red-400',
    verified: 'bg-green-500/20 text-green-400'
  }
  return classes[status] || 'bg-zinc-700 text-zinc-400'
}

function showToast(message, type = 'success') {
  if (type === 'success') {
    successMessage.value = message
    showSuccess.value = true
    setTimeout(() => { showSuccess.value = false }, 3000)
  } else {
    errorMessage.value = message
    showError.value = true
    setTimeout(() => { showError.value = false }, 3000)
  }
}

onMounted(() => {
  refreshData()
})
</script>
