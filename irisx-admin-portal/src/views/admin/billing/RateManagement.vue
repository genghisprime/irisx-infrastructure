<template>
  <div class="space-y-6">
    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center">
          <div class="p-3 bg-blue-100 rounded-lg">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm text-gray-500">Total Rates</p>
            <p class="text-2xl font-semibold">{{ stats.total_rates || 0 }}</p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center">
          <div class="p-3 bg-green-100 rounded-lg">
            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm text-gray-500">Active Rates</p>
            <p class="text-2xl font-semibold">{{ stats.active_rates || 0 }}</p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center">
          <div class="p-3 bg-purple-100 rounded-lg">
            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm text-gray-500">Carriers</p>
            <p class="text-2xl font-semibold">{{ stats.unique_carriers || 0 }}</p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center">
          <div class="p-3 bg-yellow-100 rounded-lg">
            <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm text-gray-500">Avg Rate/Min</p>
            <p class="text-2xl font-semibold">${{ formatRate(stats.avg_cost_per_minute) }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="bg-white rounded-lg shadow">
      <div class="border-b border-gray-200">
        <nav class="flex space-x-4 px-6" aria-label="Tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            :class="[
              'py-4 px-2 border-b-2 font-medium text-sm whitespace-nowrap',
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            ]"
          >
            {{ tab.name }}
          </button>
        </nav>
      </div>

      <!-- Rate Table Tab -->
      <div v-if="activeTab === 'rates'" class="p-6">
        <!-- Search and Filters -->
        <div class="flex flex-wrap gap-4 mb-6">
          <div class="flex-1 min-w-[200px]">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search prefix, destination, or carrier..."
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              @input="debouncedSearch"
            />
          </div>
          <select
            v-model="filterCarrier"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            @change="loadRates"
          >
            <option value="">All Carriers</option>
            <option v-for="carrier in carriers" :key="carrier.carrier_name" :value="carrier.carrier_name">
              {{ carrier.carrier_name }} ({{ carrier.rate_count }})
            </option>
          </select>
          <select
            v-model="filterActive"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            @change="loadRates"
          >
            <option value="">All Status</option>
            <option value="true">Active Only</option>
            <option value="false">Inactive Only</option>
          </select>
          <button
            @click="showCreateModal = true"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Rate
          </button>
          <button
            @click="showImportModal = true"
            class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Import CSV
          </button>
          <button
            @click="exportRates"
            class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        </div>

        <!-- Rates Table -->
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  @click="sortBy('prefix')"
                >
                  Prefix
                  <span v-if="sortColumn === 'prefix'" class="ml-1">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  @click="sortBy('destination_name')"
                >
                  Destination
                  <span v-if="sortColumn === 'destination_name'" class="ml-1">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  @click="sortBy('cost_per_minute')"
                >
                  Rate/Min
                  <span v-if="sortColumn === 'cost_per_minute'" class="ml-1">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Conn Fee
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  @click="sortBy('carrier_name')"
                >
                  Carrier
                  <span v-if="sortColumn === 'carrier_name'" class="ml-1">{{ sortOrder === 'asc' ? '↑' : '↓' }}</span>
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Effective
                </th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="rate in rates" :key="rate.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="font-mono text-sm font-medium">{{ rate.prefix }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm text-gray-900">{{ rate.destination_name }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm font-medium text-green-600">${{ formatRate(rate.cost_per_minute) }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm text-gray-500">${{ formatRate(rate.connection_fee) }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="text-sm text-gray-900">{{ rate.carrier_name || '-' }}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span
                    :class="[
                      'px-2 py-1 text-xs font-medium rounded-full',
                      rate.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    ]"
                  >
                    {{ rate.is_active ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {{ formatDate(rate.effective_date) }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    @click="editRate(rate)"
                    class="text-blue-600 hover:text-blue-900 mr-3"
                  >
                    Edit
                  </button>
                  <button
                    @click="confirmDelete(rate)"
                    class="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
              <tr v-if="rates.length === 0 && !loading">
                <td colspan="8" class="px-6 py-12 text-center text-gray-500">
                  No rates found
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="flex items-center justify-between mt-4">
          <div class="text-sm text-gray-500">
            Showing {{ ((pagination.page - 1) * pagination.limit) + 1 }} to
            {{ Math.min(pagination.page * pagination.limit, pagination.total) }} of
            {{ pagination.total }} rates
          </div>
          <div class="flex space-x-2">
            <button
              @click="pagination.page--; loadRates()"
              :disabled="pagination.page <= 1"
              class="px-3 py-1 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              @click="pagination.page++; loadRates()"
              :disabled="pagination.page >= pagination.totalPages"
              class="px-3 py-1 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <!-- LCR Lookup Tab -->
      <div v-if="activeTab === 'lookup'" class="p-6">
        <div class="max-w-2xl">
          <h3 class="text-lg font-medium mb-4">Least Cost Routing Lookup</h3>
          <p class="text-gray-600 mb-6">
            Enter a destination phone number to find the best available rates across all carriers.
          </p>

          <div class="flex gap-4 mb-6">
            <input
              v-model="lookupNumber"
              type="text"
              placeholder="Enter phone number (e.g., +14155551234)"
              class="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              @keyup.enter="performLookup"
            />
            <button
              @click="performLookup"
              :disabled="!lookupNumber || lookupLoading"
              class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="lookupLoading">Searching...</span>
              <span v-else>Find Rates</span>
            </button>
          </div>

          <!-- Lookup Results -->
          <div v-if="lookupResult" class="space-y-4">
            <div v-if="lookupResult.found" class="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 class="font-medium text-green-800 mb-2">Best Rate Found</h4>
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="text-gray-600">Destination:</span>
                  <span class="ml-2 font-medium">{{ lookupResult.best_rate.destination_name }}</span>
                </div>
                <div>
                  <span class="text-gray-600">Carrier:</span>
                  <span class="ml-2 font-medium">{{ lookupResult.best_rate.carrier_name || 'Default' }}</span>
                </div>
                <div>
                  <span class="text-gray-600">Rate/Min:</span>
                  <span class="ml-2 font-medium text-green-600">${{ formatRate(lookupResult.best_rate.cost_per_minute) }}</span>
                </div>
                <div>
                  <span class="text-gray-600">Est. 1-min Cost:</span>
                  <span class="ml-2 font-medium">${{ lookupResult.estimated_cost_1min }}</span>
                </div>
              </div>
            </div>

            <div v-if="lookupResult.found && lookupResult.all_rates?.length > 1" class="bg-white border rounded-lg">
              <h4 class="font-medium p-4 border-b">All Matching Rates ({{ lookupResult.total_matching_rates }})</h4>
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Prefix</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Destination</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Carrier</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Rate/Min</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Priority</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <tr v-for="(rate, index) in lookupResult.all_rates" :key="rate.id" :class="index === 0 ? 'bg-green-50' : ''">
                    <td class="px-4 py-2 font-mono text-sm">{{ rate.prefix }}</td>
                    <td class="px-4 py-2 text-sm">{{ rate.destination_name }}</td>
                    <td class="px-4 py-2 text-sm">{{ rate.carrier_name || '-' }}</td>
                    <td class="px-4 py-2 text-sm font-medium text-green-600">${{ formatRate(rate.cost_per_minute) }}</td>
                    <td class="px-4 py-2 text-sm">{{ rate.carrier_priority }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="!lookupResult.found" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p class="text-yellow-800">No matching rates found for this destination.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Carriers Tab -->
      <div v-if="activeTab === 'carriers'" class="p-6">
        <h3 class="text-lg font-medium mb-4">Carrier Summary</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Carrier</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Rates</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Active</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Cost</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Min Cost</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Max Cost</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Updated</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="carrier in carriers" :key="carrier.carrier_name" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap font-medium">{{ carrier.carrier_name }}</td>
                <td class="px-6 py-4 whitespace-nowrap">{{ carrier.rate_count }}</td>
                <td class="px-6 py-4 whitespace-nowrap">{{ carrier.active_count }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-green-600">${{ formatRate(carrier.avg_cost) }}</td>
                <td class="px-6 py-4 whitespace-nowrap">${{ formatRate(carrier.min_cost) }}</td>
                <td class="px-6 py-4 whitespace-nowrap">${{ formatRate(carrier.max_cost) }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-gray-500">{{ formatDate(carrier.last_updated) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- By Destination Tab -->
      <div v-if="activeTab === 'destinations'" class="p-6">
        <h3 class="text-lg font-medium mb-4">Rates by Destination</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Country Code</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Destination</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate Count</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Min Rate</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Max Rate</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="dest in byDestination" :key="dest.country_code + dest.destination_name" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap font-mono">+{{ dest.country_code }}</td>
                <td class="px-6 py-4 whitespace-nowrap">{{ dest.destination_name }}</td>
                <td class="px-6 py-4 whitespace-nowrap">{{ dest.rate_count }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-green-600">${{ formatRate(dest.min_cost) }}</td>
                <td class="px-6 py-4 whitespace-nowrap">${{ formatRate(dest.max_cost) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Create/Edit Rate Modal -->
    <div v-if="showCreateModal || showEditModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b">
          <h3 class="text-lg font-medium">{{ showEditModal ? 'Edit Rate' : 'Add New Rate' }}</h3>
        </div>
        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Prefix *</label>
            <input
              v-model="rateForm.prefix"
              type="text"
              placeholder="e.g., 1, 44, 1415"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Destination Name *</label>
            <input
              v-model="rateForm.destination_name"
              type="text"
              placeholder="e.g., USA, UK Mobile, US-SF"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Cost per Minute *</label>
              <input
                v-model.number="rateForm.cost_per_minute"
                type="number"
                step="0.000001"
                min="0"
                placeholder="0.0100"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Connection Fee</label>
              <input
                v-model.number="rateForm.connection_fee"
                type="number"
                step="0.000001"
                min="0"
                placeholder="0.00"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Min Duration (sec)</label>
              <input
                v-model.number="rateForm.minimum_duration"
                type="number"
                min="0"
                placeholder="0"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Billing Increment (sec)</label>
              <input
                v-model.number="rateForm.billing_increment"
                type="number"
                min="1"
                placeholder="1"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Carrier Name</label>
              <input
                v-model="rateForm.carrier_name"
                type="text"
                placeholder="e.g., Twilio, Telnyx"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Carrier Priority</label>
              <input
                v-model.number="rateForm.carrier_priority"
                type="number"
                min="1"
                max="1000"
                placeholder="100"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Effective Date</label>
            <input
              v-model="rateForm.effective_date"
              type="datetime-local"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div class="flex items-center">
            <input
              v-model="rateForm.is_active"
              type="checkbox"
              id="is_active"
              class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label for="is_active" class="ml-2 text-sm text-gray-700">Active</label>
          </div>
        </div>
        <div class="p-6 border-t bg-gray-50 flex justify-end space-x-3">
          <button
            @click="closeRateModal"
            class="px-4 py-2 text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            @click="saveRate"
            :disabled="!rateForm.prefix || !rateForm.destination_name || rateForm.cost_per_minute === undefined"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ showEditModal ? 'Update' : 'Create' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Import CSV Modal -->
    <div v-if="showImportModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b">
          <h3 class="text-lg font-medium">Import Rates from CSV</h3>
        </div>
        <div class="p-6 space-y-4">
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
            <p class="font-medium text-blue-800 mb-2">Expected CSV Format:</p>
            <code class="text-xs text-blue-700">prefix,destination_name,cost_per_minute,carrier_name,connection_fee</code>
            <p class="mt-2 text-blue-700">Example:</p>
            <code class="text-xs text-blue-700">1,USA,0.0100,Twilio,0.00<br/>44,UK,0.0200,Telnyx,0.00</code>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">CSV Data</label>
            <textarea
              v-model="importCsv"
              rows="10"
              placeholder="Paste your CSV data here..."
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            ></textarea>
          </div>
          <div class="flex items-center">
            <input
              v-model="importHasHeader"
              type="checkbox"
              id="has_header"
              class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label for="has_header" class="ml-2 text-sm text-gray-700">First row is header</label>
          </div>
          <div v-if="importResult" class="rounded-lg p-4" :class="importResult.failed > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'">
            <p class="font-medium" :class="importResult.failed > 0 ? 'text-yellow-800' : 'text-green-800'">
              Import Complete: {{ importResult.created }} created, {{ importResult.failed }} failed
            </p>
            <div v-if="importResult.errors?.length" class="mt-2 text-sm text-yellow-700">
              <p class="font-medium">Errors:</p>
              <ul class="list-disc ml-4">
                <li v-for="err in importResult.errors.slice(0, 5)" :key="err.prefix">
                  {{ err.prefix }}: {{ err.error }}
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div class="p-6 border-t bg-gray-50 flex justify-end space-x-3">
          <button
            @click="showImportModal = false; importCsv = ''; importResult = null"
            class="px-4 py-2 text-gray-700 hover:text-gray-900"
          >
            Close
          </button>
          <button
            @click="importRates"
            :disabled="!importCsv || importLoading"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ importLoading ? 'Importing...' : 'Import' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div class="p-6">
          <h3 class="text-lg font-medium text-red-600 mb-4">Delete Rate</h3>
          <p class="text-gray-600 mb-4">
            Are you sure you want to delete the rate for <strong>{{ rateToDelete?.prefix }}</strong> ({{ rateToDelete?.destination_name }})?
          </p>
          <div class="flex items-center mb-4">
            <input
              v-model="hardDelete"
              type="checkbox"
              id="hard_delete"
              class="h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
            />
            <label for="hard_delete" class="ml-2 text-sm text-gray-700">Permanently delete (cannot be undone)</label>
          </div>
        </div>
        <div class="p-6 border-t bg-gray-50 flex justify-end space-x-3">
          <button
            @click="showDeleteModal = false; rateToDelete = null"
            class="px-4 py-2 text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            @click="deleteRate"
            class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- Loading Overlay -->
    <div v-if="loading" class="fixed inset-0 bg-black bg-opacity-25 flex items-center justify-center z-40">
      <div class="bg-white rounded-lg p-6 shadow-xl">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p class="mt-2 text-gray-600">Loading...</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import { adminAPI } from '../../../utils/api'

// State
const loading = ref(false)
const stats = ref({})
const rates = ref([])
const carriers = ref([])
const byDestination = ref([])
const activeTab = ref('rates')

const tabs = [
  { id: 'rates', name: 'Rate Table' },
  { id: 'lookup', name: 'LCR Lookup' },
  { id: 'carriers', name: 'Carriers' },
  { id: 'destinations', name: 'By Destination' }
]

// Filters & Sorting
const searchQuery = ref('')
const filterCarrier = ref('')
const filterActive = ref('')
const sortColumn = ref('prefix')
const sortOrder = ref('asc')
const pagination = reactive({
  page: 1,
  limit: 50,
  total: 0,
  totalPages: 0
})

// Modals
const showCreateModal = ref(false)
const showEditModal = ref(false)
const showImportModal = ref(false)
const showDeleteModal = ref(false)
const rateToDelete = ref(null)
const hardDelete = ref(false)

// Rate Form
const rateForm = reactive({
  id: null,
  prefix: '',
  destination_name: '',
  cost_per_minute: null,
  connection_fee: 0,
  minimum_duration: 0,
  billing_increment: 1,
  carrier_name: '',
  carrier_priority: 100,
  effective_date: '',
  is_active: true
})

// Import
const importCsv = ref('')
const importHasHeader = ref(true)
const importLoading = ref(false)
const importResult = ref(null)

// LCR Lookup
const lookupNumber = ref('')
const lookupLoading = ref(false)
const lookupResult = ref(null)

// Debounce timer
let searchTimer = null

// Methods
function formatRate(value) {
  if (value === null || value === undefined) return '0.0000'
  return parseFloat(value).toFixed(4)
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString()
}

function debouncedSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    pagination.page = 1
    loadRates()
  }, 300)
}

function sortBy(column) {
  if (sortColumn.value === column) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortColumn.value = column
    sortOrder.value = 'asc'
  }
  loadRates()
}

async function loadStats() {
  try {
    const data = await adminAPI.billingRates.getStats()
    stats.value = data.stats || {}
    byDestination.value = data.byDestination || []
  } catch (error) {
    console.error('Failed to load stats:', error)
  }
}

async function loadRates() {
  loading.value = true
  try {
    const data = await adminAPI.billingRates.list({
      page: pagination.page,
      limit: pagination.limit,
      search: searchQuery.value || undefined,
      carrier: filterCarrier.value || undefined,
      is_active: filterActive.value || undefined,
      sort_by: sortColumn.value,
      sort_order: sortOrder.value
    })
    rates.value = data.rates || []
    pagination.total = data.pagination?.total || 0
    pagination.totalPages = data.pagination?.totalPages || 0
  } catch (error) {
    console.error('Failed to load rates:', error)
  } finally {
    loading.value = false
  }
}

async function loadCarriers() {
  try {
    const data = await adminAPI.billingRates.getCarriers()
    carriers.value = data.carriers || []
  } catch (error) {
    console.error('Failed to load carriers:', error)
  }
}

function editRate(rate) {
  Object.assign(rateForm, {
    id: rate.id,
    prefix: rate.prefix,
    destination_name: rate.destination_name,
    cost_per_minute: rate.cost_per_minute,
    connection_fee: rate.connection_fee || 0,
    minimum_duration: rate.minimum_duration || 0,
    billing_increment: rate.billing_increment || 1,
    carrier_name: rate.carrier_name || '',
    carrier_priority: rate.carrier_priority || 100,
    effective_date: rate.effective_date ? new Date(rate.effective_date).toISOString().slice(0, 16) : '',
    is_active: rate.is_active
  })
  showEditModal.value = true
}

function closeRateModal() {
  showCreateModal.value = false
  showEditModal.value = false
  Object.assign(rateForm, {
    id: null,
    prefix: '',
    destination_name: '',
    cost_per_minute: null,
    connection_fee: 0,
    minimum_duration: 0,
    billing_increment: 1,
    carrier_name: '',
    carrier_priority: 100,
    effective_date: '',
    is_active: true
  })
}

async function saveRate() {
  loading.value = true
  try {
    const data = {
      prefix: rateForm.prefix,
      destination_name: rateForm.destination_name,
      cost_per_minute: rateForm.cost_per_minute,
      connection_fee: rateForm.connection_fee,
      minimum_duration: rateForm.minimum_duration,
      billing_increment: rateForm.billing_increment,
      carrier_name: rateForm.carrier_name || null,
      carrier_priority: rateForm.carrier_priority,
      effective_date: rateForm.effective_date || null,
      is_active: rateForm.is_active
    }

    if (showEditModal.value && rateForm.id) {
      await adminAPI.billingRates.update(rateForm.id, data)
    } else {
      await adminAPI.billingRates.create(data)
    }

    closeRateModal()
    await loadRates()
    await loadStats()
    await loadCarriers()
  } catch (error) {
    console.error('Failed to save rate:', error)
    alert('Failed to save rate: ' + (error.response?.data?.error || error.message))
  } finally {
    loading.value = false
  }
}

function confirmDelete(rate) {
  rateToDelete.value = rate
  hardDelete.value = false
  showDeleteModal.value = true
}

async function deleteRate() {
  if (!rateToDelete.value) return

  loading.value = true
  try {
    await adminAPI.billingRates.delete(rateToDelete.value.id, hardDelete.value)
    showDeleteModal.value = false
    rateToDelete.value = null
    await loadRates()
    await loadStats()
    await loadCarriers()
  } catch (error) {
    console.error('Failed to delete rate:', error)
    alert('Failed to delete rate: ' + (error.response?.data?.error || error.message))
  } finally {
    loading.value = false
  }
}

async function importRates() {
  if (!importCsv.value) return

  importLoading.value = true
  importResult.value = null
  try {
    const result = await adminAPI.billingRates.import(importCsv.value, importHasHeader.value)
    importResult.value = result.results
    if (result.results?.created > 0) {
      await loadRates()
      await loadStats()
      await loadCarriers()
    }
  } catch (error) {
    console.error('Failed to import rates:', error)
    importResult.value = { created: 0, failed: 1, errors: [{ prefix: 'Import', error: error.message }] }
  } finally {
    importLoading.value = false
  }
}

async function exportRates() {
  loading.value = true
  try {
    const result = await adminAPI.billingRates.export({
      carrier: filterCarrier.value || undefined,
      is_active: filterActive.value || undefined
    })

    // Download CSV
    const blob = new Blob([result.csv_data], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename || 'rates_export.csv'
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  } catch (error) {
    console.error('Failed to export rates:', error)
    alert('Failed to export rates: ' + (error.response?.data?.error || error.message))
  } finally {
    loading.value = false
  }
}

async function performLookup() {
  if (!lookupNumber.value) return

  lookupLoading.value = true
  lookupResult.value = null
  try {
    const result = await adminAPI.billingRates.lookup(lookupNumber.value)
    lookupResult.value = result
  } catch (error) {
    console.error('Failed to perform lookup:', error)
    lookupResult.value = { found: false, error: error.message }
  } finally {
    lookupLoading.value = false
  }
}

// Initialize
onMounted(async () => {
  await Promise.all([
    loadStats(),
    loadRates(),
    loadCarriers()
  ])
})
</script>
