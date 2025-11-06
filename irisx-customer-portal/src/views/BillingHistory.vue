<template>
  <div class="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="mb-8">
        <div class="flex items-center justify-between">
          <div>
            <router-link to="/usage" class="text-sm text-purple-600 hover:text-purple-700 flex items-center mb-2">
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
              </svg>
              Back to Usage
            </router-link>
            <h1 class="text-3xl font-bold text-gray-900">Billing History</h1>
            <p class="mt-2 text-sm text-gray-600">
              View and download your invoices
            </p>
          </div>
        </div>
      </div>

      <!-- Filter Tabs -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div class="border-b border-gray-200">
          <nav class="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            <button
              v-for="tab in tabs"
              :key="tab.value"
              @click="selectedStatus = tab.value; fetchInvoices()"
              :class="[
                selectedStatus === tab.value
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm'
              ]"
            >
              {{ tab.label }}
            </button>
          </nav>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center items-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6">
        <div class="flex items-start">
          <svg class="w-6 h-6 text-red-400 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
          </svg>
          <div>
            <h3 class="text-sm font-medium text-red-800">Error loading invoices</h3>
            <p class="mt-1 text-sm text-red-700">{{ error }}</p>
            <button @click="fetchInvoices" class="mt-3 text-sm font-medium text-red-600 hover:text-red-500">
              Try again
            </button>
          </div>
        </div>
      </div>

      <!-- Invoices List -->
      <div v-else>
        <!-- Empty State -->
        <div v-if="invoices.length === 0" class="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <svg style="width: 48px; height: 48px; min-width: 48px; min-height: 48px; max-width: 48px; max-height: 48px;" class="mx-auto  text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900">No invoices</h3>
          <p class="mt-1 text-sm text-gray-500">
            {{ selectedStatus === null ? 'You don\'t have any invoices yet' : `No ${selectedStatus} invoices found` }}
          </p>
        </div>

        <!-- Invoices Table -->
        <div v-else class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Period
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Due Date
                </th>
                <th scope="col" class="relative px-6 py-3">
                  <span class="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr
                v-for="invoice in invoices"
                :key="invoice.id"
                class="hover:bg-gray-50 transition cursor-pointer"
                @click="viewInvoice(invoice.id)"
              >
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10 flex items-center justify-center bg-purple-100 rounded-lg">
                      <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class=" text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                      </svg>
                    </div>
                    <div class="ml-4">
                      <div class="text-sm font-medium text-gray-900">
                        {{ invoice.invoiceNumber }}
                      </div>
                      <div class="text-sm text-gray-500">
                        {{ formatDate(invoice.createdAt) }}
                      </div>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">{{ formatDate(invoice.periodStart) }} - {{ formatDate(invoice.periodEnd) }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-semibold text-gray-900">${{ invoice.totalAmount.toFixed(2) }}</div>
                  <div class="text-xs text-gray-500">{{ invoice.currency }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="getStatusClass(invoice.status)" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                    {{ invoice.status }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ invoice.dueDate ? formatDate(invoice.dueDate) : 'N/A' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    @click.stop="downloadInvoice(invoice)"
                    class="text-purple-600 hover:text-purple-900 mr-4"
                    title="Download Invoice"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                    </svg>
                  </button>
                  <button
                    @click.stop="viewInvoice(invoice.id)"
                    class="text-gray-600 hover:text-gray-900"
                    title="View Details"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                    </svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Pagination -->
          <div v-if="hasMore" class="bg-gray-50 px-6 py-4 border-t border-gray-200">
            <button
              @click="loadMore"
              :disabled="loadingMore"
              class="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
            >
              {{ loadingMore ? 'Loading...' : 'Load More' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Invoice Detail Modal -->
      <div
        v-if="selectedInvoice"
        class="fixed z-10 inset-0 overflow-y-auto"
        aria-labelledby="modal-title"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <!-- Background overlay -->
          <div
            class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
            @click="selectedInvoice = null"
          ></div>

          <!-- Modal panel -->
          <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
            <div class="bg-white px-6 pt-6 pb-4">
              <!-- Modal Header -->
              <div class="flex items-start justify-between mb-6">
                <div>
                  <h3 class="text-2xl font-bold text-gray-900">{{ selectedInvoice.invoiceNumber }}</h3>
                  <p class="mt-1 text-sm text-gray-500">
                    {{ formatDate(selectedInvoice.periodStart) }} - {{ formatDate(selectedInvoice.periodEnd) }}
                  </p>
                </div>
                <button
                  @click="selectedInvoice = null"
                  class="text-gray-400 hover:text-gray-500"
                >
                  <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class="" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>

              <!-- Invoice Details -->
              <div class="border-t border-b border-gray-200 py-6">
                <dl class="grid grid-cols-2 gap-4">
                  <div>
                    <dt class="text-sm font-medium text-gray-500">Status</dt>
                    <dd class="mt-1">
                      <span :class="getStatusClass(selectedInvoice.status)" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                        {{ selectedInvoice.status }}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt class="text-sm font-medium text-gray-500">Due Date</dt>
                    <dd class="mt-1 text-sm text-gray-900">{{ selectedInvoice.dueDate ? formatDate(selectedInvoice.dueDate) : 'N/A' }}</dd>
                  </div>
                  <div v-if="selectedInvoice.paidAt">
                    <dt class="text-sm font-medium text-gray-500">Paid At</dt>
                    <dd class="mt-1 text-sm text-gray-900">{{ formatDate(selectedInvoice.paidAt) }}</dd>
                  </div>
                  <div v-if="selectedInvoice.paymentMethod">
                    <dt class="text-sm font-medium text-gray-500">Payment Method</dt>
                    <dd class="mt-1 text-sm text-gray-900 capitalize">{{ selectedInvoice.paymentMethod }}</dd>
                  </div>
                </dl>
              </div>

              <!-- Line Items -->
              <div class="mt-6">
                <h4 class="text-lg font-semibold text-gray-900 mb-4">Line Items</h4>
                <div class="overflow-x-auto">
                  <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                      <tr>
                        <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th scope="col" class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                        <th scope="col" class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                        <th scope="col" class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
                      <tr v-for="item in selectedInvoice.lineItems" :key="item.id">
                        <td class="px-4 py-3 text-sm text-gray-900">{{ item.description }}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right">{{ item.quantity }}</td>
                        <td class="px-4 py-3 text-sm text-gray-900 text-right">${{ item.unitPrice }}</td>
                        <td class="px-4 py-3 text-sm font-medium text-gray-900 text-right">${{ item.amount }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Totals -->
              <div class="mt-6 space-y-2">
                <div class="flex justify-between text-sm">
                  <span class="text-gray-600">Subtotal</span>
                  <span class="font-medium text-gray-900">${{ selectedInvoice.subtotal.toFixed(2) }}</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-gray-600">Tax</span>
                  <span class="font-medium text-gray-900">${{ selectedInvoice.tax.toFixed(2) }}</span>
                </div>
                <div class="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total</span>
                  <span>${{ selectedInvoice.totalAmount.toFixed(2) }} {{ selectedInvoice.currency }}</span>
                </div>
              </div>
            </div>

            <!-- Modal Footer -->
            <div class="bg-gray-50 px-6 py-4 flex justify-end space-x-3">
              <button
                @click="selectedInvoice = null"
                class="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Close
              </button>
              <button
                @click="downloadInvoice(selectedInvoice); selectedInvoice = null"
                class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700"
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// State
const loading = ref(true);
const loadingMore = ref(false);
const error = ref(null);
const invoices = ref([]);
const selectedInvoice = ref(null);
const selectedStatus = ref(null);
const hasMore = ref(false);
const offset = ref(0);
const limit = 20;

// Tabs
const tabs = [
  { label: 'All', value: null },
  { label: 'Paid', value: 'paid' },
  { label: 'Pending', value: 'pending' },
  { label: 'Overdue', value: 'overdue' },
];

// Status badge classes
const getStatusClass = (status) => {
  const classes = {
    paid: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    overdue: 'bg-red-100 text-red-800',
    draft: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };
  return classes[status] || 'bg-gray-100 text-gray-800';
};

// Format date
const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

// Fetch invoices
const fetchInvoices = async (loadingMoreData = false) => {
  try {
    if (!loadingMoreData) {
      loading.value = true;
      offset.value = 0;
      invoices.value = [];
    } else {
      loadingMore.value = true;
    }
    error.value = null;

    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('Not authenticated');
    }

    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.value.toString()
    });

    if (selectedStatus.value) {
      params.append('status', selectedStatus.value);
    }

    const response = await axios.get(`${API_URL}/v1/billing/invoices?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.success) {
      const newInvoices = response.data.data.invoices;
      invoices.value = loadingMoreData ? [...invoices.value, ...newInvoices] : newInvoices;
      hasMore.value = response.data.data.pagination.hasMore;
    } else {
      throw new Error(response.data.error || 'Failed to fetch invoices');
    }
  } catch (err) {
    console.error('Error fetching invoices:', err);
    error.value = err.response?.data?.message || err.message || 'Failed to load invoices';
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

// Load more invoices
const loadMore = () => {
  offset.value += limit;
  fetchInvoices(true);
};

// View invoice details
const viewInvoice = async (invoiceId) => {
  try {
    const token = localStorage.getItem('authToken');
    const response = await axios.get(`${API_URL}/v1/billing/invoice/${invoiceId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.success) {
      selectedInvoice.value = response.data.data;
    }
  } catch (err) {
    console.error('Error fetching invoice:', err);
    error.value = err.response?.data?.message || 'Failed to load invoice details';
  }
};

// Download invoice (placeholder - requires PDF generation)
const downloadInvoice = (invoice) => {
  if (invoice.pdfUrl) {
    window.open(invoice.pdfUrl, '_blank');
  } else {
    alert('PDF generation coming soon. Invoice: ' + invoice.invoiceNumber);
  }
};

// Lifecycle
onMounted(() => {
  fetchInvoices();
});
</script>

<style scoped>
/* Add any custom styles here if needed */
</style>
