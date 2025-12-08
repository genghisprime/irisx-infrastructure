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
            <p class="text-2xl font-semibold text-gray-900">{{ stats.templates?.total || 0 }}</p>
          </div>
        </div>
        <p class="mt-2 text-sm text-gray-500">{{ stats.templates?.active || 0 }} active</p>
      </div>

      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center">
          <div class="p-3 rounded-full bg-green-100 text-green-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500">Emails (24h)</p>
            <p class="text-2xl font-semibold text-gray-900">{{ stats.emails?.total24h || 0 }}</p>
          </div>
        </div>
        <p class="mt-2 text-sm text-gray-500">{{ stats.emails?.deliveryRate || 0 }}% delivered</p>
      </div>

      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center">
          <div class="p-3 rounded-full bg-red-100 text-red-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500">Unsubscribes</p>
            <p class="text-2xl font-semibold text-gray-900">{{ stats.unsubscribes?.total || 0 }}</p>
          </div>
        </div>
        <p class="mt-2 text-sm text-gray-500">{{ stats.unsubscribes?.recent7d || 0 }} in last 7 days</p>
      </div>

      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center">
          <div class="p-3 rounded-full bg-yellow-100 text-yellow-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500">Bounces</p>
            <p class="text-2xl font-semibold text-gray-900">{{ stats.bounces?.total || 0 }}</p>
          </div>
        </div>
        <p class="mt-2 text-sm text-gray-500">{{ stats.bounces?.suppressed || 0 }} suppressed</p>
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
            v-model="filters.is_active"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            @change="fetchTemplates"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Template</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
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
                  <div class="text-sm text-gray-500">{{ template.slug }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm text-gray-900">{{ template.tenant_name || 'N/A' }}</span>
                </td>
                <td class="px-6 py-4">
                  <div class="text-sm text-gray-900 truncate max-w-xs">{{ template.subject }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm text-gray-900">{{ template.times_used || 0 }} uses</div>
                  <div class="text-xs text-gray-500">{{ template.last_used_at ? formatDate(template.last_used_at) : 'Never' }}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="template.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'" class="px-2 py-1 text-xs rounded-full">
                    {{ template.is_active ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(template.created_at) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button @click="viewTemplate(template)" class="text-blue-600 hover:text-blue-900">
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

      <!-- Emails Tab -->
      <div v-if="activeTab === 'emails'" class="p-6">
        <div class="flex flex-wrap gap-4 mb-6">
          <div class="flex-1 min-w-[200px]">
            <input
              v-model="emailFilters.search"
              type="text"
              placeholder="Search by email, subject..."
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              @input="debouncedFetchEmails"
            />
          </div>
          <select
            v-model="emailFilters.status"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            @change="fetchEmails"
          >
            <option value="">All Status</option>
            <option value="queued">Queued</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="bounced">Bounced</option>
            <option value="failed">Failed</option>
            <option value="opened">Opened</option>
            <option value="clicked">Clicked</option>
          </select>
          <select
            v-model="emailFilters.email_type"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            @change="fetchEmails"
          >
            <option value="">All Types</option>
            <option value="transactional">Transactional</option>
            <option value="marketing">Marketing</option>
            <option value="notification">Notification</option>
          </select>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From/To</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Engagement</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sent At</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="email in emails" :key="email.id" class="hover:bg-gray-50">
                <td class="px-6 py-4">
                  <div class="text-sm font-medium text-gray-900">{{ email.from_email }}</div>
                  <div class="text-sm text-gray-500">to {{ email.to_email }}</div>
                </td>
                <td class="px-6 py-4">
                  <div class="text-sm text-gray-900 truncate max-w-xs">{{ email.subject }}</div>
                  <div v-if="email.has_attachments" class="text-xs text-gray-500">{{ email.attachment_count }} attachment(s)</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="getTypeBadgeClass(email.email_type)" class="px-2 py-1 text-xs rounded-full">
                    {{ email.email_type }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="getStatusBadgeClass(email.status)" class="px-2 py-1 text-xs rounded-full">
                    {{ email.status }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center space-x-2 text-xs">
                    <span v-if="email.open_count > 0" class="text-green-600">{{ email.open_count }} opens</span>
                    <span v-if="email.click_count > 0" class="text-blue-600">{{ email.click_count }} clicks</span>
                    <span v-if="email.open_count === 0 && email.click_count === 0" class="text-gray-400">-</span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ email.sent_at ? formatDate(email.sent_at) : formatDate(email.created_at) }}
                </td>
              </tr>
              <tr v-if="emails.length === 0 && !loading">
                <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                  No emails found
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="emailPagination.total > 0" class="flex items-center justify-between px-6 py-3 border-t border-gray-200">
          <div class="text-sm text-gray-500">
            Showing {{ ((emailPagination.page - 1) * emailPagination.limit) + 1 }} to {{ Math.min(emailPagination.page * emailPagination.limit, emailPagination.total) }} of {{ emailPagination.total }} emails
          </div>
          <div class="flex space-x-2">
            <button
              @click="emailPagination.page--; fetchEmails()"
              :disabled="emailPagination.page === 1"
              class="px-3 py-1 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              @click="emailPagination.page++; fetchEmails()"
              :disabled="emailPagination.page * emailPagination.limit >= emailPagination.total"
              class="px-3 py-1 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <!-- Unsubscribes Tab -->
      <div v-if="activeTab === 'unsubscribes'" class="p-6">
        <div class="flex flex-wrap gap-4 mb-6">
          <div class="flex-1 min-w-[200px]">
            <input
              v-model="unsubscribeFilters.search"
              type="text"
              placeholder="Search email addresses..."
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              @input="debouncedFetchUnsubscribes"
            />
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email Address</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unsubscribed At</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="unsub in unsubscribes" :key="unsub.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm font-medium text-gray-900">{{ unsub.email_address }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm text-gray-900">{{ unsub.tenant_name || 'N/A' }}</span>
                </td>
                <td class="px-6 py-4">
                  <span class="text-sm text-gray-500">{{ unsub.reason || 'Not specified' }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(unsub.unsubscribed_at) }}
                </td>
              </tr>
              <tr v-if="unsubscribes.length === 0 && !loading">
                <td colspan="4" class="px-6 py-12 text-center text-gray-500">
                  No unsubscribes found
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Bounces Tab -->
      <div v-if="activeTab === 'bounces'" class="p-6">
        <div class="flex flex-wrap gap-4 mb-6">
          <div class="flex-1 min-w-[200px]">
            <input
              v-model="bounceFilters.search"
              type="text"
              placeholder="Search email addresses..."
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              @input="debouncedFetchBounces"
            />
          </div>
          <select
            v-model="bounceFilters.bounce_type"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            @change="fetchBounces"
          >
            <option value="">All Types</option>
            <option value="hard">Hard Bounce</option>
            <option value="soft">Soft Bounce</option>
          </select>
          <select
            v-model="bounceFilters.suppressed"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            @change="fetchBounces"
          >
            <option value="">All</option>
            <option value="true">Suppressed</option>
            <option value="false">Not Suppressed</option>
          </select>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email Address</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Bounced</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="bounce in bounces" :key="bounce.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm font-medium text-gray-900">{{ bounce.email_address }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm text-gray-900">{{ bounce.tenant_name || 'N/A' }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="bounce.bounce_type === 'hard' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'" class="px-2 py-1 text-xs rounded-full">
                    {{ bounce.bounce_type || 'unknown' }}
                  </span>
                </td>
                <td class="px-6 py-4">
                  <span class="text-sm text-gray-500 truncate max-w-xs block">{{ bounce.bounce_reason || '-' }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ bounce.bounce_count }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="bounce.is_suppressed ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'" class="px-2 py-1 text-xs rounded-full">
                    {{ bounce.is_suppressed ? 'Suppressed' : 'Active' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(bounce.last_bounced_at) }}
                </td>
              </tr>
              <tr v-if="bounces.length === 0 && !loading">
                <td colspan="7" class="px-6 py-12 text-center text-gray-500">
                  No bounces found
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Analytics Tab -->
      <div v-if="activeTab === 'analytics'" class="p-6">
        <div class="mb-8">
          <h3 class="text-lg font-medium text-gray-900 mb-4">Cost by Tenant</h3>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Emails Sent</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delivered</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bounced</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Cost</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="item in costByTenant" :key="item.tenant_id" class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-sm font-medium text-gray-900">{{ item.tenant_name }}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {{ item.emails_sent || 0 }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                    {{ item.delivered || 0 }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                    {{ item.bounced || 0 }}
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

        <div>
          <h3 class="text-lg font-medium text-gray-900 mb-4">Email Analytics</h3>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm font-medium text-gray-500">Total Emails</p>
              <p class="text-2xl font-semibold text-gray-900">{{ analytics.overall?.total || 0 }}</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm font-medium text-gray-500">Delivered</p>
              <p class="text-2xl font-semibold text-green-600">{{ analytics.overall?.delivered || 0 }}</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm font-medium text-gray-500">Opened</p>
              <p class="text-2xl font-semibold text-blue-600">{{ analytics.overall?.opened || 0 }}</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm font-medium text-gray-500">Total Cost</p>
              <p class="text-2xl font-semibold text-gray-900">${{ (analytics.overall?.total_cost || 0).toFixed(2) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Template Details Modal -->
    <div v-if="selectedTemplate" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 class="text-lg font-medium text-gray-900">Template Details</h3>
          <button @click="selectedTemplate = null" class="text-gray-400 hover:text-gray-500">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="px-6 py-4 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-500">Name</label>
              <p class="mt-1 text-sm text-gray-900">{{ selectedTemplate.name }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-500">Slug</label>
              <p class="mt-1 text-sm text-gray-900 font-mono">{{ selectedTemplate.slug }}</p>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-500">Subject</label>
            <p class="mt-1 text-sm text-gray-900">{{ selectedTemplate.subject }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-500">Description</label>
            <p class="mt-1 text-sm text-gray-900">{{ selectedTemplate.description || 'No description' }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-500">Variables</label>
            <div class="mt-1 flex flex-wrap gap-2">
              <span v-for="variable in (selectedTemplate.variables || [])" :key="variable" class="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                {{ variable }}
              </span>
              <span v-if="!selectedTemplate.variables || selectedTemplate.variables.length === 0" class="text-sm text-gray-500">No variables</span>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-500">Times Used</label>
              <p class="mt-1 text-sm text-gray-900">{{ selectedTemplate.times_used || 0 }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-500">Last Used</label>
              <p class="mt-1 text-sm text-gray-900">{{ selectedTemplate.last_used_at ? formatDate(selectedTemplate.last_used_at) : 'Never' }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-500">Status</label>
              <span :class="selectedTemplate.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'" class="mt-1 inline-block px-2 py-1 text-xs rounded-full">
                {{ selectedTemplate.is_active ? 'Active' : 'Inactive' }}
              </span>
            </div>
          </div>
          <div v-if="selectedTemplate.body_html">
            <label class="block text-sm font-medium text-gray-500">HTML Preview</label>
            <div class="mt-1 border rounded-lg p-4 bg-gray-50 max-h-60 overflow-auto">
              <div v-html="selectedTemplate.body_html" class="prose prose-sm"></div>
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

const loading = ref(false)
const activeTab = ref('templates')

const stats = ref({})
const templates = ref([])
const emails = ref([])
const unsubscribes = ref([])
const bounces = ref([])
const costByTenant = ref([])
const analytics = ref({})
const selectedTemplate = ref(null)

const filters = reactive({
  search: '',
  is_active: ''
})

const emailFilters = reactive({
  search: '',
  status: '',
  email_type: ''
})

const unsubscribeFilters = reactive({
  search: ''
})

const bounceFilters = reactive({
  search: '',
  bounce_type: '',
  suppressed: ''
})

const pagination = reactive({
  page: 1,
  limit: 20,
  total: 0
})

const emailPagination = reactive({
  page: 1,
  limit: 20,
  total: 0
})

const tabs = computed(() => [
  { id: 'templates', name: 'Templates', count: stats.value.templates?.total },
  { id: 'emails', name: 'Emails', count: stats.value.emails?.total24h },
  { id: 'unsubscribes', name: 'Unsubscribes', count: stats.value.unsubscribes?.total },
  { id: 'bounces', name: 'Bounces', count: stats.value.bounces?.total },
  { id: 'analytics', name: 'Analytics' }
])

let debounceTimer = null
const debouncedFetch = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(fetchTemplates, 300)
}

const debouncedFetchEmails = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(fetchEmails, 300)
}

const debouncedFetchUnsubscribes = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(fetchUnsubscribes, 300)
}

const debouncedFetchBounces = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(fetchBounces, 300)
}

async function fetchStats() {
  try {
    const data = await adminAPI.emailTemplates.getStats()
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

    const data = await adminAPI.emailTemplates.list(params)
    templates.value = data.templates || []
    pagination.total = data.pagination?.total || 0
  } catch (error) {
    console.error('Failed to fetch templates:', error)
  } finally {
    loading.value = false
  }
}

async function fetchEmails() {
  loading.value = true
  try {
    const params = {
      page: emailPagination.page,
      limit: emailPagination.limit,
      ...emailFilters
    }
    Object.keys(params).forEach(key => !params[key] && delete params[key])

    const data = await adminAPI.emailTemplates.getEmails(params)
    emails.value = data.emails || []
    emailPagination.total = data.pagination?.total || 0
  } catch (error) {
    console.error('Failed to fetch emails:', error)
  } finally {
    loading.value = false
  }
}

async function fetchUnsubscribes() {
  loading.value = true
  try {
    const params = { search: unsubscribeFilters.search }
    Object.keys(params).forEach(key => !params[key] && delete params[key])

    const data = await adminAPI.emailTemplates.getUnsubscribes(params)
    unsubscribes.value = data.unsubscribes || []
  } catch (error) {
    console.error('Failed to fetch unsubscribes:', error)
  } finally {
    loading.value = false
  }
}

async function fetchBounces() {
  loading.value = true
  try {
    const params = { ...bounceFilters }
    Object.keys(params).forEach(key => !params[key] && delete params[key])

    const data = await adminAPI.emailTemplates.getBounces(params)
    bounces.value = data.bounces || []
  } catch (error) {
    console.error('Failed to fetch bounces:', error)
  } finally {
    loading.value = false
  }
}

async function fetchCostByTenant() {
  try {
    const data = await adminAPI.emailTemplates.getCostByTenant({})
    costByTenant.value = data.costs || []
  } catch (error) {
    console.error('Failed to fetch cost by tenant:', error)
  }
}

async function fetchAnalytics() {
  try {
    const data = await adminAPI.emailTemplates.getAnalytics({})
    analytics.value = data
  } catch (error) {
    console.error('Failed to fetch analytics:', error)
  }
}

function viewTemplate(template) {
  selectedTemplate.value = template
}

function formatDate(date) {
  if (!date) return 'N/A'
  return new Date(date).toLocaleString()
}

function getStatusBadgeClass(status) {
  const classes = {
    queued: 'bg-gray-100 text-gray-800',
    sent: 'bg-blue-100 text-blue-800',
    delivered: 'bg-green-100 text-green-800',
    bounced: 'bg-red-100 text-red-800',
    failed: 'bg-red-100 text-red-800',
    opened: 'bg-purple-100 text-purple-800',
    clicked: 'bg-indigo-100 text-indigo-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

function getTypeBadgeClass(type) {
  const classes = {
    transactional: 'bg-blue-100 text-blue-800',
    marketing: 'bg-purple-100 text-purple-800',
    notification: 'bg-yellow-100 text-yellow-800'
  }
  return classes[type] || 'bg-gray-100 text-gray-800'
}

onMounted(async () => {
  await Promise.all([
    fetchStats(),
    fetchTemplates(),
    fetchEmails(),
    fetchUnsubscribes(),
    fetchBounces(),
    fetchCostByTenant(),
    fetchAnalytics()
  ])
})
</script>
