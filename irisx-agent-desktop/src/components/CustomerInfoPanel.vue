<template>
  <div class="bg-white rounded-lg shadow h-full flex flex-col">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-gray-900">Customer Info</h3>
      <div class="flex items-center gap-2">
        <button
          v-if="customer"
          @click="refreshCustomer"
          :disabled="loading"
          class="text-gray-400 hover:text-gray-600"
          title="Refresh"
        >
          <svg class="w-4 h-4" :class="{ 'animate-spin': loading }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <button
          v-if="customer"
          @click="openInCRM"
          class="text-gray-400 hover:text-gray-600"
          title="Open in CRM"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && !customer" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <svg class="animate-spin h-8 w-8 text-indigo-600 mx-auto" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        <p class="mt-2 text-sm text-gray-500">Looking up customer...</p>
      </div>
    </div>

    <!-- No Active Call -->
    <div v-else-if="!phoneNumber" class="flex-1 flex items-center justify-center p-4">
      <div class="text-center text-gray-500">
        <svg class="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <p class="mt-2 text-sm">No active call</p>
        <p class="text-xs text-gray-400">Customer info will appear here</p>
      </div>
    </div>

    <!-- Customer Not Found -->
    <div v-else-if="!customer && !loading" class="flex-1 p-4">
      <div class="text-center py-4">
        <svg class="w-10 h-10 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="mt-2 text-sm text-gray-600">Unknown Caller</p>
        <p class="text-xs text-gray-400 mb-3">{{ phoneNumber }}</p>
        <button
          @click="showCreateForm = true"
          class="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          + Create Contact
        </button>
      </div>

      <!-- Quick Create Form -->
      <div v-if="showCreateForm" class="mt-4 p-3 bg-gray-50 rounded-lg">
        <h4 class="text-xs font-semibold text-gray-700 mb-2">Quick Create Contact</h4>
        <div class="space-y-2">
          <input
            v-model="newContact.name"
            type="text"
            placeholder="Name"
            class="w-full text-sm border-gray-300 rounded px-2 py-1"
          />
          <input
            v-model="newContact.email"
            type="email"
            placeholder="Email"
            class="w-full text-sm border-gray-300 rounded px-2 py-1"
          />
          <input
            v-model="newContact.company"
            type="text"
            placeholder="Company"
            class="w-full text-sm border-gray-300 rounded px-2 py-1"
          />
          <div class="flex gap-2">
            <button
              @click="createContact"
              :disabled="!newContact.name"
              class="flex-1 text-xs bg-indigo-600 text-white py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              @click="showCreateForm = false"
              class="flex-1 text-xs bg-gray-200 text-gray-700 py-1 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Customer Found -->
    <div v-else class="flex-1 overflow-y-auto">
      <!-- Customer Header -->
      <div class="p-4 border-b border-gray-100">
        <div class="flex items-start gap-3">
          <!-- Avatar -->
          <div class="flex-shrink-0 h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
            <span class="text-lg font-semibold text-indigo-600">
              {{ getInitials(customer.name) }}
            </span>
          </div>
          <div class="flex-1 min-w-0">
            <h4 class="text-sm font-semibold text-gray-900 truncate">{{ customer.name }}</h4>
            <p v-if="customer.company" class="text-xs text-gray-500 truncate">{{ customer.company }}</p>
            <div class="flex items-center gap-2 mt-1">
              <span
                v-if="customer.vip"
                class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800"
              >
                VIP
              </span>
              <span
                v-if="customer.tier"
                class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                :class="tierClass"
              >
                {{ customer.tier }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Contact Details -->
      <div class="p-4 border-b border-gray-100">
        <h5 class="text-xs font-semibold text-gray-500 uppercase mb-2">Contact</h5>
        <div class="space-y-2">
          <div class="flex items-center gap-2 text-sm">
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <span>{{ customer.phone }}</span>
          </div>
          <div v-if="customer.email" class="flex items-center gap-2 text-sm">
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span class="truncate">{{ customer.email }}</span>
          </div>
          <div v-if="customer.location" class="flex items-center gap-2 text-sm">
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{{ customer.location }}</span>
          </div>
        </div>
      </div>

      <!-- Quick Stats -->
      <div class="p-4 border-b border-gray-100">
        <h5 class="text-xs font-semibold text-gray-500 uppercase mb-2">Summary</h5>
        <div class="grid grid-cols-2 gap-3">
          <div class="text-center p-2 bg-gray-50 rounded">
            <div class="text-lg font-semibold text-gray-900">{{ customer.totalCalls || 0 }}</div>
            <div class="text-xs text-gray-500">Total Calls</div>
          </div>
          <div class="text-center p-2 bg-gray-50 rounded">
            <div class="text-lg font-semibold text-gray-900">{{ customer.openTickets || 0 }}</div>
            <div class="text-xs text-gray-500">Open Tickets</div>
          </div>
          <div class="text-center p-2 bg-gray-50 rounded">
            <div class="text-lg font-semibold" :class="sentimentClass">{{ customer.sentiment || 'N/A' }}</div>
            <div class="text-xs text-gray-500">Sentiment</div>
          </div>
          <div class="text-center p-2 bg-gray-50 rounded">
            <div class="text-lg font-semibold text-gray-900">{{ formatCurrency(customer.totalSpend) }}</div>
            <div class="text-xs text-gray-500">Lifetime Value</div>
          </div>
        </div>
      </div>

      <!-- Open Tickets -->
      <div v-if="customer.tickets?.length" class="p-4 border-b border-gray-100">
        <h5 class="text-xs font-semibold text-gray-500 uppercase mb-2">Open Tickets</h5>
        <div class="space-y-2">
          <div
            v-for="ticket in customer.tickets.slice(0, 3)"
            :key="ticket.id"
            class="p-2 bg-gray-50 rounded text-sm cursor-pointer hover:bg-gray-100"
            @click="openTicket(ticket)"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium text-gray-900">#{{ ticket.id }}</span>
              <span
                class="text-xs px-1.5 py-0.5 rounded"
                :class="ticketPriorityClass(ticket.priority)"
              >
                {{ ticket.priority }}
              </span>
            </div>
            <p class="text-xs text-gray-600 truncate mt-1">{{ ticket.subject }}</p>
          </div>
        </div>
      </div>

      <!-- Recent Interactions -->
      <div class="p-4 border-b border-gray-100">
        <div class="flex items-center justify-between mb-2">
          <h5 class="text-xs font-semibold text-gray-500 uppercase">Recent Activity</h5>
          <button
            @click="showAllHistory = true"
            class="text-xs text-indigo-600 hover:text-indigo-800"
          >
            View All
          </button>
        </div>
        <div class="space-y-3">
          <div
            v-for="interaction in recentInteractions"
            :key="interaction.id"
            class="flex items-start gap-2"
          >
            <div class="flex-shrink-0 mt-0.5">
              <component :is="getInteractionIcon(interaction.type)" class="w-4 h-4 text-gray-400" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-gray-900">{{ interaction.summary }}</p>
              <p class="text-xs text-gray-400">{{ formatRelativeTime(interaction.timestamp) }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Custom Fields -->
      <div v-if="customer.customFields?.length" class="p-4 border-b border-gray-100">
        <h5 class="text-xs font-semibold text-gray-500 uppercase mb-2">Additional Info</h5>
        <div class="space-y-1">
          <div
            v-for="field in customer.customFields"
            :key="field.name"
            class="flex justify-between text-sm"
          >
            <span class="text-gray-500">{{ field.name }}</span>
            <span class="text-gray-900 font-medium">{{ field.value }}</span>
          </div>
        </div>
      </div>

      <!-- Notes Section -->
      <div class="p-4">
        <div class="flex items-center justify-between mb-2">
          <h5 class="text-xs font-semibold text-gray-500 uppercase">Call Notes</h5>
          <button
            v-if="!editingNotes"
            @click="editingNotes = true"
            class="text-xs text-indigo-600 hover:text-indigo-800"
          >
            + Add Note
          </button>
        </div>
        <div v-if="editingNotes" class="space-y-2">
          <textarea
            v-model="currentNote"
            rows="3"
            placeholder="Add notes for this call..."
            class="w-full text-sm border-gray-300 rounded resize-none"
          ></textarea>
          <div class="flex gap-2">
            <button
              @click="saveNote"
              class="flex-1 text-xs bg-indigo-600 text-white py-1 rounded hover:bg-indigo-700"
            >
              Save
            </button>
            <button
              @click="editingNotes = false; currentNote = ''"
              class="flex-1 text-xs bg-gray-200 text-gray-700 py-1 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
        <div v-else-if="customer.notes?.length" class="space-y-2">
          <div
            v-for="note in customer.notes.slice(0, 3)"
            :key="note.id"
            class="text-xs p-2 bg-yellow-50 rounded"
          >
            <p class="text-gray-700">{{ note.text }}</p>
            <p class="text-gray-400 mt-1">{{ formatRelativeTime(note.timestamp) }} - {{ note.agent }}</p>
          </div>
        </div>
        <p v-else class="text-xs text-gray-400">No notes yet</p>
      </div>
    </div>

    <!-- Full History Modal -->
    <Teleport to="body">
      <div
        v-if="showAllHistory"
        class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
        @click.self="showAllHistory = false"
      >
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b">
            <h3 class="font-semibold text-gray-900">Interaction History - {{ customer?.name }}</h3>
            <button @click="showAllHistory = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="p-4 overflow-y-auto max-h-[calc(80vh-60px)]">
            <div class="space-y-4">
              <div
                v-for="interaction in customer?.interactions || []"
                :key="interaction.id"
                class="flex gap-3 p-3 border border-gray-200 rounded-lg"
              >
                <div class="flex-shrink-0">
                  <component :is="getInteractionIcon(interaction.type)" class="w-5 h-5 text-gray-400" />
                </div>
                <div class="flex-1">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-gray-900">{{ interaction.type }}</span>
                    <span class="text-xs text-gray-500">{{ formatDateTime(interaction.timestamp) }}</span>
                  </div>
                  <p class="text-sm text-gray-600 mt-1">{{ interaction.summary }}</p>
                  <p v-if="interaction.agent" class="text-xs text-gray-400 mt-1">Agent: {{ interaction.agent }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, h } from 'vue'

const props = defineProps({
  phoneNumber: {
    type: String,
    default: null
  },
  callSid: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['customer-loaded', 'note-saved', 'contact-created'])

// State
const loading = ref(false)
const customer = ref(null)
const showCreateForm = ref(false)
const showAllHistory = ref(false)
const editingNotes = ref(false)
const currentNote = ref('')
const newContact = ref({
  name: '',
  email: '',
  company: ''
})

// Watch for phone number changes (new call)
watch(() => props.phoneNumber, async (newPhone) => {
  if (newPhone) {
    await lookupCustomer(newPhone)
  } else {
    customer.value = null
  }
}, { immediate: true })

// Computed
const recentInteractions = computed(() => {
  return (customer.value?.interactions || []).slice(0, 5)
})

const tierClass = computed(() => {
  const tier = customer.value?.tier?.toLowerCase()
  if (tier === 'gold') return 'bg-yellow-100 text-yellow-800'
  if (tier === 'silver') return 'bg-gray-100 text-gray-800'
  if (tier === 'platinum') return 'bg-purple-100 text-purple-800'
  return 'bg-blue-100 text-blue-800'
})

const sentimentClass = computed(() => {
  const sentiment = customer.value?.sentiment?.toLowerCase()
  if (sentiment === 'positive') return 'text-green-600'
  if (sentiment === 'negative') return 'text-red-600'
  return 'text-gray-600'
})

// Methods
async function lookupCustomer(phone) {
  loading.value = true
  try {
    // In production, this would be an API call
    // const response = await fetch(`/v1/contacts/lookup?phone=${encodeURIComponent(phone)}`)
    // customer.value = await response.json()

    // Demo data
    await new Promise(resolve => setTimeout(resolve, 800))

    // Simulate found/not found based on phone number
    if (phone.includes('555')) {
      customer.value = null
    } else {
      customer.value = {
        id: 'c-' + Date.now(),
        name: 'Sarah Johnson',
        company: 'Acme Corporation',
        phone: phone,
        email: 'sarah.johnson@acme.com',
        location: 'San Francisco, CA',
        vip: true,
        tier: 'Gold',
        totalCalls: 12,
        openTickets: 2,
        sentiment: 'Positive',
        totalSpend: 15420,
        crmId: 'SF-001234',
        crmSource: 'salesforce',
        tickets: [
          { id: 'T-1234', subject: 'Billing discrepancy on invoice', priority: 'high' },
          { id: 'T-1189', subject: 'Feature request for mobile app', priority: 'low' }
        ],
        interactions: [
          { id: 1, type: 'call', summary: 'Discussed account upgrade options', timestamp: Date.now() - 86400000 * 2, agent: 'Mike T.' },
          { id: 2, type: 'email', summary: 'Sent invoice for Q4 services', timestamp: Date.now() - 86400000 * 5, agent: 'System' },
          { id: 3, type: 'chat', summary: 'Helped with password reset', timestamp: Date.now() - 86400000 * 7, agent: 'Lisa M.' },
          { id: 4, type: 'call', summary: 'Resolved billing inquiry', timestamp: Date.now() - 86400000 * 14, agent: 'John D.' },
          { id: 5, type: 'ticket', summary: 'Submitted feature request', timestamp: Date.now() - 86400000 * 21, agent: 'Sarah J.' }
        ],
        customFields: [
          { name: 'Account ID', value: 'ACM-2024-001' },
          { name: 'Contract End', value: 'Dec 2026' },
          { name: 'Industry', value: 'Technology' }
        ],
        notes: [
          { id: 1, text: 'Prefers morning calls. Very responsive via email.', timestamp: Date.now() - 86400000 * 10, agent: 'Mike T.' },
          { id: 2, text: 'Interested in enterprise plan when contract renews.', timestamp: Date.now() - 86400000 * 30, agent: 'Lisa M.' }
        ]
      }
    }

    emit('customer-loaded', customer.value)
  } catch (error) {
    console.error('Failed to lookup customer:', error)
    customer.value = null
  } finally {
    loading.value = false
  }
}

async function refreshCustomer() {
  if (props.phoneNumber) {
    await lookupCustomer(props.phoneNumber)
  }
}

async function createContact() {
  try {
    // In production, this would be an API call
    const newCustomer = {
      id: 'c-' + Date.now(),
      name: newContact.value.name,
      email: newContact.value.email,
      company: newContact.value.company,
      phone: props.phoneNumber,
      totalCalls: 1,
      openTickets: 0,
      interactions: [],
      notes: []
    }

    customer.value = newCustomer
    showCreateForm.value = false
    newContact.value = { name: '', email: '', company: '' }

    emit('contact-created', newCustomer)
  } catch (error) {
    console.error('Failed to create contact:', error)
  }
}

async function saveNote() {
  if (!currentNote.value.trim()) return

  try {
    const note = {
      id: Date.now(),
      text: currentNote.value,
      timestamp: Date.now(),
      agent: 'Current Agent',
      callSid: props.callSid
    }

    if (!customer.value.notes) {
      customer.value.notes = []
    }
    customer.value.notes.unshift(note)

    emit('note-saved', note)
    currentNote.value = ''
    editingNotes.value = false
  } catch (error) {
    console.error('Failed to save note:', error)
  }
}

function openInCRM() {
  if (customer.value?.crmId) {
    // In production, would open CRM URL
    const crmUrls = {
      salesforce: `https://login.salesforce.com/${customer.value.crmId}`,
      hubspot: `https://app.hubspot.com/contacts/${customer.value.crmId}`,
      zendesk: `https://support.zendesk.com/agent/users/${customer.value.crmId}`
    }
    window.open(crmUrls[customer.value.crmSource] || '#', '_blank')
  }
}

function openTicket(ticket) {
  console.log('Opening ticket:', ticket.id)
  // In production, would open ticket in new tab or modal
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatCurrency(amount) {
  if (!amount) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0
  }).format(amount)
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString()
}

function ticketPriorityClass(priority) {
  if (priority === 'high') return 'bg-red-100 text-red-800'
  if (priority === 'medium') return 'bg-yellow-100 text-yellow-800'
  return 'bg-gray-100 text-gray-800'
}

// Interaction icons
const PhoneIcon = {
  render: () => h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' })
  ])
}

const EmailIcon = {
  render: () => h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' })
  ])
}

const ChatIcon = {
  render: () => h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' })
  ])
}

const TicketIcon = {
  render: () => h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z' })
  ])
}

function getInteractionIcon(type) {
  const icons = {
    call: PhoneIcon,
    email: EmailIcon,
    chat: ChatIcon,
    ticket: TicketIcon
  }
  return icons[type] || PhoneIcon
}
</script>
