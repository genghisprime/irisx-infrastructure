<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-gray-900">Campaign Monitoring</h1>
      <div class="flex space-x-2">
        <select v-model="filterStatus" class="px-4 py-2 border border-gray-300 rounded-lg">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </select>
      </div>
    </div>

    <!-- Stats Overview -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-sm text-gray-600 mb-1">Active Campaigns</div>
        <div class="text-3xl font-bold text-green-600">{{ stats.active }}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-sm text-gray-600 mb-1">Total Contacts Today</div>
        <div class="text-3xl font-bold text-blue-600">{{ formatNumber(stats.contacts_today) }}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-sm text-gray-600 mb-1">Compliance Issues</div>
        <div class="text-3xl font-bold text-red-600">{{ stats.compliance_issues }}</div>
      </div>
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-sm text-gray-600 mb-1">Avg Response Rate</div>
        <div class="text-3xl font-bold text-gray-900">{{ stats.avg_response_rate }}%</div>
      </div>
    </div>

    <!-- Compliance Alerts -->
    <div v-if="complianceAlerts.length > 0" class="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
          </svg>
        </div>
        <div class="ml-3">
          <h3 class="text-sm font-medium text-red-800">Compliance Alerts</h3>
          <div class="mt-2 text-sm text-red-700 space-y-1">
            <div v-for="alert in complianceAlerts" :key="alert.id">
              • {{ alert.message }} - <RouterLink :to="`/dashboard/campaigns/${alert.campaign_id}`" class="underline">View Campaign</RouterLink>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="text-center py-12">
      <div class="text-gray-500">Loading campaigns...</div>
    </div>

    <div v-else class="bg-white rounded-lg shadow">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Campaign</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contacts</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Response Rate</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Compliance</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="campaign in filteredCampaigns" :key="campaign.id" class="hover:bg-gray-50">
              <td class="px-6 py-4">
                <div class="text-sm font-medium text-gray-900">{{ campaign.name }}</div>
                <div class="text-xs text-gray-500">Started: {{ formatDate(campaign.started_at) }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <RouterLink :to="`/dashboard/tenants/${campaign.tenant_id}`" class="text-sm text-blue-600 hover:underline">
                  {{ campaign.tenant_name }}
                </RouterLink>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-sm text-gray-900">{{ campaign.type }}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">{{ formatNumber(campaign.contacts_reached) }} / {{ formatNumber(campaign.total_contacts) }}</div>
                <div class="w-full bg-gray-200 rounded-full h-2 mt-1">
                  <div class="bg-blue-600 h-2 rounded-full" :style="{width: campaign.progress + '%'}"></div>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium" :class="campaign.response_rate > 10 ? 'text-green-600' : 'text-gray-900'">
                  {{ campaign.response_rate }}%
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="[
                  'px-2 py-1 text-xs font-medium rounded-full',
                  campaign.compliance_status === 'compliant' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                ]">
                  {{ campaign.compliance_status }}
                </span>
                <div v-if="campaign.compliance_issues" class="text-xs text-red-600 mt-1">
                  {{ campaign.compliance_issues }}
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="[
                  'px-2 py-1 text-xs font-medium rounded-full',
                  campaign.status === 'active' ? 'bg-green-100 text-green-800' :
                  campaign.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                ]">
                  {{ campaign.status }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                <button v-if="campaign.status === 'active'" @click="pauseCampaign(campaign.id)" class="text-yellow-600 hover:text-yellow-800">
                  Pause
                </button>
                <button v-if="campaign.status === 'paused'" @click="resumeCampaign(campaign.id)" class="text-green-600 hover:text-green-800">
                  Resume
                </button>
                <button @click="stopCampaign(campaign.id)" class="text-red-600 hover:text-red-800">
                  Stop
                </button>
                <button @click="viewDetails(campaign)" class="text-blue-600 hover:text-blue-800">
                  Details
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { adminAPI } from '../../../utils/api'

const loading = ref(true)
const filterStatus = ref('')
const campaigns = ref([])
const complianceAlerts = ref([])

const stats = ref({
  active: 0,
  contacts_today: 0,
  compliance_issues: 0,
  avg_response_rate: 0
})

const filteredCampaigns = computed(() => {
  if (!filterStatus.value) return campaigns.value
  return campaigns.value.filter(c => c.status === filterStatus.value)
})

async function fetchCampaigns() {
  loading.value = true
  try {
    const response = await adminAPI.campaigns.list()
    campaigns.value = response.data
    calculateStats()
  } catch (err) {
    console.error('Failed to fetch campaigns:', err)
    // Mock data
    campaigns.value = [
      {
        id: 1,
        name: 'Summer Promotion 2025',
        tenant_id: 7,
        tenant_name: 'Demo Corp',
        type: 'SMS',
        total_contacts: 10000,
        contacts_reached: 7500,
        progress: 75,
        response_rate: 12.5,
        compliance_status: 'compliant',
        status: 'active',
        started_at: '2025-11-01T10:00:00Z'
      },
      {
        id: 2,
        name: 'Customer Survey',
        tenant_id: 7,
        tenant_name: 'Demo Corp',
        type: 'Email',
        total_contacts: 5000,
        contacts_reached: 5000,
        progress: 100,
        response_rate: 8.3,
        compliance_status: 'compliant',
        status: 'completed',
        started_at: '2025-10-25T09:00:00Z'
      },
      {
        id: 3,
        name: 'Product Launch',
        tenant_id: 8,
        tenant_name: 'TechStart Inc',
        type: 'Voice',
        total_contacts: 2500,
        contacts_reached: 500,
        progress: 20,
        response_rate: 5.2,
        compliance_status: 'violation',
        compliance_issues: 'High opt-out rate detected',
        status: 'paused',
        started_at: '2025-11-05T14:00:00Z'
      }
    ]
    complianceAlerts.value = [
      { id: 1, campaign_id: 3, message: 'Campaign "Product Launch" has high opt-out rate (15%) - Possible TCPA violation' }
    ]
    calculateStats()
  } finally {
    loading.value = false
  }
}

function calculateStats() {
  stats.value.active = campaigns.value.filter(c => c.status === 'active').length
  stats.value.contacts_today = campaigns.value.reduce((sum, c) => sum + (c.status === 'active' ? c.contacts_reached : 0), 0)
  stats.value.compliance_issues = campaigns.value.filter(c => c.compliance_status === 'violation').length
  const avgRate = campaigns.value.reduce((sum, c) => sum + c.response_rate, 0) / campaigns.value.length
  stats.value.avg_response_rate = avgRate.toFixed(1)
}

async function pauseCampaign(id) {
  try {
    await adminAPI.campaigns.pause(id)
    await fetchCampaigns()
  } catch (err) {
    alert('Failed to pause campaign')
  }
}

async function resumeCampaign(id) {
  try {
    await adminAPI.campaigns.resume(id)
    await fetchCampaigns()
  } catch (err) {
    alert('Failed to resume campaign')
  }
}

async function stopCampaign(id) {
  if (!confirm('Are you sure you want to stop this campaign? This cannot be undone.')) return
  try {
    await adminAPI.campaigns.stop(id)
    await fetchCampaigns()
  } catch (err) {
    alert('Failed to stop campaign')
  }
}

function viewDetails(campaign) {
  // Navigate to campaign details
  alert(`Campaign details for: ${campaign.name}`)
}

function formatNumber(num) {
  return num.toLocaleString()
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString()
}

onMounted(() => {
  fetchCampaigns()
})
</script>
