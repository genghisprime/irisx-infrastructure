<template>
  <div class="space-y-6">
    <!-- Statistics Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-500">Total Accounts</p>
            <p class="text-2xl font-bold text-gray-900">{{ stats.totalAccounts || 0 }}</p>
          </div>
          <div class="p-3 bg-green-100 rounded-full">
            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          <span class="text-green-600">{{ stats.activeAccounts || 0 }}</span> active
        </p>
      </div>

      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-500">Templates</p>
            <p class="text-2xl font-bold text-gray-900">{{ stats.totalTemplates || 0 }}</p>
          </div>
          <div class="p-3 bg-blue-100 rounded-full">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          <span class="text-green-600">{{ stats.approvedTemplates || 0 }}</span> approved
        </p>
      </div>

      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-500">Messages (24h)</p>
            <p class="text-2xl font-bold text-gray-900">{{ stats.messages24h || 0 }}</p>
          </div>
          <div class="p-3 bg-purple-100 rounded-full">
            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          <span class="text-blue-600">{{ stats.messagesSent24h || 0 }}</span> sent,
          <span class="text-green-600">{{ stats.messagesReceived24h || 0 }}</span> received
        </p>
      </div>

      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-500">Delivery Rate</p>
            <p class="text-2xl font-bold text-gray-900">{{ stats.deliveryRate || 0 }}%</p>
          </div>
          <div class="p-3 bg-yellow-100 rounded-full">
            <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          <span class="text-green-600">{{ stats.messagesDelivered || 0 }}</span> delivered
        </p>
      </div>

      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-500">Active Contacts</p>
            <p class="text-2xl font-bold text-gray-900">{{ stats.totalContacts || 0 }}</p>
          </div>
          <div class="p-3 bg-indigo-100 rounded-full">
            <svg class="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          <span class="text-green-600">{{ stats.optedInContacts || 0 }}</span> opted in
        </p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="bg-white rounded-lg shadow">
      <div class="border-b border-gray-200">
        <nav class="flex -mb-px">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            :class="[
              'px-6 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            ]"
          >
            {{ tab.name }}
          </button>
        </nav>
      </div>

      <!-- Accounts Tab -->
      <div v-if="activeTab === 'accounts'" class="p-6">
        <div class="flex justify-between items-center mb-4">
          <div class="flex gap-4">
            <select v-model="accountFilters.status" class="px-3 py-2 border rounded-md text-sm">
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
            <select v-model="accountFilters.tenant_id" class="px-3 py-2 border rounded-md text-sm">
              <option value="">All Tenants</option>
              <option v-for="t in tenants" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>
          <button @click="loadAccounts" class="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700">
            Refresh
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone Number</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Display Name</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quality</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Messages</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="account in accounts" :key="account.id" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ account.phone_number }}</td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ account.display_name || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ account.tenant_name || `Tenant ${account.tenant_id}` }}</td>
                <td class="px-4 py-3">
                  <span :class="getStatusClass(account.status)">{{ account.status }}</span>
                </td>
                <td class="px-4 py-3">
                  <span :class="getQualityClass(account.quality_rating)">{{ account.quality_rating || 'N/A' }}</span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ account.message_count || 0 }}</td>
                <td class="px-4 py-3 text-sm">
                  <button @click="viewAccountDetails(account)" class="text-green-600 hover:text-green-800 mr-2">View</button>
                  <button
                    v-if="account.status === 'active'"
                    @click="updateAccountStatus(account.id, 'suspended')"
                    class="text-red-600 hover:text-red-800"
                  >Suspend</button>
                  <button
                    v-else
                    @click="updateAccountStatus(account.id, 'active')"
                    class="text-green-600 hover:text-green-800"
                  >Activate</button>
                </td>
              </tr>
              <tr v-if="accounts.length === 0">
                <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                  No WhatsApp accounts found
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-4 flex justify-between items-center">
          <p class="text-sm text-gray-500">
            Showing {{ accounts.length }} of {{ pagination.total }} accounts
          </p>
          <div class="flex gap-2">
            <button
              @click="pagination.page--; loadAccounts()"
              :disabled="pagination.page <= 1"
              class="px-3 py-1 border rounded text-sm disabled:opacity-50"
            >Previous</button>
            <button
              @click="pagination.page++; loadAccounts()"
              :disabled="accounts.length < pagination.limit"
              class="px-3 py-1 border rounded text-sm disabled:opacity-50"
            >Next</button>
          </div>
        </div>
      </div>

      <!-- Templates Tab -->
      <div v-if="activeTab === 'templates'" class="p-6">
        <div class="flex justify-between items-center mb-4">
          <div class="flex gap-4">
            <select v-model="templateFilters.status" class="px-3 py-2 border rounded-md text-sm">
              <option value="">All Statuses</option>
              <option value="APPROVED">Approved</option>
              <option value="PENDING">Pending</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <select v-model="templateFilters.category" class="px-3 py-2 border rounded-md text-sm">
              <option value="">All Categories</option>
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
              <option value="AUTHENTICATION">Authentication</option>
            </select>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template Name</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Language</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Delivered</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Read</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="template in templates" :key="template.id" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ template.template_name }}</td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ template.category }}</td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ template.language }}</td>
                <td class="px-4 py-3">
                  <span :class="getTemplateStatusClass(template.status)">{{ template.status }}</span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ template.sent_count || 0 }}</td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ template.delivered_count || 0 }}</td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ template.read_count || 0 }}</td>
              </tr>
              <tr v-if="templates.length === 0">
                <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                  No templates found
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Messages Tab -->
      <div v-if="activeTab === 'messages'" class="p-6">
        <div class="flex justify-between items-center mb-4">
          <div class="flex gap-4">
            <select v-model="messageFilters.direction" class="px-3 py-2 border rounded-md text-sm">
              <option value="">All Directions</option>
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
            <select v-model="messageFilters.status" class="px-3 py-2 border rounded-md text-sm">
              <option value="">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="delivered">Delivered</option>
              <option value="read">Read</option>
              <option value="failed">Failed</option>
            </select>
            <input
              v-model="messageFilters.phone_number"
              type="text"
              placeholder="Search phone number..."
              class="px-3 py-2 border rounded-md text-sm w-48"
            />
          </div>
          <button @click="loadMessages" class="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700">
            Search
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Direction</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">From</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">To</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="message in messages" :key="message.id" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm text-gray-500">{{ formatDate(message.created_at) }}</td>
                <td class="px-4 py-3">
                  <span :class="message.direction === 'outbound' ? 'text-blue-600' : 'text-green-600'">
                    {{ message.direction }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-900">{{ message.from_number }}</td>
                <td class="px-4 py-3 text-sm text-gray-900">{{ message.to_number }}</td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ message.message_type }}</td>
                <td class="px-4 py-3">
                  <span :class="getMessageStatusClass(message.status)">{{ message.status }}</span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                  {{ message.text_body || message.template_name || '-' }}
                </td>
              </tr>
              <tr v-if="messages.length === 0">
                <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                  No messages found
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Webhooks Tab -->
      <div v-if="activeTab === 'webhooks'" class="p-6">
        <div class="flex justify-between items-center mb-4">
          <div class="flex gap-4">
            <select v-model="webhookFilters.event_type" class="px-3 py-2 border rounded-md text-sm">
              <option value="">All Event Types</option>
              <option value="messages">Messages</option>
              <option value="statuses">Statuses</option>
            </select>
            <select v-model="webhookFilters.processed" class="px-3 py-2 border rounded-md text-sm">
              <option value="">All</option>
              <option value="true">Processed</option>
              <option value="false">Pending</option>
            </select>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Received At</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event Type</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone Number ID</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Processed</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="webhook in webhooks" :key="webhook.id" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm text-gray-500">{{ formatDate(webhook.received_at) }}</td>
                <td class="px-4 py-3 text-sm text-gray-900">{{ webhook.event_type }}</td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ webhook.phone_number_id }}</td>
                <td class="px-4 py-3">
                  <span :class="webhook.processed ? 'text-green-600' : 'text-yellow-600'">
                    {{ webhook.processed ? 'Yes' : 'No' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-red-500 max-w-xs truncate">
                  {{ webhook.processing_error || '-' }}
                </td>
              </tr>
              <tr v-if="webhooks.length === 0">
                <td colspan="5" class="px-4 py-8 text-center text-gray-500">
                  No webhook events found
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Contacts Tab -->
      <div v-if="activeTab === 'contacts'" class="p-6">
        <div class="flex justify-between items-center mb-4">
          <div class="flex gap-4">
            <select v-model="contactFilters.opted_in" class="px-3 py-2 border rounded-md text-sm">
              <option value="">All Contacts</option>
              <option value="true">Opted In</option>
              <option value="false">Opted Out</option>
            </select>
            <input
              v-model="contactFilters.phone_number"
              type="text"
              placeholder="Search phone number..."
              class="px-3 py-2 border rounded-md text-sm w-48"
            />
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone Number</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">WhatsApp Name</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Opted In</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Messages</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Contact</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="contact in contacts" :key="contact.id" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ contact.phone_number }}</td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ contact.whatsapp_name || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ contact.tenant_name || `Tenant ${contact.tenant_id}` }}</td>
                <td class="px-4 py-3">
                  <span :class="contact.opted_in ? 'text-green-600' : 'text-red-600'">
                    {{ contact.opted_in ? 'Yes' : 'No' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ contact.message_count || 0 }}</td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ formatDate(contact.last_contacted_at) }}</td>
              </tr>
              <tr v-if="contacts.length === 0">
                <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                  No contacts found
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Analytics Tab -->
      <div v-if="activeTab === 'analytics'" class="p-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Messages by Tenant -->
          <div class="bg-gray-50 rounded-lg p-4">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Messages by Tenant</h3>
            <div class="space-y-3">
              <div v-for="tenant in analytics.messagesByTenant || []" :key="tenant.tenant_id" class="flex justify-between items-center">
                <span class="text-sm text-gray-600">{{ tenant.tenant_name || `Tenant ${tenant.tenant_id}` }}</span>
                <span class="text-sm font-medium text-gray-900">{{ tenant.message_count }}</span>
              </div>
              <div v-if="!analytics.messagesByTenant?.length" class="text-center text-gray-500 py-4">
                No data available
              </div>
            </div>
          </div>

          <!-- Templates by Status -->
          <div class="bg-gray-50 rounded-lg p-4">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Templates by Status</h3>
            <div class="space-y-3">
              <div v-for="status in analytics.templatesByStatus || []" :key="status.status" class="flex justify-between items-center">
                <span :class="getTemplateStatusClass(status.status)">{{ status.status }}</span>
                <span class="text-sm font-medium text-gray-900">{{ status.count }}</span>
              </div>
              <div v-if="!analytics.templatesByStatus?.length" class="text-center text-gray-500 py-4">
                No data available
              </div>
            </div>
          </div>

          <!-- Message Types -->
          <div class="bg-gray-50 rounded-lg p-4">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Message Types</h3>
            <div class="space-y-3">
              <div v-for="type in analytics.messageTypes || []" :key="type.message_type" class="flex justify-between items-center">
                <span class="text-sm text-gray-600">{{ type.message_type }}</span>
                <span class="text-sm font-medium text-gray-900">{{ type.count }}</span>
              </div>
              <div v-if="!analytics.messageTypes?.length" class="text-center text-gray-500 py-4">
                No data available
              </div>
            </div>
          </div>

          <!-- Delivery Stats -->
          <div class="bg-gray-50 rounded-lg p-4">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Delivery Statistics</h3>
            <div class="space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600">Sent</span>
                <span class="text-sm font-medium text-gray-900">{{ analytics.deliveryStats?.sent || 0 }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600">Delivered</span>
                <span class="text-sm font-medium text-green-600">{{ analytics.deliveryStats?.delivered || 0 }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600">Read</span>
                <span class="text-sm font-medium text-blue-600">{{ analytics.deliveryStats?.read || 0 }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600">Failed</span>
                <span class="text-sm font-medium text-red-600">{{ analytics.deliveryStats?.failed || 0 }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Account Details Modal -->
    <div v-if="showAccountModal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b">
          <div class="flex justify-between items-center">
            <h3 class="text-lg font-semibold text-gray-900">Account Details</h3>
            <button @click="showAccountModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div class="p-6" v-if="selectedAccount">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium text-gray-500">Phone Number</label>
              <p class="text-gray-900">{{ selectedAccount.phone_number }}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-500">Display Name</label>
              <p class="text-gray-900">{{ selectedAccount.display_name || '-' }}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-500">Business Account ID</label>
              <p class="text-gray-900">{{ selectedAccount.business_account_id || '-' }}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-500">Phone Number ID</label>
              <p class="text-gray-900">{{ selectedAccount.phone_number_id }}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-500">Status</label>
              <p><span :class="getStatusClass(selectedAccount.status)">{{ selectedAccount.status }}</span></p>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-500">Quality Rating</label>
              <p><span :class="getQualityClass(selectedAccount.quality_rating)">{{ selectedAccount.quality_rating || 'N/A' }}</span></p>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-500">Messaging Limit</label>
              <p class="text-gray-900">{{ selectedAccount.messaging_limit || 'Standard' }}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-500">Daily Limit</label>
              <p class="text-gray-900">{{ selectedAccount.daily_conversation_limit || 'Unlimited' }}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-500">Verified</label>
              <p :class="selectedAccount.verified ? 'text-green-600' : 'text-yellow-600'">
                {{ selectedAccount.verified ? 'Yes' : 'No' }}
              </p>
            </div>
            <div>
              <label class="text-sm font-medium text-gray-500">Last Synced</label>
              <p class="text-gray-900">{{ formatDate(selectedAccount.last_synced_at) }}</p>
            </div>
          </div>

          <div class="mt-6">
            <h4 class="text-sm font-medium text-gray-500 mb-2">Recent Templates</h4>
            <div class="space-y-2">
              <div v-for="template in selectedAccount.templates || []" :key="template.id"
                   class="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span class="text-sm text-gray-900">{{ template.template_name }}</span>
                <span :class="getTemplateStatusClass(template.status)">{{ template.status }}</span>
              </div>
              <div v-if="!selectedAccount.templates?.length" class="text-center text-gray-500 py-2">
                No templates
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { adminAPI } from '../../../utils/api'

const stats = ref({})
const accounts = ref([])
const templates = ref([])
const messages = ref([])
const webhooks = ref([])
const contacts = ref([])
const analytics = ref({})
const tenants = ref([])
const loading = ref(false)

const activeTab = ref('accounts')
const showAccountModal = ref(false)
const selectedAccount = ref(null)

const tabs = [
  { id: 'accounts', name: 'Accounts' },
  { id: 'templates', name: 'Templates' },
  { id: 'messages', name: 'Messages' },
  { id: 'webhooks', name: 'Webhooks' },
  { id: 'contacts', name: 'Contacts' },
  { id: 'analytics', name: 'Analytics' }
]

const pagination = reactive({
  page: 1,
  limit: 20,
  total: 0
})

const accountFilters = reactive({
  status: '',
  tenant_id: ''
})

const templateFilters = reactive({
  status: '',
  category: ''
})

const messageFilters = reactive({
  direction: '',
  status: '',
  phone_number: ''
})

const webhookFilters = reactive({
  event_type: '',
  processed: ''
})

const contactFilters = reactive({
  opted_in: '',
  phone_number: ''
})

onMounted(async () => {
  await loadStats()
  await loadAccounts()
})

watch(activeTab, async (newTab) => {
  if (newTab === 'accounts') await loadAccounts()
  else if (newTab === 'templates') await loadTemplates()
  else if (newTab === 'messages') await loadMessages()
  else if (newTab === 'webhooks') await loadWebhooks()
  else if (newTab === 'contacts') await loadContacts()
  else if (newTab === 'analytics') await loadAnalytics()
})

async function loadStats() {
  try {
    const data = await adminAPI.whatsapp.getStats()
    stats.value = data
  } catch (error) {
    console.error('Failed to load stats:', error)
  }
}

async function loadAccounts() {
  try {
    loading.value = true
    const params = {
      page: pagination.page,
      limit: pagination.limit,
      ...accountFilters
    }
    const data = await adminAPI.whatsapp.getAccounts(params)
    accounts.value = data.accounts || []
    pagination.total = data.total || 0
    tenants.value = data.tenants || []
  } catch (error) {
    console.error('Failed to load accounts:', error)
  } finally {
    loading.value = false
  }
}

async function loadTemplates() {
  try {
    loading.value = true
    const data = await adminAPI.whatsapp.getTemplates(templateFilters)
    templates.value = data.templates || []
  } catch (error) {
    console.error('Failed to load templates:', error)
  } finally {
    loading.value = false
  }
}

async function loadMessages() {
  try {
    loading.value = true
    const data = await adminAPI.whatsapp.getMessages(messageFilters)
    messages.value = data.messages || []
  } catch (error) {
    console.error('Failed to load messages:', error)
  } finally {
    loading.value = false
  }
}

async function loadWebhooks() {
  try {
    loading.value = true
    const data = await adminAPI.whatsapp.getWebhooks(webhookFilters)
    webhooks.value = data.webhooks || []
  } catch (error) {
    console.error('Failed to load webhooks:', error)
  } finally {
    loading.value = false
  }
}

async function loadContacts() {
  try {
    loading.value = true
    const data = await adminAPI.whatsapp.getContacts(contactFilters)
    contacts.value = data.contacts || []
  } catch (error) {
    console.error('Failed to load contacts:', error)
  } finally {
    loading.value = false
  }
}

async function loadAnalytics() {
  try {
    loading.value = true
    const data = await adminAPI.whatsapp.getAnalytics({})
    analytics.value = data
  } catch (error) {
    console.error('Failed to load analytics:', error)
  } finally {
    loading.value = false
  }
}

async function viewAccountDetails(account) {
  try {
    const data = await adminAPI.whatsapp.getAccountDetails(account.id)
    selectedAccount.value = data.account
    showAccountModal.value = true
  } catch (error) {
    console.error('Failed to load account details:', error)
  }
}

async function updateAccountStatus(accountId, status) {
  try {
    await adminAPI.whatsapp.updateAccountStatus(accountId, status)
    await loadAccounts()
    await loadStats()
  } catch (error) {
    console.error('Failed to update account status:', error)
  }
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleString()
}

function getStatusClass(status) {
  const classes = {
    active: 'px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800',
    inactive: 'px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800',
    suspended: 'px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800'
  }
  return classes[status] || classes.inactive
}

function getQualityClass(rating) {
  const classes = {
    GREEN: 'px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800',
    YELLOW: 'px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800',
    RED: 'px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800'
  }
  return classes[rating] || 'px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800'
}

function getTemplateStatusClass(status) {
  const classes = {
    APPROVED: 'px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800',
    PENDING: 'px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800',
    REJECTED: 'px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800'
  }
  return classes[status] || 'px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800'
}

function getMessageStatusClass(status) {
  const classes = {
    sent: 'px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800',
    delivered: 'px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800',
    read: 'px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800',
    failed: 'px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800',
    pending: 'px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800'
  }
  return classes[status] || 'px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800'
}
</script>
