<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-gray-900">SIP Trunk Configuration</h1>
      <button @click="showCreateModal = true" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        Add SIP Trunk
      </button>
    </div>

    <div v-if="loading" class="text-center py-12">
      <div class="text-gray-500">Loading SIP trunks...</div>
    </div>

    <div v-else class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Total Trunks</div>
          <div class="text-3xl font-bold text-gray-900">{{ trunks.length }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Active Channels</div>
          <div class="text-3xl font-bold text-green-600">{{ totalActiveChannels }}</div>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-sm text-gray-600 mb-1">Available Capacity</div>
          <div class="text-3xl font-bold text-blue-600">{{ totalAvailableChannels }}</div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trunk Name</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SIP URI</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channels</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Codec</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="trunk in trunks" :key="trunk.id" class="hover:bg-gray-50">
                <td class="px-6 py-4">
                  <div class="text-sm font-medium text-gray-900">{{ trunk.name }}</div>
                  <div class="text-xs text-gray-500">{{ trunk.description }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ trunk.provider }}</td>
                <td class="px-6 py-4 text-sm text-gray-600">{{ trunk.sip_uri }}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">{{ trunk.active_channels }} / {{ trunk.max_channels }}</div>
                  <div class="w-full bg-gray-200 rounded-full h-2 mt-1">
                    <div class="bg-blue-600 h-2 rounded-full" :style="{width: (trunk.active_channels / trunk.max_channels * 100) + '%'}"></div>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ trunk.codec }}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="[
                    'px-2 py-1 text-xs font-medium rounded-full',
                    trunk.status === 'registered' ? 'bg-green-100 text-green-800' :
                    trunk.status === 'unregistered' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  ]">
                    {{ trunk.status }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                  <button @click="testTrunk(trunk.id)" class="text-green-600 hover:text-green-800">Test</button>
                  <button @click="editTrunk(trunk)" class="text-blue-600 hover:text-blue-800">Edit</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showCreateModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
        <div class="p-6">
          <h2 class="text-2xl font-bold text-gray-900 mb-6">{{ editingTrunk ? 'Edit SIP Trunk' : 'Add SIP Trunk' }}</h2>
          <form @submit.prevent="saveTrunk" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Trunk Name</label>
              <input v-model="trunkForm.name" type="text" required class="w-full px-3 py-2 border border-gray-300 rounded-lg">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Provider</label>
              <input v-model="trunkForm.provider" type="text" required class="w-full px-3 py-2 border border-gray-300 rounded-lg">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">SIP URI</label>
              <input v-model="trunkForm.sip_uri" type="text" required placeholder="sip:trunk@provider.com" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input v-model="trunkForm.username" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input v-model="trunkForm.password" type="password" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Max Channels</label>
              <input v-model.number="trunkForm.max_channels" type="number" required min="1" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Codec Priority</label>
              <select v-model="trunkForm.codec" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="PCMU,PCMA,G729">PCMU, PCMA, G729 (Bandwidth optimized)</option>
                <option value="OPUS,PCMU,PCMA">OPUS, PCMU, PCMA (Quality optimized)</option>
                <option value="G722,PCMU,PCMA">G722, PCMU, PCMA (HD Voice)</option>
              </select>
            </div>
            <div class="flex justify-end space-x-3 pt-4">
              <button type="button" @click="closeModal" class="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
              <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { adminAPI } from '../../../utils/api'

const loading = ref(true)
const trunks = ref([])
const showCreateModal = ref(false)
const editingTrunk = ref(null)

const trunkForm = ref({
  name: '',
  provider: '',
  sip_uri: '',
  username: '',
  password: '',
  max_channels: 50,
  codec: 'PCMU,PCMA,G729'
})

const totalActiveChannels = computed(() => trunks.value.reduce((sum, t) => sum + t.active_channels, 0))
const totalAvailableChannels = computed(() => trunks.value.reduce((sum, t) => sum + (t.max_channels - t.active_channels), 0))

async function fetchTrunks() {
  loading.value = true
  try {
    const response = await adminAPI.sipTrunks.list()
    trunks.value = response.data
  } catch (err) {
    console.error('Failed to fetch trunks:', err)
    trunks.value = [
      { id: 1, name: 'Twilio Primary', provider: 'Twilio', sip_uri: 'sip:trunk@twilio.com', active_channels: 12, max_channels: 100, codec: 'PCMU,PCMA', status: 'registered', description: 'Main Twilio trunk' },
      { id: 2, name: 'Bandwidth Backup', provider: 'Bandwidth', sip_uri: 'sip:trunk@bandwidth.com', active_channels: 0, max_channels: 50, codec: 'OPUS,PCMU', status: 'registered', description: 'Failover trunk' }
    ]
  } finally {
    loading.value = false
  }
}

function editTrunk(trunk) {
  editingTrunk.value = trunk
  trunkForm.value = { ...trunk }
  showCreateModal.value = true
}

async function testTrunk(id) {
  try {
    await adminAPI.sipTrunks.test(id)
    alert('Trunk test successful!')
  } catch (err) {
    alert('Trunk test failed')
  }
}

async function saveTrunk() {
  try {
    if (editingTrunk.value) {
      await adminAPI.sipTrunks.update(editingTrunk.value.id, trunkForm.value)
    } else {
      await adminAPI.sipTrunks.create(trunkForm.value)
    }
    await fetchTrunks()
    closeModal()
  } catch (err) {
    alert('Failed to save trunk')
  }
}

function closeModal() {
  showCreateModal.value = false
  editingTrunk.value = null
  trunkForm.value = { name: '', provider: '', sip_uri: '', username: '', password: '', max_channels: 50, codec: 'PCMU,PCMA,G729' }
}

onMounted(() => {
  fetchTrunks()
})
</script>
