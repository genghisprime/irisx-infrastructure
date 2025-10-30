<template>
  <!-- Modal Backdrop -->
  <div
    v-if="isOpen"
    class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
    @click.self="handleClose"
  >
    <!-- Modal Content -->
    <div class="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
      <!-- Modal Header -->
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-900">
          Call Disposition
        </h3>
        <button
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
            class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isSubmitting">Saving...</span>
            <span v-else>Save Disposition</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { apiClient } from '../utils/api'

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
  }
})

// Emits
const emit = defineEmits(['close', 'saved'])

// State
const form = ref({
  outcome: '',
  notes: ''
})

const isSubmitting = ref(false)
const error = ref(null)

// Watch for modal open to reset form
watch(() => props.isOpen, (newValue) => {
  if (newValue) {
    // Reset form when modal opens
    form.value = {
      outcome: '',
      notes: ''
    }
    error.value = null
  }
})

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
