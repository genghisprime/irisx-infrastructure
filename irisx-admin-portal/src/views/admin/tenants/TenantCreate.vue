<template>
  <div>
    <div class="mb-6">
      <RouterLink
        to="/dashboard/tenants"
        class="text-blue-600 hover:text-blue-800 flex items-center"
      >
        <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Tenants
      </RouterLink>
    </div>

    <h1 class="text-2xl font-bold text-gray-900 mb-6">Create New Tenant</h1>

    <!-- Error Alert -->
    <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <p class="text-red-600">{{ error }}</p>
    </div>

    <!-- Create Form -->
    <div class="bg-white rounded-lg shadow">
      <form @submit.prevent="handleSubmit" class="p-6 space-y-6">
        <!-- Company Information -->
        <div>
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Company Information</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Company Name <span class="text-red-500">*</span>
              </label>
              <input
                v-model="form.company_name"
                type="text"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Acme Corporation"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Domain <span class="text-red-500">*</span>
              </label>
              <input
                v-model="form.domain"
                type="text"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="acme"
              />
              <p class="text-xs text-gray-500 mt-1">Used for subdomain: acme.irisx.com</p>
            </div>
          </div>
        </div>

        <!-- Admin User Information -->
        <div>
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Admin User</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                First Name <span class="text-red-500">*</span>
              </label>
              <input
                v-model="form.admin_first_name"
                type="text"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Last Name <span class="text-red-500">*</span>
              </label>
              <input
                v-model="form.admin_last_name"
                type="text"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Email <span class="text-red-500">*</span>
              </label>
              <input
                v-model="form.admin_email"
                type="email"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Phone
              </label>
              <input
                v-model="form.admin_phone"
                type="tel"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="+1234567890"
              />
            </div>
          </div>
        </div>

        <!-- Subscription Plan -->
        <div>
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Subscription</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Plan <span class="text-red-500">*</span>
              </label>
              <select
                v-model="form.plan"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="free">Free ($0/mo)</option>
                <option value="starter">Starter ($49/mo)</option>
                <option value="professional">Professional ($199/mo)</option>
                <option value="enterprise">Enterprise ($499/mo)</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Initial Status <span class="text-red-500">*</span>
              </label>
              <select
                v-model="form.status"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="trial">Trial (14 days)</option>
                <option value="active">Active (Immediate)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Contact Information -->
        <div>
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Address
              </label>
              <input
                v-model="form.address"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                City
              </label>
              <input
                v-model="form.city"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                State
              </label>
              <input
                v-model="form.state"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Postal Code
              </label>
              <input
                v-model="form.postal_code"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Country
              </label>
              <select
                v-model="form.country"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="GB">United Kingdom</option>
                <option value="AU">Australia</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Notes
          </label>
          <textarea
            v-model="form.notes"
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Optional notes about this tenant..."
          ></textarea>
        </div>

        <!-- Action Buttons -->
        <div class="flex justify-end space-x-3 pt-4 border-t">
          <RouterLink
            to="/dashboard/tenants"
            class="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </RouterLink>
          <button
            type="submit"
            :disabled="loading"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="loading">Creating...</span>
            <span v-else>Create Tenant</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminAPI } from '../../../utils/api'

const router = useRouter()

const loading = ref(false)
const error = ref(null)

const form = ref({
  company_name: '',
  domain: '',
  admin_first_name: '',
  admin_last_name: '',
  admin_email: '',
  admin_phone: '',
  plan: 'starter',
  status: 'trial',
  address: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'US',
  notes: ''
})

async function handleSubmit() {
  loading.value = true
  error.value = null

  try {
    const response = await adminAPI.tenants.create(form.value)
    const newTenant = response.data.tenant

    // Redirect to the new tenant's detail page
    router.push(`/dashboard/tenants/${newTenant.id}`)
  } catch (err) {
    console.error('Failed to create tenant:', err)
    error.value = err.response?.data?.error || 'Failed to create tenant'
  } finally {
    loading.value = false
  }
}
</script>
