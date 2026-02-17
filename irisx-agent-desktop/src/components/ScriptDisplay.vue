<template>
  <div class="script-display bg-zinc-800 rounded-lg border border-zinc-700 h-full flex flex-col">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-zinc-700 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 class="font-medium text-zinc-100">Call Script</h3>
        <span v-if="scriptName" class="text-xs text-zinc-400">- {{ scriptName }}</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="toggleMinimize"
          class="p-1 text-zinc-400 hover:text-zinc-200"
          :title="isMinimized ? 'Expand' : 'Minimize'"
        >
          <svg v-if="isMinimized" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Progress bar -->
    <div v-if="!isMinimized && scriptSteps.length > 0" class="px-4 py-2 border-b border-zinc-700">
      <div class="flex items-center justify-between text-xs text-zinc-400 mb-1">
        <span>Step {{ currentStepIndex + 1 }} of {{ scriptSteps.length }}</span>
        <span>{{ Math.round(progress) }}% complete</span>
      </div>
      <div class="w-full bg-zinc-700 rounded-full h-1.5">
        <div
          class="bg-amber-500 h-1.5 rounded-full transition-all"
          :style="{ width: `${progress}%` }"
        ></div>
      </div>
    </div>

    <!-- Content -->
    <div v-if="!isMinimized" class="flex-1 overflow-hidden flex flex-col">
      <!-- No script -->
      <div v-if="scriptSteps.length === 0" class="flex-1 flex items-center justify-center p-4">
        <div class="text-center text-zinc-500">
          <svg class="w-12 h-12 mx-auto mb-2 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>No script loaded</p>
          <p class="text-xs mt-1">A script will appear when you start a call</p>
        </div>
      </div>

      <!-- Script step content -->
      <div v-else class="flex-1 overflow-y-auto p-4">
        <!-- Current step -->
        <div
          v-if="currentStep"
          class="bg-zinc-900 rounded-lg p-4 mb-4 border-l-4 border-amber-500"
        >
          <div class="flex items-start justify-between mb-2">
            <span class="text-xs font-medium px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
              {{ currentStep.type === 'greeting' ? 'Opening' :
                 currentStep.type === 'question' ? 'Question' :
                 currentStep.type === 'objection' ? 'Objection Handling' :
                 currentStep.type === 'closing' ? 'Closing' : 'Script' }}
            </span>
            <button
              v-if="currentStep.canSkip !== false"
              @click="skipStep"
              class="text-xs text-zinc-400 hover:text-zinc-200"
            >
              Skip
            </button>
          </div>

          <!-- Script text with variables highlighted -->
          <div class="text-zinc-100 text-sm leading-relaxed whitespace-pre-wrap">
            <span v-html="renderScriptText(currentStep.text)"></span>
          </div>

          <!-- Response options (for questions) -->
          <div v-if="currentStep.responses && currentStep.responses.length > 0" class="mt-4 space-y-2">
            <p class="text-xs text-zinc-400">Customer Response:</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="(response, idx) in currentStep.responses"
                :key="idx"
                @click="handleResponse(response)"
                class="px-3 py-1.5 text-sm rounded-lg border transition-colors"
                :class="selectedResponse === response.value
                  ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                  : 'border-zinc-600 text-zinc-300 hover:border-zinc-500'"
              >
                {{ response.label }}
              </button>
            </div>
          </div>

          <!-- Free text input -->
          <div v-if="currentStep.requiresInput" class="mt-4">
            <label class="text-xs text-zinc-400 mb-1 block">{{ currentStep.inputLabel || 'Notes' }}</label>
            <textarea
              v-model="stepInput"
              rows="2"
              class="w-full bg-zinc-800 border border-zinc-600 rounded text-sm text-zinc-200 p-2 focus:border-amber-500 focus:ring-0"
              :placeholder="currentStep.inputPlaceholder || 'Enter notes...'"
            ></textarea>
          </div>
        </div>

        <!-- Navigation -->
        <div class="flex items-center justify-between pt-2">
          <button
            @click="previousStep"
            :disabled="currentStepIndex === 0"
            class="flex items-center gap-1 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>

          <button
            @click="nextStep"
            :disabled="currentStepIndex === scriptSteps.length - 1"
            class="flex items-center gap-1 px-4 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Quick actions -->
      <div v-if="scriptSteps.length > 0" class="border-t border-zinc-700 p-3">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="action in quickActions"
            :key="action.id"
            @click="handleQuickAction(action)"
            class="px-3 py-1 text-xs rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
          >
            {{ action.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Objection handling sidebar -->
    <div
      v-if="showObjections && !isMinimized"
      class="border-t border-zinc-700 p-4 max-h-48 overflow-y-auto bg-zinc-900"
    >
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-medium text-zinc-200">Objection Handlers</h4>
        <button @click="showObjections = false" class="text-zinc-400 hover:text-zinc-200">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="space-y-2">
        <button
          v-for="objection in objectionHandlers"
          :key="objection.id"
          @click="selectObjection(objection)"
          class="w-full text-left p-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm"
        >
          <span class="text-amber-400 font-medium">{{ objection.objection }}</span>
          <p class="text-zinc-400 text-xs mt-1 line-clamp-2">{{ objection.response }}</p>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps({
  callContext: {
    type: Object,
    default: null
  },
  campaignId: {
    type: String,
    default: null
  },
  queueId: {
    type: String,
    default: null
  },
  customerData: {
    type: Object,
    default: () => ({})
  },
  token: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['step-completed', 'script-completed', 'data-collected'])

// State
const isMinimized = ref(false)
const scriptName = ref('')
const scriptSteps = ref([])
const currentStepIndex = ref(0)
const selectedResponse = ref(null)
const stepInput = ref('')
const showObjections = ref(false)
const collectedData = ref({})

// Demo objection handlers
const objectionHandlers = ref([
  { id: 1, objection: 'Too expensive', response: 'I understand budget is a concern. Let me explain the value and ROI you would receive...' },
  { id: 2, objection: 'Need to think about it', response: 'Of course, important decisions deserve thought. What specific aspects would you like to consider?' },
  { id: 3, objection: 'Already have a solution', response: 'That\'s great you have something in place. Many of our customers switched because...' },
  { id: 4, objection: 'Not interested', response: 'I appreciate your time. May I ask what would make this relevant to you?' },
  { id: 5, objection: 'Call back later', response: 'I\'d be happy to. What would be the best time, and may I send you some information beforehand?' }
])

// Quick actions
const quickActions = ref([
  { id: 'objections', label: 'Show Objections' },
  { id: 'restart', label: 'Restart Script' },
  { id: 'notes', label: 'Add Note' }
])

// Computed
const currentStep = computed(() => scriptSteps.value[currentStepIndex.value] || null)

const progress = computed(() => {
  if (scriptSteps.value.length === 0) return 0
  return ((currentStepIndex.value + 1) / scriptSteps.value.length) * 100
})

// Methods
const toggleMinimize = () => {
  isMinimized.value = !isMinimized.value
}

const loadScript = async () => {
  try {
    // Try to load script based on campaign or queue
    let endpoint = '/api/v1/scripts/default'
    if (props.campaignId) {
      endpoint = `/api/v1/scripts/campaign/${props.campaignId}`
    } else if (props.queueId) {
      endpoint = `/api/v1/scripts/queue/${props.queueId}`
    }

    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${props.token}` }
    })

    if (response.ok) {
      const data = await response.json()
      scriptName.value = data.name || 'Call Script'
      scriptSteps.value = data.steps || []
      currentStepIndex.value = 0
    } else {
      // Load demo script
      loadDemoScript()
    }
  } catch (error) {
    console.error('Failed to load script:', error)
    loadDemoScript()
  }
}

const loadDemoScript = () => {
  scriptName.value = 'Sales Call Script'
  scriptSteps.value = [
    {
      id: 1,
      type: 'greeting',
      text: 'Good {{timeOfDay}}, my name is {{agentName}} calling from {{companyName}}. Am I speaking with {{customerName}}?',
      responses: [
        { label: 'Yes, speaking', value: 'confirmed', next: 2 },
        { label: 'No, not available', value: 'not_available', next: 'end' },
        { label: 'Wrong number', value: 'wrong_number', next: 'end' }
      ]
    },
    {
      id: 2,
      type: 'question',
      text: 'Great! I\'m reaching out because we noticed {{companyName}} could benefit from our services. Do you have a few minutes to discuss how we can help you {{painPoint}}?',
      responses: [
        { label: 'Yes, go ahead', value: 'interested', next: 3 },
        { label: 'Not right now', value: 'callback', next: 'schedule' },
        { label: 'Not interested', value: 'not_interested', next: 'objection' }
      ]
    },
    {
      id: 3,
      type: 'discovery',
      text: 'To better understand your needs, could you tell me about your current challenges with {{topic}}?',
      requiresInput: true,
      inputLabel: 'Customer Pain Points',
      inputPlaceholder: 'Enter what the customer mentions...'
    },
    {
      id: 4,
      type: 'pitch',
      text: 'Based on what you\'ve shared, I believe our solution can help you:\n\n• Reduce {{painPoint}} by up to 50%\n• Save approximately {{estimatedSavings}} per month\n• Improve {{keyMetric}} significantly\n\nWould you like to hear more about how this works?',
      responses: [
        { label: 'Yes, tell me more', value: 'continue', next: 5 },
        { label: 'What\'s the cost?', value: 'pricing', next: 6 },
        { label: 'Need to think about it', value: 'hesitant', next: 'objection' }
      ]
    },
    {
      id: 5,
      type: 'demo',
      text: 'I\'d like to schedule a brief 15-minute demonstration where we can show you exactly how this would work for your specific situation. What day works best for you this week?',
      requiresInput: true,
      inputLabel: 'Appointment Date/Time',
      inputPlaceholder: 'Enter scheduled date and time...'
    },
    {
      id: 6,
      type: 'closing',
      text: 'Thank you for your time today, {{customerName}}. I\'ll send you a confirmation email with the details we discussed. Is there anything else I can help you with before we wrap up?',
      canSkip: false
    }
  ]
}

const renderScriptText = (text) => {
  if (!text) return ''

  // Replace variables with highlighted spans
  const variables = {
    '{{timeOfDay}}': getTimeOfDay(),
    '{{agentName}}': 'Agent', // Would come from auth
    '{{companyName}}': 'IRISX',
    '{{customerName}}': props.customerData?.name || 'Customer',
    '{{painPoint}}': 'operational efficiency',
    '{{topic}}': 'your current processes',
    '{{estimatedSavings}}': '$500',
    '{{keyMetric}}': 'productivity'
  }

  let result = text
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(
      new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'),
      `<span class="text-amber-400 font-medium">${value}</span>`
    )
  }

  return result
}

const getTimeOfDay = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

const nextStep = () => {
  if (currentStepIndex.value < scriptSteps.value.length - 1) {
    // Emit step completed event
    emit('step-completed', {
      step: currentStep.value,
      response: selectedResponse.value,
      input: stepInput.value,
      data: { ...collectedData.value }
    })

    // Store any input data
    if (currentStep.value?.requiresInput && stepInput.value) {
      collectedData.value[currentStep.value.inputLabel || 'notes'] = stepInput.value
    }

    currentStepIndex.value++
    selectedResponse.value = null
    stepInput.value = ''
  } else {
    // Script completed
    emit('script-completed', {
      collectedData: collectedData.value
    })
  }
}

const previousStep = () => {
  if (currentStepIndex.value > 0) {
    currentStepIndex.value--
    selectedResponse.value = null
    stepInput.value = ''
  }
}

const skipStep = () => {
  nextStep()
}

const handleResponse = (response) => {
  selectedResponse.value = response.value

  // If response has a next step, we might jump to it
  if (response.next === 'end') {
    emit('script-completed', { outcome: response.value })
  } else if (response.next === 'objection') {
    showObjections.value = true
  } else if (response.next === 'schedule') {
    // Could trigger scheduling workflow
    emit('data-collected', { action: 'schedule_callback' })
  }
}

const selectObjection = (objection) => {
  // Show the objection response as current step
  scriptSteps.value.splice(currentStepIndex.value + 1, 0, {
    id: `obj_${objection.id}`,
    type: 'objection',
    text: objection.response,
    canSkip: true
  })
  showObjections.value = false
  nextStep()
}

const handleQuickAction = (action) => {
  switch (action.id) {
    case 'objections':
      showObjections.value = !showObjections.value
      break
    case 'restart':
      currentStepIndex.value = 0
      selectedResponse.value = null
      stepInput.value = ''
      collectedData.value = {}
      break
    case 'notes':
      emit('data-collected', { action: 'add_note' })
      break
  }
}

// Watch for call context changes
watch(() => props.callContext, (newContext) => {
  if (newContext) {
    loadScript()
  }
}, { immediate: true })

// Watch for campaign changes
watch(() => props.campaignId, () => {
  loadScript()
})

onMounted(() => {
  if (props.callContext || props.campaignId || props.queueId) {
    loadScript()
  }
})
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
