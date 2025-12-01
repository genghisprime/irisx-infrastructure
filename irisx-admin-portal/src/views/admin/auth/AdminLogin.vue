<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center px-4">
    <div class="max-w-md w-full">
      <!-- Logo/Header -->
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-white mb-2">Tazzi</h1>
        <p class="text-gray-400">Platform Administration Portal</p>
        <p class="text-sm text-gray-500 mt-2">Tazzi Staff Only</p>
      </div>

      <!-- Login Card -->
      <div class="bg-white rounded-lg shadow-2xl p-8">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Admin Sign In</h2>

        <!-- Error Message -->
        <div v-if="error" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p class="text-sm text-red-600">{{ error }}</p>
        </div>

        <form @submit.prevent="handleLogin" autocomplete="off">
          <!-- Email -->
          <div class="mb-4">
            <label for="user-identifier" class="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              id="user-identifier"
              name="user-identifier"
              v-model="email"
              type="text"
              required
              autocomplete="off"
              placeholder="admin@irisx.internal"
              class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              :disabled="loading"
              data-lpignore="true"
              data-form-type="other"
            />
          </div>

          <!-- Password -->
          <div class="mb-6">
            <div class="flex items-center justify-between mb-2">
              <label for="user-secret" class="block text-sm font-medium text-gray-700">
                Password
              </label>
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="text-xs text-blue-600 hover:text-blue-700"
              >
                {{ showPassword ? 'Hide' : 'Show' }}
              </button>
            </div>
            <div class="relative mb-8">
              <input
                id="user-secret"
                name="user-secret"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                required
                autocomplete="new-password"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                placeholder="Enter your password"
                class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                :disabled="loading"
                data-lpignore="true"
                data-form-type="other"
                @focus="passwordFocused = true"
                @blur="passwordFocused = false"
              />
              <!-- Debug indicator showing first 3 chars when focused -->
              <div v-if="passwordFocused && password.length > 0" class="absolute -bottom-6 left-0 text-xs text-red-600 font-semibold">
                VERIFY: First 3 chars = <span class="font-mono font-bold bg-yellow-200 px-1">{{ password.substring(0, 3) }}</span> | Length = {{ password.length }}
                <span v-if="password.substring(0, 3) === 'Adm'" class="text-green-600">✓ CORRECT</span>
                <span v-else class="text-red-600 font-bold">✗ WRONG! Should be "Adm"</span>
              </div>
            </div>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <svg
              v-if="loading"
              class="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ loading ? 'Signing In...' : 'Sign In' }}
          </button>
        </form>

        <!-- Info -->
        <div class="mt-6 pt-6 border-t border-gray-200">
          <p class="text-xs text-gray-500 text-center">
            This portal is for authorized Tazzi staff only. All activities are logged and monitored.
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div class="text-center mt-8">
        <p class="text-sm text-gray-500">
          Tazzi Platform v1.0 | Powered by Tazzi Infrastructure
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAdminAuthStore } from '../../../stores/adminAuth'

const router = useRouter()
const route = useRoute()
const authStore = useAdminAuthStore()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref(null)
const showPassword = ref(false)
const passwordFocused = ref(false)

// Removed aggressive autofill prevention on mount
// Removed aggressive autofill detection - it was preventing legitimate password entry
// Removed readonly attribute to allow copy/paste functionality

async function handleLogin() {
  if (!email.value || !password.value) {
    error.value = 'Please enter both email and password'
    return
  }

  loading.value = true
  error.value = null

  try {
    const result = await authStore.login(email.value, password.value)

    if (result.success) {
      // Redirect to original destination or dashboard
      const redirect = route.query.redirect || '/dashboard'
      router.push(redirect)
    } else {
      error.value = result.error || 'Login failed'
    }
  } catch (err) {
    console.error('Login error:', err)
    error.value = 'An unexpected error occurred. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>
