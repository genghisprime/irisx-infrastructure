<template>
  <div class="p-6">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-zinc-100">Settings</h1>
      <p class="text-zinc-400">Manage your organization settings and preferences</p>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-zinc-700 mb-6">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="[
          'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
          activeTab === tab.id
            ? 'border-blue-500 text-blue-400'
            : 'border-transparent text-zinc-400 hover:text-zinc-200'
        ]"
      >
        <component :is="tab.icon" class="w-4 h-4" />
        {{ tab.name }}
      </button>
    </div>

    <!-- Company Profile Tab -->
    <div v-if="activeTab === 'profile'" class="space-y-6">
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
        <h2 class="text-lg font-medium text-zinc-100 mb-4">Company Information</h2>

        <form @submit.prevent="saveProfile" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-zinc-400 mb-1">Company Name *</label>
              <input
                v-model="profile.company_name"
                type="text"
                required
                class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
              />
            </div>
            <div>
              <label class="block text-sm text-zinc-400 mb-1">Industry</label>
              <select
                v-model="profile.industry"
                class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
              >
                <option value="">Select Industry</option>
                <option value="technology">Technology</option>
                <option value="healthcare">Healthcare</option>
                <option value="finance">Finance & Banking</option>
                <option value="retail">Retail & E-commerce</option>
                <option value="manufacturing">Manufacturing</option>
                <option value="telecom">Telecommunications</option>
                <option value="education">Education</option>
                <option value="government">Government</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-zinc-400 mb-1">Contact Email</label>
              <input
                v-model="profile.contact_email"
                type="email"
                class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
              />
            </div>
            <div>
              <label class="block text-sm text-zinc-400 mb-1">Contact Phone</label>
              <input
                v-model="profile.contact_phone"
                type="tel"
                class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Website</label>
            <input
              v-model="profile.website"
              type="url"
              class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Address</label>
            <textarea
              v-model="profile.address"
              rows="2"
              class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
            ></textarea>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm text-zinc-400 mb-1">City</label>
              <input
                v-model="profile.city"
                type="text"
                class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
              />
            </div>
            <div>
              <label class="block text-sm text-zinc-400 mb-1">State/Province</label>
              <input
                v-model="profile.state"
                type="text"
                class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
              />
            </div>
            <div>
              <label class="block text-sm text-zinc-400 mb-1">Country</label>
              <input
                v-model="profile.country"
                type="text"
                class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Time Zone</label>
            <select
              v-model="profile.timezone"
              class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern Time (US)</option>
              <option value="America/Chicago">Central Time (US)</option>
              <option value="America/Denver">Mountain Time (US)</option>
              <option value="America/Los_Angeles">Pacific Time (US)</option>
              <option value="Europe/London">London (GMT)</option>
              <option value="Europe/Paris">Central European Time</option>
              <option value="Asia/Tokyo">Japan Time</option>
              <option value="Asia/Singapore">Singapore Time</option>
              <option value="Australia/Sydney">Sydney Time</option>
            </select>
          </div>

          <div class="pt-4">
            <button
              type="submit"
              :disabled="saving"
              class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
            >
              {{ saving ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Branding Tab -->
    <div v-if="activeTab === 'branding'" class="space-y-6">
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
        <h2 class="text-lg font-medium text-zinc-100 mb-4">Brand Customization</h2>

        <div class="space-y-6">
          <!-- Logo Upload -->
          <div>
            <label class="block text-sm text-zinc-400 mb-2">Company Logo</label>
            <div class="flex items-center gap-4">
              <div class="w-24 h-24 bg-zinc-900 border border-zinc-700 rounded-lg flex items-center justify-center">
                <img
                  v-if="branding.logo_url"
                  :src="branding.logo_url"
                  alt="Logo"
                  class="max-w-full max-h-full object-contain"
                />
                <svg v-else class="w-10 h-10 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <input
                  type="file"
                  accept="image/*"
                  @change="handleLogoUpload"
                  class="hidden"
                  ref="logoInput"
                />
                <button
                  @click="$refs.logoInput.click()"
                  class="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200"
                >
                  Upload Logo
                </button>
                <p class="text-xs text-zinc-500 mt-1">PNG, JPG, or SVG. Max 2MB.</p>
              </div>
            </div>
          </div>

          <!-- Colors -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm text-zinc-400 mb-2">Primary Color</label>
              <div class="flex items-center gap-2">
                <input
                  v-model="branding.primary_color"
                  type="color"
                  class="w-10 h-10 rounded cursor-pointer"
                />
                <input
                  v-model="branding.primary_color"
                  type="text"
                  class="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
                  placeholder="#3B82F6"
                />
              </div>
            </div>
            <div>
              <label class="block text-sm text-zinc-400 mb-2">Secondary Color</label>
              <div class="flex items-center gap-2">
                <input
                  v-model="branding.secondary_color"
                  type="color"
                  class="w-10 h-10 rounded cursor-pointer"
                />
                <input
                  v-model="branding.secondary_color"
                  type="text"
                  class="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
                  placeholder="#10B981"
                />
              </div>
            </div>
            <div>
              <label class="block text-sm text-zinc-400 mb-2">Accent Color</label>
              <div class="flex items-center gap-2">
                <input
                  v-model="branding.accent_color"
                  type="color"
                  class="w-10 h-10 rounded cursor-pointer"
                />
                <input
                  v-model="branding.accent_color"
                  type="text"
                  class="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
                  placeholder="#F59E0B"
                />
              </div>
            </div>
          </div>

          <!-- Custom Domain -->
          <div>
            <label class="block text-sm text-zinc-400 mb-2">Custom Domain (Enterprise)</label>
            <input
              v-model="branding.custom_domain"
              type="text"
              class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200"
              placeholder="support.yourcompany.com"
            />
            <p class="text-xs text-zinc-500 mt-1">Contact support to enable custom domain.</p>
          </div>

          <div class="pt-4">
            <button
              @click="saveBranding"
              :disabled="saving"
              class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
            >
              {{ saving ? 'Saving...' : 'Save Branding' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Notifications Tab -->
    <div v-if="activeTab === 'notifications'" class="space-y-6">
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
        <h2 class="text-lg font-medium text-zinc-100 mb-4">Notification Preferences</h2>

        <div class="space-y-4">
          <div class="flex items-center justify-between py-3 border-b border-zinc-700">
            <div>
              <p class="text-zinc-200">Email Notifications</p>
              <p class="text-sm text-zinc-500">Receive system updates and alerts via email</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input v-model="notifications.email_enabled" type="checkbox" class="sr-only peer" />
              <div class="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div class="flex items-center justify-between py-3 border-b border-zinc-700">
            <div>
              <p class="text-zinc-200">SMS Notifications</p>
              <p class="text-sm text-zinc-500">Receive critical alerts via SMS</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input v-model="notifications.sms_enabled" type="checkbox" class="sr-only peer" />
              <div class="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div class="flex items-center justify-between py-3 border-b border-zinc-700">
            <div>
              <p class="text-zinc-200">Billing Alerts</p>
              <p class="text-sm text-zinc-500">Get notified about billing events and invoices</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input v-model="notifications.billing_alerts" type="checkbox" class="sr-only peer" />
              <div class="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div class="flex items-center justify-between py-3 border-b border-zinc-700">
            <div>
              <p class="text-zinc-200">Usage Warnings</p>
              <p class="text-sm text-zinc-500">Get alerts when approaching usage limits</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input v-model="notifications.usage_warnings" type="checkbox" class="sr-only peer" />
              <div class="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div class="flex items-center justify-between py-3 border-b border-zinc-700">
            <div>
              <p class="text-zinc-200">Security Alerts</p>
              <p class="text-sm text-zinc-500">Get notified about security events and login attempts</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input v-model="notifications.security_alerts" type="checkbox" class="sr-only peer" />
              <div class="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div class="flex items-center justify-between py-3">
            <div>
              <p class="text-zinc-200">Weekly Reports</p>
              <p class="text-sm text-zinc-500">Receive weekly summary of activity</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input v-model="notifications.weekly_reports" type="checkbox" class="sr-only peer" />
              <div class="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div class="pt-4">
            <button
              @click="saveNotifications"
              :disabled="saving"
              class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
            >
              {{ saving ? 'Saving...' : 'Save Preferences' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Security Tab -->
    <div v-if="activeTab === 'security'" class="space-y-6">
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
        <h2 class="text-lg font-medium text-zinc-100 mb-4">Security Settings</h2>

        <div class="space-y-6">
          <!-- Password Policy -->
          <div>
            <h3 class="text-md font-medium text-zinc-200 mb-3">Password Policy</h3>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-zinc-400">Minimum password length</span>
                <select
                  v-model="security.min_password_length"
                  class="bg-zinc-900 border border-zinc-700 rounded px-3 py-1 text-zinc-200"
                >
                  <option :value="8">8 characters</option>
                  <option :value="10">10 characters</option>
                  <option :value="12">12 characters</option>
                  <option :value="14">14 characters</option>
                </select>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-zinc-400">Require special characters</span>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input v-model="security.require_special_chars" type="checkbox" class="sr-only peer" />
                  <div class="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-zinc-400">Require numbers</span>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input v-model="security.require_numbers" type="checkbox" class="sr-only peer" />
                  <div class="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          <!-- Two-Factor Authentication -->
          <div class="border-t border-zinc-700 pt-6">
            <h3 class="text-md font-medium text-zinc-200 mb-3">Two-Factor Authentication</h3>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-zinc-400">Require 2FA for all users</p>
                <p class="text-sm text-zinc-500">Enforce two-factor authentication organization-wide</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input v-model="security.require_2fa" type="checkbox" class="sr-only peer" />
                <div class="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          <!-- Session Settings -->
          <div class="border-t border-zinc-700 pt-6">
            <h3 class="text-md font-medium text-zinc-200 mb-3">Session Settings</h3>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-zinc-400">Session timeout (minutes)</span>
                <select
                  v-model="security.session_timeout"
                  class="bg-zinc-900 border border-zinc-700 rounded px-3 py-1 text-zinc-200"
                >
                  <option :value="30">30 minutes</option>
                  <option :value="60">1 hour</option>
                  <option :value="120">2 hours</option>
                  <option :value="240">4 hours</option>
                  <option :value="480">8 hours</option>
                </select>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-zinc-400">Allow multiple sessions</span>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input v-model="security.allow_multiple_sessions" type="checkbox" class="sr-only peer" />
                  <div class="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          <!-- IP Whitelisting -->
          <div class="border-t border-zinc-700 pt-6">
            <h3 class="text-md font-medium text-zinc-200 mb-3">IP Whitelisting</h3>
            <div class="flex items-center justify-between mb-3">
              <span class="text-zinc-400">Enable IP restrictions</span>
              <label class="relative inline-flex items-center cursor-pointer">
                <input v-model="security.ip_whitelist_enabled" type="checkbox" class="sr-only peer" />
                <div class="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <textarea
              v-if="security.ip_whitelist_enabled"
              v-model="security.ip_whitelist"
              rows="3"
              class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 font-mono text-sm"
              placeholder="One IP or CIDR per line:
192.168.1.0/24
10.0.0.1"
            ></textarea>
          </div>

          <div class="pt-4">
            <button
              @click="saveSecurity"
              :disabled="saving"
              class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
            >
              {{ saving ? 'Saving...' : 'Save Security Settings' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Integrations Tab -->
    <div v-if="activeTab === 'integrations'" class="space-y-6">
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
        <h2 class="text-lg font-medium text-zinc-100 mb-4">Connected Integrations</h2>

        <div class="grid gap-4">
          <div
            v-for="integration in integrations"
            :key="integration.id"
            class="flex items-center justify-between p-4 bg-zinc-900 rounded-lg"
          >
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center">
                <span class="text-2xl">{{ integration.icon }}</span>
              </div>
              <div>
                <p class="text-zinc-200 font-medium">{{ integration.name }}</p>
                <p class="text-sm text-zinc-500">{{ integration.description }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span
                :class="integration.connected ? 'text-green-400' : 'text-zinc-500'"
                class="text-sm"
              >
                {{ integration.connected ? 'Connected' : 'Not connected' }}
              </span>
              <button
                v-if="integration.connected"
                @click="disconnectIntegration(integration)"
                class="px-3 py-1 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30"
              >
                Disconnect
              </button>
              <button
                v-else
                @click="connectIntegration(integration)"
                class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Success Toast -->
    <div
      v-if="showSuccess"
      class="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg"
    >
      Settings saved successfully!
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, h } from 'vue'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()

// Tab icons as inline components
const BuildingIcon = {
  render: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' })
  ])
}

const PaletteIcon = {
  render: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' })
  ])
}

const BellIcon = {
  render: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' })
  ])
}

const ShieldIcon = {
  render: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' })
  ])
}

const PlugIcon = {
  render: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' })
  ])
}

// State
const activeTab = ref('profile')
const tabs = [
  { id: 'profile', name: 'Company Profile', icon: BuildingIcon },
  { id: 'branding', name: 'Branding', icon: PaletteIcon },
  { id: 'notifications', name: 'Notifications', icon: BellIcon },
  { id: 'security', name: 'Security', icon: ShieldIcon },
  { id: 'integrations', name: 'Integrations', icon: PlugIcon },
]

const saving = ref(false)
const showSuccess = ref(false)

const profile = ref({
  company_name: '',
  industry: '',
  contact_email: '',
  contact_phone: '',
  website: '',
  address: '',
  city: '',
  state: '',
  country: '',
  timezone: 'UTC',
})

const branding = ref({
  logo_url: '',
  primary_color: '#3B82F6',
  secondary_color: '#10B981',
  accent_color: '#F59E0B',
  custom_domain: '',
})

const notifications = ref({
  email_enabled: true,
  sms_enabled: false,
  billing_alerts: true,
  usage_warnings: true,
  security_alerts: true,
  weekly_reports: false,
})

const security = ref({
  min_password_length: 8,
  require_special_chars: true,
  require_numbers: true,
  require_2fa: false,
  session_timeout: 60,
  allow_multiple_sessions: true,
  ip_whitelist_enabled: false,
  ip_whitelist: '',
})

const integrations = ref([
  { id: 'salesforce', name: 'Salesforce', description: 'CRM integration', icon: '☁️', connected: false },
  { id: 'hubspot', name: 'HubSpot', description: 'Marketing automation', icon: '🧡', connected: false },
  { id: 'slack', name: 'Slack', description: 'Team notifications', icon: '💬', connected: true },
  { id: 'zapier', name: 'Zapier', description: 'Workflow automation', icon: '⚡', connected: false },
])

// Methods
const loadSettings = async () => {
  try {
    const response = await fetch('/api/v1/tenant/settings', {
      headers: { Authorization: `Bearer ${authStore.token}` }
    })
    if (response.ok) {
      const data = await response.json()
      if (data.profile) profile.value = { ...profile.value, ...data.profile }
      if (data.branding) branding.value = { ...branding.value, ...data.branding }
      if (data.notifications) notifications.value = { ...notifications.value, ...data.notifications }
      if (data.security) security.value = { ...security.value, ...data.security }
    }
  } catch (error) {
    console.error('Failed to load settings:', error)
  }
}

const saveProfile = async () => {
  saving.value = true
  try {
    await fetch('/api/v1/tenant/settings/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`
      },
      body: JSON.stringify(profile.value)
    })
    showSuccessToast()
  } catch (error) {
    console.error('Failed to save profile:', error)
  } finally {
    saving.value = false
  }
}

const saveBranding = async () => {
  saving.value = true
  try {
    await fetch('/api/v1/tenant/settings/branding', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`
      },
      body: JSON.stringify(branding.value)
    })
    showSuccessToast()
  } catch (error) {
    console.error('Failed to save branding:', error)
  } finally {
    saving.value = false
  }
}

const saveNotifications = async () => {
  saving.value = true
  try {
    await fetch('/api/v1/tenant/settings/notifications', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`
      },
      body: JSON.stringify(notifications.value)
    })
    showSuccessToast()
  } catch (error) {
    console.error('Failed to save notifications:', error)
  } finally {
    saving.value = false
  }
}

const saveSecurity = async () => {
  saving.value = true
  try {
    await fetch('/api/v1/tenant/settings/security', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`
      },
      body: JSON.stringify(security.value)
    })
    showSuccessToast()
  } catch (error) {
    console.error('Failed to save security:', error)
  } finally {
    saving.value = false
  }
}

const handleLogoUpload = async (event) => {
  const file = event.target.files[0]
  if (!file) return

  const formData = new FormData()
  formData.append('logo', file)

  try {
    const response = await fetch('/api/v1/tenant/settings/logo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authStore.token}` },
      body: formData
    })
    if (response.ok) {
      const data = await response.json()
      branding.value.logo_url = data.url
      showSuccessToast()
    }
  } catch (error) {
    console.error('Failed to upload logo:', error)
  }
}

const connectIntegration = (integration) => {
  // TODO: Implement OAuth flow for each integration
  console.log('Connect:', integration.id)
}

const disconnectIntegration = (integration) => {
  if (confirm(`Disconnect ${integration.name}?`)) {
    integration.connected = false
  }
}

const showSuccessToast = () => {
  showSuccess.value = true
  setTimeout(() => {
    showSuccess.value = false
  }, 3000)
}

// Lifecycle
onMounted(() => {
  loadSettings()
})
</script>
