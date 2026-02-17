<template>
  <!-- Modal Backdrop -->
  <div
    v-if="isOpen"
    class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
    @click.self="!wrapUpTimer.isExpired.value && handleClose()"
  >
    <!-- Modal Content -->
    <div class="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
      <!-- Wrap-up Timer Bar -->
      <div v-if="wrapUpTimer.isActive.value" class="mb-4">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-medium" :class="timerTextClass">
            Wrap-up Time: {{ wrapUpTimer.formattedElapsed.value }} / {{ wrapUpTimer.formattedMax.value }}
          </span>
          <div class="flex items-center gap-2">
            <span v-if="wrapUpTimer.isWarning.value" class="text-xs text-orange-600 font-medium">
              {{ wrapUpTimer.formattedRemaining.value }} remaining
            </span>
            <button
              v-if="wrapUpTimer.canExtend.value && wrapUpTimer.isWarning.value"
              @click="handleExtension"
              class="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            >
              +1 min
            </button>
          </div>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="timerBarClass"
            :style="{ width: `${wrapUpTimer.progressPercent.value}%` }"
          ></div>
        </div>
        <div v-if="wrapUpTimer.isExpired.value" class="mt-2 flex items-center gap-2 text-red-600 text-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span class="font-medium">Wrap-up time exceeded! Please submit disposition.</span>
        </div>
      </div>

      <!-- Modal Header -->
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-900">
          Call Disposition
        </h3>
        <button
          v-if="!wrapUpTimer.isExpired.value"
          @click="handleClose"
          class="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Call Details Summary -->
      <div v-if="callData" class="bg-gray-50 rounded-lg p-3 mb-4">
        <div class="text-sm text-gray-600">
          <div><strong>Number:</strong> {{ callData.number }}</div>
          <div><strong>Duration:</strong> {{ formatDuration(callData.duration) }}</div>
          <div v-if="callData.startTime"><strong>Time:</strong> {{ formatTime(callData.startTime) }}</div>
        </div>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleSubmit">
        <!-- Outcome Dropdown -->
        <div class="mb-4">
          <label for="outcome" class="block text-sm font-medium text-gray-700 mb-2">
            Call Outcome <span class="text-red-500">*</span>
          </label>
          <select
            id="outcome"
            v-model="form.outcome"
            required
            class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          >
            <option value="">Select outcome...</option>
            <option value="completed">Completed</option>
            <option value="no_answer">No Answer</option>
            <option value="voicemail">Left Voicemail</option>
            <option value="busy">Busy</option>
            <option value="callback_requested">Callback Requested</option>
            <option value="transferred">Transferred</option>
            <option value="disconnected">Disconnected</option>
            <option value="wrong_number">Wrong Number</option>
          </select>
        </div>

        <!-- Notes Textarea -->
        <div class="mb-4">
          <label for="notes" class="block text-sm font-medium text-gray-700 mb-2">
            Call Notes
          </label>
          <textarea
            id="notes"
            v-model="form.notes"
            rows="4"
            placeholder="Enter any notes about this call..."
            class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm resize-none"
          ></textarea>
        </div>

        <!-- Error Message -->
        <div v-if="error" class="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {{ error }}
        </div>

        <!-- Buttons -->
        <div class="flex justify-end space-x-3">
          <button
            v-if="!wrapUpTimer.isExpired.value"
            type="button"
            @click="handleClose"
            :disabled="isSubmitting"
            class="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="isSubmitting || !form.outcome"
            :class="[
              'px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
              wrapUpTimer.isExpired.value
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500 animate-pulse'
                : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
            ]"
          >
            <span v-if="isSubmitting">Saving...</span>
            <span v-else-if="wrapUpTimer.isExpired.value">Submit Now</span>
            <span v-else>Save Disposition</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { apiClient } from '../utils/api'
import { useWrapUpTimer } from '../composables/useWrapUpTimer'

// Props
const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  callData: {
    type: Object,
    default: null
    // Expected shape: { number, duration, startTime, callSid }
  },
  wrapUpSettings: {
    type: Object,
    default: () => ({
      maxWrapUpSeconds: 120,
      warningThresholdSeconds: 30,
      extensionAllowed: true,
      extensionSeconds: 60,
      maxExtensions: 2,
    })
  }
})

// Emits
const emit = defineEmits(['close', 'saved', 'wrapup-expired'])

// Wrap-up timer
const wrapUpTimer = useWrapUpTimer(props.wrapUpSettings)

// Timer styling
const timerTextClass = computed(() => {
  if (wrapUpTimer.isExpired.value) return 'text-red-600'
  if (wrapUpTimer.isWarning.value) return 'text-orange-600'
  return 'text-gray-600'
})

const timerBarClass = computed(() => {
  if (wrapUpTimer.isExpired.value) return 'bg-red-500'
  if (wrapUpTimer.isWarning.value) return 'bg-orange-500'
  return 'bg-green-500'
})

// State
const form = ref({
  outcome: '',
  notes: ''
})

const isSubmitting = ref(false)
const error = ref(null)

// Watch for modal open to reset form and start timer
watch(() => props.isOpen, (newValue) => {
  if (newValue) {
    // Reset form when modal opens
    form.value = {
      outcome: '',
      notes: ''
    }
    error.value = null
    // Start wrap-up timer
    wrapUpTimer.start()
  } else {
    // Stop timer when modal closes
    wrapUpTimer.reset()
  }
})

// Watch for timer expiration
watch(() => wrapUpTimer.isExpired.value, (expired) => {
  if (expired) {
    emit('wrapup-expired')
  }
})

// Extension handler
function handleExtension() {
  const result = wrapUpTimer.requestExtension()
  if (!result.success) {
    error.value = result.reason
  }
}

// Methods
function handleClose() {
  if (!isSubmitting.value) {
    emit('close')
  }
}

async function handleSubmit() {
  if (!form.value.outcome) {
    error.value = 'Please select a call outcome'
    return
  }

  isSubmitting.value = true
  error.value = null

  try {
    // API call to save disposition
    const payload = {
      call_sid: props.callData?.callSid,
      outcome: form.value.outcome,
      notes: form.value.notes,
      agent_id: 'current-agent-id' // Would come from auth store in real app
    }

    console.log('DEMO: Saving call disposition:', payload)

    // In real implementation, uncomment this:
    // await apiClient.post('/v1/calls/disposition', payload)

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500))

    emit('saved', {
      ...payload,
      success: true
    })

    emit('close')
  } catch (err) {
    console.error('Failed to save disposition:', err)
    error.value = err.response?.data?.message || 'Failed to save disposition. Please try again.'
  } finally {
    isSubmitting.value = false
  }
}

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleString()
}
</script>
