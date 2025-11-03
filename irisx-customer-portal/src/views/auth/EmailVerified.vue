<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <!-- Success Animation -->
      <div class="text-center">
        <div class="mx-auto w-24 h-24 bg-gradient-to-r from-green-400 to-blue-500 rounded-full flex items-center justify-center mb-6 animate-bounce-slow shadow-lg">
          <svg class="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>

        <h2 class="text-4xl font-extrabold text-gray-900 mb-3">
          Email Verified!
        </h2>
        <p class="text-lg text-gray-600 mb-2">
          Your account has been successfully activated
        </p>
        <p class="text-sm text-gray-500">
          You can now sign in and start using Tazzi
        </p>
      </div>

      <!-- Trial Information Card -->
      <div class="bg-white shadow-lg rounded-xl p-6 border border-gray-200">
        <div class="flex items-start space-x-3 mb-4">
          <div class="flex-shrink-0">
            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-900 mb-1">Your 14-Day Free Trial</h3>
            <p class="text-sm text-gray-600">
              Explore all features with full access. No credit card required.
            </p>
          </div>
        </div>

        <div class="border-t border-gray-200 pt-4 space-y-3">
          <div class="flex items-center text-sm text-gray-700">
            <svg class="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
            </svg>
            <span>Access to Voice, SMS, Email, WhatsApp & Social channels</span>
          </div>
          <div class="flex items-center text-sm text-gray-700">
            <svg class="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
            </svg>
            <span>Up to 5 agent seats</span>
          </div>
          <div class="flex items-center text-sm text-gray-700">
            <svg class="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
            </svg>
            <span>$50 in free credits (1,000 messages or 100 minutes)</span>
          </div>
        </div>
      </div>

      <!-- Quick Start Guide -->
      <div class="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6 border border-purple-200">
        <h3 class="text-sm font-semibold text-gray-900 mb-3 flex items-center">
          <svg class="w-5 h-5 text-purple-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
          </svg>
          Quick Start Steps
        </h3>
        <ol class="space-y-2 text-sm text-gray-700">
          <li class="flex items-start">
            <span class="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5">1</span>
            <span>Sign in to your dashboard</span>
          </li>
          <li class="flex items-start">
            <span class="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5">2</span>
            <span>Configure your phone numbers and channels</span>
          </li>
          <li class="flex items-start">
            <span class="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5">3</span>
            <span>Invite your team members</span>
          </li>
          <li class="flex items-start">
            <span class="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold mr-3 mt-0.5">4</span>
            <span>Send your first message or make a call!</span>
          </li>
        </ol>
      </div>

      <!-- Auto-redirect countdown -->
      <div v-if="countdown > 0" class="text-center text-sm text-gray-500">
        <p>Redirecting to login in {{ countdown }} seconds...</p>
      </div>

      <!-- Action Button -->
      <div>
        <router-link
          to="/login?verified=true"
          class="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-base font-semibold rounded-lg text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all shadow-lg hover:shadow-xl"
        >
          <span class="flex items-center">
            Continue to Login
            <svg class="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path>
            </svg>
          </span>
        </router-link>
      </div>

      <!-- Help Link -->
      <div class="text-center text-sm text-gray-600">
        <p>
          Need help getting started?
          <a href="https://docs.tazzi.com/guides" target="_blank" class="font-semibold text-purple-600 hover:text-purple-700 underline">
            View our guides
          </a>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const countdown = ref(5)

// Auto-redirect after 5 seconds
onMounted(() => {
  const interval = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(interval)
      router.push('/login?verified=true')
    }
  }, 1000)
})
</script>

<style scoped>
@keyframes bounce-slow {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.animate-bounce-slow {
  animation: bounce-slow 2s infinite;
}
</style>
