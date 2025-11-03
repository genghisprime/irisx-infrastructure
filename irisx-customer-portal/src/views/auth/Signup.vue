<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <!-- Logo/Header -->
      <div>
        <h2 class="mt-6 text-center text-4xl font-extrabold text-gray-900">
          Start your free trial
        </h2>
        <p class="mt-2 text-center text-base text-gray-600">
          14 days free • No credit card required • Full access to all features
        </p>
      </div>

      <!-- Success State (Email Verification Sent) -->
      <div v-if="signupSuccess" class="bg-green-50 border border-green-200 rounded-lg p-6 text-center space-y-4">
        <div class="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
          <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="width" stroke-width="2" d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"></path>
          </svg>
        </div>
        <div>
          <h3 class="text-lg font-semibold text-green-900">Check your email!</h3>
          <p class="mt-2 text-sm text-green-700">
            We've sent a verification link to <strong>{{ form.email }}</strong>
          </p>
          <p class="mt-2 text-sm text-green-600">
            Click the link in the email to activate your account and start your free trial.
          </p>
        </div>
        <div class="pt-4 border-t border-green-200">
          <p class="text-xs text-green-600 mb-3">Didn't receive the email?</p>
          <button
            v-if="!resendCooldown"
            @click="resendVerification"
            :disabled="isResending"
            class="text-sm font-medium text-green-700 hover:text-green-800 underline disabled:opacity-50"
          >
            {{ isResending ? 'Sending...' : 'Resend verification email' }}
          </button>
          <p v-else class="text-xs text-green-600">
            Wait {{ resendCooldown }}s before requesting again
          </p>
        </div>
      </div>

      <!-- Signup Form -->
      <form v-else class="mt-8 space-y-6" @submit.prevent="handleSignup">
        <!-- Error Message -->
        <div v-if="errorMessage" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <div class="flex items-start">
            <svg class="w-5 h-5 text-red-400 mt-0.5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
            </svg>
            <span>{{ errorMessage }}</span>
          </div>
        </div>

        <div class="space-y-5">
          <!-- Company Name -->
          <div>
            <label for="company-name" class="block text-sm font-medium text-gray-700 mb-1">
              Company Name <span class="text-red-500">*</span>
            </label>
            <input
              id="company-name"
              v-model="form.companyName"
              type="text"
              required
              minlength="2"
              maxlength="100"
              class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
              placeholder="Acme Inc."
            />
          </div>

          <!-- First and Last Name (Side by side) -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="first-name" class="block text-sm font-medium text-gray-700 mb-1">
                First Name <span class="text-red-500">*</span>
              </label>
              <input
                id="first-name"
                v-model="form.firstName"
                type="text"
                required
                minlength="1"
                maxlength="50"
                class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                placeholder="John"
              />
            </div>
            <div>
              <label for="last-name" class="block text-sm font-medium text-gray-700 mb-1">
                Last Name <span class="text-red-500">*</span>
              </label>
              <input
                id="last-name"
                v-model="form.lastName"
                type="text"
                required
                minlength="1"
                maxlength="50"
                class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                placeholder="Doe"
              />
            </div>
          </div>

          <!-- Email -->
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
              Work Email <span class="text-red-500">*</span>
            </label>
            <input
              id="email"
              v-model="form.email"
              type="email"
              required
              autocomplete="email"
              class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
              placeholder="john@acmeinc.com"
            />
          </div>

          <!-- Phone (Optional) -->
          <div>
            <label for="phone" class="block text-sm font-medium text-gray-700 mb-1">
              Phone Number <span class="text-gray-400 text-xs">(Optional)</span>
            </label>
            <input
              id="phone"
              v-model="form.phone"
              type="tel"
              autocomplete="tel"
              class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <!-- Password -->
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
              Password <span class="text-red-500">*</span>
            </label>
            <input
              id="password"
              v-model="form.password"
              type="password"
              required
              autocomplete="new-password"
              class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
              placeholder="••••••••"
              @input="validatePassword"
            />
            <!-- Password Strength Indicator -->
            <div v-if="form.password" class="mt-2 space-y-1">
              <div class="flex items-center space-x-2 text-xs">
                <div class="flex-1 bg-gray-200 rounded-full h-1.5">
                  <div
                    class="h-1.5 rounded-full transition-all"
                    :class="{
                      'bg-red-500 w-1/4': passwordStrength === 'weak',
                      'bg-yellow-500 w-2/4': passwordStrength === 'medium',
                      'bg-green-500 w-full': passwordStrength === 'strong'
                    }"
                  ></div>
                </div>
                <span
                  class="font-medium"
                  :class="{
                    'text-red-600': passwordStrength === 'weak',
                    'text-yellow-600': passwordStrength === 'medium',
                    'text-green-600': passwordStrength === 'strong'
                  }"
                >
                  {{ passwordStrength ? passwordStrength.charAt(0).toUpperCase() + passwordStrength.slice(1) : '' }}
                </span>
              </div>
              <ul class="text-xs text-gray-600 space-y-0.5 pl-1">
                <li :class="{'text-green-600 font-medium': passwordChecks.length}">
                  {{ passwordChecks.length ? '✓' : '○' }} At least 8 characters
                </li>
                <li :class="{'text-green-600 font-medium': passwordChecks.uppercase}">
                  {{ passwordChecks.uppercase ? '✓' : '○' }} One uppercase letter
                </li>
                <li :class="{'text-green-600 font-medium': passwordChecks.number}">
                  {{ passwordChecks.number ? '✓' : '○' }} One number
                </li>
                <li :class="{'text-green-600 font-medium': passwordChecks.special}">
                  {{ passwordChecks.special ? '✓' : '○' }} One special character (!@#$%^&*)
                </li>
              </ul>
            </div>
          </div>

          <!-- Confirm Password -->
          <div>
            <label for="confirm-password" class="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password <span class="text-red-500">*</span>
            </label>
            <input
              id="confirm-password"
              v-model="form.confirmPassword"
              type="password"
              required
              autocomplete="new-password"
              class="appearance-none block w-full px-4 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
              placeholder="••••••••"
            />
            <p v-if="passwordMismatch" class="mt-1.5 text-xs text-red-600 flex items-center">
              <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
              </svg>
              Passwords do not match
            </p>
          </div>

          <!-- Terms & Conditions -->
          <div class="flex items-start pt-2">
            <div class="flex items-center h-5">
              <input
                id="terms"
                v-model="form.acceptTerms"
                type="checkbox"
                required
                class="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer"
              />
            </div>
            <div class="ml-3 text-sm">
              <label for="terms" class="text-gray-700 cursor-pointer">
                I agree to the <a href="/terms" target="_blank" class="text-purple-600 hover:text-purple-700 font-medium underline">Terms of Service</a> and <a href="/privacy" target="_blank" class="text-purple-600 hover:text-purple-700 font-medium underline">Privacy Policy</a>
              </label>
            </div>
          </div>
        </div>

        <!-- Submit Button -->
        <div>
          <button
            type="submit"
            :disabled="isSubmitting || passwordMismatch || !form.acceptTerms || !isPasswordValid"
            class="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-base font-semibold rounded-lg text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
          >
            <span v-if="isSubmitting" class="flex items-center">
              <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating your account...
            </span>
            <span v-else>Start Free Trial</span>
          </button>
        </div>

        <!-- Features List -->
        <div class="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
          <p class="font-semibold text-gray-700 mb-2">Your free trial includes:</p>
          <ul class="space-y-1.5 text-xs">
            <li class="flex items-center">
              <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
              </svg>
              Full access to Voice, SMS, Email, WhatsApp, and Social channels
            </li>
            <li class="flex items-center">
              <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
              </svg>
              Up to 5 agent seats with full features
            </li>
            <li class="flex items-center">
              <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
              </svg>
              $50 in free credits (1,000 messages or 100 call minutes)
            </li>
            <li class="flex items-center">
              <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
              </svg>
              No credit card required
            </li>
          </ul>
        </div>

        <!-- Login Link -->
        <div class="text-center pt-2">
          <p class="text-sm text-gray-600">
            Already have an account?
            <router-link to="/login" class="font-semibold text-purple-600 hover:text-purple-700 underline">
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
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const form = ref({
  companyName: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  acceptTerms: false
})

const isSubmitting = ref(false)
const signupSuccess = ref(false)
const errorMessage = ref(null)
const isResending = ref(false)
const resendCooldown = ref(0)

// Password validation
const passwordChecks = ref({
  length: false,
  uppercase: false,
  number: false,
  special: false
})

const passwordStrength = computed(() => {
  const checks = Object.values(passwordChecks.value).filter(Boolean).length
  if (checks === 0) return null
  if (checks <= 2) return 'weak'
  if (checks === 3) return 'medium'
  return 'strong'
})

const isPasswordValid = computed(() => {
  return Object.values(passwordChecks.value).every(Boolean)
})

const passwordMismatch = computed(() => {
  return form.value.password !== form.value.confirmPassword && form.value.confirmPassword.length > 0
})

function validatePassword() {
  const pwd = form.value.password
  passwordChecks.value = {
    length: pwd.length >= 8,
    uppercase: /[A-Z]/.test(pwd),
    number: /[0-9]/.test(pwd),
    special: /[!@#$%^&*]/.test(pwd)
  }
}

async function handleSignup() {
  if (passwordMismatch.value || !isPasswordValid.value || !form.value.acceptTerms) {
    return
  }

  isSubmitting.value = true
  errorMessage.value = null

  try {
    const response = await axios.post(`${API_URL}/public/signup`, {
      companyName: form.value.companyName,
      firstName: form.value.firstName,
      lastName: form.value.lastName,
      email: form.value.email,
      phone: form.value.phone || undefined,
      password: form.value.password
    })

    if (response.data.success) {
      signupSuccess.value = true
    }
  } catch (error) {
    console.error('Signup error:', error)
    errorMessage.value = error.response?.data?.error || error.response?.data?.message || 'Failed to create account. Please try again.'
  } finally {
    isSubmitting.value = false
  }
}

async function resendVerification() {
  isResending.value = true
  errorMessage.value = null

  try {
    await axios.post(`${API_URL}/public/resend-verification`, {
      email: form.value.email
    })

    // Start cooldown timer (30 seconds)
    resendCooldown.value = 30
    const interval = setInterval(() => {
      resendCooldown.value--
      if (resendCooldown.value <= 0) {
        clearInterval(interval)
      }
    }, 1000)
  } catch (error) {
    console.error('Resend error:', error)
    errorMessage.value = error.response?.data?.error || 'Failed to resend email. Please try again.'
  } finally {
    isResending.value = false
  }
}
</script>
