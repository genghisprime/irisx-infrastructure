<template>
  <div class="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-800 to-indigo-900 flex items-center justify-center px-4">
    <div class="max-w-md w-full">
      <!-- Logo/Header -->
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-white mb-2">Tazzi</h1>
        <p class="text-indigo-200">Customer Portal</p>
        <p class="text-sm text-indigo-300 mt-2">Manage your communications</p>
      </div>

      <!-- Login Card -->
      <div class="bg-white rounded-lg shadow-2xl p-8">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Sign In</h2>

        <!-- Error Message -->
        <div v-if="authStore.error" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p class="text-sm text-red-600">{{ authStore.error }}</p>
        </div>

        <form @submit.prevent="handleLogin">
          <!-- Email -->
          <div class="mb-4">
            <label for="email" class="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              id="email"
              v-model="form.email"
              name="email"
              type="email"
              autocomplete="email"
              required
              placeholder="you@company.com"
              class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              :disabled="authStore.isLoading"
            />
          </div>

          <!-- Password -->
          <div class="mb-6">
            <div class="flex items-center justify-between mb-2">
              <label for="password" class="block text-sm font-medium text-gray-700">
                Password
              </label>
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="text-xs text-indigo-600 hover:text-indigo-700"
              >
                {{ showPassword ? 'Hide' : 'Show' }}
              </button>
            </div>
            <input
              id="password"
              v-model="form.password"
              name="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
              placeholder="Enter your password"
              class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              :disabled="authStore.isLoading"
            />
          </div>

          <!-- Remember Me & Forgot Password -->
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center">
              <input
                id="remember-me"
                v-model="form.rememberMe"
                name="remember-me"
                type="checkbox"
                class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <label for="remember-me" class="ml-2 block text-sm text-gray-700">
                Remember me
              </label>
            </div>
            <a href="#" class="text-sm text-indigo-600 hover:text-indigo-500">
              Forgot password?
            </a>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="authStore.isLoading"
            class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <svg
              v-if="authStore.isLoading"
              class="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ authStore.isLoading ? 'Signing In...' : 'Sign In' }}
          </button>
        </form>

        <!-- Sign Up Link -->
        <div class="mt-6 text-center">
          <p class="text-sm text-gray-600">
            Don't have an account?
            <router-link to="/signup" class="font-medium text-indigo-600 hover:text-indigo-500">
              Sign up
            </router-link>
          </p>
        </div>

      </div>

      <!-- Footer -->
      <div class="text-center mt-8">
        <p class="text-sm text-indigo-300">
          Tazzi Platform v1.0 | Powered by Tazzi
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const form = ref({
  email: '',
  password: '',
  rememberMe: false
})

const showPassword = ref(false)

async function handleLogin() {
  const result = await authStore.login(form.value.email, form.value.password)

  if (result.success) {
    router.push('/dashboard')
  }
}
</script>
