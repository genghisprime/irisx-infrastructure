<template>
  <div class="bg-white rounded-lg shadow-lg p-6 max-w-sm mx-auto">
    <!-- Connection Status Banner with Manual Connect -->
    <div v-if="!isRegistered && !isConnecting" class="bg-gray-100 border-l-4 border-gray-500 text-gray-700 p-3 mb-4">
      <p class="text-sm font-semibold">⚪ OFFLINE</p>
      <button @click="connectWebRTC" class="mt-2 px-4 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600">
        Connect
      </button>
    </div>
    <div v-else-if="isConnecting" class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-3 mb-4">
      <p class="text-sm font-semibold">⚠️ CONNECTING...</p>
      <p class="text-xs">Please wait...</p>
    </div>
    <div v-else-if="isRegistered" class="bg-green-100 border-l-4 border-green-500 text-green-700 p-3 mb-4">
      <p class="text-sm font-semibold">✅ CONNECTED</p>
      <p class="text-xs">Extension {{ sipUsername }} ready</p>
    </div>

    <!-- Display Screen -->
    <div class="bg-gray-900 text-white rounded-lg p-4 mb-4">
      <div class="text-right">
        <!-- Phone Number Display -->
        <div class="text-2xl font-mono h-10 flex items-center justify-end">
          {{ displayNumber || '&nbsp;' }}
        </div>
        <!-- Call Status & Timer -->
        <div class="text-sm text-gray-400 mt-2 h-6">
          <span v-if="callStatus === 'idle'">Ready</span>
          <span v-else-if="callStatus === 'dialing'">Dialing...</span>
          <span v-else-if="callStatus === 'ringing'">Ringing...</span>
          <span v-else-if="callStatus === 'connected'" class="text-green-400">
            Connected - {{ formatTime(callDuration) }}
          </span>
          <span v-else-if="callStatus === 'onhold'" class="text-yellow-400">
            On Hold - {{ formatTime(callDuration) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Dial Pad -->
    <div class="grid grid-cols-3 gap-3 mb-4">
      <button
        v-for="key in dialPadKeys"
        :key="key.value"
        @click="handleKeyPress(key.value)"
        :disabled="callStatus === 'connected' || callStatus === 'onhold'"
        class="bg-gray-100 hover:bg-gray-200 active:bg-gray-300 disabled:bg-gray-50 disabled:text-gray-400 rounded-lg py-4 text-center font-semibold text-lg transition-colors"
      >
        <div>{{ key.value }}</div>
        <div v-if="key.letters" class="text-xs text-gray-500">{{ key.letters }}</div>
      </button>
    </div>

    <!-- Call Control Buttons -->
    <div class="space-y-3">
      <!-- Call/Hangup Button -->
      <button
        v-if="callStatus === 'idle'"
        @click="handleCall"
        :disabled="!displayNumber"
        class="w-full bg-green-500 hover:bg-green-600 active:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center"
      >
        <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
        </svg>
        Call
      </button>

      <button
        v-else
        @click="handleHangup"
        class="w-full bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center"
      >
        <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
        </svg>
        Hang Up
      </button>

      <!-- Additional Controls (Mute, Hold, Transfer) -->
      <div v-if="callStatus === 'connected' || callStatus === 'onhold'" class="grid grid-cols-3 gap-2">
        <!-- Mute Button -->
        <button
          @click="handleMute"
          :class="isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-200 hover:bg-gray-300'"
          class="py-2 rounded-lg transition-colors flex flex-col items-center justify-center"
        >
          <svg class="w-5 h-5" :class="isMuted ? 'text-white' : 'text-gray-700'" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clip-rule="evenodd" />
          </svg>
          <span class="text-xs mt-1" :class="isMuted ? 'text-white' : 'text-gray-700'">
            {{ isMuted ? 'Unmute' : 'Mute' }}
          </span>
        </button>

        <!-- Hold Button -->
        <button
          @click="handleHold"
          :class="callStatus === 'onhold' ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-gray-200 hover:bg-gray-300'"
          class="py-2 rounded-lg transition-colors flex flex-col items-center justify-center"
        >
          <svg class="w-5 h-5" :class="callStatus === 'onhold' ? 'text-white' : 'text-gray-700'" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          <span class="text-xs mt-1" :class="callStatus === 'onhold' ? 'text-white' : 'text-gray-700'">
            {{ callStatus === 'onhold' ? 'Resume' : 'Hold' }}
          </span>
        </button>

        <!-- Transfer Button -->
        <button
          @click="handleTransfer"
          class="bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 rounded-lg transition-colors flex flex-col items-center justify-center"
        >
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
          </svg>
          <span class="text-xs mt-1">Transfer</span>
        </button>
      </div>

      <!-- Backspace Button (when idle) -->
      <button
        v-if="callStatus === 'idle' && displayNumber"
        @click="handleBackspace"
        class="w-full bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-700 font-semibold py-2 rounded-lg transition-colors flex items-center justify-center"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M6.707 4.879A3 3 0 018.828 4H15a3 3 0 013 3v6a3 3 0 01-3 3H8.828a3 3 0 01-2.121-.879l-4.415-4.414a1 1 0 010-1.414l4.415-4.414zm4 2.414a1 1 0 00-1.414 1.414L10.586 10l-1.293 1.293a1 1 0 101.414 1.414L12 11.414l1.293 1.293a1 1 0 001.414-1.414L13.414 10l1.293-1.293a1 1 0 00-1.414-1.414L12 8.586l-1.293-1.293z" clip-rule="evenodd" />
        </svg>
      </button>
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

    webrtc.onCallStateChange = (newState) => {
      try {
        console.log('Call state changed:', newState)

        if (newState === SessionState.Establishing) {
          callStatus.value = 'dialing'
        } else if (newState === SessionState.Established) {
          callStatus.value = 'connected'
          startCallTimer()
          emit('call-started', { number: displayNumber.value })
        } else if (newState === SessionState.Terminated) {
          callStatus.value = 'idle'
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
