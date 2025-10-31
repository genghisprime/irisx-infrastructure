<template>
  <!-- Incoming Call Modal (Full Screen Overlay) -->
  <div v-if="incomingCall" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
    <div class="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
      <!-- Ringing Animation Icon -->
      <div class="mb-6">
        <div class="inline-flex items-center justify-center w-24 h-24 bg-green-100 rounded-full animate-pulse">
          <svg fill="currentColor" viewBox="0 0 20 20" class="text-green-600" style="width: 48px !important; height: 48px !important;">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
          </svg>
        </div>
      </div>

      <!-- Caller Info -->
      <h2 class="text-2xl font-bold text-gray-900 mb-2">Incoming Call</h2>
      <p class="text-lg text-gray-600 mb-1">{{ incomingCall.displayName || 'Unknown Caller' }}</p>
      <p class="text-xl font-mono text-gray-800 mb-8">{{ incomingCall.from }}</p>

      <!-- Accept/Reject Buttons -->
      <div class="flex gap-4 justify-center">
        <!-- Reject Button -->
        <button
          @click="handleRejectCall"
          class="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
        >
          <svg fill="currentColor" viewBox="0 0 20 20" style="width: 24px !important; height: 24px !important;">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
          </svg>
          <span>Decline</span>
        </button>

        <!-- Accept Button -->
        <button
          @click="handleAcceptCall"
          class="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
        >
          <svg fill="currentColor" viewBox="0 0 20 20" style="width: 24px !important; height: 24px !important;">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
          </svg>
          <span>Accept</span>
        </button>
      </div>
    </div>
  </div>

  <div class="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-auto">
    <!-- Connection Status Banner -->
    <div v-if="!isRegistered && !isConnecting" class="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-gray-600">⚪ Offline</span>
        <button @click="connectWebRTC" class="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 transition-colors">
          Connect
        </button>
      </div>
    </div>
    <div v-else-if="isConnecting" class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
      <span class="text-sm font-medium text-yellow-700">⚠️ Connecting...</span>
    </div>
    <div v-else-if="isRegistered" class="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-green-700">✅ Connected</span>
        <span class="text-xs text-green-600">Ext {{ sipUsername }}</span>
      </div>
    </div>

    <!-- Display Screen -->
    <div class="bg-gradient-to-br from-gray-800 to-gray-900 text-white rounded-xl p-5 mb-4 shadow-inner">
      <div class="text-right">
        <!-- Phone Number Display -->
        <div class="text-3xl font-light tracking-wider h-12 flex items-center justify-end font-mono">
          {{ displayNumber || 'Enter number' }}
        </div>
        <!-- Call Status & Timer -->
        <div class="text-sm mt-3 h-6 flex items-center justify-end">
          <span v-if="callStatus === 'idle'" class="text-gray-400">Ready to dial</span>
          <span v-else-if="callStatus === 'dialing'" class="text-blue-400 flex items-center">
            <svg class="animate-spin -ml-1 mr-2" style="width: 14px !important; height: 14px !important; min-width: 14px !important; min-height: 14px !important; max-width: 14px !important; max-height: 14px !important;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Dialing...
          </span>
          <span v-else-if="callStatus === 'ringing'" class="text-blue-400">Ringing...</span>
          <span v-else-if="callStatus === 'connected'" class="text-green-400 font-medium">
            ● {{ formatTime(callDuration) }}
          </span>
          <span v-else-if="callStatus === 'onhold'" class="text-yellow-400">
            ⏸ On Hold - {{ formatTime(callDuration) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Dial Pad -->
    <div class="grid grid-cols-3 gap-2 mb-4">
      <button
        v-for="key in dialPadKeys"
        :key="key.value"
        @click="handleKeyPress(key.value)"
        :disabled="callStatus === 'connected' || callStatus === 'onhold'"
        class="bg-white hover:bg-gray-50 active:bg-gray-100 disabled:bg-gray-50 disabled:text-gray-300 border border-gray-200 rounded-lg py-3 text-center transition-all hover:shadow-md disabled:cursor-not-allowed"
      >
        <div class="text-xl font-semibold text-gray-800">{{ key.value }}</div>
        <div v-if="key.letters" class="text-xs text-gray-500 font-medium tracking-wide">{{ key.letters }}</div>
      </button>
    </div>

    <!-- Call Control Buttons -->
    <div class="space-y-2">
      <!-- Call/Hangup Button -->
      <button
        v-if="callStatus === 'idle'"
        @click="handleCall"
        :disabled="!displayNumber"
        class="w-full bg-green-500 hover:bg-green-600 active:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-lg hover:shadow-xl disabled:shadow-none flex items-center justify-center gap-2"
      >
        <svg fill="currentColor" viewBox="0 0 20 20" style="width: 18px !important; height: 18px !important; min-width: 18px !important; min-height: 18px !important; max-width: 18px !important; max-height: 18px !important;">
          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
        </svg>
        <span>Call</span>
      </button>

      <button
        v-else
        @click="handleHangup"
        class="w-full bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
      >
        <svg fill="currentColor" viewBox="0 0 20 20" style="width: 18px !important; height: 18px !important; min-width: 18px !important; min-height: 18px !important; max-width: 18px !important; max-height: 18px !important;">
          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
        </svg>
        <span>Hang Up</span>
      </button>

      <!-- Additional Controls (Mute, Hold, Transfer) -->
      <div v-if="callStatus === 'connected' || callStatus === 'onhold'" class="grid grid-cols-3 gap-2 pt-1">
        <!-- Mute Button -->
        <button
          @click="handleMute"
          :class="isMuted ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'"
          class="py-3 rounded-lg transition-all shadow-sm hover:shadow-md flex flex-col items-center justify-center gap-1"
        >
          <svg :class="isMuted ? 'text-white' : 'text-gray-700'" fill="currentColor" viewBox="0 0 20 20" style="width: 16px !important; height: 16px !important; min-width: 16px !important; min-height: 16px !important; max-width: 16px !important; max-height: 16px !important;">
            <path fill-rule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clip-rule="evenodd" />
          </svg>
          <span class="text-xs font-medium">
            {{ isMuted ? 'Unmute' : 'Mute' }}
          </span>
        </button>

        <!-- Hold Button -->
        <button
          @click="handleHold"
          :class="callStatus === 'onhold' ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'"
          class="py-3 rounded-lg transition-all shadow-sm hover:shadow-md flex flex-col items-center justify-center gap-1"
        >
          <svg :class="callStatus === 'onhold' ? 'text-white' : 'text-gray-700'" fill="currentColor" viewBox="0 0 20 20" style="width: 16px !important; height: 16px !important; min-width: 16px !important; min-height: 16px !important; max-width: 16px !important; max-height: 16px !important;">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          <span class="text-xs font-medium">
            {{ callStatus === 'onhold' ? 'Resume' : 'Hold' }}
          </span>
        </button>

        <!-- Transfer Button -->
        <button
          @click="handleTransfer"
          class="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 py-3 rounded-lg transition-all shadow-sm hover:shadow-md flex flex-col items-center justify-center gap-1"
        >
          <svg fill="currentColor" viewBox="0 0 20 20" style="width: 16px !important; height: 16px !important; min-width: 16px !important; min-height: 16px !important; max-width: 16px !important; max-height: 16px !important;">
            <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
          </svg>
          <span class="text-xs font-medium">Transfer</span>
        </button>
      </div>

      <!-- Clear/Backspace Buttons (when idle and has number) -->
      <div v-if="callStatus === 'idle' && displayNumber" class="grid grid-cols-2 gap-2">
        <button
          @click="handleBackspace"
          class="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-medium py-2 rounded-lg transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
        >
          <svg fill="currentColor" viewBox="0 0 20 20" style="width: 16px !important; height: 16px !important; min-width: 16px !important; min-height: 16px !important; max-width: 16px !important; max-height: 16px !important;">
            <path fill-rule="evenodd" d="M6.707 4.879A3 3 0 018.828 4H15a3 3 0 013 3v6a3 3 0 01-3 3H8.828a3 3 0 01-2.121-.879l-4.415-4.414a1 1 0 010-1.414l4.415-4.414zm4 2.414a1 1 0 00-1.414 1.414L10.586 10l-1.293 1.293a1 1 0 101.414 1.414L12 11.414l1.293 1.293a1 1 0 001.414-1.414L13.414 10l1.293-1.293a1 1 0 00-1.414-1.414L12 8.586l-1.293-1.293z" clip-rule="evenodd" />
          </svg>
          <span class="text-sm">Delete</span>
        </button>
        <button
          @click="handleClear"
          class="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-medium py-2 rounded-lg transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
        >
          <svg fill="currentColor" viewBox="0 0 20 20" style="width: 16px !important; height: 16px !important; min-width: 16px !important; min-height: 16px !important; max-width: 16px !important; max-height: 16px !important;">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
          <span class="text-sm">Clear</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import WebRTCService from '../services/webrtc'
import { SessionState } from 'sip.js'

// Create a new WebRTC instance for this component
const webrtc = new WebRTCService()

// SIP Configuration
const sipUsername = ref('1000')
const sipPassword = ref('IrisX2025Secure!')
const sipServer = ref('54.160.220.243')

// State
const displayNumber = ref('')
const callStatus = ref('idle') // idle, dialing, ringing, connected, onhold
const callDuration = ref(0)
const isMuted = ref(false)
const isRegistered = ref(false)
const isConnecting = ref(false)
const incomingCall = ref(null) // Stores incoming call data
let callTimer = null

// Dial pad configuration
const dialPadKeys = [
  { value: '1', letters: '' },
  { value: '2', letters: 'ABC' },
  { value: '3', letters: 'DEF' },
  { value: '4', letters: 'GHI' },
  { value: '5', letters: 'JKL' },
  { value: '6', letters: 'MNO' },
  { value: '7', letters: 'PQRS' },
  { value: '8', letters: 'TUV' },
  { value: '9', letters: 'WXYZ' },
  { value: '*', letters: '' },
  { value: '0', letters: '+' },
  { value: '#', letters: '' }
]

// Emits
const emit = defineEmits(['call-started', 'call-ended', 'call-muted', 'call-held', 'call-transferred'])

// Methods
function handleKeyPress(key) {
  if (displayNumber.value.length < 20) {
    displayNumber.value += key
  }
}

function handleBackspace() {
  displayNumber.value = displayNumber.value.slice(0, -1)
}

function handleClear() {
  displayNumber.value = ''
}

async function connectWebRTC() {
  isConnecting.value = true

  try {
    // Disconnect any existing connection first
    if (webrtc.userAgent) {
      await webrtc.disconnect().catch(e => console.log('Disconnect ignored:', e))
    }

    const result = await webrtc.connect({
      sipUsername: sipUsername.value,
      sipPassword: sipPassword.value,
      sipServer: sipServer.value,
      displayName: `Agent ${sipUsername.value}`
    })

    if (!result.success) {
      console.error('Failed to connect:', result.error)
      alert('Connection failed: ' + result.error)
      isConnecting.value = false
    }
  } catch (error) {
    console.error('Connection error:', error)
    alert('Connection error: ' + error.message)
    isConnecting.value = false
  }
}

async function handleCall() {
  if (!displayNumber.value) return

  console.log('📞 Initiating call to', displayNumber.value)
  console.log('📞 displayNumber type:', typeof displayNumber.value)
  console.log('📞 displayNumber length:', displayNumber.value.length)
  console.log('📞 displayNumber chars:', displayNumber.value.split('').join(','))

  callStatus.value = 'dialing'

  try {
    const result = await webrtc.makeCall(displayNumber.value)
    if (!result.success) {
      console.error('Call failed:', result.error)
      callStatus.value = 'idle'
      alert(`Call failed: ${result.error}`)
    }
  } catch (error) {
    console.error('Call error:', error)
    callStatus.value = 'idle'
    alert(`Call error: ${error.message}`)
  }
}

async function handleHangup() {
  console.log('📞 Ending call')

  try {
    await webrtc.hangup()
    callStatus.value = 'idle'
    stopCallTimer()
    emit('call-ended', {
      number: displayNumber.value,
      duration: callDuration.value
    })
    displayNumber.value = ''
    callDuration.value = 0
    isMuted.value = false
  } catch (error) {
    console.error('Hangup error:', error)
  }
}

async function handleMute() {
  try {
    const result = await webrtc.toggleMute()
    if (result.success) {
      isMuted.value = result.muted
      emit('call-muted', { muted: result.muted })
    }
  } catch (error) {
    console.error('Mute error:', error)
  }
}

async function handleHold() {
  try {
    const result = await webrtc.toggleHold()
    if (result.success) {
      callStatus.value = result.onHold ? 'onhold' : 'connected'
      emit('call-held', { onHold: result.onHold })
    }
  } catch (error) {
    console.error('Hold error:', error)
  }
}

async function handleTransfer() {
  const transferTarget = prompt('Enter extension or number to transfer to:')
  if (transferTarget) {
    try {
      const result = await webrtc.transfer(transferTarget)
      if (result.success) {
        emit('call-transferred')
        callStatus.value = 'idle'
        displayNumber.value = ''
      }
    } catch (error) {
      console.error('Transfer error:', error)
      alert('Transfer failed: ' + error.message)
    }
  }
}

function startCallTimer() {
  callTimer = setInterval(() => {
    callDuration.value++
  }, 1000)
}

function stopCallTimer() {
  if (callTimer) {
    clearInterval(callTimer)
    callTimer = null
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// Initialize WebRTC event handlers on mount (NO auto-connection)
onMounted(() => {
  console.log('🔌 Component mounted, WebRTC ready')

  try {
    webrtc.onRegistered = () => {
      try {
        console.log('✅ Registered with SIP server')
        isRegistered.value = true
        isConnecting.value = false
      } catch (err) {
        console.error('Error in onRegistered:', err)
      }
    }

    webrtc.onUnregistered = () => {
      try {
        console.log('⚠️ Unregistered from SIP server')
        isRegistered.value = false
      } catch (err) {
        console.error('Error in onUnregistered:', err)
      }
    }

    webrtc.onIncomingCall = (callData) => {
      try {
        console.log('📞 Incoming call from:', callData.from)
        incomingCall.value = callData
        callStatus.value = 'ringing'
      } catch (err) {
        console.error('Error in onIncomingCall:', err)
      }
    }

    webrtc.onCallStateChange = (newState) => {
      try {
        console.log('Call state changed:', newState)

        if (newState === SessionState.Establishing) {
          callStatus.value = 'dialing'
        } else if (newState === SessionState.Established) {
          callStatus.value = 'connected'
          incomingCall.value = null // Clear incoming call modal
          startCallTimer()
          emit('call-started', { number: displayNumber.value || incomingCall.value?.from })
        } else if (newState === SessionState.Terminated) {
          callStatus.value = 'idle'
          incomingCall.value = null // Clear incoming call modal
          stopCallTimer()
          emit('call-ended', {
            number: displayNumber.value,
            duration: callDuration.value
          })
          displayNumber.value = ''
          callDuration.value = 0
          isMuted.value = false
        }
      } catch (err) {
        console.error('Error in onCallStateChange:', err)
      }
    }
  } catch (err) {
    console.error('Error setting up WebRTC handlers:', err)
  }
})

// Accept incoming call
async function handleAcceptCall() {
  try {
    await webrtc.answerCall()
    displayNumber.value = incomingCall.value?.from || ''
  } catch (error) {
    console.error('Accept call error:', error)
    alert('Failed to answer call: ' + error.message)
  }
}

// Reject incoming call
async function handleRejectCall() {
  try {
    await webrtc.hangup()
    incomingCall.value = null
    callStatus.value = 'idle'
  } catch (error) {
    console.error('Reject call error:', error)
  }
}

// Cleanup on unmount
onUnmounted(() => {
  console.log('🔌 Component unmounting, cleaning up')
  stopCallTimer()

  // Disconnect WebRTC (non-blocking, catch all errors)
  if (webrtc && webrtc.disconnect) {
    webrtc.disconnect().catch(err => {
      console.log('Disconnect error (ignored):', err)
    })
  }
})
</script>
