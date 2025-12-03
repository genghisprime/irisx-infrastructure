<template>
  <div class="ivr-management">
    <!-- Page Header -->
    <div class="page-header mb-6">
      <h1 class="text-2xl font-bold text-gray-900">IVR Management</h1>
      <p class="text-sm text-gray-500 mt-1">Manage Interactive Voice Response menus and sessions across all tenants</p>
    </div>

    <!-- Statistics Dashboard -->
    <div class="stats-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <div class="stat-card bg-white p-4 rounded-lg shadow border border-gray-200">
        <div class="text-sm font-medium text-gray-500">Total Menus</div>
        <div class="text-2xl font-bold text-gray-900 mt-1">{{ stats.total_menus }}</div>
        <div class="text-xs text-gray-400 mt-1">
          <span class="text-green-600">{{ stats.active_menus }}</span> active,
          <span class="text-gray-500">{{ stats.inactive_menus }}</span> inactive
        </div>
      </div>

      <div class="stat-card bg-white p-4 rounded-lg shadow border border-gray-200">
        <div class="text-sm font-medium text-gray-500">Active Tenants</div>
        <div class="text-2xl font-bold text-gray-900 mt-1">{{ stats.active_tenants }}</div>
        <div class="text-xs text-gray-400 mt-1">Using IVR menus</div>
      </div>

      <div class="stat-card bg-white p-4 rounded-lg shadow border border-gray-200">
        <div class="text-sm font-medium text-gray-500">Total Sessions</div>
        <div class="text-2xl font-bold text-gray-900 mt-1">{{ stats.total_sessions.toLocaleString() }}</div>
        <div class="text-xs mt-1">
          <span class="text-green-600">{{ stats.active_sessions }}</span> active now
        </div>
      </div>

      <div class="stat-card bg-white p-4 rounded-lg shadow border border-gray-200">
        <div class="text-sm font-medium text-gray-500">Avg Duration</div>
        <div class="text-2xl font-bold text-gray-900 mt-1">{{ formatDuration(stats.avg_session_duration_seconds) }}</div>
        <div class="text-xs text-gray-400 mt-1">Per session</div>
      </div>

      <div class="stat-card bg-white p-4 rounded-lg shadow border border-gray-200">
        <div class="text-sm font-medium text-gray-500">Avg Options/Menu</div>
        <div class="text-2xl font-bold text-gray-900 mt-1">{{ stats.avg_options_per_menu.toFixed(1) }}</div>
        <div class="text-xs text-gray-400 mt-1">{{ stats.total_options }} total options</div>
      </div>
    </div>

    <!-- Action Type Distribution (if available) -->
    <div v-if="stats.action_distribution && stats.action_distribution.length > 0" class="mb-6 bg-white p-4 rounded-lg shadow border border-gray-200">
      <h3 class="text-sm font-semibold text-gray-700 mb-3">Action Type Distribution</h3>
      <div class="flex flex-wrap gap-3">
        <div v-for="action in stats.action_distribution" :key="action.action_type" class="flex items-center space-x-2">
          <span class="text-xs font-medium text-gray-600 capitalize">{{ action.action_type }}:</span>
          <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">{{ action.count }}</span>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs mb-4 border-b border-gray-200">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="[
          'px-4 py-2 font-medium text-sm border-b-2 transition-colors',
          activeTab === tab.id
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
        ]"
      >
        {{ tab.label }}
        <span v-if="tab.badge" class="ml-2 px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-xs">
          {{ tab.badge }}
        </span>
      </button>
    </div>

    <!-- Menus Tab -->
    <div v-show="activeTab === 'menus'" class="menus-section">
      <!-- Filters -->
      <div class="filters bg-white p-4 rounded-lg shadow border border-gray-200 mb-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              v-model="menuFilters.search"
              @input="debouncedFetchMenus"
              type="text"
              placeholder="Menu name or description..."
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              v-model="menuFilters.status"
              @change="fetchMenus"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tenant</label>
            <input
              v-model="menuFilters.tenant_id"
              @input="debouncedFetchMenus"
              type="number"
              placeholder="Tenant ID..."
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              v-model="menuFilters.sort_by"
              @change="fetchMenus"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="created_at">Created Date</option>
              <option value="updated_at">Updated Date</option>
              <option value="name">Name</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Menus Table -->
      <div class="bg-white rounded-lg shadow border border-gray-200">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Menu</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Options</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sessions</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-if="loading" class="hover:bg-gray-50">
                <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                  <div class="flex items-center justify-center">
                    <svg class="animate-spin h-5 w-5 mr-3 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading menus...
                  </div>
                </td>
              </tr>
              <tr v-else-if="menus.length === 0" class="hover:bg-gray-50">
                <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                  No IVR menus found
                </td>
              </tr>
              <tr v-else v-for="menu in menus" :key="menu.id" class="hover:bg-gray-50 cursor-pointer" @click="viewMenuDetails(menu.id)">
                <td class="px-4 py-3">
                  <div class="text-sm font-medium text-gray-900">{{ menu.name }}</div>
                  <div v-if="menu.description" class="text-xs text-gray-500 truncate max-w-xs">{{ menu.description }}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="text-sm text-gray-900">{{ menu.tenant_name || `Tenant #${menu.tenant_id}` }}</div>
                  <div class="text-xs text-gray-500">ID: {{ menu.tenant_id }}</div>
                </td>
                <td class="px-4 py-3">
                  <span :class="[
                    'px-2 py-1 text-xs font-semibold rounded-full',
                    menu.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  ]">
                    {{ menu.status }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-900">
                  {{ menu.option_count }} option{{ menu.option_count !== 1 ? 's' : '' }}
                </td>
                <td class="px-4 py-3">
                  <div class="text-sm text-gray-900">{{ menu.session_count }} total</div>
                  <div v-if="menu.active_session_count > 0" class="text-xs text-green-600">
                    {{ menu.active_session_count }} active
                  </div>
                </td>
                <td class="px-4 py-3 text-sm text-gray-500">
                  {{ formatDate(menu.created_at) }}
                </td>
                <td class="px-4 py-3 text-right">
                  <button
                    @click.stop="viewMenuDetails(menu.id)"
                    class="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    View Details
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div v-if="pagination.total > 0" class="px-4 py-3 border-t border-gray-200 sm:px-6">
          <div class="flex items-center justify-between">
            <div class="text-sm text-gray-700">
              Showing <span class="font-medium">{{ (pagination.page - 1) * pagination.limit + 1 }}</span> to
              <span class="font-medium">{{ Math.min(pagination.page * pagination.limit, pagination.total) }}</span> of
              <span class="font-medium">{{ pagination.total }}</span> menus
            </div>
            <div class="flex space-x-2">
              <button
                @click="changePage(pagination.page - 1)"
                :disabled="pagination.page === 1"
                :class="[
                  'px-3 py-1 border rounded-md text-sm font-medium',
                  pagination.page === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
                ]"
              >
                Previous
              </button>
              <button
                @click="changePage(pagination.page + 1)"
                :disabled="pagination.page >= pagination.total_pages"
                :class="[
                  'px-3 py-1 border rounded-md text-sm font-medium',
                  pagination.page >= pagination.total_pages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
                ]"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sessions Tab -->
    <div v-show="activeTab === 'sessions'" class="sessions-section">
      <!-- Session Filters -->
      <div class="filters bg-white p-4 rounded-lg shadow border border-gray-200 mb-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Filter</label>
            <select
              v-model="sessionFilters.active_only"
              @change="fetchSessions"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option :value="false">All Sessions</option>
              <option :value="true">Active Only</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Menu ID</label>
            <input
              v-model="sessionFilters.menu_id"
              @input="debouncedFetchSessions"
              type="number"
              placeholder="Filter by menu..."
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tenant ID</label>
            <input
              v-model="sessionFilters.tenant_id"
              @input="debouncedFetchSessions"
              type="number"
              placeholder="Filter by tenant..."
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <!-- Sessions Table -->
      <div class="bg-white rounded-lg shadow border border-gray-200">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Session</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Menu</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Caller</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Started</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-if="loadingSessions" class="hover:bg-gray-50">
                <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                  <div class="flex items-center justify-center">
                    <svg class="animate-spin h-5 w-5 mr-3 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading sessions...
                  </div>
                </td>
              </tr>
              <tr v-else-if="sessions.length === 0" class="hover:bg-gray-50">
                <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                  No IVR sessions found
                </td>
              </tr>
              <tr v-else v-for="session in sessions" :key="session.id" class="hover:bg-gray-50">
                <td class="px-4 py-3">
                  <div class="text-sm font-medium text-gray-900">ID: {{ session.id }}</div>
                  <div class="text-xs text-gray-500">UUID: {{ session.call_uuid.substring(0, 8) }}...</div>
                </td>
                <td class="px-4 py-3">
                  <div class="text-sm text-gray-900">{{ session.menu_name }}</div>
                  <div class="text-xs text-gray-500">ID: {{ session.menu_id }}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="text-sm text-gray-900">{{ session.tenant_name || `Tenant #${session.tenant_id}` }}</div>
                  <div class="text-xs text-gray-500">ID: {{ session.tenant_id }}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="text-sm text-gray-900">{{ session.from_number }}</div>
                  <div class="text-xs text-gray-500">→ {{ session.to_number }}</div>
                </td>
                <td class="px-4 py-3">
                  <span :class="[
                    'px-2 py-1 text-xs font-semibold rounded-full',
                    session.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  ]">
                    {{ session.is_active ? 'Active' : 'Ended' }}
                  </span>
                  <div v-if="session.invalid_input_count > 0" class="text-xs text-orange-600 mt-1">
                    {{ session.invalid_input_count }} invalid input{{ session.invalid_input_count !== 1 ? 's' : '' }}
                  </div>
                </td>
                <td class="px-4 py-3 text-sm text-gray-900">
                  {{ session.duration_seconds ? formatDuration(session.duration_seconds) : 'In progress' }}
                </td>
                <td class="px-4 py-3 text-sm text-gray-500">
                  {{ formatDate(session.started_at) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div v-if="sessionPagination.total > 0" class="px-4 py-3 border-t border-gray-200 sm:px-6">
          <div class="flex items-center justify-between">
            <div class="text-sm text-gray-700">
              Showing <span class="font-medium">{{ (sessionPagination.page - 1) * sessionPagination.limit + 1 }}</span> to
              <span class="font-medium">{{ Math.min(sessionPagination.page * sessionPagination.limit, sessionPagination.total) }}</span> of
              <span class="font-medium">{{ sessionPagination.total }}</span> sessions
            </div>
            <div class="flex space-x-2">
              <button
                @click="changeSessionPage(sessionPagination.page - 1)"
                :disabled="sessionPagination.page === 1"
                :class="[
                  'px-3 py-1 border rounded-md text-sm font-medium',
                  sessionPagination.page === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
                ]"
              >
                Previous
              </button>
              <button
                @click="changeSessionPage(sessionPagination.page + 1)"
                :disabled="sessionPagination.page >= sessionPagination.total_pages"
                :class="[
                  'px-3 py-1 border rounded-md text-sm font-medium',
                  sessionPagination.page >= sessionPagination.total_pages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
                ]"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Analytics Tab -->
    <div v-show="activeTab === 'analytics'" class="analytics-section">
      <div class="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">IVR Analytics</h3>
        <p class="text-sm text-gray-500 mb-4">Analytics dashboard coming soon. This will include completion rates, drop-off analysis, and popular menu options.</p>

        <!-- Top Menus by Usage -->
        <div v-if="stats.top_menus && stats.top_menus.length > 0" class="mt-6">
          <h4 class="text-sm font-semibold text-gray-700 mb-3">Top Menus by Usage (Last 30 Days)</h4>
          <div class="space-y-3">
            <div v-for="menu in stats.top_menus" :key="menu.id" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div class="flex-1">
                <div class="text-sm font-medium text-gray-900">{{ menu.name }}</div>
                <div class="text-xs text-gray-500">{{ menu.tenant_name }} (ID: {{ menu.tenant_id }})</div>
              </div>
              <div class="text-right">
                <div class="text-sm font-semibold text-gray-900">{{ menu.session_count }} sessions</div>
                <div class="text-xs text-gray-500">{{ formatDuration(menu.avg_duration_seconds) }} avg</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Menu Details Modal -->
    <div v-if="showMenuModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" @click.self="closeMenuModal">
      <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <!-- Modal Header -->
        <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 class="text-xl font-bold text-gray-900">IVR Menu Details</h2>
          <button @click="closeMenuModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <!-- Modal Body -->
        <div class="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          <div v-if="loadingMenuDetails" class="flex items-center justify-center py-12">
            <svg class="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>

          <div v-else-if="selectedMenu">
            <!-- Menu Info -->
            <div class="mb-6">
              <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ selectedMenu.menu.name }}</h3>
              <p v-if="selectedMenu.menu.description" class="text-sm text-gray-600 mb-3">{{ selectedMenu.menu.description }}</p>

              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="font-medium text-gray-700">Tenant:</span>
                  <span class="ml-2 text-gray-900">{{ selectedMenu.menu.tenant_name }} (ID: {{ selectedMenu.menu.tenant_id }})</span>
                </div>
                <div>
                  <span class="font-medium text-gray-700">Status:</span>
                  <span :class="[
                    'ml-2 px-2 py-0.5 rounded-full text-xs font-semibold',
                    selectedMenu.menu.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  ]">
                    {{ selectedMenu.menu.status }}
                  </span>
                </div>
                <div>
                  <span class="font-medium text-gray-700">Max Digits:</span>
                  <span class="ml-2 text-gray-900">{{ selectedMenu.menu.settings.max_digits }}</span>
                </div>
                <div>
                  <span class="font-medium text-gray-700">Digit Timeout:</span>
                  <span class="ml-2 text-gray-900">{{ selectedMenu.menu.settings.digit_timeout_ms }}ms</span>
                </div>
              </div>
            </div>

            <!-- Menu Options -->
            <div class="mb-6">
              <h4 class="text-md font-semibold text-gray-900 mb-3">Menu Options ({{ selectedMenu.options.length }})</h4>
              <div v-if="selectedMenu.options.length === 0" class="text-sm text-gray-500 italic">
                No options configured
              </div>
              <div v-else class="space-y-2">
                <div v-for="option in selectedMenu.options" :key="option.id" class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center space-x-2 mb-1">
                        <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded font-mono text-sm font-bold">{{ option.digit_pattern }}</span>
                        <span class="text-sm font-medium text-gray-900">{{ option.description || 'No description' }}</span>
                      </div>
                      <div class="text-xs text-gray-600">
                        <span class="font-medium">Action:</span>
                        <span class="ml-1 capitalize">{{ option.action_type }}</span>
                        <span v-if="option.action_value" class="ml-1">→ {{ option.submenu_name || option.action_value }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Analytics -->
            <div class="mb-6 grid grid-cols-3 gap-4">
              <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div class="text-xs font-medium text-blue-700">Total Sessions</div>
                <div class="text-2xl font-bold text-blue-900 mt-1">{{ selectedMenu.analytics.total_sessions }}</div>
              </div>
              <div class="p-4 bg-green-50 rounded-lg border border-green-200">
                <div class="text-xs font-medium text-green-700">Avg Duration</div>
                <div class="text-2xl font-bold text-green-900 mt-1">{{ formatDuration(selectedMenu.analytics.avg_duration_seconds) }}</div>
              </div>
              <div class="p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div class="text-xs font-medium text-orange-700">Avg Invalid Inputs</div>
                <div class="text-2xl font-bold text-orange-900 mt-1">{{ selectedMenu.analytics.avg_invalid_inputs.toFixed(1) }}</div>
              </div>
            </div>

            <!-- Recent Sessions -->
            <div>
              <h4 class="text-md font-semibold text-gray-900 mb-3">Recent Sessions (Last 100)</h4>
              <div v-if="selectedMenu.recent_sessions.length === 0" class="text-sm text-gray-500 italic">
                No recent sessions
              </div>
              <div v-else class="max-h-64 overflow-y-auto space-y-2">
                <div v-for="session in selectedMenu.recent_sessions.slice(0, 10)" :key="session.id" class="p-2 bg-gray-50 rounded text-xs">
                  <div class="flex items-center justify-between">
                    <div>
                      <span class="font-medium">{{ session.from_number }}</span>
                      <span class="text-gray-500 mx-1">→</span>
                      <span>{{ session.to_number }}</span>
                    </div>
                    <div class="text-gray-500">
                      {{ formatDate(session.started_at) }}
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="selectedMenu.recent_sessions.length > 10" class="text-xs text-gray-500 mt-2 text-center">
                Showing 10 of {{ selectedMenu.recent_sessions.length }} recent sessions
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { adminAPI } from '../../../utils/api'

// State
const loading = ref(false)
const loadingSessions = ref(false)
const loadingMenuDetails = ref(false)
const activeTab = ref('menus')

// Stats
const stats = ref({
  total_menus: 0,
  active_menus: 0,
  inactive_menus: 0,
  active_tenants: 0,
  total_options: 0,
  avg_options_per_menu: 0,
  total_sessions: 0,
  active_sessions: 0,
  avg_session_duration_seconds: 0,
  avg_invalid_inputs: 0,
  action_distribution: [],
  top_menus: []
})

// Menus
const menus = ref([])
const menuFilters = ref({
  search: '',
  status: '',
  tenant_id: '',
  sort_by: 'created_at',
  sort_order: 'desc'
})
const pagination = ref({
  page: 1,
  limit: 50,
  total: 0,
  total_pages: 0
})

// Sessions
const sessions = ref([])
const sessionFilters = ref({
  active_only: false,
  menu_id: '',
  tenant_id: ''
})
const sessionPagination = ref({
  page: 1,
  limit: 50,
  total: 0,
  total_pages: 0
})

// Menu Details Modal
const showMenuModal = ref(false)
const selectedMenu = ref(null)

// Tabs
const tabs = computed(() => [
  { id: 'menus', label: 'Menus', badge: pagination.value.total },
  { id: 'sessions', label: 'Sessions', badge: stats.value.active_sessions > 0 ? stats.value.active_sessions : null },
  { id: 'analytics', label: 'Analytics', badge: null }
])

// Methods
const fetchStats = async () => {
  try {
    const response = await adminAPI.ivr.getStats()
    stats.value = response.data.stats
    if (response.data.action_distribution) {
      stats.value.action_distribution = response.data.action_distribution
    }
    if (response.data.top_menus) {
      stats.value.top_menus = response.data.top_menus
    }
  } catch (error) {
    console.error('Failed to fetch IVR stats:', error)
  }
}

const fetchMenus = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.value.page,
      limit: pagination.value.limit,
      ...menuFilters.value
    }
    const response = await adminAPI.ivr.listMenus(params)
    menus.value = response.data.menus
    pagination.value.total = response.data.total
    pagination.value.total_pages = response.data.total_pages
  } catch (error) {
    console.error('Failed to fetch IVR menus:', error)
  } finally {
    loading.value = false
  }
}

const fetchSessions = async () => {
  loadingSessions.value = true
  try {
    const params = {
      page: sessionPagination.value.page,
      limit: sessionPagination.value.limit,
      ...sessionFilters.value
    }
    const response = await adminAPI.ivr.listSessions(params)
    sessions.value = response.data.sessions
    sessionPagination.value.total = response.data.total
    sessionPagination.value.total_pages = response.data.total_pages
  } catch (error) {
    console.error('Failed to fetch IVR sessions:', error)
  } finally {
    loadingSessions.value = false
  }
}

const viewMenuDetails = async (menuId) => {
  showMenuModal.value = true
  loadingMenuDetails.value = true
  try {
    const response = await adminAPI.ivr.getMenuDetails(menuId)
    selectedMenu.value = response.data
  } catch (error) {
    console.error('Failed to fetch menu details:', error)
  } finally {
    loadingMenuDetails.value = false
  }
}

const closeMenuModal = () => {
  showMenuModal.value = false
  selectedMenu.value = null
}

const changePage = (page) => {
  pagination.value.page = page
  fetchMenus()
}

const changeSessionPage = (page) => {
  sessionPagination.value.page = page
  fetchSessions()
}

// Debounced search
let searchTimeout = null
const debouncedFetchMenus = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    pagination.value.page = 1
    fetchMenus()
  }, 500)
}

const debouncedFetchSessions = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    sessionPagination.value.page = 1
    fetchSessions()
  }, 500)
}

// Formatters
const formatDate = (dateString) => {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const formatDuration = (seconds) => {
  if (!seconds || seconds === 0) return '0s'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

// Lifecycle
onMounted(() => {
  fetchStats()
  fetchMenus()
  fetchSessions()
})
</script>

<style scoped>
.ivr-management {
  padding: 1rem;
}

@media (min-width: 768px) {
  .ivr-management {
    padding: 1.5rem;
  }
}
</style>
