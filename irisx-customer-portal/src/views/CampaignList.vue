<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <div class="bg-white shadow-sm border-b">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="py-6">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-2xl font-bold text-gray-900">Campaign Management</h1>
              <p class="mt-1 text-sm text-gray-500">
                Create and manage outbound calling campaigns
              </p>
            </div>
            <button
              @click="showCreateWizard = true"
              class="px-4 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 transition-colors flex items-center space-x-2"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Create Campaign</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Status Filter Tabs -->
      <div class="bg-white rounded-lg shadow-sm border mb-6">
        <nav class="flex -mb-px">
          <button
            v-for="tab in statusTabs"
            :key="tab.value"
            @click="selectedStatus = tab.value; loadCampaigns()"
            :class="[
              'flex-1 py-3 px-4 text-center border-b-2 font-medium text-sm transition-colors',
              selectedStatus === tab.value
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            ]"
          >
            {{ tab.label }}
            <span
              v-if="getCampaignCountByStatus(tab.value) > 0"
              class="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
            >
              {{ getCampaignCountByStatus(tab.value) }}
            </span>
          </button>
        </nav>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p class="mt-4 text-sm text-gray-500">Loading campaigns...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="campaigns.length === 0" class="bg-white rounded-lg shadow-sm border p-12 text-center">
        <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        <h3 class="mt-4 text-lg font-medium text-gray-900">No campaigns yet</h3>
        <p class="mt-2 text-sm text-gray-500">Get started by creating your first outbound calling campaign</p>
        <button
          @click="showCreateWizard = true"
          class="mt-6 px-6 py-3 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 transition-colors"
        >
          Create Your First Campaign
        </button>
      </div>

      <!-- Campaigns Table -->
      <div v-else class="bg-white rounded-lg shadow-sm border overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Campaign
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Progress
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contacts
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr
              v-for="campaign in campaigns"
              :key="campaign.id"
              class="hover:bg-gray-50 cursor-pointer"
              @click="viewCampaign(campaign.id)"
            >
              <td class="px-6 py-4">
                <div class="flex items-center">
                  <div>
                    <div class="text-sm font-medium text-gray-900">{{ campaign.name }}</div>
                    <div class="text-sm text-gray-500">{{ campaign.description || 'No description' }}</div>
                  </div>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span
                  :class="[
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                    getStatusClass(campaign.status)
                  ]"
                >
                  {{ campaign.status }}
                </span>
              </td>
              <td class="px-6 py-4">
                <div class="w-full">
                  <div class="flex items-center justify-between text-xs text-gray-600 mb-1">
                    <span>{{ getCompletionRate(campaign) }}%</span>
                    <span>{{ parseInt(campaign.completed_contacts) + parseInt(campaign.failed_contacts) }} / {{ campaign.total_contacts }}</span>
                  </div>
                  <div class="w-full bg-gray-200 rounded-full h-2">
                    <div
                      class="bg-indigo-600 h-2 rounded-full transition-all"
                      :style="{ width: getCompletionRate(campaign) + '%' }"
                    ></div>
                  </div>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">{{ campaign.total_contacts }} total</div>
                <div class="text-xs text-gray-500">
                  {{ campaign.pending_contacts }} pending
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ formatDate(campaign.created_at) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex items-center justify-end space-x-2" @click.stop>
                  <button
                    v-if="campaign.status === 'draft' || campaign.status === 'paused'"
                    @click="startCampaign(campaign.id)"
                    class="text-green-600 hover:text-green-900"
                    title="Start campaign"
                  >
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  <button
                    v-if="campaign.status === 'running'"
                    @click="pauseCampaign(campaign.id)"
                    class="text-yellow-600 hover:text-yellow-900"
                    title="Pause campaign"
                  >
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  <button
                    @click="viewCampaign(campaign.id)"
                    class="text-indigo-600 hover:text-indigo-900"
                    title="View details"
                  >
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                  <button
                    @click="deleteCampaign(campaign.id)"
                    class="text-red-600 hover:text-red-900"
                    title="Delete campaign"
                  >
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="bg-gray-50 px-4 py-3 border-t flex items-center justify-between">
          <div class="flex-1 flex justify-between sm:hidden">
            <button
              @click="changePage(currentPage - 1)"
              :disabled="currentPage === 1"
              class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              @click="changePage(currentPage + 1)"
              :disabled="currentPage === totalPages"
              class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
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
                  @click="changePage(currentPage - 1)"
                  :disabled="currentPage === 1"
                  class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span class="sr-only">Previous</span>
                  <svg style="width: 20px; height: 20px; min-width: 20px; min-height: 20px; max-width: 20px; max-height: 20px;" class="" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </button>
                <button
                  @click="changePage(currentPage + 1)"
                  :disabled="currentPage === totalPages"
                  class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span class="sr-only">Next</span>
                  <svg style="width: 20px; height: 20px; min-width: 20px; min-height: 20px; max-width: 20px; max-height: 20px;" class="" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Campaign Wizard Modal -->
    <CampaignWizard
      v-if="showCreateWizard"
      @close="showCreateWizard = false"
      @created="onCampaignCreated"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import CampaignWizard from '../components/CampaignWizard.vue';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const router = useRouter();

// State
const loading = ref(false);
const campaigns = ref([]);
const selectedStatus = ref('all');
const currentPage = ref(1);
const totalPages = ref(1);
const showCreateWizard = ref(false);

const statusTabs = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Running', value: 'running' },
  { label: 'Paused', value: 'paused' },
  { label: 'Completed', value: 'completed' }
];

// Get auth token
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = '/login';
}

// Load campaigns
async function loadCampaigns() {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      limit: 20
    };

    if (selectedStatus.value !== 'all') {
      params.status = selectedStatus.value;
    }

    const response = await axios.get(`${API_URL}/v1/campaigns`, {
      params,
      headers: { 'Authorization': `Bearer ${token}` }
    });

    campaigns.value = response.data.campaigns;
    totalPages.value = Math.ceil(response.data.total / response.data.limit);
  } catch (error) {
    console.error('Error loading campaigns:', error);
    alert('Failed to load campaigns');
  } finally {
    loading.value = false;
  }
}

// Get campaign count by status
function getCampaignCountByStatus(status) {
  if (status === 'all') return campaigns.value.length;
  return campaigns.value.filter(c => c.status === status).length;
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

// Get completion rate
function getCompletionRate(campaign) {
  const total = parseInt(campaign.total_contacts);
  if (total === 0) return 0;
  const completed = parseInt(campaign.completed_contacts) + parseInt(campaign.failed_contacts);
  return Math.round((completed / total) * 100);
}

// Format date
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Change page
function changePage(page) {
  if (page < 1 || page > totalPages.value) return;
  currentPage.value = page;
  loadCampaigns();
}

// View campaign
function viewCampaign(id) {
  router.push(`/dashboard/campaigns/${id}`);
}

// Start campaign
async function startCampaign(id) {
  if (!confirm('Are you sure you want to start this campaign?')) return;

  try {
    await axios.post(
      `${API_URL}/v1/campaigns/${id}/start`,
      {},
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    await loadCampaigns();
    alert('Campaign started successfully!');
  } catch (error) {
    console.error('Error starting campaign:', error);
    alert('Failed to start campaign');
  }
}

// Pause campaign
async function pauseCampaign(id) {
  if (!confirm('Are you sure you want to pause this campaign?')) return;

  try {
    await axios.post(
      `${API_URL}/v1/campaigns/${id}/pause`,
      {},
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    await loadCampaigns();
    alert('Campaign paused successfully!');
  } catch (error) {
    console.error('Error pausing campaign:', error);
    alert('Failed to pause campaign');
  }
}

// Delete campaign
async function deleteCampaign(id) {
  if (!confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) return;

  try {
    await axios.delete(`${API_URL}/v1/campaigns/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    await loadCampaigns();
    alert('Campaign deleted successfully!');
  } catch (error) {
    console.error('Error deleting campaign:', error);
    alert('Failed to delete campaign');
  }
}

// On campaign created
function onCampaignCreated(campaign) {
  showCreateWizard.value = false;
  loadCampaigns();
  router.push(`/dashboard/campaigns/${campaign.id}`);
}

// Lifecycle
onMounted(() => {
  loadCampaigns();
});
</script>
