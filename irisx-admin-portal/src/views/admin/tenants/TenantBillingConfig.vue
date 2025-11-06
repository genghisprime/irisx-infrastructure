<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Billing Configuration</h1>
        <p class="text-gray-500 mt-1">Manage billing settings for {{ tenant?.company_name }}</p>
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

    <!-- Billing Configuration -->
    <div v-if="!loading && billingConfig" class="space-y-6">
      <!-- Subscription Plan -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold mb-4">Subscription Plan</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Current Plan</label>
            <select
              v-model="billingConfig.plan"
              :disabled="!authStore.isAdmin"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="free">Free - $0/month</option>
              <option value="starter">Starter - $49/month</option>
              <option value="professional">Professional - $199/month</option>
              <option value="enterprise">Enterprise - Custom Pricing</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Billing Cycle</label>
            <select
              v-model="billingConfig.billing_cycle"
              :disabled="!authStore.isAdmin"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="monthly">Monthly</option>
              <option value="annually">Annually (Save 20%)</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Monthly Recurring Revenue</label>
            <div class="flex items-center">
              <span class="text-gray-500 mr-2">$</span>
              <input
                v-model.number="billingConfig.mrr"
                type="number"
                step="0.01"
                :disabled="!authStore.isAdmin"
                class="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Billing Status</label>
            <select
              v-model="billingConfig.billing_status"
              :disabled="!authStore.isAdmin"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="active">Active</option>
              <option value="past_due">Past Due</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Usage Limits -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold mb-4">Usage Limits</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Monthly Calls Limit</label>
            <input
              v-model.number="billingConfig.limits.calls"
              type="number"
              :disabled="!authStore.isAdmin"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Unlimited"
            />
            <p class="text-xs text-gray-500 mt-1">Leave empty for unlimited</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Monthly SMS Limit</label>
            <input
              v-model.number="billingConfig.limits.sms"
              type="number"
              :disabled="!authStore.isAdmin"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Unlimited"
            />
            <p class="text-xs text-gray-500 mt-1">Leave empty for unlimited</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Monthly Email Limit</label>
            <input
              v-model.number="billingConfig.limits.emails"
              type="number"
              :disabled="!authStore.isAdmin"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Unlimited"
            />
            <p class="text-xs text-gray-500 mt-1">Leave empty for unlimited</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Storage Limit (GB)</label>
            <input
              v-model.number="billingConfig.limits.storage_gb"
              type="number"
              :disabled="!authStore.isAdmin"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Unlimited"
            />
            <p class="text-xs text-gray-500 mt-1">Leave empty for unlimited</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">API Requests/Hour</label>
            <input
              v-model.number="billingConfig.limits.api_requests_per_hour"
              type="number"
              :disabled="!authStore.isAdmin"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Unlimited"
            />
            <p class="text-xs text-gray-500 mt-1">Leave empty for unlimited</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Max Users</label>
            <input
              v-model.number="billingConfig.limits.max_users"
              type="number"
              :disabled="!authStore.isAdmin"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Unlimited"
            />
            <p class="text-xs text-gray-500 mt-1">Leave empty for unlimited</p>
          </div>
        </div>
      </div>

      <!-- Payment Information -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold mb-4">Payment Information</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Stripe Customer ID</label>
            <input
              v-model="billingConfig.stripe_customer_id"
              type="text"
              :disabled="!authStore.isAdmin"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="cus_xxxxx"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Stripe Subscription ID</label>
            <input
              v-model="billingConfig.stripe_subscription_id"
              type="text"
              :disabled="!authStore.isAdmin"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="sub_xxxxx"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
            <input
              v-model="billingConfig.payment_method"
              type="text"
              disabled
              class="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
              :placeholder="billingConfig.payment_method || 'Not configured'"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Next Billing Date</label>
            <input
              v-model="billingConfig.next_billing_date"
              type="date"
              :disabled="!authStore.isAdmin"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>

        <div class="mt-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">Billing Email</label>
          <input
            v-model="billingConfig.billing_email"
            type="email"
            :disabled="!authStore.isAdmin"
            class="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="billing@example.com"
          />
        </div>
      </div>

      <!-- Pricing Tiers -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold mb-4">Custom Pricing Tiers</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Cost per Call Minute</label>
            <div class="flex items-center">
              <span class="text-gray-500 mr-2">$</span>
              <input
                v-model.number="billingConfig.pricing.per_call_minute"
                type="number"
                step="0.001"
                :disabled="!authStore.isAdmin"
                class="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                placeholder="0.015"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Cost per SMS</label>
            <div class="flex items-center">
              <span class="text-gray-500 mr-2">$</span>
              <input
                v-model.number="billingConfig.pricing.per_sms"
                type="number"
                step="0.001"
                :disabled="!authStore.isAdmin"
                class="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                placeholder="0.008"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Cost per Email</label>
            <div class="flex items-center">
              <span class="text-gray-500 mr-2">$</span>
              <input
                v-model.number="billingConfig.pricing.per_email"
                type="number"
                step="0.001"
                :disabled="!authStore.isAdmin"
                class="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                placeholder="0.001"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Cost per GB Storage</label>
            <div class="flex items-center">
              <span class="text-gray-500 mr-2">$</span>
              <input
                v-model.number="billingConfig.pricing.per_gb_storage"
                type="number"
                step="0.01"
                :disabled="!authStore.isAdmin"
                class="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                placeholder="0.10"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Save Button -->
      <div v-if="authStore.isAdmin" class="flex justify-end">
        <button
          @click="saveBillingConfig"
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

const route = useRoute()
const authStore = useAdminAuthStore()

const loading = ref(true)
const saving = ref(false)
const error = ref(null)
const successMessage = ref(null)
const tenant = ref(null)
const billingConfig = ref({
  plan: 'free',
  billing_cycle: 'monthly',
  mrr: 0,
  billing_status: 'active',
  limits: {
    calls: null,
    sms: null,
    emails: null,
    storage_gb: null,
    api_requests_per_hour: null,
    max_users: null
  },
  stripe_customer_id: '',
  stripe_subscription_id: '',
  payment_method: '',
  next_billing_date: '',
  billing_email: '',
  pricing: {
    per_call_minute: 0.015,
    per_sms: 0.008,
    per_email: 0.001,
    per_gb_storage: 0.10
  }
})

onMounted(() => {
  fetchTenant()
  fetchBillingConfig()
})

async function fetchTenant() {
  try {
    const response = await adminAPI.tenants.get(route.params.id)
    tenant.value = response.data
  } catch (err) {
    console.error('Failed to fetch tenant:', err)
  }
}

async function fetchBillingConfig() {
  loading.value = true
  error.value = null

  try {
    const response = await adminAPI.billing.getConfig(route.params.id)
    if (response.data) {
      billingConfig.value = {
        ...billingConfig.value,
        ...response.data,
        limits: { ...billingConfig.value.limits, ...response.data.limits },
        pricing: { ...billingConfig.value.pricing, ...response.data.pricing }
      }
    }
  } catch (err) {
    console.error('Failed to fetch billing config:', err)
    error.value = 'Failed to load billing configuration'
  } finally {
    loading.value = false
  }
}

async function saveBillingConfig() {
  saving.value = true
  error.value = null
  successMessage.value = null

  try {
    await adminAPI.billing.updateConfig(route.params.id, billingConfig.value)
    successMessage.value = 'Billing configuration saved successfully!'
    setTimeout(() => successMessage.value = null, 3000)
  } catch (err) {
    console.error('Failed to save billing config:', err)
    error.value = 'Failed to save billing configuration'
  } finally {
    saving.value = false
  }
}
</script>
