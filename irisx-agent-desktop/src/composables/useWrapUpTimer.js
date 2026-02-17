/**
 * Wrap-Up Timer Composable
 * Manages wrap-up (ACW) time enforcement for agents
 */

import { ref, computed, onUnmounted, watch } from 'vue'

// Default wrap-up settings (would come from tenant config in production)
const DEFAULT_SETTINGS = {
  maxWrapUpSeconds: 120,      // 2 minutes max
  warningThresholdSeconds: 30, // Warning at 30 seconds remaining
  autoSubmitOnExpire: false,   // Auto-submit when time expires
  extensionAllowed: true,      // Allow requesting extension
  extensionSeconds: 60,        // 1 minute extension
  maxExtensions: 2,            // Max number of extensions
}

export function useWrapUpTimer(options = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...options }

  // State
  const isActive = ref(false)
  const startTime = ref(null)
  const elapsedSeconds = ref(0)
  const extensionsUsed = ref(0)
  const isPaused = ref(false)
  const timerInterval = ref(null)

  // Computed
  const currentMaxSeconds = computed(() => {
    return settings.maxWrapUpSeconds + (extensionsUsed.value * settings.extensionSeconds)
  })

  const remainingSeconds = computed(() => {
    return Math.max(0, currentMaxSeconds.value - elapsedSeconds.value)
  })

  const progressPercent = computed(() => {
    if (currentMaxSeconds.value === 0) return 0
    return Math.min(100, (elapsedSeconds.value / currentMaxSeconds.value) * 100)
  })

  const isWarning = computed(() => {
    return remainingSeconds.value <= settings.warningThresholdSeconds && remainingSeconds.value > 0
  })

  const isExpired = computed(() => {
    return remainingSeconds.value === 0 && isActive.value
  })

  const canExtend = computed(() => {
    return settings.extensionAllowed && extensionsUsed.value < settings.maxExtensions
  })

  const formattedElapsed = computed(() => {
    return formatTime(elapsedSeconds.value)
  })

  const formattedRemaining = computed(() => {
    return formatTime(remainingSeconds.value)
  })

  const formattedMax = computed(() => {
    return formatTime(currentMaxSeconds.value)
  })

  // Methods
  function start() {
    if (isActive.value) return

    isActive.value = true
    startTime.value = Date.now()
    elapsedSeconds.value = 0
    extensionsUsed.value = 0
    isPaused.value = false

    startTimer()
  }

  function stop() {
    isActive.value = false
    clearInterval(timerInterval.value)
    timerInterval.value = null
  }

  function pause() {
    if (!isActive.value || isPaused.value) return
    isPaused.value = true
    clearInterval(timerInterval.value)
    timerInterval.value = null
  }

  function resume() {
    if (!isActive.value || !isPaused.value) return
    isPaused.value = false
    startTimer()
  }

  function reset() {
    stop()
    elapsedSeconds.value = 0
    extensionsUsed.value = 0
    startTime.value = null
  }

  function requestExtension() {
    if (!canExtend.value) {
      return { success: false, reason: 'No extensions remaining' }
    }

    extensionsUsed.value++
    return {
      success: true,
      newMaxSeconds: currentMaxSeconds.value,
      extensionsRemaining: settings.maxExtensions - extensionsUsed.value,
    }
  }

  function startTimer() {
    if (timerInterval.value) {
      clearInterval(timerInterval.value)
    }

    timerInterval.value = setInterval(() => {
      if (!isPaused.value) {
        elapsedSeconds.value++

        // Check for expiration
        if (elapsedSeconds.value >= currentMaxSeconds.value) {
          if (settings.autoSubmitOnExpire) {
            // Emit event for auto-submit (handled by parent component)
          }
        }
      }
    }, 1000)
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get status for display
  function getStatus() {
    if (!isActive.value) return 'inactive'
    if (isPaused.value) return 'paused'
    if (isExpired.value) return 'expired'
    if (isWarning.value) return 'warning'
    return 'active'
  }

  // Cleanup on unmount
  onUnmounted(() => {
    if (timerInterval.value) {
      clearInterval(timerInterval.value)
    }
  })

  return {
    // State
    isActive,
    elapsedSeconds,
    remainingSeconds,
    extensionsUsed,
    isPaused,

    // Computed
    currentMaxSeconds,
    progressPercent,
    isWarning,
    isExpired,
    canExtend,
    formattedElapsed,
    formattedRemaining,
    formattedMax,

    // Methods
    start,
    stop,
    pause,
    resume,
    reset,
    requestExtension,
    getStatus,

    // Settings
    settings,
  }
}

export default useWrapUpTimer
