<template>
  <div class="live-transcript" :class="{ 'minimized': isMinimized }">
    <!-- Header -->
    <div class="transcript-header" @click="toggleMinimize">
      <div class="header-title">
        <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span>Live Transcript</span>
        <span v-if="connectionStatus === 'connected'" class="status-dot connected"></span>
        <span v-else-if="connectionStatus === 'connecting'" class="status-dot connecting"></span>
        <span v-else class="status-dot disconnected"></span>
      </div>
      <div class="header-actions">
        <button v-if="!isMinimized" @click.stop="clearTranscript" class="action-btn" title="Clear transcript">
          <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
        <button @click.stop="toggleMinimize" class="action-btn" :title="isMinimized ? 'Expand' : 'Minimize'">
          <svg v-if="isMinimized" class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
          </svg>
          <svg v-else class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Transcript Content -->
    <div v-if="!isMinimized" class="transcript-content" ref="transcriptContainer">
      <!-- No active call message -->
      <div v-if="!callId" class="no-call-message">
        <svg class="icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        <p>Transcript will appear when a call is active</p>
      </div>

      <!-- Transcript entries -->
      <template v-else>
        <div v-if="transcriptChunks.length === 0" class="loading-transcript">
          <div class="spinner"></div>
          <p>Waiting for speech...</p>
        </div>

        <div v-for="chunk in transcriptChunks" :key="chunk.id" class="transcript-entry"
             :class="{ 'agent': chunk.speaker === 'agent', 'caller': chunk.speaker === 'caller', 'interim': !chunk.isFinal }">
          <div class="speaker-label">
            <span class="speaker-icon">{{ chunk.speaker === 'agent' ? 'A' : 'C' }}</span>
            <span class="speaker-name">{{ chunk.speaker === 'agent' ? 'Agent' : 'Caller' }}</span>
            <span class="timestamp">{{ formatTime(chunk.startTimeMs) }}</span>
          </div>
          <div class="transcript-text">
            {{ chunk.text }}
            <span v-if="!chunk.isFinal" class="interim-indicator">...</span>
          </div>
          <div v-if="showConfidence" class="confidence-bar">
            <div class="confidence-fill" :style="{ width: (chunk.confidence * 100) + '%' }"></div>
          </div>
        </div>
      </template>
    </div>

    <!-- Footer with controls -->
    <div v-if="!isMinimized && callId" class="transcript-footer">
      <div class="footer-stats">
        <span>{{ transcriptChunks.length }} segments</span>
        <span v-if="totalDuration">| {{ formatDuration(totalDuration) }}</span>
      </div>
      <div class="footer-actions">
        <label class="checkbox-label">
          <input type="checkbox" v-model="showConfidence" />
          <span>Show confidence</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="autoScroll" />
          <span>Auto-scroll</span>
        </label>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  callId: {
    type: String,
    default: null
  },
  callSid: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['transcript-updated', 'connection-status'])

const authStore = useAuthStore()
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const WS_URL = API_URL.replace('http', 'ws')

// State
const isMinimized = ref(false)
const showConfidence = ref(false)
const autoScroll = ref(true)
const connectionStatus = ref('disconnected') // 'disconnected' | 'connecting' | 'connected'
const transcriptChunks = ref([])
const transcriptContainer = ref(null)

let ws = null
let sessionToken = null
let reconnectTimer = null
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 5

// Computed
const totalDuration = computed(() => {
  if (transcriptChunks.value.length === 0) return 0
  const lastChunk = transcriptChunks.value[transcriptChunks.value.length - 1]
  return lastChunk.endTimeMs || lastChunk.startTimeMs || 0
})

// Methods
const toggleMinimize = () => {
  isMinimized.value = !isMinimized.value
}

const clearTranscript = () => {
  transcriptChunks.value = []
}

const formatTime = (ms) => {
  if (!ms) return '0:00'
  const seconds = Math.floor(ms / 1000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const formatDuration = (ms) => {
  return formatTime(ms) + ' duration'
}

const scrollToBottom = async () => {
  if (!autoScroll.value || !transcriptContainer.value) return
  await nextTick()
  transcriptContainer.value.scrollTop = transcriptContainer.value.scrollHeight
}

// WebSocket Connection
const createStreamingSession = async () => {
  try {
    const response = await fetch(`${API_URL}/v1/streaming/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        stream_types: ['transcript', 'events'],
        client_info: {
          platform: 'agent-desktop',
          version: '1.0.0'
        }
      })
    })

    if (!response.ok) throw new Error('Failed to create streaming session')

    const data = await response.json()
    sessionToken = data.data?.sessionToken || data.sessionToken
    return sessionToken
  } catch (error) {
    console.error('Failed to create streaming session:', error)
    throw error
  }
}

const connectWebSocket = async () => {
  if (!sessionToken) {
    try {
      await createStreamingSession()
    } catch (error) {
      connectionStatus.value = 'disconnected'
      scheduleReconnect()
      return
    }
  }

  connectionStatus.value = 'connecting'

  try {
    ws = new WebSocket(`${WS_URL}/ws/streaming?token=${sessionToken}`)

    ws.onopen = () => {
      console.log('[Transcript WS] Connected')
      connectionStatus.value = 'connected'
      reconnectAttempts = 0
      emit('connection-status', 'connected')

      // Subscribe to call if we have one
      if (props.callId) {
        subscribeToCall(props.callId)
      }
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        handleWebSocketMessage(message)
      } catch (error) {
        console.error('[Transcript WS] Message parse error:', error)
      }
    }

    ws.onclose = (event) => {
      console.log('[Transcript WS] Disconnected:', event.code, event.reason)
      connectionStatus.value = 'disconnected'
      emit('connection-status', 'disconnected')
      scheduleReconnect()
    }

    ws.onerror = (error) => {
      console.error('[Transcript WS] Error:', error)
      connectionStatus.value = 'disconnected'
    }
  } catch (error) {
    console.error('[Transcript WS] Connection error:', error)
    connectionStatus.value = 'disconnected'
    scheduleReconnect()
  }
}

const handleWebSocketMessage = (message) => {
  switch (message.type) {
    case 'connected':
      console.log('[Transcript WS] Session connected:', message.sessionId)
      break

    case 'call_subscribed':
      console.log('[Transcript WS] Subscribed to call:', message.callId)
      break

    case 'event':
      if (message.eventType === 'transcript.chunk') {
        addTranscriptChunk(message.payload)
      }
      break

    case 'transcript':
      // Full transcript response
      if (message.chunks) {
        transcriptChunks.value = message.chunks.map(normalizeChunk)
        scrollToBottom()
      }
      break

    case 'pong':
    case 'server_ping':
      // Heartbeat responses
      break

    case 'error':
      console.error('[Transcript WS] Server error:', message.error)
      break

    default:
      console.log('[Transcript WS] Unknown message:', message.type)
  }
}

const normalizeChunk = (chunk) => ({
  id: chunk.chunkId || chunk.id || Math.random().toString(36),
  chunkIndex: chunk.chunkIndex || chunk.chunk_index,
  speaker: chunk.speaker,
  text: chunk.text,
  confidence: chunk.confidence || 1.0,
  startTimeMs: chunk.startTimeMs || chunk.start_time_ms || 0,
  endTimeMs: chunk.endTimeMs || chunk.end_time_ms || 0,
  isFinal: chunk.isFinal !== undefined ? chunk.isFinal : chunk.is_final !== undefined ? chunk.is_final : true
})

const addTranscriptChunk = (payload) => {
  const chunk = normalizeChunk(payload)

  // Check if this is an update to an existing interim chunk
  const existingIndex = transcriptChunks.value.findIndex(
    c => c.chunkIndex === chunk.chunkIndex && c.speaker === chunk.speaker && !c.isFinal
  )

  if (existingIndex !== -1) {
    // Update existing interim chunk
    transcriptChunks.value.splice(existingIndex, 1, chunk)
  } else {
    // Add new chunk
    transcriptChunks.value.push(chunk)
  }

  emit('transcript-updated', transcriptChunks.value)
  scrollToBottom()
}

const subscribeToCall = (callId) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[Transcript WS] Cannot subscribe - not connected')
    return
  }

  ws.send(JSON.stringify({
    type: 'subscribe_call',
    call_id: callId
  }))
}

const unsubscribeFromCall = (callId) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return

  ws.send(JSON.stringify({
    type: 'unsubscribe',
    subscription_type: 'call',
    subscription_id: callId
  }))
}

const scheduleReconnect = () => {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[Transcript WS] Max reconnect attempts reached')
    return
  }

  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
  reconnectAttempts++

  console.log(`[Transcript WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
  reconnectTimer = setTimeout(connectWebSocket, delay)
}

const disconnect = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  if (ws) {
    ws.close(1000, 'Component unmounting')
    ws = null
  }

  sessionToken = null
  connectionStatus.value = 'disconnected'
}

// Watch for call changes
watch(() => props.callId, (newCallId, oldCallId) => {
  if (oldCallId) {
    unsubscribeFromCall(oldCallId)
  }

  // Clear transcript for new call
  transcriptChunks.value = []

  if (newCallId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      subscribeToCall(newCallId)
    } else {
      connectWebSocket()
    }
  }
})

// Lifecycle
onMounted(() => {
  if (props.callId) {
    connectWebSocket()
  }
})

onUnmounted(() => {
  disconnect()
})
</script>

<style scoped>
.live-transcript {
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  min-width: 300px;
  max-height: 400px;
}

.live-transcript.minimized {
  max-height: 48px;
}

.transcript-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  cursor: pointer;
  user-select: none;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #1e293b;
}

.icon {
  width: 20px;
  height: 20px;
}

.icon-sm {
  width: 16px;
  height: 16px;
}

.icon-lg {
  width: 48px;
  height: 48px;
  color: #cbd5e1;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: 4px;
}

.status-dot.connected {
  background: #22c55e;
}

.status-dot.connecting {
  background: #eab308;
  animation: pulse 1s infinite;
}

.status-dot.disconnected {
  background: #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 4px;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: #64748b;
}

.action-btn:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.transcript-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 200px;
  max-height: 300px;
}

.no-call-message,
.loading-transcript {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 150px;
  color: #94a3b8;
  text-align: center;
  gap: 12px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.transcript-entry {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f8fafc;
}

.transcript-entry.agent {
  background: #eff6ff;
  border-left: 3px solid #3b82f6;
}

.transcript-entry.caller {
  background: #f0fdf4;
  border-left: 3px solid #22c55e;
}

.transcript-entry.interim {
  opacity: 0.7;
}

.speaker-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
}

.speaker-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: 600;
  font-size: 11px;
  color: white;
}

.agent .speaker-icon {
  background: #3b82f6;
}

.caller .speaker-icon {
  background: #22c55e;
}

.speaker-name {
  font-weight: 600;
  color: #475569;
}

.timestamp {
  color: #94a3b8;
  font-size: 11px;
}

.transcript-text {
  color: #1e293b;
  line-height: 1.5;
}

.interim-indicator {
  color: #94a3b8;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.confidence-bar {
  margin-top: 4px;
  height: 3px;
  background: #e2e8f0;
  border-radius: 2px;
  overflow: hidden;
}

.confidence-fill {
  height: 100%;
  background: #3b82f6;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.transcript-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  font-size: 12px;
  color: #64748b;
}

.footer-stats {
  display: flex;
  gap: 8px;
}

.footer-actions {
  display: flex;
  gap: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.checkbox-label input {
  cursor: pointer;
}
</style>
