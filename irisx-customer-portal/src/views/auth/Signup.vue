<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Create your account
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600">
          Start using IRISX communications platform
        </p>
      </div>

      <form class="mt-8 space-y-6" @submit.prevent="handleSignup">
        <!-- Error Message -->
        <div v-if="authStore.error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {{ authStore.error }}
        </div>

        <div class="space-y-4">
          <!-- Company Name -->
          <div>
            <label for="company-name" class="block text-sm font-medium text-gray-700">
              Company Name
            </label>
            <input
              id="company-name"
              v-model="form.companyName"
              name="company-name"
              type="text"
              required
              class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Acme Inc."
            />
          </div>

          <!-- Full Name -->
          <div>
            <label for="full-name" class="block text-sm font-medium text-gray-700">
              Full Name
            </label>
            <input
              id="full-name"
              v-model="form.fullName"
              name="full-name"
              type="text"
              required
              class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="John Doe"
            />
          </div>

          <!-- Email -->
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700">
              Email Address
            </label>
            <input
              id="email"
              v-model="form.email"
              name="email"
              type="email"
              autocomplete="email"
              required
              class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="john@example.com"
            />
          </div>

          <!-- Password -->
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              v-model="form.password"
              name="password"
              type="password"
              autocomplete="new-password"
              required
              class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="••••••••"
            />
            <p class="mt-1 text-xs text-gray-500">
              Must be at least 8 characters
            </p>
          </div>

          <!-- Confirm Password -->
          <div>
            <label for="confirm-password" class="block text-sm font-medium text-gray-700">
              Confirm Password
            </label>
            <input
              id="confirm-password"
              v-model="form.confirmPassword"
              name="confirm-password"
              type="password"
              autocomplete="new-password"
              required
              class="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="••••••••"
            />
            <p v-if="passwordMismatch" class="mt-1 text-xs text-red-600">
              Passwords do not match
            </p>
          </div>

          <!-- Terms & Conditions -->
          <div class="flex items-start">
            <div class="flex items-center h-5">
              <input
                id="terms"
                v-model="form.acceptTerms"
                name="terms"
                type="checkbox"
                required
                class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
            </div>
            <div class="ml-3 text-sm">
              <label for="terms" class="font-medium text-gray-700">
                I agree to the
                <a href="#" class="text-indigo-600 hover:text-indigo-500">Terms and Conditions</a>
                and
                <a href="#" class="text-indigo-600 hover:text-indigo-500">Privacy Policy</a>
              </label>
            </div>
          </div>
        </div>

        <div>
          <button
            type="submit"
            :disabled="authStore.isLoading || passwordMismatch || !form.acceptTerms"
            class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="authStore.isLoading">Creating account...</span>
            <span v-else>Create account</span>
          </button>
        </div>

        <div class="text-center">
          <p class="text-sm text-gray-600">
            Already have an account?
            <router-link to="/login" class="font-medium text-indigo-600 hover:text-indigo-500">
              Sign in
            </router-link>
          </p>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const form = ref({
  companyName: '',
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  acceptTerms: false
})

const passwordMismatch = computed(() => {
  return form.value.password !== form.value.confirmPassword && form.value.confirmPassword.length > 0
})

async function handleSignup() {
  if (passwordMismatch.value) return
  if (!form.value.acceptTerms) return

  const result = await authStore.signup({
    tenant_name: form.value.companyName,
    name: form.value.fullName,
    email: form.value.email,
    password: form.value.password
  })

  if (result.success) {
    // Redirect to dashboard on successful signup
    router.push('/dashboard')
  }
}
</script>
