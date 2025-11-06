<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Campaign Management</h1>
        <p class="text-sm text-gray-600 mt-1">Create and manage outbound calling campaigns</p>
      </div>
      <button
        @click="showCreateModal = true"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        + Create Campaign
      </button>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600 mb-2">Total Campaigns</p>
        <p class="text-2xl font-bold text-gray-900">{{ campaigns.length }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600 mb-2">Running</p>
        <p class="text-2xl font-bold text-green-600">
          {{ campaigns.filter(c => c.status === 'running').length }}
        </p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600 mb-2">Total Contacts</p>
        <p class="text-2xl font-bold text-gray-900">
          {{ campaigns.reduce((sum, c) => sum + (c.total_contacts || 0), 0) }}
        </p>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <p class="text-sm text-gray-600 mb-2">Completed Calls</p>
        <p class="text-2xl font-bold text-blue-600">
          {{ campaigns.reduce((sum, c) => sum + (c.completed_contacts || 0), 0) }}
        </p>
      </div>
    </div>

    <!-- Loading/Error -->
    <div v-if="loading" class="flex justify-center py-12">
      <svg class="h-6 w-6 animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <!-- Campaigns List -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Campaign</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contacts</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="campaign in campaigns" :key="campaign.id" class="hover:bg-gray-50">
            <td class="px-6 py-4">
              <p class="text-sm font-medium text-gray-900">{{ campaign.name }}</p>
              <p class="text-xs text-gray-500">{{ campaign.description }}</p>
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">
              {{ campaign.total_contacts || 0 }}
            </td>
            <td class="px-6 py-4">
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div
                  class="bg-blue-600 h-2 rounded-full"
                  :style="{ width: getProgress(campaign) + '%' }"
                ></div>
              </div>
              <p class="text-xs text-gray-600 mt-1">
                {{ campaign.completed_contacts || 0 }} / {{ campaign.total_contacts || 0 }}
              </p>
            </td>
            <td class="px-6 py-4">
              <span class="px-2 py-1 text-xs font-medium rounded-full" :class="getStatusClass(campaign.status)">
                {{ campaign.status }}
              </span>
            </td>
            <td class="px-6 py-4 text-right text-sm space-x-2">
              <button @click="viewCampaign(campaign)" class="text-blue-600 hover:text-blue-800">
                View
              </button>
              <button
                v-if="campaign.status === 'draft'"
                @click="startCampaign(campaign)"
                class="text-green-600 hover:text-green-800"
              >
                Start
              </button>
              <button
                v-if="campaign.status === 'running'"
                @click="pauseCampaign(campaign)"
                class="text-yellow-600 hover:text-yellow-800"
              >
                Pause
              </button>
              <button @click="deleteCampaign(campaign)" class="text-red-600 hover:text-red-800">
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="campaigns.length === 0" class="text-center py-12">
        <p class="text-gray-500 mb-4">No campaigns yet</p>
        <button @click="showCreateModal = true" class="px-4 py-2 bg-blue-600 text-white rounded-md">
          Create First Campaign
        </button>
      </div>
    </div>

    <!-- Create Campaign Modal -->
    <div v-if="showCreateModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" @click="showCreateModal = false">
      <div class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Create Campaign</h3>
        <form @submit.prevent="handleCreateCampaign" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Campaign Name</label>
              <input v-model="campaignForm.name" type="text" required class="w-full px-3 py-2 border rounded-md" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Caller ID</label>
              <input v-model="campaignForm.caller_id" type="tel" required class="w-full px-3 py-2 border rounded-md" placeholder="+15551234567" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea v-model="campaignForm.description" rows="2" class="w-full px-3 py-2 border rounded-md"></textarea>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Max Concurrent Calls</label>
              <input v-model.number="campaignForm.max_concurrent_calls" type="number" min="1" max="100" class="w-full px-3 py-2 border rounded-md" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Max Retries</label>
              <input v-model.number="campaignForm.max_retries" type="number" min="0" max="10" class="w-full px-3 py-2 border rounded-md" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Upload Contacts (CSV)</label>
            <input type="file" @change="handleFileUpload" accept=".csv" class="w-full px-3 py-2 border rounded-md" />
            <p class="text-xs text-gray-500 mt-1">CSV format: phone_number,first_name,last_name</p>
          </div>

          <div class="flex justify-end space-x-3 pt-4 border-t">
            <button type="button" @click="showCreateModal = false" class="px-4 py-2 border rounded-md">
              Cancel
            </button>
            <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
              Create Campaign
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- View Campaign Modal -->
    <div v-if="viewingCampaign" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" @click="viewingCampaign = null">
      <div class="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto" @click.stop>
        <h3 class="text-lg font-semibold mb-4">{{ viewingCampaign.name }}</h3>

        <!-- Stats Grid -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div class="bg-gray-50 p-4 rounded">
            <p class="text-xs text-gray-600">Pending</p>
            <p class="text-xl font-bold text-gray-900">{{ viewingCampaign.pending_contacts || 0 }}</p>
          </div>
          <div class="bg-blue-50 p-4 rounded">
            <p class="text-xs text-gray-600">Called</p>
            <p class="text-xl font-bold text-blue-600">{{ viewingCampaign.called_contacts || 0 }}</p>
          </div>
          <div class="bg-green-50 p-4 rounded">
            <p class="text-xs text-gray-600">Completed</p>
            <p class="text-xl font-bold text-green-600">{{ viewingCampaign.completed_contacts || 0 }}</p>
          </div>
          <div class="bg-red-50 p-4 rounded">
            <p class="text-xs text-gray-600">Failed</p>
            <p class="text-xl font-bold text-red-600">{{ viewingCampaign.failed_contacts || 0 }}</p>
          </div>
          <div class="bg-purple-50 p-4 rounded">
            <p class="text-xs text-gray-600">Avg Duration</p>
            <p class="text-xl font-bold text-purple-600">{{ formatDuration(viewingCampaign.avg_call_duration) }}</p>
          </div>
        </div>

        <div class="flex justify-end">
          <button @click="viewingCampaign = null" class="px-4 py-2 bg-gray-600 text-white rounded-md">
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiClient } from '../utils/api'

const loading = ref(true)
const campaigns = ref([])
const showCreateModal = ref(false)
const viewingCampaign = ref(null)
const contactsFile = ref(null)

const campaignForm = ref({
  name: '',
  description: '',
  caller_id: '',
  max_concurrent_calls: 5,
  max_retries: 3
})

onMounted(() => {
  fetchCampaigns()
})

async function fetchCampaigns() {
  loading.value = true
  try {
    const response = await apiClient.get('/v1/campaigns')
    campaigns.value = response.data.campaigns || []
  } catch (error) {
    console.error('Failed to fetch campaigns:', error)
  } finally {
    loading.value = false
  }
}

function handleFileUpload(event) {
  contactsFile.value = event.target.files[0]
}

async function handleCreateCampaign() {
  try {
    // Create campaign
    const response = await apiClient.post('/v1/campaigns', campaignForm.value)
    const campaign = response.data.campaign

    // Upload contacts if file provided
    if (contactsFile.value) {
      const contacts = await parseCSV(contactsFile.value)
      await apiClient.post(`/v1/campaigns/${campaign.id}/contacts`, { contacts })
    }

    showCreateModal.value = false
    campaignForm.value = { name: '', description: '', caller_id: '', max_concurrent_calls: 5, max_retries: 3 }
    contactsFile.value = null
    await fetchCampaigns()
  } catch (error) {
    console.error('Failed to create campaign:', error)
    alert('Failed to create campaign')
  }
}

async function parseCSV(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const lines = e.target.result.split('\n').slice(1) // Skip header
      const contacts = lines
        .filter(line => line.trim())
        .map(line => {
          const [phone_number, first_name, last_name] = line.split(',')
          return { phone_number: phone_number.trim(), first_name: first_name?.trim(), last_name: last_name?.trim() }
        })
      resolve(contacts)
    }
    reader.readAsText(file)
  })
}

async function startCampaign(campaign) {
  if (!confirm(`Start campaign "${campaign.name}"?`)) return
  try {
    await apiClient.post(`/v1/campaigns/${campaign.id}/start`)
    await fetchCampaigns()
  } catch (error) {
    alert('Failed to start campaign')
  }
}

async function pauseCampaign(campaign) {
  try {
    await apiClient.post(`/v1/campaigns/${campaign.id}/pause`)
    await fetchCampaigns()
  } catch (error) {
    alert('Failed to pause campaign')
  }
}

async function deleteCampaign(campaign) {
  if (!confirm(`Delete campaign "${campaign.name}"?`)) return
  try {
    await apiClient.delete(`/v1/campaigns/${campaign.id}`)
    await fetchCampaigns()
  } catch (error) {
    alert('Failed to delete campaign')
  }
}

async function viewCampaign(campaign) {
  try {
    const response = await apiClient.get(`/v1/campaigns/${campaign.id}`)
    viewingCampaign.value = response.data.campaign
  } catch (error) {
    alert('Failed to load campaign details')
  }
}

function getProgress(campaign) {
  if (!campaign.total_contacts) return 0
  return Math.round(((campaign.completed_contacts || 0) / campaign.total_contacts) * 100)
}

function getStatusClass(status) {
  const classes = {
    draft: 'bg-gray-100 text-gray-800',
    scheduled: 'bg-blue-100 text-blue-800',
    running: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-purple-100 text-purple-800',
    cancelled: 'bg-red-100 text-red-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

function formatDuration(seconds) {
  if (!seconds) return '0s'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}
</script>
