<template>
  <div class="space-y-6">
    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center">
          <div class="p-3 rounded-full bg-blue-100 text-blue-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500">Total Templates</p>
            <p class="text-2xl font-semibold text-gray-900">{{ stats.totalTemplates || 0 }}</p>
          </div>
        </div>
        <p class="mt-2 text-sm text-gray-500">{{ stats.activeTemplates || 0 }} active</p>
      </div>

      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center">
          <div class="p-3 rounded-full bg-green-100 text-green-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500">Messages (24h)</p>
            <p class="text-2xl font-semibold text-gray-900">{{ stats.messagesSent24h || 0 }}</p>
          </div>
        </div>
        <p class="mt-2 text-sm text-gray-500">{{ stats.messagesDelivered24h || 0 }} delivered</p>
      </div>

      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center">
          <div class="p-3 rounded-full bg-red-100 text-red-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500">Opt-Outs</p>
            <p class="text-2xl font-semibold text-gray-900">{{ stats.totalOptOuts || 0 }}</p>
          </div>
        </div>
        <p class="mt-2 text-sm text-gray-500">{{ stats.optOuts7d || 0 }} in last 7 days</p>
      </div>

      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center">
          <div class="p-3 rounded-full bg-yellow-100 text-yellow-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500">Scheduled</p>
            <p class="text-2xl font-semibold text-gray-900">{{ stats.scheduledMessages || 0 }}</p>
          </div>
        </div>
        <p class="mt-2 text-sm text-gray-500">{{ stats.pendingMessages || 0 }} pending</p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="bg-white rounded-lg shadow">
      <div class="border-b border-gray-200">
        <nav class="-mb-px flex space-x-8 px-6" aria-label="Tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            :class="[
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm'
            ]"
          >
            {{ tab.name }}
            <span
              v-if="tab.count !== undefined"
              :class="[
                activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-900',
                'ml-2 py-0.5 px-2.5 rounded-full text-xs font-medium'
              ]"
            >
              {{ tab.count }}
            </span>
          </button>
        </nav>
      </div>

      <!-- Templates Tab -->
      <div v-if="activeTab === 'templates'" class="p-6">
        <!-- Filters -->
        <div class="flex flex-wrap gap-4 mb-6">
          <div class="flex-1 min-w-[200px]">
            <input
              v-model="filters.search"
              type="text"
              placeholder="Search templates..."
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              @input="debouncedFetch"
            />
          </div>
          <select
            v-model="filters.tenant_id"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            @change="fetchTemplates"
          >
            <option value="">All Tenants</option>
            <option v-for="tenant in tenants" :key="tenant.id" :value="tenant.id">
              {{ tenant.name }}
            </option>
          </select>
          <select
            v-model="filters.category"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            @change="fetchTemplates"
          >
            <option value="">All Categories</option>
            <option value="marketing">Marketing</option>
            <option value="transactional">Transactional</option>
            <option value="notification">Notification</option>
            <option value="otp">OTP</option>
          </select>
          <select
            v-model="filters.status"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            @change="fetchTemplates"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <!-- Templates Table -->
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Template</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usage</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="template in templates" :key="template.id" class="hover:bg-gray-50">
                <td class="px-6 py-4">
                  <div class="text-sm font-medium text-gray-900">{{ template.name }}</div>
                  <div class="text-sm text-gray-500 truncate max-w-xs">{{ template.content }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm text-gray-900">{{ template.tenant_name || 'N/A' }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="getCategoryBadgeClass(template.category)" class="px-2 py-1 text-xs rounded-full">
                    {{ template.category || 'general' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">{{ template.usage_count || 0 }} uses</div>
                  <div class="text-xs text-gray-500">{{ template.last_used ? formatDate(template.last_used) : 'Never' }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="getStatusBadgeClass(template.status)" class="px-2 py-1 text-xs rounded-full">
                    {{ template.status || 'active' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(template.created_at) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button @click="viewTemplate(template)" class="text-blue-600 hover:text-blue-900 mr-3">
                    View
                  </button>
                </td>
              </tr>
              <tr v-if="templates.length === 0 && !loading">
                <td colspan="7" class="px-6 py-12 text-center text-gray-500">
                  No templates found
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div v-if="pagination.total > 0" class="flex items-center justify-between px-6 py-3 border-t border-gray-200">
          <div class="text-sm text-gray-500">
            Showing {{ ((pagination.page - 1) * pagination.limit) + 1 }} to {{ Math.min(pagination.page * pagination.limit, pagination.total) }} of {{ pagination.total }} templates
          </div>
          <div class="flex space-x-2">
            <button
              @click="pagination.page--; fetchTemplates()"
              :disabled="pagination.page === 1"
              class="px-3 py-1 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              @click="pagination.page++; fetchTemplates()"
              :disabled="pagination.page * pagination.limit >= pagination.total"
              class="px-3 py-1 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <!-- Messages Tab -->
      <div v-if="activeTab === 'messages'" class="p-6">
        <div class="flex flex-wrap gap-4 mb-6">
          <div class="flex-1 min-w-[200px]">
            <input
              v-model="messageFilters.search"
              type="text"
              placeholder="Search by phone number..."
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              @input="debouncedFetchMessages"
            />
          </div>
          <select
            v-model="messageFilters.status"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            @change="fetchMessages"
          >
            <option value="">All Status</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
          <select
            v-model="messageFilters.direction"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            @change="fetchMessages"
          >
            <option value="">All Directions</option>
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound</option>
          </select>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From/To</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Direction</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sent At</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="message in messages" :key="message.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-medium text-gray-900">{{ message.from_number }}</div>
                  <div class="text-sm text-gray-500">to {{ message.to_number }}</div>
                </td>
                <td class="px-6 py-4">
                  <div class="text-sm text-gray-900 truncate max-w-xs">{{ message.body }}</div>
                  <div class="text-xs text-gray-500">{{ message.segments || 1 }} segment(s)</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="message.direction === 'outbound' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'" class="px-2 py-1 text-xs rounded-full">
                    {{ message.direction }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="getMessageStatusClass(message.status)" class="px-2 py-1 text-xs rounded-full">
                    {{ message.status }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ${{ (message.cost || 0).toFixed(4) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(message.created_at) }}
                </td>
              </tr>
              <tr v-if="messages.length === 0 && !loading">
                <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                  No messages found
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="messagePagination.total > 0" class="flex items-center justify-between px-6 py-3 border-t border-gray-200">
          <div class="text-sm text-gray-500">
            Showing {{ ((messagePagination.page - 1) * messagePagination.limit) + 1 }} to {{ Math.min(messagePagination.page * messagePagination.limit, messagePagination.total) }} of {{ messagePagination.total }} messages
          </div>
          <div class="flex space-x-2">
            <button
              @click="messagePagination.page--; fetchMessages()"
              :disabled="messagePagination.page === 1"
              class="px-3 py-1 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              @click="messagePagination.page++; fetchMessages()"
              :disabled="messagePagination.page * messagePagination.limit >= messagePagination.total"
              class="px-3 py-1 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <!-- Opt-Outs Tab -->
      <div v-if="activeTab === 'optouts'" class="p-6">
        <div class="flex flex-wrap gap-4 mb-6">
          <div class="flex-1 min-w-[200px]">
            <input
              v-model="optOutFilters.search"
              type="text"
              placeholder="Search phone numbers..."
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              @input="debouncedFetchOptOuts"
            />
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone Number</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Opted Out At</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="optOut in optOuts" :key="optOut.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm font-medium text-gray-900">{{ optOut.phone_number }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm text-gray-900">{{ optOut.tenant_name || 'N/A' }}</span>
                </td>
                <td class="px-6 py-4">
                  <span class="text-sm text-gray-500">{{ optOut.reason || 'Not specified' }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
                    {{ optOut.source || 'manual' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(optOut.created_at) }}
                </td>
              </tr>
              <tr v-if="optOuts.length === 0 && !loading">
                <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                  No opt-outs found
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Scheduled Tab -->
      <div v-if="activeTab === 'scheduled'" class="p-6">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">To Number</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scheduled For</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="scheduled in scheduledMessages" :key="scheduled.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm font-medium text-gray-900">{{ scheduled.to_number }}</span>
                </td>
                <td class="px-6 py-4">
                  <div class="text-sm text-gray-900 truncate max-w-xs">{{ scheduled.body }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm text-gray-900">{{ scheduled.tenant_name || 'N/A' }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="getScheduledStatusClass(scheduled.status)" class="px-2 py-1 text-xs rounded-full">
                    {{ scheduled.status }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(scheduled.scheduled_at) }}
                </td>
              </tr>
              <tr v-if="scheduledMessages.length === 0 && !loading">
                <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                  No scheduled messages found
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Analytics Tab -->
      <div v-if="activeTab === 'analytics'" class="p-6">
        <!-- Cost by Tenant -->
        <div class="mb-8">
          <h3 class="text-lg font-medium text-gray-900 mb-4">Cost by Tenant</h3>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Messages Sent</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delivered</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Failed</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Cost</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="item in costByTenant" :key="item.tenant_id" class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-sm font-medium text-gray-900">{{ item.tenant_name }}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {{ item.messages_sent || 0 }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                    {{ item.delivered || 0 }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                    {{ item.failed || 0 }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    ${{ (item.total_cost || 0).toFixed(2) }}
                  </td>
                </tr>
                <tr v-if="costByTenant.length === 0 && !loading">
                  <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                    No cost data available
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Analytics Data -->
        <div>
          <h3 class="text-lg font-medium text-gray-900 mb-4">Message Analytics</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm font-medium text-gray-500">Total Messages</p>
              <p class="text-2xl font-semibold text-gray-900">{{ analytics.totalMessages || 0 }}</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm font-medium text-gray-500">Delivery Rate</p>
              <p class="text-2xl font-semibold text-green-600">{{ analytics.deliveryRate || 0 }}%</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm font-medium text-gray-500">Total Cost</p>
              <p class="text-2xl font-semibold text-gray-900">${{ (analytics.totalCost || 0).toFixed(2) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Template Details Modal -->
    <div v-if="selectedTemplate" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 class="text-lg font-medium text-gray-900">Template Details</h3>
          <button @click="selectedTemplate = null" class="text-gray-400 hover:text-gray-500">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="px-6 py-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-500">Name</label>
            <p class="mt-1 text-sm text-gray-900">{{ selectedTemplate.name }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-500">Content</label>
            <p class="mt-1 text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">{{ selectedTemplate.content }}</p>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-500">Category</label>
              <p class="mt-1 text-sm text-gray-900">{{ selectedTemplate.category || 'general' }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-500">Status</label>
              <span :class="getStatusBadgeClass(selectedTemplate.status)" class="mt-1 inline-block px-2 py-1 text-xs rounded-full">
                {{ selectedTemplate.status || 'active' }}
              </span>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-500">Usage Count</label>
              <p class="mt-1 text-sm text-gray-900">{{ selectedTemplate.usage_count || 0 }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-500">Last Used</label>
              <p class="mt-1 text-sm text-gray-900">{{ selectedTemplate.last_used ? formatDate(selectedTemplate.last_used) : 'Never' }}</p>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-500">Variables</label>
            <div class="mt-1 flex flex-wrap gap-2">
              <span v-for="variable in extractVariables(selectedTemplate.content)" :key="variable" class="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                {{ variable }}
              </span>
              <span v-if="extractVariables(selectedTemplate.content).length === 0" class="text-sm text-gray-500">No variables</span>
            </div>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button @click="selectedTemplate = null" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Loading Overlay -->
    <div v-if="loading" class="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-40">
      <div class="bg-white rounded-lg p-6 flex items-center space-x-3">
        <svg class="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="text-gray-700">Loading...</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { adminAPI } from '../../../utils/api'

// State
const loading = ref(false)
const activeTab = ref('templates')

const stats = ref({})
const templates = ref([])
const messages = ref([])
const optOuts = ref([])
const scheduledMessages = ref([])
const costByTenant = ref([])
const analytics = ref({})
const tenants = ref([])
const selectedTemplate = ref(null)

// Filters
const filters = reactive({
  search: '',
  tenant_id: '',
  category: '',
  status: ''
})

const messageFilters = reactive({
  search: '',
  status: '',
  direction: ''
})

const optOutFilters = reactive({
  search: ''
})

// Pagination
const pagination = reactive({
  page: 1,
  limit: 20,
  total: 0
})

const messagePagination = reactive({
  page: 1,
  limit: 20,
  total: 0
})

// Tabs
const tabs = computed(() => [
  { id: 'templates', name: 'Templates', count: stats.value.totalTemplates },
  { id: 'messages', name: 'Messages', count: stats.value.messagesSent24h },
  { id: 'optouts', name: 'Opt-Outs', count: stats.value.totalOptOuts },
  { id: 'scheduled', name: 'Scheduled', count: stats.value.scheduledMessages },
  { id: 'analytics', name: 'Analytics' }
])

// Debounce
let debounceTimer = null
const debouncedFetch = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(fetchTemplates, 300)
}

const debouncedFetchMessages = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(fetchMessages, 300)
}

const debouncedFetchOptOuts = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(fetchOptOuts, 300)
}

// Fetch functions
async function fetchStats() {
  try {
    const data = await adminAPI.smsTemplates.getStats()
    stats.value = data
  } catch (error) {
    console.error('Failed to fetch stats:', error)
  }
}

async function fetchTemplates() {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      limit: pagination.limit,
      ...filters
    }
    Object.keys(params).forEach(key => !params[key] && delete params[key])

    const data = await adminAPI.smsTemplates.list(params)
    templates.value = data.templates || []
    pagination.total = data.total || 0
  } catch (error) {
    console.error('Failed to fetch templates:', error)
  } finally {
    loading.value = false
  }
}

async function fetchMessages() {
  loading.value = true
  try {
    const params = {
      page: messagePagination.page,
      limit: messagePagination.limit,
      ...messageFilters
    }
    Object.keys(params).forEach(key => !params[key] && delete params[key])

    const data = await adminAPI.smsTemplates.getMessages(params)
    messages.value = data.messages || []
    messagePagination.total = data.total || 0
  } catch (error) {
    console.error('Failed to fetch messages:', error)
  } finally {
    loading.value = false
  }
}

async function fetchOptOuts() {
  loading.value = true
  try {
    const params = { search: optOutFilters.search }
    Object.keys(params).forEach(key => !params[key] && delete params[key])

    const data = await adminAPI.smsTemplates.getOptOuts(params)
    optOuts.value = data.optOuts || []
  } catch (error) {
    console.error('Failed to fetch opt-outs:', error)
  } finally {
    loading.value = false
  }
}

async function fetchScheduled() {
  loading.value = true
  try {
    const data = await adminAPI.smsTemplates.getScheduled({})
    scheduledMessages.value = data.scheduled || []
  } catch (error) {
    console.error('Failed to fetch scheduled:', error)
  } finally {
    loading.value = false
  }
}

async function fetchCostByTenant() {
  try {
    const data = await adminAPI.smsTemplates.getCostByTenant({})
    costByTenant.value = data.costs || []
  } catch (error) {
    console.error('Failed to fetch cost by tenant:', error)
  }
}

async function fetchAnalytics() {
  try {
    const data = await adminAPI.smsTemplates.getAnalytics({})
    analytics.value = data
  } catch (error) {
    console.error('Failed to fetch analytics:', error)
  }
}

function viewTemplate(template) {
  selectedTemplate.value = template
}

// Helper functions
function formatDate(date) {
  if (!date) return 'N/A'
  return new Date(date).toLocaleString()
}

function getCategoryBadgeClass(category) {
  const classes = {
    marketing: 'bg-purple-100 text-purple-800',
    transactional: 'bg-blue-100 text-blue-800',
    notification: 'bg-yellow-100 text-yellow-800',
    otp: 'bg-green-100 text-green-800'
  }
  return classes[category] || 'bg-gray-100 text-gray-800'
}

function getStatusBadgeClass(status) {
  const classes = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    pending: 'bg-yellow-100 text-yellow-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

function getMessageStatusClass(status) {
  const classes = {
    sent: 'bg-blue-100 text-blue-800',
    delivered: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

function getScheduledStatusClass(status) {
  const classes = {
    pending: 'bg-yellow-100 text-yellow-800',
    sent: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

function extractVariables(content) {
  if (!content) return []
  const matches = content.match(/\{\{(\w+)\}\}/g) || []
  return [...new Set(matches)]
}

// Lifecycle
onMounted(async () => {
  await Promise.all([
    fetchStats(),
    fetchTemplates(),
    fetchMessages(),
    fetchOptOuts(),
    fetchScheduled(),
    fetchCostByTenant(),
    fetchAnalytics()
  ])
})
</script>
