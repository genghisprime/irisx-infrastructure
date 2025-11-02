<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Invoices</h1>
      <button
        v-if="authStore.isAdmin"
        @click="showCreateModal = true"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        + Create Invoice
      </button>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <input
          v-model="filters.search"
          type="text"
          placeholder="Search invoice number..."
          class="px-3 py-2 border rounded-md"
        />
        <select v-model="filters.status" class="px-3 py-2 border rounded-md">
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select v-model="filters.tenant_id" class="px-3 py-2 border rounded-md">
          <option value="">All Tenants</option>
        </select>
        <button
          @click="applyFilters"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Apply
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <svg class="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4">
      <p class="text-red-600">{{ error }}</p>
    </div>

    <!-- Invoices Table -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Invoice #
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Tenant
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Amount
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Status
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Due Date
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Created
            </th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="invoice in invoices" :key="invoice.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm font-medium text-gray-900">
              {{ invoice.invoice_number }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ invoice.tenant_name }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              ${{ invoice.total_amount }}
            </td>
            <td class="px-6 py-4">
              <span
                class="px-2 py-1 text-xs font-medium rounded-full"
                :class="getStatusClass(invoice.status)"
              >
                {{ invoice.status }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ formatDate(invoice.due_date) }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ formatDate(invoice.created_at) }}
            </td>
            <td class="px-6 py-4 text-right text-sm space-x-2">
              <button class="text-blue-600 hover:text-blue-800">View</button>
              <button
                v-if="invoice.status === 'draft' && authStore.isAdmin"
                class="text-green-600 hover:text-green-800"
              >
                Send
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Empty State -->
      <div v-if="invoices.length === 0" class="text-center py-12">
        <p class="text-gray-500">No invoices found</p>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="px-6 py-4 border-t flex justify-between">
        <div class="text-sm text-gray-700">
          Showing {{ (currentPage - 1) * 20 + 1 }} to {{ Math.min(currentPage * 20, total) }} of {{ total }}
        </div>
        <div class="flex space-x-2">
          <button
            @click="changePage(currentPage - 1)"
            :disabled="currentPage === 1"
            class="px-3 py-1 border rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            @click="changePage(currentPage + 1)"
            :disabled="currentPage === totalPages"
            class="px-3 py-1 border rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- Create Invoice Modal -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="showCreateModal = false"
    >
      <div class="bg-white rounded-lg p-6 max-w-lg w-full mx-4" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Create Manual Invoice</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">Tenant</label>
            <select v-model="newInvoice.tenant_id" class="w-full px-3 py-2 border rounded-md">
              <option value="">Select tenant...</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Amount</label>
            <input
              v-model="newInvoice.amount"
              type="number"
              step="0.01"
              class="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Description</label>
            <textarea
              v-model="newInvoice.description"
              rows="3"
              class="w-full px-3 py-2 border rounded-md"
            ></textarea>
          </div>
        </div>
        <div class="flex justify-end space-x-2 mt-6">
          <button
            @click="showCreateModal = false"
            class="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            @click="createInvoice"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAdminAuthStore } from '../../../stores/adminAuth'
import { adminAPI } from '../../../utils/api'

const authStore = useAdminAuthStore()

const loading = ref(true)
const error = ref(null)
const invoices = ref([])
const total = ref(0)
const currentPage = ref(1)
const showCreateModal = ref(false)

const filters = ref({
  search: '',
  status: '',
  tenant_id: ''
})

const newInvoice = ref({
  tenant_id: '',
  amount: 0,
  description: ''
})

const totalPages = computed(() => Math.ceil(total.value / 20))

onMounted(() => {
  fetchInvoices()
})

async function fetchInvoices() {
  loading.value = true
  error.value = null

  try {
    const params = {
      page: currentPage.value,
      limit: 20,
      ...filters.value
    }

    const response = await adminAPI.billing.listInvoices(params)
    invoices.value = response.data.invoices || []
    total.value = response.data.total || 0
  } catch (err) {
    console.error('Failed to fetch invoices:', err)
    error.value = 'Failed to load invoices'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  currentPage.value = 1
  fetchInvoices()
}

function changePage(page) {
  currentPage.value = page
  fetchInvoices()
}

async function createInvoice() {
  try {
    await adminAPI.billing.createInvoice(newInvoice.value)
    showCreateModal.value = false
    await fetchInvoices()
  } catch (err) {
    console.error('Failed to create invoice:', err)
    alert('Failed to create invoice')
  }
}

function getStatusClass(status) {
  const classes = {
    draft: 'bg-gray-100 text-gray-800',
    sent: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

function formatDate(dateString) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString()
}
</script>
