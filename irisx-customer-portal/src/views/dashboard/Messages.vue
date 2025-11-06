<template>
  <div class="py-6">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-semibold text-gray-900">SMS & MMS Messages</h1>
        <button
          @click="showSendModal = true"
          class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Send Message
        </button>
      </div>

      <!-- Filters -->
      <div class="bg-white shadow rounded-lg p-4 mb-6">
        <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Direction</label>
            <select
              v-model="filters.direction"
              @change="fetchMessages"
              class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              v-model="filters.status"
              @change="fetchMessages"
              class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All Status</option>
              <option value="delivered">Delivered</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="queued">Queued</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <input
              v-model="filters.dateFrom"
              type="date"
              @change="fetchMessages"
              class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <input
              v-model="filters.dateTo"
              type="date"
              @change="fetchMessages"
              class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              v-model="filters.search"
              type="text"
              placeholder="Phone number..."
              @input="debouncedSearch"
              class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      <!-- Messages Table -->
      <div class="bg-white shadow rounded-lg overflow-hidden">
        <div v-if="isLoading" class="p-8 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p class="mt-2 text-gray-600">Loading messages...</p>
        </div>

        <div v-else-if="messages.length === 0" class="p-8 text-center text-gray-500">
          <svg style="width: 48px; height: 48px; min-width: 48px; min-height: 48px; max-width: 48px; max-height: 48px;" class="mx-auto  text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p class="mt-2">No messages found</p>
        </div>

        <table v-else class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date & Time
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Direction
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                From
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                To
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Message Preview
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="message in messages" :key="message.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ formatDateTime(message.created_at) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span
                  :class="{
                    'bg-blue-100 text-blue-800': message.direction === 'inbound',
                    'bg-purple-100 text-purple-800': message.direction === 'outbound'
                  }"
                  class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                >
                  {{ message.direction }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ message.from_number }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ message.to_number }}
              </td>
              <td class="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                {{ message.body }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span
                  :class="getStatusClass(message.status)"
                  class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                >
                  {{ message.status }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button
                  @click="viewMessageDetails(message)"
                  class="text-indigo-600 hover:text-indigo-900"
                >
                  Details
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="messages.length > 0" class="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 mt-4 rounded-lg shadow">
        <div class="flex-1 flex justify-between sm:hidden">
          <button
            @click="previousPage"
            :disabled="currentPage === 1"
            class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            @click="nextPage"
            :disabled="!hasNextPage"
            class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
        <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div>
            <p class="text-sm text-gray-700">
              Showing page <span class="font-medium">{{ currentPage }}</span> of <span class="font-medium">{{ totalPages }}</span>
            </p>
          </div>
          <div>
            <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
              <button
                @click="previousPage"
                :disabled="currentPage === 1"
                class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                @click="nextPage"
                :disabled="!hasNextPage"
                class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>

    <!-- Message Details Modal -->
    <div
      v-if="selectedMessage"
      class="fixed z-10 inset-0 overflow-y-auto"
      @click.self="selectedMessage = null"
    >
      <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>

        <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div class="flex justify-between items-start mb-4">
              <h3 class="text-lg leading-6 font-medium text-gray-900">Message Details</h3>
              <button @click="selectedMessage = null" class="text-gray-400 hover:text-gray-500">
                <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class="" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <dl class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">Message SID</dt>
                <dd class="mt-1 text-sm text-gray-900 font-mono">{{ selectedMessage.id }}</dd>
              </div>

              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">Direction</dt>
                <dd class="mt-1">
                  <span
                    :class="{
                      'bg-blue-100 text-blue-800': selectedMessage.direction === 'inbound',
                      'bg-purple-100 text-purple-800': selectedMessage.direction === 'outbound'
                    }"
                    class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                  >
                    {{ selectedMessage.direction }}
                  </span>
                </dd>
              </div>

              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">From Number</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ selectedMessage.from_number }}</dd>
              </div>

              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">To Number</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ selectedMessage.to_number }}</dd>
              </div>

              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">Status</dt>
                <dd class="mt-1">
                  <span :class="getStatusClass(selectedMessage.status)" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                    {{ selectedMessage.status }}
                  </span>
                </dd>
              </div>

              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">Created At</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ formatDateTime(selectedMessage.created_at) }}</dd>
              </div>

              <div class="sm:col-span-2">
                <dt class="text-sm font-medium text-gray-500">Message Body</dt>
                <dd class="mt-1 text-sm text-gray-900 bg-gray-50 p-3 rounded">{{ selectedMessage.body }}</dd>
              </div>

              <div v-if="selectedMessage.media_url" class="sm:col-span-2">
                <dt class="text-sm font-medium text-gray-500 mb-2">Media Attachment</dt>
                <dd class="mt-1">
                  <img :src="selectedMessage.media_url" alt="MMS attachment" class="max-w-full h-auto rounded" />
                </dd>
              </div>

              <div v-if="selectedMessage.error_message" class="sm:col-span-2">
                <dt class="text-sm font-medium text-red-500">Error Message</dt>
                <dd class="mt-1 text-sm text-red-700 bg-red-50 p-3 rounded">{{ selectedMessage.error_message }}</dd>
              </div>
            </dl>
          </div>

          <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              @click="selectedMessage = null"
              class="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Send Message Modal -->
    <div
      v-if="showSendModal"
      class="fixed z-10 inset-0 overflow-y-auto"
      @click.self="showSendModal = false"
    >
      <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>

        <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <form @submit.prevent="sendMessage">
            <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div class="flex justify-between items-start mb-4">
                <h3 class="text-lg leading-6 font-medium text-gray-900">Send SMS Message</h3>
                <button type="button" @click="showSendModal = false" class="text-gray-400 hover:text-gray-500">
                  <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class="" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div v-if="sendError" class="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {{ sendError }}
              </div>

              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">To Number</label>
                  <input
                    v-model="sendForm.to"
                    type="tel"
                    required
                    placeholder="+12025551234"
                    class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">From Number</label>
                  <select
                    v-model="sendForm.from"
                    required
                    class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Select a number</option>
                    <option v-for="number in availableNumbers" :key="number" :value="number">
                      {{ number }}
                    </option>
                  </select>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea
                    v-model="sendForm.body"
                    required
                    rows="4"
                    maxlength="1600"
                    placeholder="Type your message..."
                    class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  ></textarea>
                  <p class="mt-1 text-sm text-gray-500">{{ sendForm.body.length }} / 1600 characters</p>
                </div>
              </div>
            </div>

            <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                :disabled="isSending"
                class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ isSending ? 'Sending...' : 'Send Message' }}
              </button>
              <button
                type="button"
                @click="showSendModal = false"
                class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiClient } from '@/utils/api'

const messages = ref([])
const isLoading = ref(false)
const selectedMessage = ref(null)
const showSendModal = ref(false)
const isSending = ref(false)
const sendError = ref('')

const availableNumbers = ref([])

const filters = ref({
  direction: '',
  status: '',
  dateFrom: '',
  dateTo: '',
  search: ''
})

const sendForm = ref({
  to: '',
  from: '',
  body: ''
})

const currentPage = ref(1)
const pageSize = ref(20)
const totalPages = ref(1)
const hasNextPage = ref(false)

let searchTimeout = null

onMounted(() => {
  fetchMessages()
  fetchAvailableNumbers()
})

function debouncedSearch() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    currentPage.value = 1
    fetchMessages()
  }, 500)
}

async function fetchMessages() {
  isLoading.value = true
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      ...filters.value
    }

    const response = await apiClient.get('/v1/messages', { params })
    messages.value = response.data.messages || []
    totalPages.value = response.data.total_pages || 1
    hasNextPage.value = response.data.has_next_page || false
  } catch (error) {
    console.error('Failed to fetch messages:', error)
    messages.value = []
  } finally {
    isLoading.value = false
  }
}

async function fetchAvailableNumbers() {
  try {
    const response = await apiClient.get('/v1/phone-numbers')
    availableNumbers.value = response.data.numbers?.map(n => n.phone_number) || []
  } catch (error) {
    console.error('Failed to fetch available numbers:', error)
  }
}

function viewMessageDetails(message) {
  selectedMessage.value = message
}

async function sendMessage() {
  isSending.value = true
  sendError.value = ''

  try {
    await apiClient.post('/v1/messages', {
      to: sendForm.value.to,
      from: sendForm.value.from,
      body: sendForm.value.body
    })

    showSendModal.value = false
    sendForm.value = { to: '', from: '', body: '' }
    await fetchMessages()
  } catch (error) {
    sendError.value = error.response?.data?.error || 'Failed to send message'
  } finally {
    isSending.value = false
  }
}

function previousPage() {
  if (currentPage.value > 1) {
    currentPage.value--
    fetchMessages()
  }
}

function nextPage() {
  if (hasNextPage.value) {
    currentPage.value++
    fetchMessages()
  }
}

function formatDateTime(dateString) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getStatusClass(status) {
  const classes = {
    delivered: 'bg-green-100 text-green-800',
    sent: 'bg-blue-100 text-blue-800',
    failed: 'bg-red-100 text-red-800',
    queued: 'bg-yellow-100 text-yellow-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}
</script>
