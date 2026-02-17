<template>
  <div class="relative inline-block text-left">
    <div>
      <button
        type="button"
        @click="isOpen = !isOpen"
        class="inline-flex items-center justify-between w-52 rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        <span class="flex items-center">
          <span
            class="h-3 w-3 rounded-full mr-2"
            :class="statusColors[currentStatus]"
          ></span>
          <span class="truncate">
            {{ currentBreakReason || statusLabels[currentStatus] }}
          </span>
        </span>
        <svg class="h-5 w-5 text-gray-400 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>

    <!-- Dropdown menu -->
    <transition
      enter-active-class="transition ease-out duration-100"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-75"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div
        v-if="isOpen && !showBreakReasons"
        class="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
      >
        <div class="py-1">
          <button
            v-for="status in statuses"
            :key="status"
            @click="selectStatus(status)"
            class="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            :class="{ 'bg-gray-50': currentStatus === status && !currentBreakReason }"
          >
            <span
              class="h-3 w-3 rounded-full mr-3"
              :class="statusColors[status]"
            ></span>
            {{ statusLabels[status] }}
            <span v-if="status === 'break'" class="ml-auto text-gray-400">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </button>
        </div>
      </div>

      <!-- Break Reasons Submenu -->
      <div
        v-if="isOpen && showBreakReasons"
        class="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
      >
        <div class="py-1">
          <button
            @click="showBreakReasons = false"
            class="flex items-center w-full px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 border-b"
          >
            <svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <button
            v-for="reason in breakReasons"
            :key="reason.id"
            @click="selectBreakReason(reason)"
            class="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            :class="{ 'bg-yellow-50': currentBreakReason === reason.label }"
          >
            <span class="mr-3">{{ reason.icon }}</span>
            <span>{{ reason.label }}</span>
            <span v-if="reason.maxDuration" class="ml-auto text-xs text-gray-400">
              {{ reason.maxDuration }}m max
            </span>
          </button>
        </div>
      </div>
    </transition>

    <!-- Break Timer -->
    <div v-if="currentStatus === 'break' && breakStartTime" class="absolute top-full left-0 right-0 mt-1 text-center">
      <span :class="['text-xs font-medium', breakTimeExceeded ? 'text-red-600 animate-pulse' : 'text-yellow-600']">
        {{ formatBreakTime(breakElapsed) }}
        <span v-if="currentMaxDuration"> / {{ currentMaxDuration }}m</span>
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted, watch } from 'vue'

// Props
const props = defineProps({
  modelValue: {
    type: String,
    default: 'offline'
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'status-changed', 'break-started', 'break-ended'])

// State
const isOpen = ref(false)
const showBreakReasons = ref(false)
const currentStatus = ref(props.modelValue)
const currentBreakReason = ref('')
const currentMaxDuration = ref(null)
const breakStartTime = ref(null)
const breakElapsed = ref(0)
let breakTimer = null

// Available statuses
const statuses = ['available', 'busy', 'break', 'away', 'offline']

// Status labels
const statusLabels = {
  available: 'Available',
  busy: 'Busy',
  break: 'On Break',
  away: 'Away',
  offline: 'Offline'
}

// Status color classes (Tailwind)
const statusColors = {
  available: 'bg-green-500',
  busy: 'bg-red-500',
  break: 'bg-yellow-500',
  away: 'bg-orange-500',
  offline: 'bg-gray-400'
}

// Break reasons with optional max durations
const breakReasons = [
  { id: 'lunch', label: 'Lunch', icon: '🍽️', maxDuration: 60 },
  { id: 'short_break', label: 'Short Break', icon: '☕', maxDuration: 15 },
  { id: 'restroom', label: 'Restroom', icon: '🚻', maxDuration: 10 },
  { id: 'meeting', label: 'Meeting', icon: '📅', maxDuration: null },
  { id: 'training', label: 'Training', icon: '📚', maxDuration: null },
  { id: 'coaching', label: 'Coaching', icon: '🎯', maxDuration: null },
  { id: 'personal', label: 'Personal', icon: '👤', maxDuration: 15 },
  { id: 'technical', label: 'Technical Issue', icon: '🔧', maxDuration: null },
]

// Computed
const breakTimeExceeded = computed(() => {
  if (!currentMaxDuration.value) return false
  return breakElapsed.value >= currentMaxDuration.value * 60
})

// Methods
function selectStatus(status) {
  if (status === 'break') {
    showBreakReasons.value = true
    return
  }

  // End any active break
  if (currentStatus.value === 'break') {
    endBreak()
  }

  currentStatus.value = status
  currentBreakReason.value = ''
  currentMaxDuration.value = null
  isOpen.value = false
  emit('update:modelValue', status)
  emit('status-changed', status)
}

function selectBreakReason(reason) {
  currentStatus.value = 'break'
  currentBreakReason.value = reason.label
  currentMaxDuration.value = reason.maxDuration
  showBreakReasons.value = false
  isOpen.value = false

  // Start break timer
  startBreak(reason)

  emit('update:modelValue', 'break')
  emit('status-changed', 'break')
  emit('break-started', { reason: reason.id, label: reason.label, maxDuration: reason.maxDuration })
}

function startBreak(reason) {
  breakStartTime.value = Date.now()
  breakElapsed.value = 0

  // Update timer every second
  breakTimer = setInterval(() => {
    breakElapsed.value = Math.floor((Date.now() - breakStartTime.value) / 1000)
  }, 1000)
}

function endBreak() {
  if (breakTimer) {
    clearInterval(breakTimer)
    breakTimer = null
  }
  const duration = breakElapsed.value
  breakStartTime.value = null
  breakElapsed.value = 0

  emit('break-ended', {
    reason: currentBreakReason.value,
    duration,
    exceeded: breakTimeExceeded.value
  })
}

function formatBreakTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Watch for external status changes
watch(() => props.modelValue, (newVal) => {
  if (newVal !== currentStatus.value) {
    if (currentStatus.value === 'break') {
      endBreak()
    }
    currentStatus.value = newVal
  }
})

// Cleanup on unmount
onUnmounted(() => {
  if (breakTimer) {
    clearInterval(breakTimer)
  }
})

// Close dropdown when clicking outside
if (typeof window !== 'undefined') {
  window.addEventListener('click', (e) => {
    if (!e.target.closest('.relative')) {
      isOpen.value = false
      showBreakReasons.value = false
    }
  })
}
</script>
