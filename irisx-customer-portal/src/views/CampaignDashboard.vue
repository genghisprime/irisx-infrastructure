<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <div class="bg-white shadow-sm border-b">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="py-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-4">
              <button
                @click="$router.push('/dashboard/campaigns')"
                class="text-gray-400 hover:text-gray-600"
              >
                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div v-if="campaign">
                <h1 class="text-2xl font-bold text-gray-900">{{ campaign.name }}</h1>
                <p class="mt-1 text-sm text-gray-500">
                  {{ campaign.description || 'No description' }}
                </p>
              </div>
            </div>
            <div v-if="campaign" class="flex items-center space-x-3">
              <span
                :class="[
                  'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium',
                  getStatusClass(campaign.status)
                ]"
              >
                {{ campaign.status }}
              </span>
              <button
                v-if="campaign.status === 'draft' || campaign.status === 'paused'"
                @click="startCampaign"
                class="px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 transition-colors"
              >
                Start Campaign
              </button>
              <button
                v-if="campaign.status === 'running'"
                @click="pauseCampaign"
                class="px-4 py-2 bg-yellow-600 text-white font-medium rounded-md hover:bg-yellow-700 transition-colors"
              >
                Pause Campaign
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
      <p class="mt-4 text-sm text-gray-500">Loading campaign...</p>
    </div>

    <div v-else-if="campaign" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div class="bg-white rounded-lg shadow-sm border p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Total Contacts</p>
              <p class="mt-2 text-3xl font-bold text-gray-900">{{ stats.total_contacts || 0 }}</p>
            </div>
            <div class="p-3 bg-indigo-50 rounded-lg">
              <svg class="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Completed</p>
              <p class="mt-2 text-3xl font-bold text-green-600">{{ stats.completed || 0 }}</p>
              <p class="mt-1 text-xs text-gray-500">{{ getPercentage(stats.completed) }}%</p>
            </div>
            <div class="p-3 bg-green-50 rounded-lg">
              <svg class="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Pending</p>
              <p class="mt-2 text-3xl font-bold text-yellow-600">{{ stats.pending || 0 }}</p>
              <p class="mt-1 text-xs text-gray-500">{{ getPercentage(stats.pending) }}%</p>
            </div>
            <div class="p-3 bg-yellow-50 rounded-lg">
              <svg class="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Failed</p>
              <p class="mt-2 text-3xl font-bold text-red-600">{{ stats.failed || 0 }}</p>
              <p class="mt-1 text-xs text-gray-500">{{ getPercentage(stats.failed) }}%</p>
            </div>
            <div class="p-3 bg-red-50 rounded-lg">
              <svg class="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="bg-white rounded-lg shadow-sm border p-6 mb-8">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-medium text-gray-700">Campaign Progress</h3>
          <span class="text-sm text-gray-600">{{ getCompletionRate() }}% Complete</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-4">
          <div
            class="bg-gradient-to-r from-indigo-500 to-purple-600 h-4 rounded-full transition-all flex items-center justify-end pr-2"
            :style="{ width: getCompletionRate() + '%' }"
          >
            <span v-if="getCompletionRate() > 10" class="text-xs font-medium text-white">
              {{ getCompletionRate() }}%
            </span>
          </div>
        </div>
        <div class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p class="text-gray-500">Avg Duration</p>
            <p class="font-medium text-gray-900">{{ formatDuration(stats.avg_duration) }}</p>
          </div>
          <div>
            <p class="text-gray-500">Total Duration</p>
            <p class="font-medium text-gray-900">{{ formatDuration(stats.total_duration) }}</p>
          </div>
          <div>
            <p class="text-gray-500">No Answer</p>
            <p class="font-medium text-gray-900">{{ stats.no_answer || 0 }}</p>
          </div>
          <div>
            <p class="text-gray-500">Busy</p>
            <p class="font-medium text-gray-900">{{ stats.busy || 0 }}</p>
          </div>
        </div>
      </div>

      <!-- Contacts Table -->
      <div class="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Contact List</h3>
          <div class="flex items-center space-x-3">
            <select
              v-model="contactStatusFilter"
              @change="loadContacts"
              class="rounded-md border-gray-300 text-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="called">Called</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="no_answer">No Answer</option>
              <option value="busy">Busy</option>
            </select>
          </div>
        </div>

        <div v-if="loadingContacts" class="p-8 text-center">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
        </div>

        <div v-else-if="contacts.length === 0" class="p-8 text-center">
          <p class="text-sm text-gray-500">No contacts found</p>
        </div>

        <div v-else>
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phone Number
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Attempts
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Called
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="contact in contacts" :key="contact.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-medium text-gray-900">
                    {{ contact.first_name }} {{ contact.last_name }}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ contact.phone_number }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span
                    :class="[
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      getContactStatusClass(contact.status)
                    ]"
                  >
                    {{ contact.status }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ contact.attempt_count || 0 }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ contact.call_duration ? formatDuration(contact.call_duration) : '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ contact.last_attempt_at ? formatDateTime(contact.last_attempt_at) : 'Never' }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Pagination -->
          <div v-if="contactTotalPages > 1" class="bg-gray-50 px-4 py-3 border-t flex items-center justify-between">
            <div class="flex-1 flex justify-between sm:hidden">
              <button
                @click="changeContactPage(contactPage - 1)"
                :disabled="contactPage === 1"
                class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                @click="changeContactPage(contactPage + 1)"
                :disabled="contactPage === contactTotalPages"
                class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p class="text-sm text-gray-700">
                  Showing page <span class="font-medium">{{ contactPage }}</span> of <span class="font-medium">{{ contactTotalPages }}</span>
                </p>
              </div>
              <div>
                <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    @click="changeContactPage(contactPage - 1)"
                    :disabled="contactPage === 1"
                    class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <span class="sr-only">Previous</span>
                    <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                  </button>
                  <button
                    @click="changeContactPage(contactPage + 1)"
                    :disabled="contactPage === contactTotalPages"
                    class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <span class="sr-only">Next</span>
                    <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                    </svg>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const route = useRoute();
const router = useRouter();

// State
const loading = ref(false);
const loadingContacts = ref(false);
const campaign = ref(null);
const stats = ref({});
const contacts = ref([]);
const contactStatusFilter = ref('');
const contactPage = ref(1);
const contactTotalPages = ref(1);

let refreshInterval = null;

// Get auth token
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = '/login';
}

// Load campaign
async function loadCampaign() {
  loading.value = true;
  try {
    const response = await axios.get(`${API_URL}/v1/campaigns/${route.params.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    campaign.value = response.data.campaign;
  } catch (error) {
    console.error('Error loading campaign:', error);
    alert('Failed to load campaign');
    router.push('/dashboard/campaigns');
  } finally {
    loading.value = false;
  }
}

// Load stats
async function loadStats() {
  try {
    const response = await axios.get(`${API_URL}/v1/campaigns/${route.params.id}/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    stats.value = response.data;
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Load contacts
async function loadContacts() {
  loadingContacts.value = true;
  try {
    const params = {
      page: contactPage.value,
      limit: 50
    };

    if (contactStatusFilter.value) {
      params.status = contactStatusFilter.value;
    }

    const response = await axios.get(`${API_URL}/v1/campaigns/${route.params.id}/contacts`, {
      params,
      headers: { 'Authorization': `Bearer ${token}` }
    });

    contacts.value = response.data.contacts;
    contactTotalPages.value = Math.ceil(response.data.total / response.data.limit);
  } catch (error) {
    console.error('Error loading contacts:', error);
  } finally {
    loadingContacts.value = false;
  }
}

// Get status class
function getStatusClass(status) {
  const classes = {
    draft: 'bg-gray-100 text-gray-800',
    scheduled: 'bg-blue-100 text-blue-800',
    running: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-indigo-100 text-indigo-800',
    cancelled: 'bg-red-100 text-red-800'
  };
  return classes[status] || 'bg-gray-100 text-gray-800';
}

// Get contact status class
function getContactStatusClass(status) {
  const classes = {
    pending: 'bg-gray-100 text-gray-800',
    called: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    no_answer: 'bg-yellow-100 text-yellow-800',
    busy: 'bg-orange-100 text-orange-800'
  };
  return classes[status] || 'bg-gray-100 text-gray-800';
}

// Get percentage
function getPercentage(value) {
  const total = parseInt(stats.value.total_contacts);
  if (total === 0) return 0;
  return Math.round((parseInt(value || 0) / total) * 100);
}

// Get completion rate
function getCompletionRate() {
  const total = parseInt(stats.value.total_contacts);
  if (total === 0) return 0;
  const completed = parseInt(stats.value.completed || 0) + parseInt(stats.value.failed || 0);
  return Math.round((completed / total) * 100);
}

// Format duration
function formatDuration(seconds) {
  if (!seconds) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

// Format date time
function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Change contact page
function changeContactPage(page) {
  if (page < 1 || page > contactTotalPages.value) return;
  contactPage.value = page;
  loadContacts();
}

// Start campaign
async function startCampaign() {
  if (!confirm('Are you sure you want to start this campaign?')) return;

  try {
    await axios.post(
      `${API_URL}/v1/campaigns/${route.params.id}/start`,
      {},
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    await loadCampaign();
    alert('Campaign started successfully!');
  } catch (error) {
    console.error('Error starting campaign:', error);
    alert('Failed to start campaign');
  }
}

// Pause campaign
async function pauseCampaign() {
  if (!confirm('Are you sure you want to pause this campaign?')) return;

  try {
    await axios.post(
      `${API_URL}/v1/campaigns/${route.params.id}/pause`,
      {},
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    await loadCampaign();
    alert('Campaign paused successfully!');
  } catch (error) {
    console.error('Error pausing campaign:', error);
    alert('Failed to pause campaign');
  }
}

// Auto-refresh
function startAutoRefresh() {
  refreshInterval = setInterval(() => {
    loadStats();
    loadContacts();
  }, 5000); // Refresh every 5 seconds
}

// Lifecycle
onMounted(async () => {
  await loadCampaign();
  await loadStats();
  await loadContacts();
  startAutoRefresh();
});

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});
</script>
