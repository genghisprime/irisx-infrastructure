<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Translation Services</h1>
      <button
        v-if="authStore.isAdmin && activeTab === 'credentials'"
        @click="showAddCredentialModal = true"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        + Add Provider Credentials
      </button>
    </div>

    <!-- Tabs -->
    <div class="bg-white rounded-lg shadow mb-6">
      <div class="border-b border-gray-200">
        <nav class="flex -mb-px">
          <button
            @click="activeTab = 'overview'"
            :class="activeTab === 'overview' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Overview
          </button>
          <button
            @click="activeTab = 'providers'"
            :class="activeTab === 'providers' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Providers
          </button>
          <button
            @click="activeTab = 'credentials'"
            :class="activeTab === 'credentials' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Credentials
          </button>
          <button
            @click="activeTab = 'health'"
            :class="activeTab === 'health' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Health
          </button>
          <button
            @click="activeTab = 'usage'"
            :class="activeTab === 'usage' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Usage & Billing
          </button>
          <button
            @click="activeTab = 'languages'"
            :class="activeTab === 'languages' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="px-6 py-3 border-b-2 font-medium text-sm"
          >
            Languages
          </button>
        </nav>
      </div>
    </div>

    <!-- Overview Tab -->
    <div v-if="activeTab === 'overview'" class="space-y-6">
      <!-- Info Banner -->
      <div class="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-6 text-white">
        <h2 class="text-xl font-semibold mb-2">Multi-Provider Translation Services</h2>
        <p class="opacity-90">
          Enable real-time language translation across all channels. Support for Google Cloud, AWS Translate, DeepL, Azure, and IBM Watson.
        </p>
      </div>

      <!-- Stats Summary -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center">
            <div class="p-3 bg-blue-100 rounded-lg">
              <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"></path>
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm text-gray-500">Active Providers</p>
              <p class="text-2xl font-bold text-gray-900">{{ stats.activeProviders }}</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center">
            <div class="p-3 bg-green-100 rounded-lg">
              <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm text-gray-500">Tenants Enabled</p>
              <p class="text-2xl font-bold text-gray-900">{{ stats.tenantsEnabled }}</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center">
            <div class="p-3 bg-purple-100 rounded-lg">
              <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path>
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm text-gray-500">Translations Today</p>
              <p class="text-2xl font-bold text-gray-900">{{ stats.translationsToday.toLocaleString() }}</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center">
            <div class="p-3 bg-yellow-100 rounded-lg">
              <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm text-gray-500">Cost This Month</p>
              <p class="text-2xl font-bold text-gray-900">${{ stats.costThisMonth }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Channel Breakdown -->
      <div class="bg-white rounded-lg shadow">
        <div class="px-6 py-4 border-b">
          <h3 class="font-semibold">Translations by Channel</h3>
        </div>
        <div class="p-6">
          <div class="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div v-for="channel in channelStats" :key="channel.name" class="text-center p-4 bg-gray-50 rounded-lg">
              <div class="text-2xl mb-1">{{ channel.icon }}</div>
              <p class="text-sm text-gray-500">{{ channel.name }}</p>
              <p class="text-lg font-semibold">{{ channel.count.toLocaleString() }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Top Languages -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-white rounded-lg shadow">
          <div class="px-6 py-4 border-b">
            <h3 class="font-semibold">Top Source Languages</h3>
          </div>
          <div class="p-6">
            <div class="space-y-3">
              <div v-for="lang in topSourceLanguages" :key="lang.code" class="flex items-center justify-between">
                <div class="flex items-center">
                  <span class="text-lg mr-2">{{ lang.flag }}</span>
                  <span class="font-medium">{{ lang.name }}</span>
                </div>
                <div class="flex items-center">
                  <div class="w-32 bg-gray-200 rounded-full h-2 mr-3">
                    <div class="bg-blue-600 h-2 rounded-full" :style="{ width: lang.percentage + '%' }"></div>
                  </div>
                  <span class="text-sm text-gray-600">{{ lang.percentage }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow">
          <div class="px-6 py-4 border-b">
            <h3 class="font-semibold">Top Target Languages</h3>
          </div>
          <div class="p-6">
            <div class="space-y-3">
              <div v-for="lang in topTargetLanguages" :key="lang.code" class="flex items-center justify-between">
                <div class="flex items-center">
                  <span class="text-lg mr-2">{{ lang.flag }}</span>
                  <span class="font-medium">{{ lang.name }}</span>
                </div>
                <div class="flex items-center">
                  <div class="w-32 bg-gray-200 rounded-full h-2 mr-3">
                    <div class="bg-green-600 h-2 rounded-full" :style="{ width: lang.percentage + '%' }"></div>
                  </div>
                  <span class="text-sm text-gray-600">{{ lang.percentage }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Providers Tab -->
    <div v-if="activeTab === 'providers'" class="space-y-6">
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p class="text-sm text-blue-800">
          <strong>Provider Catalog:</strong> These are the available translation providers. Configure credentials below to enable them for use.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="provider in providers"
          :key="provider.name"
          class="bg-white rounded-lg shadow p-6 border-l-4"
          :class="getProviderBorderClass(provider)"
        >
          <div class="flex items-start justify-between mb-4">
            <div>
              <h3 class="text-lg font-semibold text-gray-900">{{ provider.display_name }}</h3>
              <code class="text-xs text-gray-500 bg-gray-100 px-1 rounded">{{ provider.name }}</code>
            </div>
            <span
              :class="provider.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'"
              class="px-2 py-1 text-xs font-medium rounded-full"
            >
              {{ provider.is_active ? 'Active' : 'Inactive' }}
            </span>
          </div>

          <!-- Capabilities -->
          <div class="flex flex-wrap gap-2 mb-4">
            <span
              v-for="(enabled, capability) in provider.capabilities"
              :key="capability"
              v-show="enabled"
              class="px-2 py-1 text-xs rounded-full"
              :class="enabled ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-400'"
            >
              {{ formatCapability(capability) }}
            </span>
          </div>

          <!-- Pricing -->
          <div class="text-sm text-gray-600 mb-4">
            <p><span class="font-medium">Cost:</span> ${{ (provider.pricing?.per_character * 1000000).toFixed(2) }} per 1M chars</p>
            <p><span class="font-medium">Free tier:</span> {{ (provider.pricing?.free_tier_characters / 1000).toLocaleString() }}K chars/month</p>
          </div>

          <!-- Languages Count -->
          <div class="text-sm text-gray-600 mb-4">
            <p><span class="font-medium">Languages:</span> {{ provider.supported_languages?.length || 0 }} supported</p>
          </div>

          <!-- Credentials Status -->
          <div class="pt-4 border-t">
            <div v-if="hasCredentials(provider.name)" class="flex items-center text-green-600">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span class="text-sm">Credentials configured</span>
            </div>
            <div v-else class="flex items-center text-yellow-600">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
              </svg>
              <span class="text-sm">No credentials configured</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Credentials Tab -->
    <div v-if="activeTab === 'credentials'" class="space-y-6">
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p class="text-sm text-blue-800">
          <strong>Security:</strong> All credentials are encrypted using AES-256-CBC. Only masked values are displayed.
        </p>
      </div>

      <!-- Loading -->
      <div v-if="loadingCredentials" class="flex justify-center py-12">
        <svg class="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
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
              <h3 class="text-lg font-semibold text-gray-900">{{ cred.name }}</h3>
              <p class="text-sm text-gray-500">{{ getProviderDisplayName(cred.provider_id) }}</p>
            </div>
            <span
              :class="cred.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'"
              class="px-3 py-1 text-xs font-medium rounded-full"
            >
              {{ cred.is_active ? 'Active' : 'Inactive' }}
            </span>
          </div>

          <!-- Health Status -->
          <div class="flex items-center mb-4">
            <span
              class="w-3 h-3 rounded-full mr-2"
              :class="{
                'bg-green-500': cred.health_status === 'healthy',
                'bg-yellow-500': cred.health_status === 'degraded',
                'bg-red-500': cred.health_status === 'down',
                'bg-gray-300': cred.health_status === 'unknown'
              }"
            ></span>
            <span class="text-sm text-gray-600">
              {{ cred.health_status === 'healthy' ? 'Healthy' : cred.health_status === 'degraded' ? 'Degraded' : cred.health_status === 'down' ? 'Down' : 'Unknown' }}
              <span v-if="cred.avg_latency_ms" class="text-gray-400"> - {{ cred.avg_latency_ms }}ms avg</span>
            </span>
          </div>

          <!-- Usage -->
          <div v-if="cred.monthly_limit" class="mb-4">
            <div class="flex justify-between text-sm text-gray-600 mb-1">
              <span>Usage</span>
              <span>{{ cred.current_usage.toLocaleString() }} / {{ cred.monthly_limit.toLocaleString() }}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                class="h-2 rounded-full"
                :class="(cred.current_usage / cred.monthly_limit) > 0.9 ? 'bg-red-600' : 'bg-blue-600'"
                :style="{ width: Math.min((cred.current_usage / cred.monthly_limit) * 100, 100) + '%' }"
              ></div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex space-x-2 pt-4 border-t">
            <button
              @click="testCredential(cred)"
              class="flex-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 text-sm"
            >
              Test
            </button>
            <button
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
      <div v-if="!loadingCredentials && credentials.length === 0" class="text-center py-12 bg-white rounded-lg shadow">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
        </svg>
        <h3 class="mt-4 text-lg font-medium text-gray-900">No credentials configured</h3>
        <p class="mt-2 text-gray-500">Add translation provider credentials to enable translation services.</p>
        <button
          @click="showAddCredentialModal = true"
          class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Add Credentials
        </button>
      </div>
    </div>

    <!-- Health Tab -->
    <div v-if="activeTab === 'health'" class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="health in providerHealth" :key="health.provider" class="bg-white rounded-lg shadow p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold">{{ health.displayName }}</h3>
            <span
              :class="{
                'bg-green-100 text-green-800': health.status === 'healthy',
                'bg-yellow-100 text-yellow-800': health.status === 'degraded',
                'bg-red-100 text-red-800': health.status === 'down'
              }"
              class="px-2 py-1 text-xs font-medium rounded-full"
            >
              {{ health.status }}
            </span>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-600">Success Rate:</span>
              <span class="font-medium" :class="health.successRate >= 99 ? 'text-green-600' : 'text-yellow-600'">
                {{ health.successRate }}%
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Avg Latency:</span>
              <span class="font-medium">{{ health.latency }}ms</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Requests (24h):</span>
              <span class="font-medium">{{ health.requests.toLocaleString() }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Last Check:</span>
              <span class="font-medium">{{ health.lastCheck }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Usage & Billing Tab -->
    <div v-if="activeTab === 'usage'" class="space-y-6">
      <!-- Date Range Selector -->
      <div class="bg-white rounded-lg shadow p-4 flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <select v-model="usageDateRange" class="px-3 py-2 border rounded-md">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <select v-model="usageGroupBy" class="px-3 py-2 border rounded-md">
            <option value="provider">Group by Provider</option>
            <option value="tenant">Group by Tenant</option>
            <option value="channel">Group by Channel</option>
          </select>
        </div>
        <button @click="fetchUsage" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Refresh
        </button>
      </div>

      <!-- Usage Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-sm text-gray-500">Total Translations</p>
          <p class="text-2xl font-bold text-gray-900">{{ usageData.totalTranslations.toLocaleString() }}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-sm text-gray-500">Characters Translated</p>
          <p class="text-2xl font-bold text-gray-900">{{ formatCharCount(usageData.totalCharacters) }}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-sm text-gray-500">Cache Hit Rate</p>
          <p class="text-2xl font-bold text-green-600">{{ usageData.cacheHitRate }}%</p>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-sm text-gray-500">Total Cost</p>
          <p class="text-2xl font-bold text-gray-900">${{ usageData.totalCost.toFixed(2) }}</p>
        </div>
      </div>

      <!-- Usage Table -->
      <div class="bg-white rounded-lg shadow">
        <div class="px-6 py-4 border-b">
          <h3 class="font-semibold">Usage Breakdown</h3>
        </div>
        <div class="p-6 overflow-x-auto">
          <table class="min-w-full">
            <thead>
              <tr class="text-left text-xs text-gray-500 uppercase">
                <th class="pb-3">{{ usageGroupBy === 'tenant' ? 'Tenant' : usageGroupBy === 'channel' ? 'Channel' : 'Provider' }}</th>
                <th class="pb-3">Translations</th>
                <th class="pb-3">Characters</th>
                <th class="pb-3">Cache Hits</th>
                <th class="pb-3">Cost</th>
                <th class="pb-3">Avg Latency</th>
              </tr>
            </thead>
            <tbody class="text-sm">
              <tr v-for="row in usageBreakdown" :key="row.name" class="border-t">
                <td class="py-3 font-medium">{{ row.name }}</td>
                <td class="py-3">{{ row.translations.toLocaleString() }}</td>
                <td class="py-3">{{ formatCharCount(row.characters) }}</td>
                <td class="py-3">{{ row.cacheHitRate }}%</td>
                <td class="py-3">${{ row.cost.toFixed(2) }}</td>
                <td class="py-3">{{ row.latency }}ms</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Languages Tab -->
    <div v-if="activeTab === 'languages'" class="space-y-6">
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold mb-4">Supported Languages by Provider</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="provider in providers" :key="provider.name" class="border rounded-lg p-4">
            <h3 class="font-medium mb-2">{{ provider.display_name }}</h3>
            <p class="text-sm text-gray-500 mb-3">{{ provider.supported_languages?.length || 0 }} languages</p>
            <div class="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              <span
                v-for="lang in (provider.supported_languages || []).slice(0, 20)"
                :key="lang"
                class="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded"
              >
                {{ lang }}
              </span>
              <span
                v-if="(provider.supported_languages?.length || 0) > 20"
                class="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded"
              >
                +{{ provider.supported_languages.length - 20 }} more
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Credential Modal -->
    <div
      v-if="showAddCredentialModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click="showAddCredentialModal = false"
    >
      <div class="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Add Translation Provider Credentials</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Name</label>
            <input
              v-model="newCredential.name"
              type="text"
              placeholder="Production Google Translate"
              class="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Provider</label>
            <select v-model="newCredential.provider" class="w-full px-3 py-2 border rounded-md">
              <option value="">Select provider...</option>
              <option v-for="p in providers" :key="p.name" :value="p.name">{{ p.display_name }}</option>
            </select>
          </div>

          <!-- Dynamic credential fields based on provider -->
          <div v-if="newCredential.provider === 'google'">
            <label class="block text-sm font-medium mb-1">API Key</label>
            <input
              v-model="newCredential.credentials.api_key"
              type="password"
              placeholder="Your Google Cloud API key"
              class="w-full px-3 py-2 border rounded-md"
            />
            <p class="text-xs text-gray-500 mt-1">From Google Cloud Console > APIs & Services > Credentials</p>
          </div>

          <div v-if="newCredential.provider === 'aws'">
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium mb-1">Access Key ID</label>
                <input
                  v-model="newCredential.credentials.access_key_id"
                  type="password"
                  class="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Secret Access Key</label>
                <input
                  v-model="newCredential.credentials.secret_access_key"
                  type="password"
                  class="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Region</label>
                <select v-model="newCredential.credentials.region" class="w-full px-3 py-2 border rounded-md">
                  <option value="us-east-1">US East (N. Virginia)</option>
                  <option value="us-west-2">US West (Oregon)</option>
                  <option value="eu-west-1">EU (Ireland)</option>
                  <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
                </select>
              </div>
            </div>
          </div>

          <div v-if="newCredential.provider === 'deepl'">
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium mb-1">API Key</label>
                <input
                  v-model="newCredential.credentials.api_key"
                  type="password"
                  class="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div class="flex items-center">
                <input
                  v-model="newCredential.credentials.use_free_api"
                  type="checkbox"
                  id="deepl-free"
                  class="mr-2"
                />
                <label for="deepl-free" class="text-sm">Use Free API (api-free.deepl.com)</label>
              </div>
            </div>
          </div>

          <div v-if="newCredential.provider === 'azure'">
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium mb-1">Subscription Key</label>
                <input
                  v-model="newCredential.credentials.subscription_key"
                  type="password"
                  class="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Region</label>
                <input
                  v-model="newCredential.credentials.region"
                  type="text"
                  placeholder="eastus"
                  class="w-full px-3 py-2 border rounded-md"
                />
              </div>
            </div>
          </div>

          <div v-if="newCredential.provider === 'ibm_watson'">
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium mb-1">API Key</label>
                <input
                  v-model="newCredential.credentials.api_key"
                  type="password"
                  class="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Service URL</label>
                <input
                  v-model="newCredential.credentials.url"
                  type="text"
                  placeholder="https://api.us-south.language-translator.watson.cloud.ibm.com"
                  class="w-full px-3 py-2 border rounded-md"
                />
              </div>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Monthly Limit (characters)</label>
            <input
              v-model.number="newCredential.monthlyLimit"
              type="number"
              placeholder="0 = unlimited"
              class="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <div class="flex items-center">
            <input v-model="newCredential.isDefault" type="checkbox" id="is-default" class="mr-2" />
            <label for="is-default" class="text-sm">Set as default provider</label>
          </div>
        </div>
        <div class="flex justify-end space-x-2 mt-6">
          <button @click="showAddCredentialModal = false" class="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">
            Cancel
          </button>
          <button @click="addCredential" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
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

const activeTab = ref('overview')
const loadingCredentials = ref(false)
const showAddCredentialModal = ref(false)

// Stats
const stats = ref({
  activeProviders: 3,
  tenantsEnabled: 45,
  translationsToday: 12450,
  costThisMonth: '1,234.56'
})

const channelStats = ref([
  { name: 'SMS', icon: '📱', count: 4520 },
  { name: 'Chat', icon: '💬', count: 3210 },
  { name: 'Email', icon: '📧', count: 2180 },
  { name: 'Voice', icon: '📞', count: 890 },
  { name: 'WhatsApp', icon: '🟢', count: 1340 },
  { name: 'Social', icon: '📣', count: 310 }
])

const topSourceLanguages = ref([
  { code: 'es', name: 'Spanish', flag: '🇪🇸', percentage: 35 },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳', percentage: 22 },
  { code: 'fr', name: 'French', flag: '🇫🇷', percentage: 18 },
  { code: 'de', name: 'German', flag: '🇩🇪', percentage: 12 },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷', percentage: 8 }
])

const topTargetLanguages = ref([
  { code: 'en', name: 'English', flag: '🇺🇸', percentage: 65 },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', percentage: 15 },
  { code: 'fr', name: 'French', flag: '🇫🇷', percentage: 10 },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳', percentage: 6 },
  { code: 'de', name: 'German', flag: '🇩🇪', percentage: 4 }
])

// Providers
const providers = ref([])

// Credentials
const credentials = ref([])

// Health
const providerHealth = ref([
  { provider: 'google', displayName: 'Google Cloud', status: 'healthy', successRate: 99.8, latency: 120, requests: 45230, lastCheck: '1 min ago' },
  { provider: 'aws', displayName: 'Amazon Translate', status: 'healthy', successRate: 99.6, latency: 145, requests: 28100, lastCheck: '1 min ago' },
  { provider: 'deepl', displayName: 'DeepL', status: 'healthy', successRate: 99.9, latency: 95, requests: 12450, lastCheck: '2 min ago' }
])

// Usage
const usageDateRange = ref(30)
const usageGroupBy = ref('provider')
const usageData = ref({
  totalTranslations: 85780,
  totalCharacters: 24500000,
  cacheHitRate: 42,
  totalCost: 456.78
})
const usageBreakdown = ref([
  { name: 'Google Cloud', translations: 45230, characters: 12500000, cacheHitRate: 45, cost: 245.50, latency: 120 },
  { name: 'Amazon Translate', translations: 28100, characters: 8200000, cacheHitRate: 38, cost: 142.30, latency: 145 },
  { name: 'DeepL', translations: 12450, characters: 3800000, cacheHitRate: 52, cost: 68.98, latency: 95 }
])

// New credential form
const newCredential = ref({
  name: '',
  provider: '',
  credentials: {},
  monthlyLimit: 0,
  isDefault: false
})

// Provider credentials map for checking
const providerCredentialsMap = ref({})

onMounted(() => {
  fetchProviders()
  fetchCredentials()
})

watch(activeTab, (newTab) => {
  if (newTab === 'usage') {
    fetchUsage()
  }
  if (newTab === 'health') {
    fetchHealth()
  }
})

async function fetchProviders() {
  try {
    const response = await adminAPI.get('/translation/providers')
    providers.value = response.data.data || response.data.providers || []
  } catch (err) {
    console.error('Failed to fetch providers:', err)
    // Use placeholder data
    providers.value = [
      {
        name: 'google',
        display_name: 'Google Cloud Translation',
        is_active: true,
        capabilities: { text_translation: true, speech_to_text: true, text_to_speech: true, real_time: true, language_detection: true },
        pricing: { per_character: 0.00002, free_tier_characters: 500000 },
        supported_languages: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko', 'pt', 'it', 'ru', 'ar', 'hi']
      },
      {
        name: 'aws',
        display_name: 'Amazon Translate',
        is_active: true,
        capabilities: { text_translation: true, speech_to_text: true, text_to_speech: true, real_time: true, language_detection: true },
        pricing: { per_character: 0.000015, free_tier_characters: 2000000 },
        supported_languages: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko', 'pt', 'it', 'ru', 'ar']
      },
      {
        name: 'deepl',
        display_name: 'DeepL Translator',
        is_active: true,
        capabilities: { text_translation: true, document_translation: true, language_detection: true },
        pricing: { per_character: 0.00002, free_tier_characters: 500000 },
        supported_languages: ['en', 'de', 'fr', 'es', 'pt', 'it', 'nl', 'pl', 'ru', 'ja', 'zh']
      },
      {
        name: 'azure',
        display_name: 'Azure Translator',
        is_active: true,
        capabilities: { text_translation: true, speech_to_text: true, text_to_speech: true, real_time: true, language_detection: true },
        pricing: { per_character: 0.00001, free_tier_characters: 2000000 },
        supported_languages: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko', 'pt', 'it', 'ru', 'ar', 'hi', 'bn']
      },
      {
        name: 'ibm_watson',
        display_name: 'IBM Watson Language Translator',
        is_active: true,
        capabilities: { text_translation: true, language_detection: true },
        pricing: { per_character: 0.00002, free_tier_characters: 1000000 },
        supported_languages: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko', 'pt', 'it', 'ru', 'ar']
      }
    ]
  }
}

async function fetchCredentials() {
  loadingCredentials.value = true
  try {
    const response = await adminAPI.get('/translation/credentials')
    credentials.value = response.data.data || response.data.credentials || []

    // Build map for hasCredentials check
    providerCredentialsMap.value = {}
    credentials.value.forEach(c => {
      providerCredentialsMap.value[c.provider_name || c.provider_id] = true
    })
  } catch (err) {
    console.error('Failed to fetch credentials:', err)
    // Use placeholder data
    credentials.value = [
      {
        id: '1',
        name: 'Production Google',
        provider_id: 'google',
        is_active: true,
        health_status: 'healthy',
        avg_latency_ms: 120,
        monthly_limit: 10000000,
        current_usage: 2500000
      },
      {
        id: '2',
        name: 'AWS Translate Primary',
        provider_id: 'aws',
        is_active: true,
        health_status: 'healthy',
        avg_latency_ms: 145,
        monthly_limit: 0,
        current_usage: 1800000
      }
    ]
    providerCredentialsMap.value = { google: true, aws: true }
  } finally {
    loadingCredentials.value = false
  }
}

async function fetchUsage() {
  try {
    const response = await adminAPI.get('/translation/usage', {
      params: { days: usageDateRange.value, groupBy: usageGroupBy.value }
    })
    if (response.data.data) {
      usageData.value = response.data.data.summary || usageData.value
      usageBreakdown.value = response.data.data.breakdown || usageBreakdown.value
    }
  } catch (err) {
    console.error('Failed to fetch usage:', err)
  }
}

async function fetchHealth() {
  try {
    const response = await adminAPI.get('/translation/health')
    if (response.data.data) {
      providerHealth.value = response.data.data
    }
  } catch (err) {
    console.error('Failed to fetch health:', err)
  }
}

async function addCredential() {
  try {
    await adminAPI.post('/translation/credentials', {
      name: newCredential.value.name,
      provider: newCredential.value.provider,
      credentials: newCredential.value.credentials,
      monthly_limit: newCredential.value.monthlyLimit,
      is_default: newCredential.value.isDefault
    })
    showAddCredentialModal.value = false
    await fetchCredentials()
    // Reset form
    newCredential.value = {
      name: '',
      provider: '',
      credentials: {},
      monthlyLimit: 0,
      isDefault: false
    }
  } catch (err) {
    console.error('Failed to add credential:', err)
    alert('Failed to add credentials: ' + (err.response?.data?.error || err.message))
  }
}

async function testCredential(cred) {
  try {
    const response = await adminAPI.post(`/translation/credentials/${cred.id}/test`)
    if (response.data.success) {
      alert('Connection test successful!')
    } else {
      alert('Connection test failed: ' + (response.data.error || 'Unknown error'))
    }
  } catch (err) {
    console.error('Test failed:', err)
    alert('Connection test failed')
  }
}

function editCredential(cred) {
  console.log('Edit credential:', cred)
  alert('Credential editing coming soon!')
}

async function deleteCredential(cred) {
  if (!confirm(`Delete ${cred.name} credentials? This action cannot be undone.`)) return

  try {
    await adminAPI.delete(`/translation/credentials/${cred.id}`)
    await fetchCredentials()
  } catch (err) {
    console.error('Failed to delete credential:', err)
    alert('Failed to delete credentials')
  }
}

function hasCredentials(providerName) {
  return !!providerCredentialsMap.value[providerName]
}

function getProviderDisplayName(providerId) {
  const provider = providers.value.find(p => p.name === providerId || p.id === providerId)
  return provider?.display_name || providerId
}

function getProviderBorderClass(provider) {
  if (!provider.is_active) return 'border-gray-300'
  if (hasCredentials(provider.name)) return 'border-green-500'
  return 'border-yellow-500'
}

function formatCapability(cap) {
  return cap.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function formatCharCount(chars) {
  if (chars >= 1000000000) return (chars / 1000000000).toFixed(1) + 'B'
  if (chars >= 1000000) return (chars / 1000000).toFixed(1) + 'M'
  if (chars >= 1000) return (chars / 1000).toFixed(1) + 'K'
  return chars.toString()
}
</script>
