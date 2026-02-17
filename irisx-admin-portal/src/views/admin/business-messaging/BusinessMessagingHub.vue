<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-zinc-100">Business Messaging</h1>
        <p class="text-zinc-400 mt-1">Manage Apple Business Messages, Google Business Messages, and RCS</p>
      </div>
      <button
        @click="refreshAll"
        :disabled="loading"
        class="flex items-center gap-2 px-4 py-2 bg-zinc-700 text-zinc-100 rounded-lg hover:bg-zinc-600 disabled:opacity-50"
      >
        <svg class="w-4 h-4" :class="{ 'animate-spin': loading }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Refresh
      </button>
    </div>

    <!-- Platform Tabs -->
    <div class="border-b border-zinc-700">
      <nav class="flex gap-4">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            'px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === tab.id
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          ]"
        >
          <div class="flex items-center gap-2">
            <component :is="tab.icon" class="w-5 h-5" />
            {{ tab.name }}
          </div>
        </button>
      </nav>
    </div>

    <!-- Overview Tab -->
    <div v-if="activeTab === 'overview'" class="space-y-6">
      <!-- Platform Stats -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Apple Stats Card -->
        <div class="bg-zinc-800 rounded-lg p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="p-2 bg-zinc-700 rounded-lg">
              <svg class="w-6 h-6 text-zinc-300" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-zinc-100">Apple Business Messages</h3>
              <p class="text-sm text-zinc-400">iMessage for Business</p>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="text-2xl font-bold text-zinc-100">{{ overview.apple?.accounts || 0 }}</p>
              <p class="text-sm text-zinc-400">Accounts</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-zinc-100">{{ overview.apple?.conversations || 0 }}</p>
              <p class="text-sm text-zinc-400">Conversations</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-zinc-100">{{ formatNumber(overview.apple?.total_messages) }}</p>
              <p class="text-sm text-zinc-400">Total Messages</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-green-400">{{ overview.apple?.messages_24h || 0 }}</p>
              <p class="text-sm text-zinc-400">Last 24h</p>
            </div>
          </div>
        </div>

        <!-- Google Stats Card -->
        <div class="bg-zinc-800 rounded-lg p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="p-2 bg-zinc-700 rounded-lg">
              <svg class="w-6 h-6 text-zinc-300" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"/>
              </svg>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-zinc-100">Google Business Messages</h3>
              <p class="text-sm text-zinc-400">Maps & Search Messaging</p>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="text-2xl font-bold text-zinc-100">{{ overview.google?.agents || 0 }}</p>
              <p class="text-sm text-zinc-400">Agents</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-zinc-100">{{ overview.google?.locations || 0 }}</p>
              <p class="text-sm text-zinc-400">Locations</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-zinc-100">{{ formatNumber(overview.google?.total_messages) }}</p>
              <p class="text-sm text-zinc-400">Total Messages</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-green-400">{{ overview.google?.messages_24h || 0 }}</p>
              <p class="text-sm text-zinc-400">Last 24h</p>
            </div>
          </div>
        </div>

        <!-- RCS Stats Card -->
        <div class="bg-zinc-800 rounded-lg p-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="p-2 bg-zinc-700 rounded-lg">
              <svg class="w-6 h-6 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-zinc-100">RCS Messaging</h3>
              <p class="text-sm text-zinc-400">Rich Communication Services</p>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="text-2xl font-bold text-zinc-100">{{ overview.rcs?.accounts || 0 }}</p>
              <p class="text-sm text-zinc-400">Accounts</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-zinc-100">{{ overview.rcs?.conversations || 0 }}</p>
              <p class="text-sm text-zinc-400">Conversations</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-zinc-100">{{ formatNumber(overview.rcs?.total_messages) }}</p>
              <p class="text-sm text-zinc-400">Total Messages</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-amber-400">{{ overview.rcs?.sms_fallback_count || 0 }}</p>
              <p class="text-sm text-zinc-400">SMS Fallback</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Tenant Breakdown -->
      <div class="bg-zinc-800 rounded-lg p-6">
        <h3 class="text-lg font-semibold text-zinc-100 mb-4">Tenant Configuration</h3>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="text-left text-zinc-400 border-b border-zinc-700">
                <th class="pb-3 font-medium">Tenant</th>
                <th class="pb-3 font-medium text-center">Apple</th>
                <th class="pb-3 font-medium text-center">Google</th>
                <th class="pb-3 font-medium text-center">RCS</th>
                <th class="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tenant in overview.tenants" :key="tenant.tenant_id" class="border-b border-zinc-700/50">
                <td class="py-3 text-zinc-100">{{ tenant.tenant_name }}</td>
                <td class="py-3 text-center">
                  <span v-if="tenant.apple_accounts > 0" class="text-green-400">{{ tenant.apple_accounts }} active</span>
                  <span v-else class="text-zinc-500">Not configured</span>
                </td>
                <td class="py-3 text-center">
                  <span v-if="tenant.google_agents > 0" class="text-green-400">{{ tenant.google_agents }} agents</span>
                  <span v-else class="text-zinc-500">Not configured</span>
                </td>
                <td class="py-3 text-center">
                  <span v-if="tenant.rcs_accounts > 0" class="text-green-400">{{ tenant.rcs_accounts }} active</span>
                  <span v-else class="text-zinc-500">Not configured</span>
                </td>
                <td class="py-3 text-right">
                  <button
                    @click="openTenantSettings(tenant.tenant_id)"
                    class="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Configure
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Unified Analytics Chart -->
      <div class="bg-zinc-800 rounded-lg p-6">
        <h3 class="text-lg font-semibold text-zinc-100 mb-4">Message Volume (Last 30 Days)</h3>
        <div class="h-64 flex items-center justify-center text-zinc-500">
          <!-- Chart placeholder - integrate with a charting library -->
          <div class="text-center">
            <svg class="w-12 h-12 mx-auto mb-2 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p>Analytics chart will display message volume across all platforms</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Apple Business Messages Tab -->
    <div v-if="activeTab === 'apple'" class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-zinc-100">Apple Business Accounts</h2>
        <div class="flex gap-2">
          <select v-model="appleFilters.status" class="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-zinc-100 text-sm">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      <div class="bg-zinc-800 rounded-lg overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="text-left text-zinc-400 border-b border-zinc-700 bg-zinc-800/50">
              <th class="px-4 py-3 font-medium">Business</th>
              <th class="px-4 py-3 font-medium">Tenant</th>
              <th class="px-4 py-3 font-medium">Conversations</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium">Created</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="account in appleAccounts" :key="account.id" class="border-b border-zinc-700/50 hover:bg-zinc-700/30">
              <td class="px-4 py-3">
                <div>
                  <p class="text-zinc-100 font-medium">{{ account.business_name }}</p>
                  <p class="text-zinc-400 text-sm">{{ account.business_id }}</p>
                </div>
              </td>
              <td class="px-4 py-3 text-zinc-300">{{ account.tenant_name }}</td>
              <td class="px-4 py-3 text-zinc-300">{{ account.conversation_count || 0 }}</td>
              <td class="px-4 py-3">
                <span :class="getStatusClass(account.status)">{{ account.status }}</span>
              </td>
              <td class="px-4 py-3 text-zinc-400 text-sm">{{ formatDate(account.created_at) }}</td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  <button
                    v-if="account.status === 'pending'"
                    @click="updateAppleStatus(account.id, 'active')"
                    class="text-green-400 hover:text-green-300 text-sm"
                  >
                    Activate
                  </button>
                  <button
                    v-if="account.status === 'active'"
                    @click="updateAppleStatus(account.id, 'suspended')"
                    class="text-amber-400 hover:text-amber-300 text-sm"
                  >
                    Suspend
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="appleAccounts.length === 0">
              <td colspan="6" class="px-4 py-8 text-center text-zinc-500">
                No Apple Business accounts found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Google Business Messages Tab -->
    <div v-if="activeTab === 'google'" class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-zinc-100">Google Business Agents</h2>
        <div class="flex gap-2">
          <select v-model="googleFilters.status" class="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-zinc-100 text-sm">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      <div class="bg-zinc-800 rounded-lg overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="text-left text-zinc-400 border-b border-zinc-700 bg-zinc-800/50">
              <th class="px-4 py-3 font-medium">Agent</th>
              <th class="px-4 py-3 font-medium">Tenant</th>
              <th class="px-4 py-3 font-medium">Locations</th>
              <th class="px-4 py-3 font-medium">Conversations</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="agent in googleAgents" :key="agent.id" class="border-b border-zinc-700/50 hover:bg-zinc-700/30">
              <td class="px-4 py-3">
                <div>
                  <p class="text-zinc-100 font-medium">{{ agent.display_name }}</p>
                  <p class="text-zinc-400 text-sm">{{ agent.agent_id }}</p>
                </div>
              </td>
              <td class="px-4 py-3 text-zinc-300">{{ agent.tenant_name }}</td>
              <td class="px-4 py-3 text-zinc-300">{{ agent.location_count || 0 }}</td>
              <td class="px-4 py-3 text-zinc-300">{{ agent.conversation_count || 0 }}</td>
              <td class="px-4 py-3">
                <span :class="getStatusClass(agent.status)">{{ agent.status }}</span>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  <button
                    @click="viewGoogleLocations(agent.id)"
                    class="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Locations
                  </button>
                  <button
                    v-if="agent.status === 'active'"
                    @click="updateGoogleStatus(agent.id, 'suspended')"
                    class="text-amber-400 hover:text-amber-300 text-sm"
                  >
                    Suspend
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="googleAgents.length === 0">
              <td colspan="6" class="px-4 py-8 text-center text-zinc-500">
                No Google Business agents found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- RCS Tab -->
    <div v-if="activeTab === 'rcs'" class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-zinc-100">RCS Accounts</h2>
        <div class="flex gap-2">
          <select v-model="rcsFilters.provider" class="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-zinc-100 text-sm">
            <option value="">All Providers</option>
            <option value="sinch">Sinch</option>
            <option value="google_jibe">Google Jibe</option>
            <option value="mavenir">Mavenir</option>
            <option value="bandwidth">Bandwidth</option>
          </select>
          <select v-model="rcsFilters.status" class="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-zinc-100 text-sm">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      <!-- RCS Capability Stats -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-zinc-800 rounded-lg p-4">
          <p class="text-zinc-400 text-sm">Cached Numbers</p>
          <p class="text-2xl font-bold text-zinc-100">{{ rcsCapabilityStats.total_cached || 0 }}</p>
        </div>
        <div class="bg-zinc-800 rounded-lg p-4">
          <p class="text-zinc-400 text-sm">RCS Enabled</p>
          <p class="text-2xl font-bold text-green-400">{{ rcsCapabilityStats.rcs_enabled_count || 0 }}</p>
        </div>
        <div class="bg-zinc-800 rounded-lg p-4">
          <p class="text-zinc-400 text-sm">RCS Disabled</p>
          <p class="text-2xl font-bold text-amber-400">{{ rcsCapabilityStats.rcs_disabled_count || 0 }}</p>
        </div>
        <div class="bg-zinc-800 rounded-lg p-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-zinc-400 text-sm">Expired Cache</p>
              <p class="text-2xl font-bold text-red-400">{{ rcsCapabilityStats.expired_count || 0 }}</p>
            </div>
            <button
              v-if="rcsCapabilityStats.expired_count > 0"
              @click="clearExpiredCache"
              class="text-sm text-red-400 hover:text-red-300"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div class="bg-zinc-800 rounded-lg overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="text-left text-zinc-400 border-b border-zinc-700 bg-zinc-800/50">
              <th class="px-4 py-3 font-medium">Agent</th>
              <th class="px-4 py-3 font-medium">Tenant</th>
              <th class="px-4 py-3 font-medium">Provider</th>
              <th class="px-4 py-3 font-medium">Conversations</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="account in rcsAccounts" :key="account.id" class="border-b border-zinc-700/50 hover:bg-zinc-700/30">
              <td class="px-4 py-3">
                <div>
                  <p class="text-zinc-100 font-medium">{{ account.agent_name }}</p>
                  <p class="text-zinc-400 text-sm">{{ account.agent_id }}</p>
                </div>
              </td>
              <td class="px-4 py-3 text-zinc-300">{{ account.tenant_name }}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-1 bg-zinc-700 rounded text-zinc-300 text-sm capitalize">
                  {{ account.provider?.replace('_', ' ') }}
                </span>
              </td>
              <td class="px-4 py-3 text-zinc-300">{{ account.conversation_count || 0 }}</td>
              <td class="px-4 py-3">
                <span :class="getStatusClass(account.status)">{{ account.status }}</span>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  <button
                    v-if="account.status === 'pending'"
                    @click="verifyRcsAccount(account.id)"
                    class="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Verify
                  </button>
                  <button
                    v-if="account.status === 'active'"
                    @click="updateRcsStatus(account.id, 'suspended')"
                    class="text-amber-400 hover:text-amber-300 text-sm"
                  >
                    Suspend
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="rcsAccounts.length === 0">
              <td colspan="6" class="px-4 py-8 text-center text-zinc-500">
                No RCS accounts found
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- RCS Fallback Stats -->
      <div class="bg-zinc-800 rounded-lg p-6">
        <h3 class="text-lg font-semibold text-zinc-100 mb-4">SMS Fallback Statistics</h3>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="text-left text-zinc-400 border-b border-zinc-700">
                <th class="pb-3 font-medium">Date</th>
                <th class="pb-3 font-medium text-right">RCS Delivered</th>
                <th class="pb-3 font-medium text-right">SMS Fallback</th>
                <th class="pb-3 font-medium text-right">Success Rate</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="stat in rcsFallbackStats" :key="stat.date" class="border-b border-zinc-700/50">
                <td class="py-2 text-zinc-300">{{ formatDate(stat.date) }}</td>
                <td class="py-2 text-right text-green-400">{{ stat.rcs_delivered }}</td>
                <td class="py-2 text-right text-amber-400">{{ stat.sms_fallback }}</td>
                <td class="py-2 text-right text-zinc-100">{{ stat.rcs_success_rate }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Templates Tab -->
    <div v-if="activeTab === 'templates'" class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-zinc-100">Message Templates</h2>
        <div class="flex gap-2">
          <select v-model="templateFilters.platform" class="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-zinc-100 text-sm">
            <option value="">All Platforms</option>
            <option value="apple">Apple</option>
            <option value="google">Google</option>
            <option value="rcs">RCS</option>
          </select>
          <select v-model="templateFilters.status" class="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-zinc-100 text-sm">
            <option value="">All Status</option>
            <option value="pending">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div class="bg-zinc-800 rounded-lg overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="text-left text-zinc-400 border-b border-zinc-700 bg-zinc-800/50">
              <th class="px-4 py-3 font-medium">Template</th>
              <th class="px-4 py-3 font-medium">Platform</th>
              <th class="px-4 py-3 font-medium">Type</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="platform in ['apple', 'google', 'rcs']" :key="platform">
              <tr
                v-for="template in getFilteredTemplates(platform)"
                :key="`${platform}-${template.id}`"
                class="border-b border-zinc-700/50 hover:bg-zinc-700/30"
              >
                <td class="px-4 py-3">
                  <div>
                    <p class="text-zinc-100 font-medium">{{ template.name }}</p>
                    <p class="text-zinc-400 text-sm">{{ template.category }}</p>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span class="px-2 py-1 bg-zinc-700 rounded text-zinc-300 text-sm capitalize">
                    {{ platform }}
                  </span>
                </td>
                <td class="px-4 py-3 text-zinc-300">{{ template.template_type }}</td>
                <td class="px-4 py-3">
                  <span :class="getTemplateStatusClass(template.status)">{{ template.status }}</span>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <button
                      v-if="template.status === 'pending'"
                      @click="approveTemplate(platform, template.id)"
                      class="text-green-400 hover:text-green-300 text-sm"
                    >
                      Approve
                    </button>
                    <button
                      v-if="template.status === 'pending'"
                      @click="rejectTemplate(platform, template.id)"
                      class="text-red-400 hover:text-red-300 text-sm"
                    >
                      Reject
                    </button>
                    <button
                      @click="viewTemplate(platform, template)"
                      class="text-blue-400 hover:text-blue-300 text-sm"
                    >
                      View
                    </button>
                  </div>
                </td>
              </tr>
            </template>
            <tr v-if="allTemplatesEmpty">
              <td colspan="5" class="px-4 py-8 text-center text-zinc-500">
                No templates found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Webhooks Tab -->
    <div v-if="activeTab === 'webhooks'" class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-zinc-100">Recent Webhook Events</h2>
        <div class="flex gap-2">
          <select v-model="webhookFilters.platform" class="bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-zinc-100 text-sm">
            <option value="">All Platforms</option>
            <option value="apple">Apple</option>
            <option value="google">Google</option>
            <option value="rcs">RCS</option>
          </select>
        </div>
      </div>

      <div class="bg-zinc-800 rounded-lg overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="text-left text-zinc-400 border-b border-zinc-700 bg-zinc-800/50">
              <th class="px-4 py-3 font-medium">Timestamp</th>
              <th class="px-4 py-3 font-medium">Platform</th>
              <th class="px-4 py-3 font-medium">Event Type</th>
              <th class="px-4 py-3 font-medium">Tenant</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in webhookLogs" :key="log.id" class="border-b border-zinc-700/50 hover:bg-zinc-700/30">
              <td class="px-4 py-3 text-zinc-400 text-sm">{{ formatDateTime(log.received_at) }}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-1 bg-zinc-700 rounded text-zinc-300 text-sm capitalize">
                  {{ log.platform }}
                </span>
              </td>
              <td class="px-4 py-3 text-zinc-300">{{ log.event_type }}</td>
              <td class="px-4 py-3 text-zinc-400 text-sm">{{ log.tenant_id }}</td>
              <td class="px-4 py-3 text-right">
                <button
                  @click="viewWebhookPayload(log)"
                  class="text-blue-400 hover:text-blue-300 text-sm"
                >
                  View Payload
                </button>
              </td>
            </tr>
            <tr v-if="webhookLogs.length === 0">
              <td colspan="5" class="px-4 py-8 text-center text-zinc-500">
                No webhook logs found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Webhook Payload Modal -->
    <div
      v-if="showPayloadModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="showPayloadModal = false"
    >
      <div class="bg-zinc-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-zinc-100">Webhook Payload</h3>
          <button @click="showPayloadModal = false" class="text-zinc-400 hover:text-zinc-200">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <pre class="bg-zinc-900 rounded p-4 text-sm text-zinc-300 overflow-x-auto">{{ JSON.stringify(selectedPayload, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAdminAuthStore } from '@/stores/adminAuth'

const authStore = useAdminAuthStore()

const loading = ref(false)
const activeTab = ref('overview')

const tabs = [
  { id: 'overview', name: 'Overview', icon: 'ChartIcon' },
  { id: 'apple', name: 'Apple Business', icon: 'AppleIcon' },
  { id: 'google', name: 'Google Business', icon: 'GoogleIcon' },
  { id: 'rcs', name: 'RCS', icon: 'MessageIcon' },
  { id: 'templates', name: 'Templates', icon: 'TemplateIcon' },
  { id: 'webhooks', name: 'Webhooks', icon: 'WebhookIcon' }
]

// Data
const overview = ref({})
const appleAccounts = ref([])
const googleAgents = ref([])
const rcsAccounts = ref([])
const rcsCapabilityStats = ref({})
const rcsFallbackStats = ref([])
const templates = ref({ apple: [], google: [], rcs: [] })
const webhookLogs = ref([])

// Filters
const appleFilters = ref({ status: '' })
const googleFilters = ref({ status: '' })
const rcsFilters = ref({ provider: '', status: '' })
const templateFilters = ref({ platform: '', status: '' })
const webhookFilters = ref({ platform: '' })

// Modals
const showPayloadModal = ref(false)
const selectedPayload = ref(null)

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

async function fetchWithAuth(url) {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Authorization': `Bearer ${authStore.token}`,
      'Content-Type': 'application/json'
    }
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function postWithAuth(url, data) {
  const response = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authStore.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function patchWithAuth(url, data) {
  const response = await fetch(`${API_BASE}${url}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${authStore.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function deleteWithAuth(url) {
  const response = await fetch(`${API_BASE}${url}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${authStore.token}`
    }
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function loadOverview() {
  try {
    overview.value = await fetchWithAuth('/admin/business-messaging/overview')
  } catch (error) {
    console.error('Failed to load overview:', error)
  }
}

async function loadAppleAccounts() {
  try {
    const params = new URLSearchParams()
    if (appleFilters.value.status) params.append('status', appleFilters.value.status)
    const data = await fetchWithAuth(`/admin/business-messaging/apple/accounts?${params}`)
    appleAccounts.value = data.accounts || []
  } catch (error) {
    console.error('Failed to load Apple accounts:', error)
  }
}

async function loadGoogleAgents() {
  try {
    const params = new URLSearchParams()
    if (googleFilters.value.status) params.append('status', googleFilters.value.status)
    const data = await fetchWithAuth(`/admin/business-messaging/google/agents?${params}`)
    googleAgents.value = data.agents || []
  } catch (error) {
    console.error('Failed to load Google agents:', error)
  }
}

async function loadRcsAccounts() {
  try {
    const params = new URLSearchParams()
    if (rcsFilters.value.provider) params.append('provider', rcsFilters.value.provider)
    if (rcsFilters.value.status) params.append('status', rcsFilters.value.status)
    const data = await fetchWithAuth(`/admin/business-messaging/rcs/accounts?${params}`)
    rcsAccounts.value = data.accounts || []
  } catch (error) {
    console.error('Failed to load RCS accounts:', error)
  }
}

async function loadRcsCapabilityStats() {
  try {
    const data = await fetchWithAuth('/admin/business-messaging/rcs/capability-stats')
    rcsCapabilityStats.value = data.stats || {}
  } catch (error) {
    console.error('Failed to load RCS capability stats:', error)
  }
}

async function loadRcsFallbackStats() {
  try {
    const data = await fetchWithAuth('/admin/business-messaging/rcs/fallback-stats')
    rcsFallbackStats.value = data.stats || []
  } catch (error) {
    console.error('Failed to load RCS fallback stats:', error)
  }
}

async function loadTemplates() {
  try {
    const params = new URLSearchParams()
    if (templateFilters.value.platform) params.append('platform', templateFilters.value.platform)
    if (templateFilters.value.status) params.append('status', templateFilters.value.status)
    const data = await fetchWithAuth(`/admin/business-messaging/templates?${params}`)
    templates.value = data.templates || { apple: [], google: [], rcs: [] }
  } catch (error) {
    console.error('Failed to load templates:', error)
  }
}

async function loadWebhookLogs() {
  try {
    const params = new URLSearchParams()
    if (webhookFilters.value.platform) params.append('platform', webhookFilters.value.platform)
    const data = await fetchWithAuth(`/admin/business-messaging/webhooks/logs?${params}`)
    webhookLogs.value = data.logs || []
  } catch (error) {
    console.error('Failed to load webhook logs:', error)
  }
}

async function refreshAll() {
  loading.value = true
  try {
    await Promise.all([
      loadOverview(),
      loadAppleAccounts(),
      loadGoogleAgents(),
      loadRcsAccounts(),
      loadRcsCapabilityStats(),
      loadRcsFallbackStats(),
      loadTemplates(),
      loadWebhookLogs()
    ])
  } finally {
    loading.value = false
  }
}

async function updateAppleStatus(id, status) {
  try {
    await patchWithAuth(`/admin/business-messaging/apple/accounts/${id}/status`, { status })
    await loadAppleAccounts()
  } catch (error) {
    console.error('Failed to update Apple status:', error)
  }
}

async function updateGoogleStatus(id, status) {
  try {
    await patchWithAuth(`/admin/business-messaging/google/agents/${id}/status`, { status })
    await loadGoogleAgents()
  } catch (error) {
    console.error('Failed to update Google status:', error)
  }
}

async function updateRcsStatus(id, status) {
  try {
    await patchWithAuth(`/admin/business-messaging/rcs/accounts/${id}/status`, { status })
    await loadRcsAccounts()
  } catch (error) {
    console.error('Failed to update RCS status:', error)
  }
}

async function verifyRcsAccount(id) {
  try {
    await postWithAuth(`/admin/business-messaging/rcs/accounts/${id}/verify`, {})
    await loadRcsAccounts()
  } catch (error) {
    console.error('Failed to verify RCS account:', error)
  }
}

async function clearExpiredCache() {
  try {
    await deleteWithAuth('/admin/business-messaging/rcs/capability-cache/expired')
    await loadRcsCapabilityStats()
  } catch (error) {
    console.error('Failed to clear expired cache:', error)
  }
}

async function approveTemplate(platform, id) {
  try {
    await patchWithAuth(`/admin/business-messaging/templates/${platform}/${id}/status`, { status: 'approved' })
    await loadTemplates()
  } catch (error) {
    console.error('Failed to approve template:', error)
  }
}

async function rejectTemplate(platform, id) {
  const reason = prompt('Rejection reason:')
  if (reason === null) return
  try {
    await patchWithAuth(`/admin/business-messaging/templates/${platform}/${id}/status`, {
      status: 'rejected',
      rejectionReason: reason
    })
    await loadTemplates()
  } catch (error) {
    console.error('Failed to reject template:', error)
  }
}

function viewTemplate(platform, template) {
  selectedPayload.value = template
  showPayloadModal.value = true
}

function viewWebhookPayload(log) {
  selectedPayload.value = log.payload
  showPayloadModal.value = true
}

function viewGoogleLocations(agentId) {
  // Navigate to locations view or open modal
  console.log('View locations for agent:', agentId)
}

function openTenantSettings(tenantId) {
  // Navigate to tenant settings
  console.log('Open settings for tenant:', tenantId)
}

function getFilteredTemplates(platform) {
  if (templateFilters.value.platform && templateFilters.value.platform !== platform) {
    return []
  }
  let items = templates.value[platform] || []
  if (templateFilters.value.status) {
    items = items.filter(t => t.status === templateFilters.value.status)
  }
  return items
}

const allTemplatesEmpty = computed(() => {
  const all = [
    ...getFilteredTemplates('apple'),
    ...getFilteredTemplates('google'),
    ...getFilteredTemplates('rcs')
  ]
  return all.length === 0
})

function getStatusClass(status) {
  const classes = {
    active: 'px-2 py-1 bg-green-500/20 text-green-400 rounded text-sm',
    pending: 'px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-sm',
    suspended: 'px-2 py-1 bg-red-500/20 text-red-400 rounded text-sm'
  }
  return classes[status] || 'px-2 py-1 bg-zinc-700 text-zinc-400 rounded text-sm'
}

function getTemplateStatusClass(status) {
  const classes = {
    approved: 'px-2 py-1 bg-green-500/20 text-green-400 rounded text-sm',
    pending: 'px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-sm',
    rejected: 'px-2 py-1 bg-red-500/20 text-red-400 rounded text-sm'
  }
  return classes[status] || 'px-2 py-1 bg-zinc-700 text-zinc-400 rounded text-sm'
}

function formatNumber(num) {
  if (!num) return '0'
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString()
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString()
}

// Watch for filter changes
watch(appleFilters, loadAppleAccounts, { deep: true })
watch(googleFilters, loadGoogleAgents, { deep: true })
watch(rcsFilters, loadRcsAccounts, { deep: true })
watch(templateFilters, loadTemplates, { deep: true })
watch(webhookFilters, loadWebhookLogs, { deep: true })

onMounted(() => {
  refreshAll()
})
</script>
