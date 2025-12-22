<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Call Detail Records (CDR)</h1>
        <p class="text-gray-600 mt-1">Monitor call quality, billing, and performance metrics</p>
      </div>
      <div class="flex gap-3">
        <button
          @click="showQualityAlerts"
          class="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Quality Alerts
          <span v-if="qualityAlertCount > 0" class="bg-white text-orange-600 px-2 py-0.5 rounded-full text-xs font-bold">
            {{ qualityAlertCount }}
          </span>
        </button>
        <button
          @click="exportCDRs"
          :disabled="exporting"
          class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {{ exporting ? 'Exporting...' : 'Export CSV' }}
        </button>
      </div>
    </div>

    <!-- Statistics Cards -->
    <div v-if="stats" class="grid grid-cols-1 md:grid-cols-5 gap-4">
      <div class="bg-white rounded-xl shadow-md p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">Total Calls</p>
            <p class="text-3xl font-bold text-gray-900 mt-2">{{ parseInt(stats.total_calls || 0).toLocaleString() }}</p>
          </div>
          <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-md p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">Avg Duration</p>
            <p class="text-3xl font-bold text-green-600 mt-2">{{ formatDuration(stats.avg_duration_seconds) }}</p>
          </div>
          <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-md p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">Total Cost</p>
            <p class="text-3xl font-bold text-purple-600 mt-2">${{ ((stats.total_cost_cents || 0) / 100).toFixed(2) }}</p>
          </div>
          <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-md p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">Avg Quality (MOS)</p>
            <p class="text-3xl font-bold mt-2" :class="getMOSColor(stats.avg_mos_score)">
              {{ parseFloat(stats.avg_mos_score || 0).toFixed(2) }}
            </p>
          </div>
          <div class="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-md p-6">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600">Poor Quality</p>
            <p class="text-3xl font-bold text-red-600 mt-2">{{ parseInt(stats.poor_quality_calls || 0).toLocaleString() }}</p>
          </div>
          <div class="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-white rounded-xl shadow-md p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">Filters</h2>
        <button
          @click="clearFilters"
          class="text-sm text-gray-600 hover:text-gray-900"
        >
          Clear All
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Search</label>
          <input
            v-model="filters.search"
            @input="debouncedFetchCDRs"
            type="text"
            placeholder="Call SID, from/to number..."
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Direction</label>
          <select
            v-model="filters.direction"
            @change="fetchCDRs"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Directions</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <select
            v-model="filters.status"
            @change="fetchCDRs"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="no-answer">No Answer</option>
            <option value="failed">Failed</option>
            <option value="busy">Busy</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Has Recording</label>
          <select
            v-model="filters.has_recording"
            @change="fetchCDRs"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Calls</option>
            <option value="true">With Recording</option>
            <option value="false">No Recording</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
          <input
            v-model="filters.start_date"
            @change="fetchCDRs"
            type="datetime-local"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">End Date</label>
          <input
            v-model="filters.end_date"
            @change="fetchCDRs"
            type="datetime-local"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Min Duration (sec)</label>
          <input
            v-model.number="filters.min_duration"
            @change="fetchCDRs"
            type="number"
            min="0"
            placeholder="0"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Min MOS Score</label>
          <input
            v-model.number="filters.min_mos"
            @change="fetchCDRs"
            type="number"
            min="1.0"
            max="5.0"
            step="0.1"
            placeholder="1.0 - 5.0"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>

    <!-- CDR Table -->
    <div class="bg-white rounded-xl shadow-md overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th @click="sortBy('initiated_at')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Time {{ getSortIcon('initiated_at') }}
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Direction
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                From / To
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th @click="sortBy('duration_seconds')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Duration {{ getSortIcon('duration_seconds') }}
              </th>
              <th @click="sortBy('mos_score')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Quality {{ getSortIcon('mos_score') }}
              </th>
              <th @click="sortBy('cost_cents')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Cost {{ getSortIcon('cost_cents') }}
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Recording
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="loading" class="text-center">
              <td colspan="9" class="px-6 py-12">
                <div class="flex items-center justify-center">
                  <svg class="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span class="ml-3 text-gray-600">Loading CDRs...</span>
                </div>
              </td>
            </tr>
            <tr v-else-if="cdrs.length === 0" class="text-center">
              <td colspan="9" class="px-6 py-12 text-gray-500">
                No CDRs found. Try adjusting your filters.
              </td>
            </tr>
            <tr v-else v-for="cdr in cdrs" :key="cdr.id" class="hover:bg-gray-50 cursor-pointer" @click="viewCDRDetails(cdr.id)">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">{{ formatDateTime(cdr.initiated_at) }}</div>
                <div class="text-xs text-gray-500">{{ cdr.tenant_name || `Tenant #${cdr.tenant_id}` }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="cdr.direction === 'inbound' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'" class="px-2 py-1 text-xs font-medium rounded-full">
                  {{ cdr.direction }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">{{ cdr.from_number }}</div>
                <div class="text-xs text-gray-500">→ {{ cdr.to_number }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="getStatusBadgeClass(cdr.status)" class="px-2 py-1 text-xs font-medium rounded-full">
                  {{ cdr.status }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {{ formatDuration(cdr.duration_seconds) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div v-if="cdr.mos_score" class="flex items-center">
                  <span :class="getMOSBadgeClass(cdr.mos_score)" class="px-2 py-1 text-xs font-medium rounded-full">
                    {{ parseFloat(cdr.mos_score).toFixed(2) }}
                  </span>
                </div>
                <span v-else class="text-xs text-gray-400">N/A</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${{ ((cdr.cost_cents || 0) / 100).toFixed(4) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <svg v-if="cdr.recording_url" class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                </svg>
                <svg v-else class="w-5 h-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                </svg>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <button
                  @click.stop="viewCDRDetails(cdr.id)"
                  class="text-blue-600 hover:text-blue-900"
                >
                  Details
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
        <div class="text-sm text-gray-700">
          Showing {{ ((pagination.page - 1) * pagination.limit) + 1 }} to {{ Math.min(pagination.page * pagination.limit, pagination.total) }} of {{ pagination.total }} results
        </div>
        <div class="flex gap-2">
          <button
            @click="pagination.page--; fetchCDRs()"
            :disabled="pagination.page === 1"
            class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span class="px-4 py-2 text-sm text-gray-700">
            Page {{ pagination.page }} of {{ Math.ceil(pagination.total / pagination.limit) }}
          </span>
          <button
            @click="pagination.page++; fetchCDRs()"
            :disabled="pagination.page >= Math.ceil(pagination.total / pagination.limit)"
            class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- CDR Details Modal -->
    <div v-if="selectedCDR" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" @click.self="closeCDRDetails">
      <div class="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 class="text-xl font-bold text-gray-900">Call Detail Record</h2>
          <button @click="closeCDRDetails" class="text-gray-400 hover:text-gray-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="p-6 space-y-6">
          <!-- Call Information -->
          <div class="grid grid-cols-2 gap-6">
            <div>
              <h3 class="font-semibold text-gray-900 mb-3">Call Information</h3>
              <div class="space-y-2 text-sm">
                <div><span class="text-gray-600">Call SID:</span> <span class="font-mono text-xs">{{ selectedCDR.call_sid }}</span></div>
                <div><span class="text-gray-600">Direction:</span> <span :class="selectedCDR.direction === 'inbound' ? 'text-blue-600' : 'text-green-600'" class="font-medium">{{ selectedCDR.direction }}</span></div>
                <div><span class="text-gray-600">From:</span> <span class="font-medium">{{ selectedCDR.from_number }}</span></div>
                <div><span class="text-gray-600">To:</span> <span class="font-medium">{{ selectedCDR.to_number }}</span></div>
                <div><span class="text-gray-600">Status:</span> <span :class="getStatusBadgeClass(selectedCDR.status)" class="px-2 py-1 text-xs font-medium rounded-full ml-2">{{ selectedCDR.status }}</span></div>
              </div>
            </div>

            <div>
              <h3 class="font-semibold text-gray-900 mb-3">Timing & Duration</h3>
              <div class="space-y-2 text-sm">
                <div><span class="text-gray-600">Initiated:</span> <span class="font-medium">{{ formatDateTime(selectedCDR.initiated_at) }}</span></div>
                <div v-if="selectedCDR.answered_at"><span class="text-gray-600">Answered:</span> <span class="font-medium">{{ formatDateTime(selectedCDR.answered_at) }}</span></div>
                <div v-if="selectedCDR.ended_at"><span class="text-gray-600">Ended:</span> <span class="font-medium">{{ formatDateTime(selectedCDR.ended_at) }}</span></div>
                <div><span class="text-gray-600">Duration:</span> <span class="font-medium">{{ formatDuration(selectedCDR.duration_seconds) }}</span></div>
                <div><span class="text-gray-600">Billable:</span> <span class="font-medium">{{ formatDuration(selectedCDR.billable_seconds) }}</span></div>
              </div>
            </div>
          </div>

          <!-- Enhanced Quality Metrics -->
          <div v-if="selectedCDR.mos_score || selectedCDR.jitter_ms || selectedCDR.packet_loss_percent">
            <h3 class="font-semibold text-gray-900 mb-3">Call Quality Analysis</h3>

            <!-- MOS Score Gauge -->
            <div class="bg-gradient-to-r from-gray-50 to-white rounded-xl p-6 mb-4 border border-gray-100">
              <div class="flex items-center justify-between">
                <!-- MOS Gauge -->
                <div class="flex items-center gap-6">
                  <div class="relative w-32 h-32">
                    <!-- Background circle -->
                    <svg class="w-32 h-32 transform -rotate-90">
                      <circle cx="64" cy="64" r="56" fill="none" stroke="#e5e7eb" stroke-width="12" />
                      <!-- Progress circle -->
                      <circle
                        cx="64" cy="64" r="56"
                        fill="none"
                        :stroke="getMOSGaugeColor(selectedCDR.mos_score)"
                        stroke-width="12"
                        stroke-linecap="round"
                        :stroke-dasharray="`${(selectedCDR.mos_score / 5) * 352} 352`"
                      />
                    </svg>
                    <!-- Center text -->
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                      <span :class="getMOSColor(selectedCDR.mos_score)" class="text-3xl font-bold">
                        {{ parseFloat(selectedCDR.mos_score).toFixed(1) }}
                      </span>
                      <span class="text-xs text-gray-500">MOS</span>
                    </div>
                  </div>

                  <div>
                    <p class="text-lg font-semibold" :class="getMOSColor(selectedCDR.mos_score)">
                      {{ getMOSLabel(selectedCDR.mos_score) }} Quality
                    </p>
                    <p class="text-sm text-gray-500 mt-1">
                      R-Factor: {{ calculateRFactor(selectedCDR.mos_score).toFixed(0) }}
                    </p>
                    <p class="text-xs text-gray-400 mt-1">
                      ITU-T G.107 E-Model
                    </p>
                  </div>
                </div>

                <!-- Quality Thresholds Legend -->
                <div class="text-xs space-y-1">
                  <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full bg-green-500"></div>
                    <span class="text-gray-600">4.0-5.0 Excellent</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <span class="text-gray-600">3.5-4.0 Good</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full bg-orange-500"></div>
                    <span class="text-gray-600">3.0-3.5 Fair</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full bg-red-500"></div>
                    <span class="text-gray-600">&lt;3.0 Poor</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Quality Metrics Grid -->
            <div class="grid grid-cols-4 gap-4 mb-4">
              <div class="bg-gray-50 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                  <p class="text-sm text-gray-600">MOS Score</p>
                  <span :class="getMetricStatusClass(selectedCDR.mos_score, 'mos')" class="text-xs px-2 py-0.5 rounded-full">
                    {{ getMetricStatus(selectedCDR.mos_score, 'mos') }}
                  </span>
                </div>
                <p :class="getMOSColor(selectedCDR.mos_score)" class="text-2xl font-bold">
                  {{ parseFloat(selectedCDR.mos_score || 0).toFixed(2) }}
                </p>
                <div class="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="getMOSBarColor(selectedCDR.mos_score)"
                    :style="{ width: `${(selectedCDR.mos_score / 5) * 100}%` }"
                  ></div>
                </div>
              </div>

              <div class="bg-gray-50 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                  <p class="text-sm text-gray-600">Jitter</p>
                  <span :class="getMetricStatusClass(selectedCDR.jitter_ms, 'jitter')" class="text-xs px-2 py-0.5 rounded-full">
                    {{ getMetricStatus(selectedCDR.jitter_ms, 'jitter') }}
                  </span>
                </div>
                <p class="text-2xl font-bold text-gray-900">{{ selectedCDR.jitter_ms || 0 }}<span class="text-sm font-normal text-gray-500">ms</span></p>
                <p class="text-xs text-gray-500 mt-1">Target: &lt;30ms</p>
              </div>

              <div class="bg-gray-50 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                  <p class="text-sm text-gray-600">Packet Loss</p>
                  <span :class="getMetricStatusClass(selectedCDR.packet_loss_percent, 'packetLoss')" class="text-xs px-2 py-0.5 rounded-full">
                    {{ getMetricStatus(selectedCDR.packet_loss_percent, 'packetLoss') }}
                  </span>
                </div>
                <p class="text-2xl font-bold text-gray-900">{{ parseFloat(selectedCDR.packet_loss_percent || 0).toFixed(2) }}<span class="text-sm font-normal text-gray-500">%</span></p>
                <p class="text-xs text-gray-500 mt-1">Target: &lt;1%</p>
              </div>

              <div class="bg-gray-50 rounded-lg p-4">
                <div class="flex items-center justify-between mb-2">
                  <p class="text-sm text-gray-600">Latency</p>
                  <span :class="getMetricStatusClass(selectedCDR.latency_ms, 'latency')" class="text-xs px-2 py-0.5 rounded-full">
                    {{ getMetricStatus(selectedCDR.latency_ms, 'latency') }}
                  </span>
                </div>
                <p class="text-2xl font-bold text-gray-900">{{ selectedCDR.latency_ms || 'N/A' }}<span v-if="selectedCDR.latency_ms" class="text-sm font-normal text-gray-500">ms</span></p>
                <p class="text-xs text-gray-500 mt-1">Target: &lt;150ms</p>
              </div>
            </div>

            <!-- Quality Recommendations -->
            <div v-if="getQualityRecommendations(selectedCDR).length > 0" class="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 class="font-medium text-amber-800 mb-2 flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Quality Recommendations
              </h4>
              <ul class="space-y-1 text-sm text-amber-700">
                <li v-for="(rec, idx) in getQualityRecommendations(selectedCDR)" :key="idx" class="flex items-start gap-2">
                  <span class="text-amber-500 mt-0.5">•</span>
                  {{ rec }}
                </li>
              </ul>
            </div>

            <!-- Network Path (if available) -->
            <div v-if="selectedCDR.carrier_name || selectedCDR.sip_trunk_name" class="mt-4 bg-gray-50 rounded-lg p-4">
              <h4 class="font-medium text-gray-700 mb-3">Network Path</h4>
              <div class="flex items-center gap-4 text-sm">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <p class="font-medium text-gray-900">{{ selectedCDR.from_number }}</p>
                    <p class="text-xs text-gray-500">Caller</p>
                  </div>
                </div>

                <div class="flex-1 border-t-2 border-dashed border-gray-300 relative">
                  <div v-if="selectedCDR.carrier_name" class="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-white px-2 text-xs text-gray-500">
                    {{ selectedCDR.carrier_name }}
                  </div>
                </div>

                <div v-if="selectedCDR.sip_trunk_name" class="flex items-center gap-2">
                  <div class="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                    <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                    </svg>
                  </div>
                  <div>
                    <p class="font-medium text-gray-900">{{ selectedCDR.sip_trunk_name }}</p>
                    <p class="text-xs text-gray-500">SIP Trunk</p>
                  </div>
                </div>

                <div class="flex-1 border-t-2 border-dashed border-gray-300"></div>

                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <p class="font-medium text-gray-900">{{ selectedCDR.to_number }}</p>
                    <p class="text-xs text-gray-500">Callee</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Billing Information -->
          <div>
            <h3 class="font-semibold text-gray-900 mb-3">Billing Information</h3>
            <div class="grid grid-cols-2 gap-4">
              <div class="bg-gray-50 rounded-lg p-4">
                <p class="text-sm text-gray-600">Total Cost</p>
                <p class="text-2xl font-bold text-purple-600 mt-1">${{ ((selectedCDR.cost_cents || 0) / 100).toFixed(4) }}</p>
              </div>
              <div class="bg-gray-50 rounded-lg p-4">
                <p class="text-sm text-gray-600">Rate per Minute</p>
                <p class="text-2xl font-bold text-gray-900 mt-1">${{ ((selectedCDR.rate_cents_per_minute || 0) / 100).toFixed(4) }}/min</p>
              </div>
            </div>
          </div>

          <!-- Recording -->
          <div v-if="selectedCDR.recording_url">
            <h3 class="font-semibold text-gray-900 mb-3">Recording</h3>
            <div class="bg-gray-50 rounded-lg p-4">
              <audio controls class="w-full">
                <source :src="selectedCDR.recording_url" type="audio/mpeg">
                Your browser does not support the audio element.
              </audio>
              <div class="mt-2 text-sm text-gray-600">
                Duration: {{ formatDuration(selectedCDR.recording_duration_seconds) }}
              </div>
            </div>
          </div>

          <!-- Transcription -->
          <div v-if="selectedCDR.transcription_text">
            <h3 class="font-semibold text-gray-900 mb-3">Transcription</h3>
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="text-sm text-gray-700 whitespace-pre-wrap">{{ selectedCDR.transcription_text }}</p>
              <div v-if="selectedCDR.transcription_confidence" class="mt-2 text-xs text-gray-500">
                Confidence: {{ (selectedCDR.transcription_confidence * 100).toFixed(1) }}%
              </div>
            </div>
          </div>

          <!-- Hangup Information -->
          <div v-if="selectedCDR.hangup_cause || selectedCDR.hangup_by">
            <h3 class="font-semibold text-gray-900 mb-3">Hangup Information</h3>
            <div class="space-y-2 text-sm">
              <div v-if="selectedCDR.hangup_cause"><span class="text-gray-600">Cause:</span> <span class="font-medium">{{ selectedCDR.hangup_cause }}</span></div>
              <div v-if="selectedCDR.hangup_by"><span class="text-gray-600">Hangup By:</span> <span class="font-medium">{{ selectedCDR.hangup_by }}</span></div>
            </div>
          </div>

          <!-- Related Calls -->
          <div v-if="selectedCDR.related_calls && selectedCDR.related_calls.length > 0">
            <h3 class="font-semibold text-gray-900 mb-3">Related Calls</h3>
            <div class="space-y-2">
              <div v-for="relatedCall in selectedCDR.related_calls" :key="relatedCall.id" class="bg-gray-50 rounded-lg p-3 text-sm">
                <div class="flex justify-between items-center">
                  <div>
                    <span class="font-medium">{{ relatedCall.from_number }} → {{ relatedCall.to_number }}</span>
                    <span class="ml-2 text-gray-500">{{ relatedCall.direction }}</span>
                  </div>
                  <span :class="getStatusBadgeClass(relatedCall.status)" class="px-2 py-1 text-xs font-medium rounded-full">
                    {{ relatedCall.status }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Timeline -->
          <div v-if="selectedCDR.timeline && selectedCDR.timeline.length > 0">
            <h3 class="font-semibold text-gray-900 mb-3">Call Timeline</h3>
            <div class="space-y-3">
              <div v-for="(event, index) in selectedCDR.timeline" :key="index" class="flex items-start gap-3">
                <div class="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-sm">{{ event.description }}</span>
                    <span class="text-xs text-gray-500">{{ formatDateTime(event.timestamp) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Quality Alerts Modal -->
    <div v-if="showQualityAlertsModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" @click.self="closeQualityAlerts">
      <div class="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 class="text-xl font-bold text-gray-900">Quality Alerts (MOS &lt; 3.5)</h2>
          <button @click="closeQualityAlerts" class="text-gray-400 hover:text-gray-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="p-6">
          <div v-if="loadingAlerts" class="text-center py-12">
            <svg class="animate-spin h-8 w-8 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>

          <div v-else-if="qualityAlerts.length === 0" class="text-center py-12 text-gray-500">
            No quality alerts found. All calls are performing well!
          </div>

          <div v-else class="space-y-3">
            <div v-for="alert in qualityAlerts" :key="alert.id" class="bg-orange-50 border border-orange-200 rounded-lg p-4 hover:bg-orange-100 cursor-pointer transition-colors" @click="viewCDRDetails(alert.id); closeQualityAlerts()">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-3 mb-2">
                    <span class="font-medium text-gray-900">{{ alert.from_number }} → {{ alert.to_number }}</span>
                    <span :class="alert.direction === 'inbound' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'" class="px-2 py-1 text-xs font-medium rounded-full">
                      {{ alert.direction }}
                    </span>
                  </div>
                  <div class="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <span class="text-gray-600">MOS:</span>
                      <span :class="getMOSColor(alert.mos_score)" class="font-bold ml-1">{{ parseFloat(alert.mos_score).toFixed(2) }}</span>
                    </div>
                    <div v-if="alert.jitter_ms">
                      <span class="text-gray-600">Jitter:</span>
                      <span class="font-medium ml-1">{{ alert.jitter_ms }}ms</span>
                    </div>
                    <div v-if="alert.packet_loss_percent">
                      <span class="text-gray-600">Packet Loss:</span>
                      <span class="font-medium ml-1">{{ parseFloat(alert.packet_loss_percent).toFixed(2) }}%</span>
                    </div>
                    <div>
                      <span class="text-gray-600">Duration:</span>
                      <span class="font-medium ml-1">{{ formatDuration(alert.duration_seconds) }}</span>
                    </div>
                  </div>
                  <div class="text-xs text-gray-500 mt-2">
                    {{ formatDateTime(alert.initiated_at) }} • {{ alert.tenant_name || `Tenant #${alert.tenant_id}` }}
                  </div>
                </div>
                <div class="ml-4">
                  <button class="text-blue-600 hover:text-blue-800 text-sm font-medium">
                    View Details →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminAPI } from '../../../utils/api'

const loading = ref(false)
const loadingAlerts = ref(false)
const exporting = ref(false)
const cdrs = ref([])
const stats = ref({
  total_calls: 0,
  completed_calls: 0,
  missed_calls: 0,
  failed_calls: 0,
  total_duration_seconds: 0,
  total_cost_cents: 0,
  avg_mos_score: 0,
  poor_quality_calls: 0
})
const selectedCDR = ref(null)
const qualityAlerts = ref([])
const qualityAlertCount = ref(0)
const showQualityAlertsModal = ref(false)

const filters = ref({
  search: '',
  direction: '',
  status: '',
  start_date: '',
  end_date: '',
  has_recording: '',
  min_duration: null,
  min_mos: null,
  sort_by: 'initiated_at',
  sort_order: 'desc'
})

const pagination = ref({
  page: 1,
  limit: 50,
  total: 0
})

onMounted(() => {
  // Set default date range to last 7 days
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  filters.value.end_date = now.toISOString().slice(0, 16)
  filters.value.start_date = sevenDaysAgo.toISOString().slice(0, 16)

  fetchStats()
  fetchCDRs()
  fetchQualityAlertsCount()
})

async function fetchStats() {
  try {
    const params = {
      start_date: filters.value.start_date,
      end_date: filters.value.end_date
    }
    const response = await adminAPI.cdrs.getStats(params)
    stats.value = response.data.stats || stats.value
  } catch (error) {
    console.error('Failed to fetch CDR stats:', error)
  }
}

async function fetchCDRs() {
  loading.value = true
  try {
    const params = {
      page: pagination.value.page,
      limit: pagination.value.limit,
      ...filters.value
    }

    // Remove empty filters
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null) {
        delete params[key]
      }
    })

    const response = await adminAPI.cdrs.list(params)
    cdrs.value = response.data.cdrs
    pagination.value.total = response.data.total

    // Refresh stats when filters change
    fetchStats()
  } catch (error) {
    console.error('Failed to fetch CDRs:', error)
  } finally {
    loading.value = false
  }
}

async function fetchQualityAlertsCount() {
  try {
    const response = await adminAPI.cdrs.getQualityAlerts({ limit: 1 })
    qualityAlertCount.value = response.data.total || 0
  } catch (error) {
    console.error('Failed to fetch quality alerts count:', error)
  }
}

async function showQualityAlerts() {
  showQualityAlertsModal.value = true
  loadingAlerts.value = true
  try {
    const response = await adminAPI.cdrs.getQualityAlerts({ limit: 100 })
    qualityAlerts.value = response.data.alerts || []
  } catch (error) {
    console.error('Failed to fetch quality alerts:', error)
  } finally {
    loadingAlerts.value = false
  }
}

function closeQualityAlerts() {
  showQualityAlertsModal.value = false
}

async function viewCDRDetails(id) {
  try {
    const response = await adminAPI.cdrs.get(id)
    selectedCDR.value = response.data.cdr
  } catch (error) {
    console.error('Failed to fetch CDR details:', error)
  }
}

function closeCDRDetails() {
  selectedCDR.value = null
}

async function exportCDRs() {
  exporting.value = true
  try {
    const params = { ...filters.value }
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null) {
        delete params[key]
      }
    })

    const response = await adminAPI.cdrs.export(params)

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `cdrs-export-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Failed to export CDRs:', error)
    alert('Failed to export CDRs. Please try again.')
  } finally {
    exporting.value = false
  }
}

let debounceTimer
function debouncedFetchCDRs() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    pagination.value.page = 1
    fetchCDRs()
  }, 500)
}

function clearFilters() {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  filters.value = {
    search: '',
    direction: '',
    status: '',
    start_date: sevenDaysAgo.toISOString().slice(0, 16),
    end_date: now.toISOString().slice(0, 16),
    has_recording: '',
    min_duration: null,
    min_mos: null,
    sort_by: 'initiated_at',
    sort_order: 'desc'
  }
  pagination.value.page = 1
  fetchCDRs()
}

function sortBy(field) {
  if (filters.value.sort_by === field) {
    filters.value.sort_order = filters.value.sort_order === 'desc' ? 'asc' : 'desc'
  } else {
    filters.value.sort_by = field
    filters.value.sort_order = 'desc'
  }
  fetchCDRs()
}

function getSortIcon(field) {
  if (filters.value.sort_by !== field) return ''
  return filters.value.sort_order === 'desc' ? '↓' : '↑'
}

function formatDateTime(dateString) {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleString()
}

function formatDuration(seconds) {
  if (!seconds) return '0s'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins > 0) {
    return `${mins}m ${secs}s`
  }
  return `${secs}s`
}

function getStatusBadgeClass(status) {
  const classes = {
    'completed': 'bg-green-100 text-green-800',
    'no-answer': 'bg-yellow-100 text-yellow-800',
    'failed': 'bg-red-100 text-red-800',
    'busy': 'bg-orange-100 text-orange-800',
    'initiated': 'bg-blue-100 text-blue-800',
    'ringing': 'bg-purple-100 text-purple-800'
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

function getMOSColor(mos) {
  if (!mos) return 'text-gray-400'
  if (mos >= 4.0) return 'text-green-600'
  if (mos >= 3.5) return 'text-yellow-600'
  return 'text-red-600'
}

function getMOSBadgeClass(mos) {
  if (!mos) return 'bg-gray-100 text-gray-800'
  if (mos >= 4.0) return 'bg-green-100 text-green-800'
  if (mos >= 3.5) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

function getMOSLabel(mos) {
  if (!mos) return 'N/A'
  if (mos >= 4.3) return 'Excellent'
  if (mos >= 4.0) return 'Good'
  if (mos >= 3.6) return 'Fair'
  if (mos >= 3.1) return 'Poor'
  return 'Bad'
}

function getJitterLabel(jitter) {
  if (!jitter) return 'N/A'
  if (jitter < 20) return 'Excellent'
  if (jitter < 50) return 'Good'
  if (jitter < 100) return 'Fair'
  return 'Poor'
}

function getPacketLossLabel(loss) {
  if (!loss) return 'N/A'
  if (loss < 1) return 'Excellent'
  if (loss < 2) return 'Good'
  if (loss < 5) return 'Fair'
  return 'Poor'
}

// Enhanced MOS display functions
function getMOSGaugeColor(mos) {
  if (!mos) return '#9ca3af'
  if (mos >= 4.0) return '#22c55e'
  if (mos >= 3.5) return '#eab308'
  if (mos >= 3.0) return '#f97316'
  return '#ef4444'
}

function getMOSBarColor(mos) {
  if (!mos) return 'bg-gray-400'
  if (mos >= 4.0) return 'bg-green-500'
  if (mos >= 3.5) return 'bg-yellow-500'
  if (mos >= 3.0) return 'bg-orange-500'
  return 'bg-red-500'
}

function calculateRFactor(mos) {
  // Convert MOS to R-Factor using ITU-T G.107 E-Model approximation
  // R = 20 * (8 - sqrt(226 - 100 * MOS)) for MOS >= 0
  if (!mos) return 0
  const mosVal = parseFloat(mos)
  if (mosVal <= 0) return 0
  if (mosVal >= 4.5) return 100

  // Inverse of: MOS = 1 + 0.035*R + 7*10^-6 * R * (R-60) * (100-R)
  // Simplified approximation
  const r = 20 * mosVal + 10
  return Math.min(100, Math.max(0, r))
}

function getMetricStatus(value, type) {
  if (value === null || value === undefined) return 'N/A'

  const thresholds = {
    mos: { excellent: 4.0, good: 3.5, fair: 3.0 },
    jitter: { excellent: 20, good: 50, fair: 100 },
    packetLoss: { excellent: 1, good: 2, fair: 5 },
    latency: { excellent: 100, good: 150, fair: 300 }
  }

  const t = thresholds[type]
  if (!t) return 'N/A'

  if (type === 'mos') {
    if (value >= t.excellent) return 'Excellent'
    if (value >= t.good) return 'Good'
    if (value >= t.fair) return 'Fair'
    return 'Poor'
  } else {
    // For metrics where lower is better
    if (value <= t.excellent) return 'Excellent'
    if (value <= t.good) return 'Good'
    if (value <= t.fair) return 'Fair'
    return 'Poor'
  }
}

function getMetricStatusClass(value, type) {
  const status = getMetricStatus(value, type)
  const classes = {
    'Excellent': 'bg-green-100 text-green-800',
    'Good': 'bg-yellow-100 text-yellow-800',
    'Fair': 'bg-orange-100 text-orange-800',
    'Poor': 'bg-red-100 text-red-800',
    'N/A': 'bg-gray-100 text-gray-600'
  }
  return classes[status] || classes['N/A']
}

function getQualityRecommendations(cdr) {
  const recommendations = []

  if (cdr.mos_score && cdr.mos_score < 3.5) {
    recommendations.push('Call quality below acceptable threshold. Review network conditions.')
  }

  if (cdr.jitter_ms && cdr.jitter_ms > 30) {
    recommendations.push(`High jitter detected (${cdr.jitter_ms}ms). Consider implementing jitter buffer or checking network congestion.`)
  }

  if (cdr.packet_loss_percent && cdr.packet_loss_percent > 1) {
    recommendations.push(`Packet loss at ${parseFloat(cdr.packet_loss_percent).toFixed(2)}%. Check network stability and carrier quality.`)
  }

  if (cdr.latency_ms && cdr.latency_ms > 150) {
    recommendations.push(`High latency (${cdr.latency_ms}ms) may cause conversation delays. Consider routing optimization.`)
  }

  if (cdr.mos_score && cdr.mos_score < 3.0) {
    recommendations.push('Critically poor quality. Investigate carrier issues, network path, or codec configuration.')
  }

  if (cdr.packet_loss_percent > 3 && cdr.jitter_ms > 50) {
    recommendations.push('Combined high packet loss and jitter suggests severe network degradation. Escalate to network operations.')
  }

  return recommendations
}
</script>
