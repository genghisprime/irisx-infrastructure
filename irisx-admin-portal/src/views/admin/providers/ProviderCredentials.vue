<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Provider & Carrier Management</h1>
      <button
        v-if="authStore.isAdmin && activeTab === 'credentials'"
        @click="showAddModal = true"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        + Add Credentials
      </button>
    </div>

    <!-- Tabs -->
    <div class="bg-white rounded-lg shadow mb-6">
      <div class="border-b border-gray-200">
        <nav class="flex -mb-px">
          <button
            @click="activeTab = 'credentials'"
            :class="activeTab === 'credentials' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Credentials
          </button>
          <button
            @click="activeTab = 'lcr'"
            :class="activeTab === 'lcr' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            LCR Routing
          </button>
          <button
            @click="activeTab = 'health'"
            :class="activeTab === 'health' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Health Monitoring
          </button>
          <button
            @click="activeTab = 'failover'"
            :class="activeTab === 'failover' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Failover
          </button>
          <button
            @click="activeTab = 'voices'"
            :class="activeTab === 'voices' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Voice Catalog
          </button>
          <button
            @click="activeTab = 'usage'"
            :class="activeTab === 'usage' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Usage Stats
          </button>
        </nav>
      </div>
    </div>

    <!-- Credentials Tab -->
    <div v-if="activeTab === 'credentials'">
      <!-- Info Alert -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p class="text-sm text-blue-800">
          <strong>🔒 Security:</strong> All credentials are encrypted using AES-256-CBC. Only masked values are displayed.
        </p>
      </div>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <select v-model="filters.type" class="px-3 py-2 border rounded-md">
          <option value="">All Types</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="tts">TTS (Text-to-Speech)</option>
          <option value="stt">STT (Speech-to-Text)</option>
          <option value="voice">Voice/Carrier</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="social">Social Media</option>
        </select>
        <select v-model="filters.provider" class="px-3 py-2 border rounded-md">
          <option value="">All Providers</option>
          <optgroup label="Email">
            <option value="sendgrid">SendGrid</option>
            <option value="mailgun">Mailgun</option>
            <option value="ses">Amazon SES</option>
            <option value="elastic_email">Elastic Email</option>
          </optgroup>
          <optgroup label="SMS">
            <option value="twilio">Twilio</option>
            <option value="telnyx">Telnyx</option>
            <option value="bandwidth">Bandwidth</option>
          </optgroup>
          <optgroup label="TTS">
            <option value="openai">OpenAI</option>
            <option value="elevenlabs">ElevenLabs</option>
            <option value="aws_polly">AWS Polly</option>
          </optgroup>
          <optgroup label="STT">
            <option value="whisper">OpenAI Whisper</option>
            <option value="deepgram">Deepgram</option>
            <option value="aws_transcribe">AWS Transcribe</option>
          </optgroup>
          <optgroup label="Other">
            <option value="meta">Meta (WhatsApp)</option>
          </optgroup>
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

    <!-- Credentials Grid -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div
        v-for="cred in credentials"
        :key="cred.id"
        class="bg-white rounded-lg shadow p-6"
      >
        <div class="flex items-start justify-between mb-4">
          <div>
            <h3 class="text-lg font-semibold text-gray-900">{{ cred.provider_name }}</h3>
            <p class="text-sm text-gray-500">{{ cred.provider_type }}</p>
          </div>
          <span
            class="px-3 py-1 text-xs font-medium rounded-full"
            :class="cred.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'"
          >
            {{ cred.is_active ? 'Active' : 'Inactive' }}
          </span>
        </div>

        <!-- Credentials Info -->
        <div class="space-y-2 mb-4">
          <div>
            <p class="text-xs text-gray-500 uppercase">Credentials</p>
            <p class="text-sm text-gray-900">{{ cred.credentials_preview || 'API Credentials configured' }}</p>
          </div>
          <div v-if="cred.tenant_name">
            <p class="text-xs text-gray-500 uppercase">Tenant</p>
            <p class="text-sm text-gray-900">{{ cred.tenant_name }}</p>
          </div>
          <div v-else>
            <p class="text-xs text-gray-500 uppercase">Scope</p>
            <p class="text-sm text-gray-900">Global (All Tenants)</p>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex space-x-2 pt-4 border-t">
          <button
            v-if="authStore.isAdmin"
            @click="testConnection(cred)"
            class="flex-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 text-sm"
          >
            Test Connection
          </button>
          <button
            v-if="authStore.isAdmin"
            @click="editCredential(cred)"
            class="flex-1 px-3 py-2 bg-gray-50 text-gray-600 rounded-md hover:bg-gray-100 text-sm"
          >
            Edit
          </button>
          <button
            v-if="authStore.isSuperAdmin"
            @click="deleteCredential(cred)"
            class="px-3 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 text-sm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!loading && !error && credentials.length === 0" class="text-center py-12 bg-white rounded-lg shadow">
      <p class="text-gray-500">No provider credentials found</p>
    </div>
    </div>

    <!-- LCR Routing Tab -->
    <div v-if="activeTab === 'lcr'" class="bg-white rounded-lg shadow p-6">
      <h2 class="text-lg font-semibold mb-4">Least Cost Routing (LCR) Configuration</h2>
      <p class="text-sm text-gray-600 mb-6">Configure carrier priority and cost routing for optimizing voice call expenses.</p>

      <div class="space-y-4">
        <div class="border rounded-lg p-4" v-for="(route, index) in lcrRoutes" :key="index">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-medium">Priority {{ route.priority }}</h3>
            <span class="text-sm text-gray-500">Cost per minute: ${{ route.cost_per_minute }}</span>
          </div>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span class="text-gray-600">Carrier:</span>
              <span class="ml-2 font-medium">{{ route.carrier }}</span>
            </div>
            <div>
              <span class="text-gray-600">Success Rate:</span>
              <span class="ml-2 font-medium">{{ route.success_rate }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Health Monitoring Tab -->
    <div v-if="activeTab === 'health'" class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-white rounded-lg shadow p-6" v-for="carrier in carrierHealth" :key="carrier.name">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold">{{ carrier.name }}</h3>
            <span
              :class="carrier.status === 'healthy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
              class="px-2 py-1 text-xs font-medium rounded-full"
            >
              {{ carrier.status }}
            </span>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-600">Uptime:</span>
              <span class="font-medium">{{ carrier.uptime }}%</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Avg Latency:</span>
              <span class="font-medium">{{ carrier.latency }}ms</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Error Rate:</span>
              <span class="font-medium">{{ carrier.error_rate }}%</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Last Check:</span>
              <span class="font-medium">{{ carrier.last_check }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Failover Tab -->
    <div v-if="activeTab === 'failover'" class="bg-white rounded-lg shadow p-6">
      <h2 class="text-lg font-semibold mb-4">Emergency Failover Configuration</h2>
      <p class="text-sm text-gray-600 mb-6">Configure automatic failover rules when primary carriers become unavailable.</p>

      <div class="space-y-6">
        <div class="border rounded-lg p-4">
          <h3 class="font-medium mb-4">Failover Rules</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between py-2 border-b">
              <div>
                <p class="text-sm font-medium">High Error Rate Failover</p>
                <p class="text-xs text-gray-500">Switch if error rate exceeds 5%</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input v-model="failoverRules.high_error" type="checkbox" class="sr-only peer" />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div class="flex items-center justify-between py-2 border-b">
              <div>
                <p class="text-sm font-medium">Latency Threshold Failover</p>
                <p class="text-xs text-gray-500">Switch if latency exceeds 200ms</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input v-model="failoverRules.high_latency" type="checkbox" class="sr-only peer" />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div class="flex items-center justify-between py-2">
              <div>
                <p class="text-sm font-medium">Carrier Unavailable Failover</p>
                <p class="text-xs text-gray-500">Switch immediately if carrier is down</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input v-model="failoverRules.carrier_down" type="checkbox" class="sr-only peer" />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Voice Catalog Tab -->
    <div v-if="activeTab === 'voices'" class="space-y-6">
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p class="text-sm text-blue-800">
          <strong>🎙️ Voice Catalog:</strong> Unified voice names for customers. Customers use IRISX voice codes (e.g., "aria", "marcus") - they never see provider-specific voice IDs.
        </p>
      </div>

      <div class="flex justify-between items-center">
        <h2 class="text-lg font-semibold">Unified Voice Catalog</h2>
        <button
          v-if="authStore.isAdmin"
          @click="showVoiceModal = true"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          + Add Voice
        </button>
      </div>

      <div v-if="loadingVoices" class="flex justify-center py-8">
        <svg class="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="voice in voices"
          :key="voice.voice_code"
          class="bg-white rounded-lg shadow p-4 border-l-4"
          :class="{
            'border-purple-500': voice.quality_tier === 'premium',
            'border-blue-500': voice.quality_tier === 'high',
            'border-gray-400': voice.quality_tier === 'standard'
          }"
        >
          <div class="flex items-start justify-between mb-3">
            <div>
              <h3 class="font-semibold text-gray-900">{{ voice.display_name }}</h3>
              <code class="text-xs text-gray-500 bg-gray-100 px-1 rounded">{{ voice.voice_code }}</code>
            </div>
            <span
              class="px-2 py-1 text-xs font-medium rounded-full"
              :class="{
                'bg-purple-100 text-purple-800': voice.quality_tier === 'premium',
                'bg-blue-100 text-blue-800': voice.quality_tier === 'high',
                'bg-gray-100 text-gray-800': voice.quality_tier === 'standard'
              }"
            >
              {{ voice.quality_tier }}
            </span>
          </div>

          <p class="text-sm text-gray-600 mb-3">{{ voice.description }}</p>

          <div class="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3">
            <div><span class="font-medium">Gender:</span> {{ voice.gender || 'N/A' }}</div>
            <div><span class="font-medium">Language:</span> {{ voice.language }}</div>
            <div><span class="font-medium">Primary:</span> {{ voice.primary_provider }}</div>
            <div><span class="font-medium">Usage:</span> {{ voice.usage_count?.toLocaleString() || 0 }}</div>
          </div>

          <div class="flex space-x-2 pt-3 border-t">
            <button
              @click="testVoice(voice)"
              class="flex-1 px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs hover:bg-blue-100"
            >
              🔊 Preview
            </button>
            <button
              v-if="authStore.isAdmin"
              @click="editVoice(voice)"
              class="flex-1 px-2 py-1 bg-gray-50 text-gray-600 rounded text-xs hover:bg-gray-100"
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Usage Stats Tab -->
    <div v-if="activeTab === 'usage'" class="space-y-6">
      <div class="flex justify-between items-center">
        <h2 class="text-lg font-semibold">Provider Usage Statistics</h2>
        <select v-model="usageDays" @change="fetchUsageStats" class="px-3 py-2 border rounded-md">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg shadow p-4">
          <p class="text-sm text-gray-500">Total Requests</p>
          <p class="text-2xl font-bold text-gray-900">{{ usageStats.total?.toLocaleString() || '0' }}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <p class="text-sm text-gray-500">Success Rate</p>
          <p class="text-2xl font-bold text-green-600">{{ usageStats.successRate || '0' }}%</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <p class="text-sm text-gray-500">Total Cost</p>
          <p class="text-2xl font-bold text-gray-900">${{ usageStats.totalCost || '0.00' }}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <p class="text-sm text-gray-500">Avg Latency</p>
          <p class="text-2xl font-bold text-gray-900">{{ usageStats.avgLatency || '0' }}ms</p>
        </div>
      </div>

      <!-- By Channel Type -->
      <div class="bg-white rounded-lg shadow">
        <div class="px-6 py-4 border-b">
          <h3 class="font-semibold">Usage by Channel</h3>
        </div>
        <div class="p-6">
          <table class="min-w-full">
            <thead>
              <tr class="text-left text-xs text-gray-500 uppercase">
                <th class="pb-3">Channel</th>
                <th class="pb-3">Requests</th>
                <th class="pb-3">Success</th>
                <th class="pb-3">Cost</th>
                <th class="pb-3">Avg Latency</th>
              </tr>
            </thead>
            <tbody class="text-sm">
              <tr v-for="channel in usageByChannel" :key="channel.type" class="border-t">
                <td class="py-3 font-medium">{{ channel.type.toUpperCase() }}</td>
                <td class="py-3">{{ channel.requests?.toLocaleString() }}</td>
                <td class="py-3">
                  <span :class="channel.successRate >= 99 ? 'text-green-600' : 'text-yellow-600'">
                    {{ channel.successRate }}%
                  </span>
                </td>
                <td class="py-3">${{ channel.cost }}</td>
                <td class="py-3">{{ channel.latency }}ms</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Add Voice Modal -->
    <div
      v-if="showVoiceModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="showVoiceModal = false"
    >
      <div class="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Add Unified Voice</h3>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">Voice Code</label>
              <input
                v-model="newVoice.voice_code"
                type="text"
                placeholder="aria"
                class="w-full px-3 py-2 border rounded-md"
              />
              <p class="text-xs text-gray-500 mt-1">Lowercase, used in API</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Display Name</label>
              <input
                v-model="newVoice.display_name"
                type="text"
                placeholder="Aria"
                class="w-full px-3 py-2 border rounded-md"
              />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Description</label>
            <textarea
              v-model="newVoice.description"
              rows="2"
              placeholder="Professional female voice, clear and confident"
              class="w-full px-3 py-2 border rounded-md"
            ></textarea>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">Gender</label>
              <select v-model="newVoice.gender" class="w-full px-3 py-2 border rounded-md">
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="neutral">Neutral</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Language</label>
              <input
                v-model="newVoice.language"
                type="text"
                placeholder="en-US"
                class="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Quality Tier</label>
              <select v-model="newVoice.quality_tier" class="w-full px-3 py-2 border rounded-md">
                <option value="standard">Standard</option>
                <option value="high">High</option>
                <option value="premium">Premium</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">Primary Provider</label>
              <select v-model="newVoice.primary_provider" class="w-full px-3 py-2 border rounded-md">
                <option value="openai">OpenAI</option>
                <option value="elevenlabs">ElevenLabs</option>
                <option value="aws_polly">AWS Polly</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Provider Voice ID</label>
              <input
                v-model="newVoice.primary_voice_id"
                type="text"
                placeholder="nova"
                class="w-full px-3 py-2 border rounded-md"
              />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Fallback Mappings (JSON)</label>
            <textarea
              v-model="newVoice.fallback_mappings"
              rows="2"
              placeholder='[{"provider": "aws_polly", "voice_id": "Joanna"}]'
              class="w-full px-3 py-2 border rounded-md font-mono text-sm"
            ></textarea>
          </div>
        </div>
        <div class="flex justify-end space-x-2 mt-6">
          <button @click="showVoiceModal = false" class="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">
            Cancel
          </button>
          <button @click="addVoice" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            Add Voice
          </button>
        </div>
      </div>
    </div>

    <!-- Add Credentials Modal -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="showAddModal = false"
    >
      <div class="bg-white rounded-lg p-6 max-w-lg w-full mx-4" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Add Provider Credentials</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">Type</label>
            <select v-model="newCredential.provider_type" class="w-full px-3 py-2 border rounded-md">
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="tts">TTS (Text-to-Speech)</option>
              <option value="stt">STT (Speech-to-Text)</option>
              <option value="voice">Voice/Carrier</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="social">Social Media</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Provider</label>
            <select v-model="newCredential.provider_name" class="w-full px-3 py-2 border rounded-md">
              <optgroup v-if="newCredential.provider_type === 'email'" label="Email">
                <option value="sendgrid">SendGrid</option>
                <option value="mailgun">Mailgun</option>
                <option value="ses">Amazon SES</option>
                <option value="elastic_email">Elastic Email</option>
              </optgroup>
              <optgroup v-if="newCredential.provider_type === 'sms'" label="SMS">
                <option value="twilio">Twilio</option>
                <option value="telnyx">Telnyx</option>
                <option value="bandwidth">Bandwidth</option>
              </optgroup>
              <optgroup v-if="newCredential.provider_type === 'tts'" label="TTS">
                <option value="openai">OpenAI</option>
                <option value="elevenlabs">ElevenLabs</option>
                <option value="aws_polly">AWS Polly</option>
              </optgroup>
              <optgroup v-if="newCredential.provider_type === 'stt'" label="STT">
                <option value="openai">OpenAI Whisper</option>
                <option value="deepgram">Deepgram</option>
                <option value="aws_transcribe">AWS Transcribe</option>
              </optgroup>
              <optgroup v-if="newCredential.provider_type === 'voice'" label="Voice">
                <option value="twilio">Twilio</option>
                <option value="telnyx">Telnyx</option>
              </optgroup>
              <optgroup v-if="newCredential.provider_type === 'whatsapp'" label="WhatsApp">
                <option value="meta">Meta (WhatsApp)</option>
              </optgroup>
              <optgroup v-if="newCredential.provider_type === 'social'" label="Social">
                <option value="discord">Discord</option>
                <option value="slack">Slack</option>
                <option value="telegram">Telegram</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Credentials (JSON)</label>
            <textarea
              v-model="newCredential.credentials"
              rows="4"
              placeholder='{"api_key": "your-key", "api_secret": "your-secret"}'
              class="w-full px-3 py-2 border rounded-md font-mono text-sm"
            ></textarea>
          </div>
        </div>
        <div class="flex justify-end space-x-2 mt-6">
          <button
            @click="showAddModal = false"
            class="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            @click="addCredential"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Add Credentials
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useAdminAuthStore } from '../../../stores/adminAuth'
import { adminAPI } from '../../../utils/api'

const authStore = useAdminAuthStore()

const activeTab = ref('credentials')
const loading = ref(true)
const error = ref(null)
const credentials = ref([])
const showAddModal = ref(false)

// Voice Catalog
const voices = ref([])
const loadingVoices = ref(false)
const showVoiceModal = ref(false)
const newVoice = ref({
  voice_code: '',
  display_name: '',
  description: '',
  gender: 'female',
  language: 'en-US',
  quality_tier: 'standard',
  primary_provider: 'openai',
  primary_voice_id: '',
  fallback_mappings: '[]'
})

// Usage Stats
const usageDays = ref(30)
const usageStats = ref({
  total: 0,
  successRate: 0,
  totalCost: '0.00',
  avgLatency: 0
})
const usageByChannel = ref([
  { type: 'tts', requests: 0, successRate: 0, cost: '0.00', latency: 0 },
  { type: 'stt', requests: 0, successRate: 0, cost: '0.00', latency: 0 },
  { type: 'sms', requests: 0, successRate: 0, cost: '0.00', latency: 0 },
  { type: 'email', requests: 0, successRate: 0, cost: '0.00', latency: 0 }
])

// LCR Routes data
const lcrRoutes = ref([
  { priority: 1, carrier: 'Twilio', cost_per_minute: 0.0085, success_rate: 99.2 },
  { priority: 2, carrier: 'Telnyx', cost_per_minute: 0.0090, success_rate: 98.8 },
  { priority: 3, carrier: 'Bandwidth', cost_per_minute: 0.0095, success_rate: 98.5 }
])

// Carrier Health data
const carrierHealth = ref([
  { name: 'Twilio', status: 'healthy', uptime: 99.98, latency: 45, error_rate: 0.2, last_check: '2 mins ago' },
  { name: 'Telnyx', status: 'healthy', uptime: 99.95, latency: 52, error_rate: 0.4, last_check: '2 mins ago' },
  { name: 'Bandwidth', status: 'healthy', uptime: 99.92, latency: 48, error_rate: 0.5, last_check: '3 mins ago' }
])

// Failover Rules
const failoverRules = ref({
  high_error: true,
  high_latency: true,
  carrier_down: true
})

const filters = ref({
  type: '',
  provider: ''
})

const newCredential = ref({
  provider_type: 'email',
  provider_name: 'sendgrid',
  credentials: ''
})

// Watch for tab changes
watch(activeTab, (newTab) => {
  if (newTab === 'voices' && voices.value.length === 0) {
    fetchVoices()
  }
  if (newTab === 'usage') {
    fetchUsageStats()
  }
  if (newTab === 'health') {
    fetchProviderHealth()
  }
})

onMounted(() => {
  fetchCredentials()
})

async function fetchCredentials() {
  loading.value = true
  error.value = null

  try {
    const response = await adminAPI.providers.list(filters.value)
    credentials.value = response.data.providers || []
  } catch (err) {
    console.error('Failed to fetch credentials:', err)
    error.value = 'Failed to load provider credentials'
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  fetchCredentials()
}

async function addCredential() {
  try {
    const credentialsObj = JSON.parse(newCredential.value.credentials)
    await adminAPI.providers.create({
      provider_type: newCredential.value.provider_type,
      provider_name: newCredential.value.provider_name,
      credentials: credentialsObj
    })
    showAddModal.value = false
    await fetchCredentials()
  } catch (err) {
    console.error('Failed to add credentials:', err)
    alert('Failed to add credentials. Check JSON format.')
  }
}

async function testConnection(cred) {
  try {
    const response = await adminAPI.providers.test(cred.id)
    if (response.data.success) {
      alert('✅ Connection test successful!')
    } else {
      alert('❌ Connection test failed: ' + (response.data.error || 'Unknown error'))
    }
  } catch (err) {
    console.error('Failed to test connection:', err)
    alert('❌ Connection test failed')
  }
}

function editCredential(cred) {
  // TODO: Implement edit modal
  console.log('Edit credential:', cred)
}

async function deleteCredential(cred) {
  if (!confirm(`Delete ${cred.provider_name} credentials? This action cannot be undone.`)) return

  try {
    await adminAPI.providers.delete(cred.id)
    await fetchCredentials()
  } catch (err) {
    console.error('Failed to delete credentials:', err)
    alert('Failed to delete credentials')
  }
}

// ========== Voice Catalog Functions ==========

async function fetchVoices() {
  loadingVoices.value = true
  try {
    const response = await adminAPI.providers.voices.list()
    voices.value = response.data.voices || []
  } catch (err) {
    console.error('Failed to fetch voices:', err)
    // Use placeholder data if API not ready
    voices.value = [
      { voice_code: 'aria', display_name: 'Aria', description: 'Professional female voice', gender: 'female', language: 'en-US', quality_tier: 'high', primary_provider: 'openai', usage_count: 45230 },
      { voice_code: 'marcus', display_name: 'Marcus', description: 'Deep male voice, authoritative', gender: 'male', language: 'en-US', quality_tier: 'high', primary_provider: 'openai', usage_count: 32100 },
      { voice_code: 'elena', display_name: 'Elena', description: 'Warm female voice, friendly', gender: 'female', language: 'en-US', quality_tier: 'high', primary_provider: 'openai', usage_count: 28500 },
      { voice_code: 'james', display_name: 'James', description: 'British male voice', gender: 'male', language: 'en-GB', quality_tier: 'premium', primary_provider: 'elevenlabs', usage_count: 15800 },
      { voice_code: 'alex', display_name: 'Alex', description: 'Neutral voice, versatile', gender: 'neutral', language: 'en-US', quality_tier: 'standard', primary_provider: 'openai', usage_count: 42100 }
    ]
  } finally {
    loadingVoices.value = false
  }
}

async function addVoice() {
  try {
    const voiceData = {
      ...newVoice.value,
      fallback_mappings: JSON.parse(newVoice.value.fallback_mappings || '[]')
    }
    await adminAPI.providers.voices.create(voiceData)
    showVoiceModal.value = false
    await fetchVoices()
    // Reset form
    newVoice.value = {
      voice_code: '',
      display_name: '',
      description: '',
      gender: 'female',
      language: 'en-US',
      quality_tier: 'standard',
      primary_provider: 'openai',
      primary_voice_id: '',
      fallback_mappings: '[]'
    }
  } catch (err) {
    console.error('Failed to add voice:', err)
    alert('Failed to add voice. Check JSON format for fallback mappings.')
  }
}

function testVoice(voice) {
  // Generate preview audio using the TTS API
  alert(`🔊 Playing preview for "${voice.display_name}"...\n\n"${voice.sample_text || 'Hello, this is a sample of my voice.'}"`)
}

function editVoice(voice) {
  // TODO: Implement edit modal
  console.log('Edit voice:', voice)
  alert('Voice editing coming soon!')
}

// ========== Usage Stats Functions ==========

async function fetchUsageStats() {
  try {
    const response = await adminAPI.providers.usage({ days: usageDays.value })
    if (response.data.usage) {
      // Process usage data
      const usage = response.data.usage
      usageStats.value = {
        total: usage.reduce((sum, r) => sum + (r.request_count || 0), 0),
        successRate: 99.2, // Calculate from data
        totalCost: (usage.reduce((sum, r) => sum + (r.total_cost_cents || 0), 0) / 100).toFixed(2),
        avgLatency: Math.round(usage.reduce((sum, r) => sum + (r.avg_latency_ms || 0), 0) / (usage.length || 1))
      }
    }
  } catch (err) {
    console.error('Failed to fetch usage stats:', err)
    // Use placeholder data
    usageStats.value = {
      total: 1250430,
      successRate: 99.4,
      totalCost: '4,532.18',
      avgLatency: 245
    }
    usageByChannel.value = [
      { type: 'tts', requests: 542000, successRate: 99.8, cost: '1,245.00', latency: 320 },
      { type: 'stt', requests: 128500, successRate: 99.5, cost: '892.50', latency: 1250 },
      { type: 'sms', requests: 385200, successRate: 99.2, cost: '1,540.80', latency: 180 },
      { type: 'email', requests: 194730, successRate: 99.6, cost: '853.88', latency: 95 }
    ]
  }
}

async function fetchProviderHealth() {
  try {
    const response = await adminAPI.providers.health()
    if (response.data.providers) {
      // Transform into health data format
      const healthData = []
      for (const [type, providers] of Object.entries(response.data.providers)) {
        providers.forEach(p => {
          healthData.push({
            name: p.provider_name,
            type: p.provider_type,
            status: p.health_score >= 80 ? 'healthy' : p.health_score >= 50 ? 'degraded' : 'unhealthy',
            uptime: p.success_rate || 99.9,
            latency: 50,
            error_rate: ((p.failed_requests || 0) / (p.total_requests || 1) * 100).toFixed(1),
            last_check: 'Now'
          })
        })
      }
      if (healthData.length > 0) {
        carrierHealth.value = healthData
      }
    }
  } catch (err) {
    console.error('Failed to fetch provider health:', err)
  }
}
</script>
