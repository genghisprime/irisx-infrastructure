<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">IVR Flow Builder</h1>
        <p class="text-gray-500">Create and manage interactive voice response flows</p>
      </div>
      <div class="flex items-center gap-3">
        <button @click="showTemplates = true" class="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2">
          <DocumentDuplicateIcon class="h-5 w-5" />
          From Template
        </button>
        <router-link to="/ivr/new" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
          <PlusIcon class="h-5 w-5" />
          New Flow
        </router-link>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex items-center gap-4 mb-6">
      <div class="flex-1">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search flows..."
          class="w-full max-w-md px-4 py-2 border rounded-lg"
        />
      </div>
      <select v-model="statusFilter" class="px-4 py-2 border rounded-lg">
        <option value="">All Status</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>
    </div>

    <!-- Flows Grid -->
    <div v-if="loading" class="text-center py-12">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
      <p class="mt-2 text-gray-500">Loading flows...</p>
    </div>

    <div v-else-if="filteredFlows.length === 0" class="text-center py-12 bg-gray-50 rounded-xl">
      <RectangleGroupIcon class="h-12 w-12 text-gray-400 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-gray-900 mb-2">No IVR flows yet</h3>
      <p class="text-gray-500 mb-4">Create your first IVR flow to get started</p>
      <router-link to="/ivr/new" class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        <PlusIcon class="h-5 w-5" />
        Create Flow
      </router-link>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="flow in filteredFlows"
        :key="flow.id"
        class="bg-white border rounded-xl shadow-sm hover:shadow-md transition-shadow"
      >
        <div class="p-5">
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-3">
              <div :class="['p-2 rounded-lg', getStatusBg(flow.status)]">
                <PhoneIcon :class="['h-5 w-5', getStatusColor(flow.status)]" />
              </div>
              <div>
                <h3 class="font-semibold text-gray-900">{{ flow.name }}</h3>
                <p class="text-sm text-gray-500">{{ flow.description || 'No description' }}</p>
              </div>
            </div>
            <div class="relative">
              <button @click="toggleMenu(flow.id)" class="p-1 hover:bg-gray-100 rounded">
                <EllipsisVerticalIcon class="h-5 w-5 text-gray-400" />
              </button>
              <div v-if="openMenu === flow.id" class="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg z-10">
                <router-link :to="`/ivr/${flow.id}`" class="block px-4 py-2 text-sm hover:bg-gray-50">
                  Edit Flow
                </router-link>
                <button @click="duplicateFlow(flow)" class="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
                  Duplicate
                </button>
                <button @click="viewAnalytics(flow)" class="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
                  View Analytics
                </button>
                <hr class="my-1" />
                <button @click="deleteFlow(flow)" class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                  Delete
                </button>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-4 text-sm text-gray-500 mb-4">
            <span class="flex items-center gap-1">
              <CubeIcon class="h-4 w-4" />
              {{ flow.node_count || 0 }} nodes
            </span>
            <span>{{ formatDate(flow.updated_at) }}</span>
          </div>

          <div class="flex items-center justify-between">
            <span :class="['px-2 py-1 rounded-full text-xs font-medium', getStatusBadge(flow.status)]">
              {{ flow.status }}
            </span>
            <router-link
              :to="`/ivr/${flow.id}`"
              class="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Open Editor
            </router-link>
          </div>
        </div>

        <!-- Stats Footer -->
        <div v-if="flow.stats" class="border-t px-5 py-3 bg-gray-50 rounded-b-xl">
          <div class="grid grid-cols-3 gap-4 text-center">
            <div>
              <p class="text-lg font-semibold text-gray-900">{{ flow.stats.total_calls || 0 }}</p>
              <p class="text-xs text-gray-500">Total Calls</p>
            </div>
            <div>
              <p class="text-lg font-semibold text-gray-900">{{ flow.stats.completion_rate || 0 }}%</p>
              <p class="text-xs text-gray-500">Completion</p>
            </div>
            <div>
              <p class="text-lg font-semibold text-gray-900">{{ formatDuration(flow.stats.avg_duration) }}</p>
              <p class="text-xs text-gray-500">Avg Duration</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Templates Modal -->
    <div v-if="showTemplates" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl">
        <div class="p-4 border-b flex items-center justify-between">
          <h3 class="font-semibold text-lg">Choose a Template</h3>
          <button @click="showTemplates = false" class="text-gray-500 hover:text-gray-700">
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>
        <div class="p-4 grid grid-cols-2 gap-4 max-h-96 overflow-y-auto">
          <div
            v-for="template in templates"
            :key="template.id"
            @click="createFromTemplate(template)"
            class="p-4 border rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div class="flex items-center gap-3 mb-2">
              <div class="p-2 bg-blue-100 rounded-lg">
                <RectangleGroupIcon class="h-5 w-5 text-blue-600" />
              </div>
              <h4 class="font-medium">{{ template.name }}</h4>
            </div>
            <p class="text-sm text-gray-500 mb-3">{{ template.description }}</p>
            <div class="flex items-center gap-2 text-xs text-gray-400">
              <span class="px-2 py-1 bg-gray-100 rounded">{{ template.category }}</span>
              <span>{{ template.node_count }} nodes</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Analytics Modal -->
    <div v-if="showAnalytics" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-4xl">
        <div class="p-4 border-b flex items-center justify-between">
          <h3 class="font-semibold text-lg">Flow Analytics: {{ selectedFlow?.name }}</h3>
          <button @click="showAnalytics = false" class="text-gray-500 hover:text-gray-700">
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>
        <div class="p-6">
          <div class="grid grid-cols-4 gap-6 mb-6">
            <div class="bg-blue-50 rounded-lg p-4">
              <p class="text-sm text-blue-600 mb-1">Total Executions</p>
              <p class="text-2xl font-bold text-blue-900">{{ analytics.total_executions || 0 }}</p>
            </div>
            <div class="bg-green-50 rounded-lg p-4">
              <p class="text-sm text-green-600 mb-1">Completed</p>
              <p class="text-2xl font-bold text-green-900">{{ analytics.completed || 0 }}</p>
            </div>
            <div class="bg-yellow-50 rounded-lg p-4">
              <p class="text-sm text-yellow-600 mb-1">Avg Duration</p>
              <p class="text-2xl font-bold text-yellow-900">{{ formatDuration(analytics.avg_duration) }}</p>
            </div>
            <div class="bg-purple-50 rounded-lg p-4">
              <p class="text-sm text-purple-600 mb-1">Completion Rate</p>
              <p class="text-2xl font-bold text-purple-900">{{ analytics.completion_rate || 0 }}%</p>
            </div>
          </div>

          <h4 class="font-medium mb-3">Node Analytics</h4>
          <div class="border rounded-lg overflow-hidden">
            <table class="w-full">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-2 text-left text-sm font-medium text-gray-500">Node</th>
                  <th class="px-4 py-2 text-left text-sm font-medium text-gray-500">Type</th>
                  <th class="px-4 py-2 text-right text-sm font-medium text-gray-500">Visits</th>
                  <th class="px-4 py-2 text-right text-sm font-medium text-gray-500">Avg Time</th>
                  <th class="px-4 py-2 text-right text-sm font-medium text-gray-500">Exit Rate</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="node in analytics.node_stats" :key="node.node_id" class="border-t">
                  <td class="px-4 py-2">{{ node.label }}</td>
                  <td class="px-4 py-2 capitalize">{{ node.node_type }}</td>
                  <td class="px-4 py-2 text-right">{{ node.visit_count }}</td>
                  <td class="px-4 py-2 text-right">{{ node.avg_time }}s</td>
                  <td class="px-4 py-2 text-right">{{ node.exit_rate }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import api from '../services/api'

// Icon Components
const PlusIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M12 4.5v15m7.5-7.5h-15' })]) }
const DocumentDuplicateIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75' })]) }
const PhoneIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z' })]) }
const EllipsisVerticalIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z' })]) }
const CubeIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'm21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9' })]) }
const RectangleGroupIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z' })]) }
const XMarkIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M6 18L18 6M6 6l12 12' })]) }

const router = useRouter()

// State
const flows = ref([])
const templates = ref([])
const loading = ref(true)
const searchQuery = ref('')
const statusFilter = ref('')
const openMenu = ref(null)
const showTemplates = ref(false)
const showAnalytics = ref(false)
const selectedFlow = ref(null)
const analytics = ref({})

// Computed
const filteredFlows = computed(() => {
  return flows.value.filter(flow => {
    const matchesSearch = !searchQuery.value ||
      flow.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      (flow.description || '').toLowerCase().includes(searchQuery.value.toLowerCase())
    const matchesStatus = !statusFilter.value || flow.status === statusFilter.value
    return matchesSearch && matchesStatus
  })
})

// Lifecycle
onMounted(async () => {
  await loadFlows()
  await loadTemplates()
})

// Methods
async function loadFlows() {
  loading.value = true
  try {
    const { data } = await api.get('/ivr/flows')
    flows.value = data.flows || []
  } catch (error) {
    console.error('Failed to load flows:', error)
  } finally {
    loading.value = false
  }
}

async function loadTemplates() {
  try {
    const { data } = await api.get('/ivr/templates')
    templates.value = data.templates || []
  } catch (error) {
    console.error('Failed to load templates:', error)
  }
}

function toggleMenu(flowId) {
  openMenu.value = openMenu.value === flowId ? null : flowId
}

async function duplicateFlow(flow) {
  try {
    const { data } = await api.post(`/ivr/flows/${flow.id}/duplicate`)
    flows.value.unshift(data.flow)
    openMenu.value = null
  } catch (error) {
    console.error('Failed to duplicate flow:', error)
  }
}

async function deleteFlow(flow) {
  if (!confirm(`Delete "${flow.name}"? This cannot be undone.`)) return
  try {
    await api.delete(`/ivr/flows/${flow.id}`)
    flows.value = flows.value.filter(f => f.id !== flow.id)
    openMenu.value = null
  } catch (error) {
    console.error('Failed to delete flow:', error)
  }
}

async function viewAnalytics(flow) {
  selectedFlow.value = flow
  try {
    const { data } = await api.get(`/ivr/flows/${flow.id}/analytics`)
    analytics.value = data.analytics || {}
    showAnalytics.value = true
    openMenu.value = null
  } catch (error) {
    console.error('Failed to load analytics:', error)
  }
}

async function createFromTemplate(template) {
  try {
    const { data } = await api.post(`/ivr/flows/from-template/${template.id}`)
    router.push(`/ivr/${data.flow.id}`)
  } catch (error) {
    console.error('Failed to create from template:', error)
  }
}

function getStatusBg(status) {
  const colors = {
    draft: 'bg-yellow-100',
    published: 'bg-green-100',
    archived: 'bg-gray-100'
  }
  return colors[status] || 'bg-gray-100'
}

function getStatusColor(status) {
  const colors = {
    draft: 'text-yellow-600',
    published: 'text-green-600',
    archived: 'text-gray-600'
  }
  return colors[status] || 'text-gray-600'
}

function getStatusBadge(status) {
  const colors = {
    draft: 'bg-yellow-100 text-yellow-800',
    published: 'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-800'
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

function formatDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDuration(seconds) {
  if (!seconds) return '0s'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}
</script>
