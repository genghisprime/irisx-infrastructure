<template>
  <div class="p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">AI Voice Management</h1>
        <p class="text-gray-500 mt-1">Manage TTS/STT providers, voice assistants, and voice bot analytics</p>
      </div>
      <div class="flex items-center gap-3">
        <button @click="refreshData" class="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50">
          Refresh
        </button>
      </div>
    </div>

    <!-- Stats Overview -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Active Assistants</p>
            <p class="text-2xl font-bold text-violet-600">{{ stats.active_assistants || 0 }}</p>
          </div>
          <div class="p-3 bg-violet-100 rounded-lg">
            <ChatBubbleLeftRightIcon class="h-6 w-6 text-violet-600" />
          </div>
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Conversations (24h)</p>
            <p class="text-2xl font-bold text-emerald-600">{{ stats.conversations_24h || 0 }}</p>
          </div>
          <div class="p-3 bg-emerald-100 rounded-lg">
            <PhoneIcon class="h-6 w-6 text-emerald-600" />
          </div>
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Completed (24h)</p>
            <p class="text-2xl font-bold text-blue-600">{{ stats.completed_24h || 0 }}</p>
          </div>
          <div class="p-3 bg-blue-100 rounded-lg">
            <CheckCircleIcon class="h-6 w-6 text-blue-600" />
          </div>
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Avg Duration</p>
            <p class="text-2xl font-bold text-orange-600">{{ formatDuration(stats.avg_duration_24h) }}</p>
          </div>
          <div class="p-3 bg-orange-100 rounded-lg">
            <ClockIcon class="h-6 w-6 text-orange-600" />
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="bg-white rounded-lg shadow">
      <div class="border-b">
        <nav class="flex -mb-px">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            :class="[
              'px-6 py-4 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-violet-500 text-violet-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            ]"
          >
            {{ tab.name }}
          </button>
        </nav>
      </div>

      <div class="p-6">
        <!-- Providers Tab -->
        <div v-if="activeTab === 'providers'">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-gray-900">Voice Providers</h3>
            <button @click="showAddProvider = true" class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700">
              Add Provider
            </button>
          </div>

          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Languages</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Credentials</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usage</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="provider in providers" :key="provider.id">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                        <SpeakerWaveIcon v-if="provider.provider_type === 'tts'" class="h-5 w-5 text-gray-600" />
                        <MicrophoneIcon v-else-if="provider.provider_type === 'stt'" class="h-5 w-5 text-gray-600" />
                        <SparklesIcon v-else class="h-5 w-5 text-gray-600" />
                      </div>
                      <div>
                        <p class="font-medium text-gray-900">{{ provider.display_name }}</p>
                        <p class="text-sm text-gray-500">{{ provider.provider_name }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span :class="getTypeClass(provider.provider_type)">
                      {{ provider.provider_type.toUpperCase() }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-sm text-gray-500">
                      {{ (provider.supported_languages || []).length }} languages
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span :class="[
                      'px-2 py-1 rounded-full text-xs',
                      provider.credential_count > 0 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    ]">
                      {{ provider.credential_count || 0 }} configured
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-sm text-gray-500">{{ provider.usage_count || 0 }} assistants</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <button
                      @click="toggleProvider(provider)"
                      :class="[
                        'px-3 py-1 rounded-full text-xs font-medium',
                        provider.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      ]"
                    >
                      {{ provider.is_active ? 'Active' : 'Inactive' }}
                    </button>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                      <button @click="manageCredentials(provider)" class="text-blue-600 hover:text-blue-800">
                        <KeyIcon class="h-5 w-5" />
                      </button>
                      <button @click="editProvider(provider)" class="text-gray-600 hover:text-gray-800">
                        <PencilSquareIcon class="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Assistants Tab -->
        <div v-if="activeTab === 'assistants'">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-4">
              <select v-model="assistantFilters.tenant_id" @change="loadAssistants" class="px-3 py-2 border rounded-lg text-sm">
                <option value="">All Tenants</option>
                <option v-for="tenant in tenants" :key="tenant.id" :value="tenant.id">{{ tenant.name }}</option>
              </select>
              <select v-model="assistantFilters.status" @change="loadAssistants" class="px-3 py-2 border rounded-lg text-sm">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assistant</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">TTS/STT</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conversations</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="assistant in assistants" :key="assistant.id">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p class="font-medium text-gray-900">{{ assistant.name }}</p>
                      <p class="text-sm text-gray-500">{{ assistant.description || 'No description' }}</p>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ assistant.tenant_name }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 bg-violet-100 text-violet-800 rounded text-xs">
                      {{ formatAssistantType(assistant.assistant_type) }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ assistant.tts_provider_name || '-' }} / {{ assistant.stt_provider_name || '-' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ assistant.conversation_count || 0 }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span :class="getStatusClass(assistant.status)">
                      {{ assistant.status }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ formatDate(assistant.created_at) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Conversations Tab -->
        <div v-if="activeTab === 'conversations'">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-4">
              <select v-model="conversationFilters.status" @change="loadConversations" class="px-3 py-2 border rounded-lg text-sm">
                <option value="">All Status</option>
                <option value="completed">Completed</option>
                <option value="transferred">Transferred</option>
                <option value="abandoned">Abandoned</option>
              </select>
              <input
                type="date"
                v-model="conversationFilters.start_date"
                @change="loadConversations"
                class="px-3 py-2 border rounded-lg text-sm"
              />
              <input
                type="date"
                v-model="conversationFilters.end_date"
                @change="loadConversations"
                class="px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conversation</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assistant</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Caller</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="conv in conversations" :key="conv.id">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <p class="font-mono text-sm text-gray-900">{{ conv.conversation_uuid?.substring(0, 8) }}...</p>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ conv.tenant_name }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ conv.assistant_name || 'Unknown' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ conv.caller_number || 'Unknown' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ formatDuration(conv.duration_seconds) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span :class="getConversationStatusClass(conv.status)">
                      {{ conv.status }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ formatDateTime(conv.started_at) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Usage Tab -->
        <div v-if="activeTab === 'usage'">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-4">
              <input
                type="date"
                v-model="usageFilters.start_date"
                @change="loadUsage"
                class="px-3 py-2 border rounded-lg text-sm"
              />
              <input
                type="date"
                v-model="usageFilters.end_date"
                @change="loadUsage"
                class="px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>

          <!-- Usage Summary -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg p-4 text-white">
              <p class="text-sm text-violet-100">TTS Characters</p>
              <p class="text-2xl font-bold">{{ formatNumber(usageTotals.total_tts_characters) }}</p>
            </div>
            <div class="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg p-4 text-white">
              <p class="text-sm text-emerald-100">STT Seconds</p>
              <p class="text-2xl font-bold">{{ formatNumber(usageTotals.total_stt_seconds) }}</p>
            </div>
            <div class="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg p-4 text-white">
              <p class="text-sm text-blue-100">Total Calls</p>
              <p class="text-2xl font-bold">{{ formatNumber(usageTotals.total_calls) }}</p>
            </div>
            <div class="bg-gradient-to-br from-orange-500 to-red-600 rounded-lg p-4 text-white">
              <p class="text-sm text-orange-100">Total Cost</p>
              <p class="text-2xl font-bold">${{ parseFloat(usageTotals.total_cost || 0).toFixed(2) }}</p>
            </div>
          </div>

          <!-- Daily Usage Table -->
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">TTS Chars</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">STT Secs</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">LLM Tokens</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Calls</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="day in usageDaily" :key="day.usage_date">
                  <td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                    {{ formatDate(day.usage_date) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ formatNumber(day.tts_characters) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ formatNumber(day.stt_seconds) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ formatNumber(day.llm_tokens) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ formatNumber(day.total_calls) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    ${{ parseFloat(day.total_cost || 0).toFixed(2) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Templates Tab -->
        <div v-if="activeTab === 'templates'">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-gray-900">System Prompt Templates</h3>
            <button @click="showAddTemplate = true" class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700">
              Add Template
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="template in templates" :key="template.id" class="bg-gray-50 rounded-lg p-4">
              <div class="flex items-start justify-between mb-2">
                <div>
                  <h4 class="font-medium text-gray-900">{{ template.template_name }}</h4>
                  <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                    {{ template.template_category }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <button @click="editTemplate(template)" class="text-gray-400 hover:text-gray-600">
                    <PencilSquareIcon class="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p class="text-sm text-gray-600 mt-2 line-clamp-3">{{ template.template_text }}</p>
              <div class="mt-2 flex flex-wrap gap-1">
                <span v-for="variable in (template.variables || [])" :key="variable" class="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">
                  {{ '{{' + variable + '}}' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Credentials Modal -->
    <div v-if="showCredentialsModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div class="p-4 border-b flex items-center justify-between">
          <h3 class="font-semibold">Manage Credentials - {{ selectedProvider?.display_name }}</h3>
          <button @click="showCredentialsModal = false" class="text-gray-500 hover:text-gray-700">
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>
        <div class="p-4 space-y-4">
          <div v-for="cred in providerCredentials" :key="cred.id" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p class="font-medium text-gray-900">{{ cred.credential_key }}</p>
              <p class="text-sm text-gray-500">{{ cred.environment }} - Last updated {{ formatDate(cred.updated_at) }}</p>
            </div>
            <button @click="deleteCredential(cred.id)" class="text-red-500 hover:text-red-700">
              <TrashIcon class="h-5 w-5" />
            </button>
          </div>

          <div class="border-t pt-4 space-y-3">
            <h4 class="font-medium text-gray-900">Add Credential</h4>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Key Name</label>
              <input v-model="newCredential.credential_key" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="api_key" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Value</label>
              <input v-model="newCredential.credential_value" type="password" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="sk-..." />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Environment</label>
              <select v-model="newCredential.environment" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
              </select>
            </div>
            <button @click="saveCredential" class="w-full py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700">
              Save Credential
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, h } from 'vue'
import adminApi from '@/utils/api'

// Icons
const ChatBubbleLeftRightIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-6 h-6' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155' })]) }
const PhoneIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-6 h-6' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z' })]) }
const CheckCircleIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-6 h-6' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' })]) }
const ClockIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-6 h-6' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z' })]) }
const SpeakerWaveIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-5 h-5' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z' })]) }
const MicrophoneIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-5 h-5' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z' })]) }
const SparklesIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-5 h-5' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z' })]) }
const KeyIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-5 h-5' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z' })]) }
const PencilSquareIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-5 h-5' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10' })]) }
const TrashIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-5 h-5' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0' })]) }
const XMarkIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor', class: 'w-5 h-5' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M6 18L18 6M6 6l12 12' })]) }

const tabs = [
  { id: 'providers', name: 'Voice Providers' },
  { id: 'assistants', name: 'Voice Assistants' },
  { id: 'conversations', name: 'Conversations' },
  { id: 'usage', name: 'Usage & Cost' },
  { id: 'templates', name: 'Templates' }
]

const activeTab = ref('providers')
const stats = ref({})
const providers = ref([])
const assistants = ref([])
const conversations = ref([])
const templates = ref([])
const tenants = ref([])
const usageDaily = ref([])
const usageTotals = ref({})

const showAddProvider = ref(false)
const showAddTemplate = ref(false)
const showCredentialsModal = ref(false)
const selectedProvider = ref(null)
const providerCredentials = ref([])
const newCredential = reactive({ credential_key: '', credential_value: '', environment: 'production' })

const assistantFilters = reactive({ tenant_id: '', status: '' })
const conversationFilters = reactive({
  status: '',
  start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  end_date: new Date().toISOString().split('T')[0]
})
const usageFilters = reactive({
  start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  end_date: new Date().toISOString().split('T')[0]
})

onMounted(async () => {
  await Promise.all([
    loadStats(),
    loadProviders(),
    loadTenants()
  ])
})

async function loadStats() {
  try {
    const { data } = await adminApi.get('/admin/voice/analytics/summary')
    stats.value = data.stats || {}
  } catch (error) {
    console.error('Failed to load stats:', error)
  }
}

async function loadProviders() {
  try {
    const { data } = await adminApi.get('/admin/voice/providers')
    providers.value = data.providers || []
  } catch (error) {
    console.error('Failed to load providers:', error)
  }
}

async function loadAssistants() {
  try {
    const params = new URLSearchParams()
    if (assistantFilters.tenant_id) params.append('tenant_id', assistantFilters.tenant_id)
    if (assistantFilters.status) params.append('status', assistantFilters.status)
    const { data } = await adminApi.get(`/admin/voice/assistants?${params}`)
    assistants.value = data.assistants || []
  } catch (error) {
    console.error('Failed to load assistants:', error)
  }
}

async function loadConversations() {
  try {
    const params = new URLSearchParams()
    if (conversationFilters.status) params.append('status', conversationFilters.status)
    if (conversationFilters.start_date) params.append('start_date', conversationFilters.start_date)
    if (conversationFilters.end_date) params.append('end_date', conversationFilters.end_date)
    params.append('limit', '50')
    const { data } = await adminApi.get(`/admin/voice/conversations?${params}`)
    conversations.value = data.conversations || []
  } catch (error) {
    console.error('Failed to load conversations:', error)
  }
}

async function loadTemplates() {
  try {
    const { data } = await adminApi.get('/admin/voice/prompt-templates')
    templates.value = data.templates || []
  } catch (error) {
    console.error('Failed to load templates:', error)
  }
}

async function loadTenants() {
  try {
    const { data } = await adminApi.get('/admin/tenants?limit=100')
    tenants.value = data.tenants || []
  } catch (error) {
    console.error('Failed to load tenants:', error)
  }
}

async function loadUsage() {
  try {
    const params = new URLSearchParams()
    params.append('start_date', usageFilters.start_date)
    params.append('end_date', usageFilters.end_date)
    const { data } = await adminApi.get(`/admin/voice/usage?${params}`)
    usageDaily.value = data.daily || []
    usageTotals.value = data.totals || {}
  } catch (error) {
    console.error('Failed to load usage:', error)
  }
}

async function toggleProvider(provider) {
  try {
    await adminApi.patch(`/admin/voice/providers/${provider.id}/toggle`)
    await loadProviders()
  } catch (error) {
    console.error('Failed to toggle provider:', error)
  }
}

async function manageCredentials(provider) {
  selectedProvider.value = provider
  try {
    const { data } = await adminApi.get(`/admin/voice/providers/${provider.id}/credentials`)
    providerCredentials.value = data.credentials || []
    showCredentialsModal.value = true
  } catch (error) {
    console.error('Failed to load credentials:', error)
  }
}

async function saveCredential() {
  if (!newCredential.credential_key || !newCredential.credential_value) return
  try {
    await adminApi.post(`/admin/voice/providers/${selectedProvider.value.id}/credentials`, newCredential)
    const { data } = await adminApi.get(`/admin/voice/providers/${selectedProvider.value.id}/credentials`)
    providerCredentials.value = data.credentials || []
    newCredential.credential_key = ''
    newCredential.credential_value = ''
    await loadProviders()
  } catch (error) {
    console.error('Failed to save credential:', error)
  }
}

async function deleteCredential(credentialId) {
  if (!confirm('Are you sure you want to delete this credential?')) return
  try {
    await adminApi.delete(`/admin/voice/credentials/${credentialId}`)
    const { data } = await adminApi.get(`/admin/voice/providers/${selectedProvider.value.id}/credentials`)
    providerCredentials.value = data.credentials || []
    await loadProviders()
  } catch (error) {
    console.error('Failed to delete credential:', error)
  }
}

function refreshData() {
  loadStats()
  loadProviders()
  if (activeTab.value === 'assistants') loadAssistants()
  if (activeTab.value === 'conversations') loadConversations()
  if (activeTab.value === 'usage') loadUsage()
  if (activeTab.value === 'templates') loadTemplates()
}

function editProvider(provider) {
  // TODO: Implement edit modal
  console.log('Edit provider:', provider)
}

function editTemplate(template) {
  // TODO: Implement edit modal
  console.log('Edit template:', template)
}

function getTypeClass(type) {
  const classes = {
    tts: 'px-2 py-1 bg-violet-100 text-violet-800 rounded text-xs',
    stt: 'px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-xs',
    both: 'px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs'
  }
  return classes[type] || 'px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs'
}

function getStatusClass(status) {
  const classes = {
    active: 'px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs',
    draft: 'px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs',
    paused: 'px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs',
    archived: 'px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs'
  }
  return classes[status] || 'px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs'
}

function getConversationStatusClass(status) {
  const classes = {
    completed: 'px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs',
    transferred: 'px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs',
    abandoned: 'px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs',
    active: 'px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs'
  }
  return classes[status] || 'px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs'
}

function formatAssistantType(type) {
  const types = {
    ivr_bot: 'IVR Bot',
    outbound_agent: 'Outbound Agent',
    survey_bot: 'Survey Bot',
    appointment_scheduler: 'Scheduler',
    payment_collector: 'Payment',
    custom: 'Custom'
  }
  return types[type] || type
}

function formatDuration(seconds) {
  if (!seconds) return '0s'
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

function formatNumber(num) {
  if (!num) return '0'
  return new Intl.NumberFormat().format(num)
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString()
}

function formatDateTime(date) {
  if (!date) return '-'
  return new Date(date).toLocaleString()
}
</script>
