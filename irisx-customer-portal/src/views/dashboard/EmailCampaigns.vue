<template>
  <div class="py-6">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-semibold text-gray-900">Email Campaigns</h1>
        <button
          @click="showSendModal = true"
          class="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Send Email
        </button>
      </div>

      <!--

 Stats Cards -->
      <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="p-5">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div class="ml-5 w-0 flex-1">
                <dl>
                  <dt class="text-sm font-medium text-gray-500 truncate">Total Sent</dt>
                  <dd class="text-lg font-semibold text-gray-900">{{ stats.totalSent.toLocaleString() }}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="p-5">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-6 w-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div class="ml-5 w-0 flex-1">
                <dl>
                  <dt class="text-sm font-medium text-gray-500 truncate">Delivered</dt>
                  <dd class="text-lg font-semibold text-gray-900">{{ stats.delivered.toLocaleString() }}</dd>
                  <dd class="text-xs text-green-600">{{ stats.deliveryRate }}%</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="p-5">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-6 w-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <div class="ml-5 w-0 flex-1">
                <dl>
                  <dt class="text-sm font-medium text-gray-500 truncate">Opens</dt>
                  <dd class="text-lg font-semibold text-gray-900">{{ stats.opens.toLocaleString() }}</dd>
                  <dd class="text-xs text-blue-600">{{ stats.openRate }}%</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="p-5">
            <div class="flex items-center">
              <div class="flex-shrink-0">
                <svg class="h-6 w-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
              </div>
              <div class="ml-5 w-0 flex-1">
                <dl>
                  <dt class="text-sm font-medium text-gray-500 truncate">Clicks</dt>
                  <dd class="text-lg font-semibold text-gray-900">{{ stats.clicks.toLocaleString() }}</dd>
                  <dd class="text-xs text-indigo-600">{{ stats.clickRate }}%</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white shadow rounded-lg p-4 mb-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              v-model="filters.status"
              @change="fetchEmails"
              class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All Status</option>
              <option value="delivered">Delivered</option>
              <option value="bounced">Bounced</option>
              <option value="failed">Failed</option>
              <option value="queued">Queued</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <input
              v-model="filters.dateFrom"
              type="date"
              @change="fetchEmails"
              class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <input
              v-model="filters.dateTo"
              type="date"
              @change="fetchEmails"
              class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              v-model="filters.search"
              type="text"
              placeholder="Email address or subject..."
              @input="debouncedSearch"
              class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      <!-- Emails Table -->
      <div class="bg-white shadow rounded-lg overflow-hidden">
        <div v-if="isLoading" class="p-8 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p class="mt-2 text-gray-600">Loading emails...</p>
        </div>

        <div v-else-if="emails.length === 0" class="p-8 text-center text-gray-500">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p class="mt-2">No emails found</p>
        </div>

        <table v-else class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date & Time
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                To
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Subject
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Opens
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Clicks
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="email in emails" :key="email.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ formatDateTime(email.created_at) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ email.to_email }}
              </td>
              <td class="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                {{ email.subject }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span
                  :class="getStatusClass(email.status)"
                  class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                >
                  {{ email.status }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ email.opens || 0 }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ email.clicks || 0 }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button
                  @click="viewEmailDetails(email)"
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
      <div v-if="emails.length > 0" class="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 mt-4 rounded-lg shadow">
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

    <!-- Email Details Modal -->
    <div
      v-if="selectedEmail"
      class="fixed z-10 inset-0 overflow-y-auto"
      @click.self="selectedEmail = null"
    >
      <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>

        <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div class="flex justify-between items-start mb-4">
              <h3 class="text-lg leading-6 font-medium text-gray-900">Email Details</h3>
              <button @click="selectedEmail = null" class="text-gray-400 hover:text-gray-500">
                <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <dl class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 mb-6">
              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">Email ID</dt>
                <dd class="mt-1 text-sm text-gray-900 font-mono">{{ selectedEmail.id }}</dd>
              </div>

              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">Status</dt>
                <dd class="mt-1">
                  <span :class="getStatusClass(selectedEmail.status)" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                    {{ selectedEmail.status }}
                  </span>
                </dd>
              </div>

              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">To</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ selectedEmail.to_email }}</dd>
              </div>

              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">From</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ selectedEmail.from_email }}</dd>
              </div>

              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">Opens</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ selectedEmail.opens || 0 }}</dd>
              </div>

              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">Clicks</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ selectedEmail.clicks || 0 }}</dd>
              </div>

              <div class="sm:col-span-2">
                <dt class="text-sm font-medium text-gray-500">Subject</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ selectedEmail.subject }}</dd>
              </div>

              <div class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">Sent At</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ formatDateTime(selectedEmail.created_at) }}</dd>
              </div>

              <div v-if="selectedEmail.delivered_at" class="sm:col-span-1">
                <dt class="text-sm font-medium text-gray-500">Delivered At</dt>
                <dd class="mt-1 text-sm text-gray-900">{{ formatDateTime(selectedEmail.delivered_at) }}</dd>
              </div>

              <div v-if="selectedEmail.bounced_at" class="sm:col-span-1">
                <dt class="text-sm font-medium text-red-500">Bounced At</dt>
                <dd class="mt-1 text-sm text-red-700">{{ formatDateTime(selectedEmail.bounced_at) }}</dd>
              </div>

              <div v-if="selectedEmail.bounce_reason" class="sm:col-span-2">
                <dt class="text-sm font-medium text-red-500">Bounce Reason</dt>
                <dd class="mt-1 text-sm text-red-700 bg-red-50 p-3 rounded">{{ selectedEmail.bounce_reason }}</dd>
              </div>
            </dl>

            <div class="border-t pt-4">
              <h4 class="text-sm font-medium text-gray-900 mb-2">Email Content</h4>
              <div class="bg-gray-50 p-4 rounded max-h-96 overflow-y-auto">
                <div v-if="selectedEmail.html_body" v-html="selectedEmail.html_body"></div>
                <pre v-else class="whitespace-pre-wrap text-sm text-gray-700">{{ selectedEmail.text_body }}</pre>
              </div>
            </div>
          </div>

          <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              @click="selectedEmail = null"
              class="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Send Email Modal -->
    <div
      v-if="showSendModal"
      class="fixed z-10 inset-0 overflow-y-auto"
      @click.self="showSendModal = false"
    >
      <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>

        <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <form @submit.prevent="sendEmail">
            <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div class="flex justify-between items-start mb-4">
                <h3 class="text-lg leading-6 font-medium text-gray-900">Send Email</h3>
                <button type="button" @click="showSendModal = false" class="text-gray-400 hover:text-gray-500">
                  <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div v-if="sendError" class="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {{ sendError }}
              </div>

              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">To Email</label>
                  <input
                    v-model="sendForm.to"
                    type="email"
                    required
                    placeholder="recipient@example.com"
                    class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    v-model="sendForm.subject"
                    type="text"
                    required
                    placeholder="Email subject"
                    class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea
                    v-model="sendForm.body"
                    required
                    rows="8"
                    placeholder="Type your email message..."
                    class="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  ></textarea>
                </div>
              </div>
            </div>

            <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                :disabled="isSending"
                class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ isSending ? 'Sending...' : 'Send Email' }}
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
import { ref, onMounted } from 'vue'
import { apiClient } from '@/utils/api'

const emails = ref([])
const isLoading = ref(false)
const selectedEmail = ref(null)
const showSendModal = ref(false)
const isSending = ref(false)
const sendError = ref('')

const stats = ref({
  totalSent: 0,
  delivered: 0,
  deliveryRate: 0,
  opens: 0,
  openRate: 0,
  clicks: 0,
  clickRate: 0
})

const filters = ref({
  status: '',
  dateFrom: '',
  dateTo: '',
  search: ''
})

const sendForm = ref({
  to: '',
  subject: '',
  body: ''
})

const currentPage = ref(1)
const pageSize = ref(20)
const totalPages = ref(1)
const hasNextPage = ref(false)

let searchTimeout = null

onMounted(() => {
  fetchEmails()
  fetchStats()
})

function debouncedSearch() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    currentPage.value = 1
    fetchEmails()
  }, 500)
}

async function fetchEmails() {
  isLoading.value = true
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      ...filters.value
    }

    const response = await apiClient.get('/v1/emails', { params })
    emails.value = response.data.emails || []
    totalPages.value = response.data.total_pages || 1
    hasNextPage.value = response.data.has_next_page || false
  } catch (error) {
    console.error('Failed to fetch emails:', error)
    emails.value = []
  } finally {
    isLoading.value = false
  }
}

async function fetchStats() {
  try {
    const response = await apiClient.get('/v1/emails/stats')
    // API returns { success: true, data: { total_sent, total_delivered, etc } }
    const apiStats = response.data.data || response.data

    // Map API response to component stats structure
    stats.value = {
      totalSent: apiStats.total_sent || 0,
      delivered: apiStats.total_delivered || 0,
      deliveryRate: apiStats.delivery_rate || 0,
      opens: apiStats.total_opened || 0,
      openRate: apiStats.open_rate || 0,
      clicks: apiStats.total_clicked || 0,
      clickRate: apiStats.click_rate || 0
    }
  } catch (error) {
    console.error('Failed to fetch email stats:', error)
  }
}

function viewEmailDetails(email) {
  selectedEmail.value = email
}

async function sendEmail() {
  isSending.value = true
  sendError.value = ''

  try {
    await apiClient.post('/v1/emails', {
      to: sendForm.value.to,
      subject: sendForm.value.subject,
      body: sendForm.value.body
    })

    showSendModal.value = false
    sendForm.value = { to: '', subject: '', body: '' }
    await fetchEmails()
    await fetchStats()
  } catch (error) {
    sendError.value = error.response?.data?.error || 'Failed to send email'
  } finally {
    isSending.value = false
  }
}

function previousPage() {
  if (currentPage.value > 1) {
    currentPage.value--
    fetchEmails()
  }
}

function nextPage() {
  if (hasNextPage.value) {
    currentPage.value++
    fetchEmails()
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
    bounced: 'bg-red-100 text-red-800',
    failed: 'bg-red-100 text-red-800',
    queued: 'bg-yellow-100 text-yellow-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}
</script>
