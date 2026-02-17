<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <router-link to="/dashboard/analytics" class="text-gray-500 hover:text-gray-700">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </router-link>
          <div>
            <h1 class="text-xl font-bold text-gray-900">Report Builder</h1>
            <p class="text-sm text-gray-600">Create custom reports with drag-and-drop</p>
          </div>
        </div>
        <div class="flex items-center space-x-3">
          <button
            @click="showTemplatesModal = true"
            class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center space-x-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
            <span>Templates</span>
          </button>
          <button
            @click="showSavedReportsModal = true"
            class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center space-x-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <span>Saved Reports</span>
          </button>
        </div>
      </div>
    </div>

    <div class="flex">
      <!-- Left Sidebar - Data Source & Fields -->
      <div class="w-80 bg-white border-r border-gray-200 h-[calc(100vh-73px)] overflow-y-auto">
        <!-- Data Source Selection -->
        <div class="p-4 border-b border-gray-200">
          <label class="block text-sm font-medium text-gray-700 mb-2">Data Source</label>
          <select
            v-model="selectedDataSource"
            @change="onDataSourceChange"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a data source...</option>
            <option v-for="(source, key) in dataSources" :key="key" :value="key">
              {{ formatSourceName(key) }}
            </option>
          </select>
        </div>

        <!-- Available Fields -->
        <div v-if="selectedDataSource" class="p-4">
          <h3 class="text-sm font-medium text-gray-700 mb-3">Available Fields</h3>
          <p class="text-xs text-gray-500 mb-3">Drag fields to add them to your report</p>

          <div class="space-y-1">
            <div
              v-for="field in availableFields"
              :key="field.field"
              draggable="true"
              @dragstart="onDragStart($event, field)"
              class="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200 cursor-grab hover:bg-gray-100 hover:border-gray-300 transition-colors"
            >
              <div class="flex items-center space-x-2">
                <span class="text-gray-400">
                  <svg v-if="field.type === 'string'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                  <svg v-else-if="field.type === 'number' || field.type === 'decimal'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                  <svg v-else-if="field.type === 'datetime' || field.type === 'date'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </span>
                <span class="text-sm text-gray-700">{{ field.label }}</span>
              </div>
              <button
                @click="addField(field)"
                class="text-blue-600 hover:text-blue-800"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Aggregations -->
        <div v-if="selectedDataSource" class="p-4 border-t border-gray-200">
          <h3 class="text-sm font-medium text-gray-700 mb-3">Aggregations</h3>
          <div class="space-y-2">
            <div
              v-for="agg in aggregationOptions"
              :key="agg.value"
              draggable="true"
              @dragstart="onDragStartAgg($event, agg)"
              class="flex items-center space-x-2 p-2 bg-purple-50 rounded border border-purple-200 cursor-grab hover:bg-purple-100 transition-colors"
            >
              <svg class="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span class="text-sm text-purple-700">{{ agg.label }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Content - Report Builder Canvas -->
      <div class="flex-1 p-6 overflow-auto">
        <!-- Report Configuration -->
        <div class="bg-white rounded-lg shadow mb-6">
          <div class="p-4 border-b border-gray-200">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Report Name</label>
                <input
                  v-model="reportConfig.name"
                  type="text"
                  placeholder="My Custom Report"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  v-model="reportConfig.dateRange.start"
                  type="date"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  v-model="reportConfig.dateRange.end"
                  type="date"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Selected Fields Drop Zone -->
        <div class="bg-white rounded-lg shadow mb-6">
          <div class="p-4 border-b border-gray-200">
            <h3 class="text-sm font-medium text-gray-700">Selected Columns</h3>
          </div>
          <div
            @dragover.prevent
            @drop="onDropField"
            class="p-4 min-h-[100px]"
            :class="selectedFields.length === 0 ? 'border-2 border-dashed border-gray-300 rounded-lg m-4' : ''"
          >
            <div v-if="selectedFields.length === 0" class="text-center text-gray-500 py-4">
              <svg class="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
              <p>Drag fields here or click + to add columns</p>
            </div>
            <div v-else class="flex flex-wrap gap-2">
              <div
                v-for="(field, index) in selectedFields"
                :key="field.field + index"
                class="flex items-center space-x-2 px-3 py-2 bg-blue-100 text-blue-800 rounded-full"
              >
                <span class="text-sm font-medium">{{ field.label }}</span>
                <button @click="removeField(index)" class="hover:text-blue-600">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Filters -->
        <div class="bg-white rounded-lg shadow mb-6">
          <div class="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 class="text-sm font-medium text-gray-700">Filters</h3>
            <button
              @click="addFilter"
              class="text-blue-600 hover:text-blue-800 text-sm flex items-center space-x-1"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Filter</span>
            </button>
          </div>
          <div class="p-4">
            <div v-if="reportConfig.filters.length === 0" class="text-center text-gray-500 py-4">
              <p>No filters applied</p>
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="(filter, index) in reportConfig.filters"
                :key="index"
                class="flex items-center space-x-3"
              >
                <select
                  v-model="filter.field"
                  class="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select field...</option>
                  <option v-for="field in availableFields" :key="field.field" :value="field.field">
                    {{ field.label }}
                  </option>
                </select>
                <select
                  v-model="filter.operator"
                  class="w-40 px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="eq">Equals</option>
                  <option value="ne">Not Equals</option>
                  <option value="gt">Greater Than</option>
                  <option value="gte">Greater Or Equal</option>
                  <option value="lt">Less Than</option>
                  <option value="lte">Less Or Equal</option>
                  <option value="like">Contains</option>
                  <option value="null">Is Null</option>
                  <option value="not_null">Is Not Null</option>
                </select>
                <input
                  v-if="!['null', 'not_null'].includes(filter.operator)"
                  v-model="filter.value"
                  type="text"
                  placeholder="Value"
                  class="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                />
                <button @click="removeFilter(index)" class="text-red-600 hover:text-red-800">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Group By & Aggregations -->
        <div class="bg-white rounded-lg shadow mb-6">
          <div class="p-4 border-b border-gray-200">
            <h3 class="text-sm font-medium text-gray-700">Grouping & Aggregations</h3>
          </div>
          <div class="p-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Group By</label>
                <select
                  v-model="reportConfig.groupBy"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">No grouping</option>
                  <option v-for="field in availableFields" :key="field.field" :value="field.field">
                    {{ field.label }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
                <div class="flex space-x-2">
                  <select
                    v-model="reportConfig.sortBy"
                    class="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Default</option>
                    <option v-for="field in availableFields" :key="field.field" :value="field.field">
                      {{ field.label }}
                    </option>
                  </select>
                  <select
                    v-model="reportConfig.sortOrder"
                    class="w-32 px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="ASC">Ascending</option>
                    <option value="DESC">Descending</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Aggregation Functions -->
            <div v-if="reportConfig.groupBy" class="mt-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">Aggregation Functions</label>
              <div
                @dragover.prevent
                @drop="onDropAgg"
                class="min-h-[60px] p-3 border-2 border-dashed border-gray-300 rounded-lg"
              >
                <div v-if="reportConfig.aggregations.length === 0" class="text-center text-gray-500 text-sm">
                  Drag aggregations here
                </div>
                <div v-else class="flex flex-wrap gap-2">
                  <div
                    v-for="(agg, index) in reportConfig.aggregations"
                    :key="index"
                    class="flex items-center space-x-2"
                  >
                    <span class="px-2 py-1 bg-purple-100 text-purple-800 rounded text-sm">
                      {{ agg.function.toUpperCase() }}
                    </span>
                    <select
                      v-model="agg.field"
                      class="px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option v-for="field in numericFields" :key="field.field" :value="field.field">
                        {{ field.label }}
                      </option>
                    </select>
                    <button @click="removeAggregation(index)" class="text-red-600 hover:text-red-800">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Chart Type Selection -->
        <div class="bg-white rounded-lg shadow mb-6">
          <div class="p-4 border-b border-gray-200">
            <h3 class="text-sm font-medium text-gray-700">Visualization</h3>
          </div>
          <div class="p-4">
            <div class="grid grid-cols-5 gap-3">
              <button
                v-for="chart in chartTypes"
                :key="chart.type"
                @click="reportConfig.chartType = chart.type"
                :class="[
                  'flex flex-col items-center justify-center p-4 border-2 rounded-lg transition-colors',
                  reportConfig.chartType === chart.type
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                ]"
              >
                <component :is="chart.icon" class="w-8 h-8 mb-2" :class="reportConfig.chartType === chart.type ? 'text-blue-600' : 'text-gray-400'" />
                <span class="text-xs" :class="reportConfig.chartType === chart.type ? 'text-blue-600 font-medium' : 'text-gray-600'">
                  {{ chart.label }}
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- Preview / Results -->
        <div class="bg-white rounded-lg shadow mb-6">
          <div class="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 class="text-sm font-medium text-gray-700">Preview</h3>
            <div class="flex space-x-2">
              <button
                @click="runReport"
                :disabled="!canRunReport || loading"
                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <svg v-if="loading" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Run Report</span>
              </button>
            </div>
          </div>

          <div class="p-4">
            <div v-if="!reportData" class="text-center text-gray-500 py-12">
              <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>Configure your report and click "Run Report" to see results</p>
            </div>

            <!-- Data Table -->
            <div v-else-if="reportConfig.chartType === 'table'" class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th
                      v-for="field in selectedFields"
                      :key="field.field"
                      class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {{ field.label }}
                    </th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="(row, index) in reportData.slice(0, 100)" :key="index">
                    <td
                      v-for="field in selectedFields"
                      :key="field.field"
                      class="px-4 py-3 text-sm text-gray-900 whitespace-nowrap"
                    >
                      {{ formatValue(row[field.field], field.type) }}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="reportData.length > 100" class="mt-4 text-center text-gray-500 text-sm">
                Showing 100 of {{ reportData.length }} rows
              </div>
            </div>

            <!-- Chart Visualization -->
            <div v-else class="h-96">
              <canvas ref="chartCanvas"></canvas>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center justify-between">
          <div class="flex space-x-3">
            <button
              @click="saveReport"
              :disabled="!canSaveReport"
              class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              <span>Save Report</span>
            </button>
            <button
              @click="showScheduleModal = true"
              :disabled="!canSaveReport"
              class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Schedule</span>
            </button>
          </div>
          <div class="flex space-x-3">
            <button
              @click="exportReport('csv')"
              :disabled="!reportData"
              class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              @click="exportReport('xlsx')"
              :disabled="!reportData"
              class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Export Excel
            </button>
            <button
              @click="exportReport('pdf')"
              :disabled="!reportData"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Export PDF
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Templates Modal -->
    <div v-if="showTemplatesModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div class="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 class="text-lg font-semibold">Report Templates</h2>
          <button @click="showTemplatesModal = false" class="text-gray-500 hover:text-gray-700">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="p-4 overflow-y-auto max-h-[60vh]">
          <div class="grid grid-cols-2 gap-4">
            <div
              v-for="template in templates"
              :key="template.id"
              @click="loadTemplate(template)"
              class="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
            >
              <h3 class="font-medium text-gray-900">{{ template.name }}</h3>
              <p class="text-sm text-gray-600 mt-1">{{ template.description }}</p>
              <div class="mt-2 flex items-center space-x-2">
                <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                  {{ formatSourceName(template.data_source) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Saved Reports Modal -->
    <div v-if="showSavedReportsModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
        <div class="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 class="text-lg font-semibold">Saved Reports</h2>
          <button @click="showSavedReportsModal = false" class="text-gray-500 hover:text-gray-700">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="p-4 overflow-y-auto max-h-[60vh]">
          <div v-if="savedReports.length === 0" class="text-center text-gray-500 py-8">
            No saved reports yet
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="report in savedReports"
              :key="report.id"
              class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div>
                <h3 class="font-medium text-gray-900">{{ report.name }}</h3>
                <p class="text-sm text-gray-600">{{ formatSourceName(report.data_source) }}</p>
                <p class="text-xs text-gray-500 mt-1">
                  Created: {{ formatDate(report.created_at) }}
                  <span v-if="report.is_scheduled" class="ml-2 text-blue-600">
                    Scheduled: {{ report.schedule_config?.frequency }}
                  </span>
                </p>
              </div>
              <div class="flex items-center space-x-2">
                <button
                  @click="loadSavedReport(report)"
                  class="px-3 py-1 text-blue-600 hover:bg-blue-50 rounded"
                >
                  Load
                </button>
                <button
                  @click="executeAndExport(report.id, 'xlsx')"
                  class="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded"
                >
                  Export
                </button>
                <button
                  @click="deleteSavedReport(report.id)"
                  class="px-3 py-1 text-red-600 hover:bg-red-50 rounded"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Schedule Modal -->
    <div v-if="showScheduleModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div class="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 class="text-lg font-semibold">Schedule Report</h2>
          <button @click="showScheduleModal = false" class="text-gray-500 hover:text-gray-700">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
            <select
              v-model="scheduleConfig.frequency"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div v-if="scheduleConfig.frequency === 'weekly'">
            <label class="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
            <select
              v-model="scheduleConfig.dayOfWeek"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option :value="0">Sunday</option>
              <option :value="1">Monday</option>
              <option :value="2">Tuesday</option>
              <option :value="3">Wednesday</option>
              <option :value="4">Thursday</option>
              <option :value="5">Friday</option>
              <option :value="6">Saturday</option>
            </select>
          </div>
          <div v-if="scheduleConfig.frequency === 'monthly'">
            <label class="block text-sm font-medium text-gray-700 mb-1">Day of Month</label>
            <select
              v-model="scheduleConfig.dayOfMonth"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option v-for="day in 28" :key="day" :value="day">{{ day }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Time (UTC)</label>
            <input
              v-model="scheduleConfig.time"
              type="time"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Export Format</label>
            <select
              v-model="scheduleConfig.format"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="xlsx">Excel (XLSX)</option>
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Recipients (comma-separated emails)</label>
            <input
              v-model="scheduleConfig.recipients"
              type="text"
              placeholder="email@example.com, another@example.com"
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>
        <div class="p-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            @click="showScheduleModal = false"
            class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            @click="saveSchedule"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Save Schedule
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, h } from 'vue'
import { useAuthStore } from '../stores/auth'
import Chart from 'chart.js/auto'

const authStore = useAuthStore()

// State
const loading = ref(false)
const dataSources = ref({})
const selectedDataSource = ref('')
const selectedFields = ref([])
const reportData = ref(null)
const savedReports = ref([])
const chartInstance = ref(null)
const chartCanvas = ref(null)

// Modals
const showTemplatesModal = ref(false)
const showSavedReportsModal = ref(false)
const showScheduleModal = ref(false)

// Report Configuration
const reportConfig = ref({
  name: '',
  dateRange: {
    start: '',
    end: ''
  },
  filters: [],
  groupBy: '',
  sortBy: '',
  sortOrder: 'DESC',
  aggregations: [],
  chartType: 'table'
})

// Schedule Configuration
const scheduleConfig = ref({
  frequency: 'daily',
  dayOfWeek: 1,
  dayOfMonth: 1,
  time: '09:00',
  format: 'xlsx',
  recipients: ''
})

// Chart Types
const chartTypes = [
  { type: 'table', label: 'Table', icon: TableIcon },
  { type: 'bar', label: 'Bar', icon: BarChartIcon },
  { type: 'line', label: 'Line', icon: LineChartIcon },
  { type: 'pie', label: 'Pie', icon: PieChartIcon },
  { type: 'area', label: 'Area', icon: AreaChartIcon }
]

// Aggregation Options
const aggregationOptions = [
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' }
]

// Templates
const templates = [
  {
    id: 1,
    name: 'Daily Call Summary',
    description: 'Total calls, average duration, and status breakdown',
    data_source: 'calls',
    fields: ['direction', 'status', 'duration_seconds', 'initiated_at'],
    groupBy: 'status',
    aggregations: [{ function: 'count', field: 'id' }, { function: 'avg', field: 'duration_seconds' }]
  },
  {
    id: 2,
    name: 'SMS Campaign Performance',
    description: 'Message delivery rates and costs',
    data_source: 'sms_messages',
    fields: ['status', 'direction', 'segments', 'cost', 'created_at'],
    groupBy: 'status',
    aggregations: [{ function: 'count', field: 'id' }, { function: 'sum', field: 'cost' }]
  },
  {
    id: 3,
    name: 'Email Engagement Report',
    description: 'Open rates, click rates, and bounces',
    data_source: 'emails',
    fields: ['status', 'subject', 'opened_at', 'clicked_at', 'created_at'],
    groupBy: 'status',
    aggregations: [{ function: 'count', field: 'id' }]
  },
  {
    id: 4,
    name: 'Agent Activity Report',
    description: 'Agent status and queue assignments',
    data_source: 'agents',
    fields: ['extension', 'status', 'created_at'],
    groupBy: 'status',
    aggregations: [{ function: 'count', field: 'id' }]
  },
  {
    id: 5,
    name: 'Billing Summary',
    description: 'Invoice totals and payment status',
    data_source: 'billing',
    fields: ['invoice_number', 'amount', 'status', 'due_date', 'paid_at'],
    groupBy: 'status',
    aggregations: [{ function: 'sum', field: 'amount' }, { function: 'count', field: 'id' }]
  },
  {
    id: 6,
    name: 'Campaign ROI Analysis',
    description: 'Campaign performance and cost analysis',
    data_source: 'campaigns',
    fields: ['name', 'type', 'status', 'total_sent', 'total_delivered', 'actual_cost'],
    groupBy: 'type',
    aggregations: [{ function: 'sum', field: 'total_sent' }, { function: 'sum', field: 'actual_cost' }]
  }
]

// Computed
const availableFields = computed(() => {
  if (!selectedDataSource.value || !dataSources.value[selectedDataSource.value]) {
    return []
  }
  return dataSources.value[selectedDataSource.value].fields
})

const numericFields = computed(() => {
  return availableFields.value.filter(f =>
    ['number', 'decimal'].includes(f.type) || f.field === 'id'
  )
})

const canRunReport = computed(() => {
  return selectedDataSource.value && selectedFields.value.length > 0
})

const canSaveReport = computed(() => {
  return reportConfig.value.name && selectedDataSource.value && selectedFields.value.length > 0
})

// Methods
async function fetchDataSources() {
  try {
    const response = await fetch('/api/v1/reports/sources', {
      headers: {
        'Authorization': `Bearer ${authStore.token}`
      }
    })
    const result = await response.json()
    if (result.success) {
      dataSources.value = result.data
    }
  } catch (error) {
    console.error('Error fetching data sources:', error)
  }
}

async function fetchSavedReports() {
  try {
    const response = await fetch('/api/v1/reports', {
      headers: {
        'Authorization': `Bearer ${authStore.token}`
      }
    })
    const result = await response.json()
    if (result.success) {
      savedReports.value = result.data
    }
  } catch (error) {
    console.error('Error fetching saved reports:', error)
  }
}

function onDataSourceChange() {
  selectedFields.value = []
  reportConfig.value.filters = []
  reportConfig.value.groupBy = ''
  reportConfig.value.aggregations = []
  reportData.value = null
}

function onDragStart(event, field) {
  event.dataTransfer.setData('field', JSON.stringify(field))
  event.dataTransfer.setData('type', 'field')
}

function onDragStartAgg(event, agg) {
  event.dataTransfer.setData('agg', JSON.stringify(agg))
  event.dataTransfer.setData('type', 'agg')
}

function onDropField(event) {
  const type = event.dataTransfer.getData('type')
  if (type === 'field') {
    const field = JSON.parse(event.dataTransfer.getData('field'))
    addField(field)
  }
}

function onDropAgg(event) {
  const type = event.dataTransfer.getData('type')
  if (type === 'agg') {
    const agg = JSON.parse(event.dataTransfer.getData('agg'))
    if (numericFields.value.length > 0) {
      reportConfig.value.aggregations.push({
        function: agg.value,
        field: numericFields.value[0].field,
        alias: `${agg.value}_${numericFields.value[0].field}`
      })
    }
  }
}

function addField(field) {
  if (!selectedFields.value.find(f => f.field === field.field)) {
    selectedFields.value.push(field)
  }
}

function removeField(index) {
  selectedFields.value.splice(index, 1)
}

function addFilter() {
  reportConfig.value.filters.push({
    field: '',
    operator: 'eq',
    value: ''
  })
}

function removeFilter(index) {
  reportConfig.value.filters.splice(index, 1)
}

function removeAggregation(index) {
  reportConfig.value.aggregations.splice(index, 1)
}

async function runReport() {
  loading.value = true
  try {
    const queryConfig = {
      data_source: selectedDataSource.value,
      fields: selectedFields.value.map(f => f.field),
      filters: reportConfig.value.filters.filter(f => f.field && f.operator),
      sort_by: reportConfig.value.sortBy || undefined,
      sort_order: reportConfig.value.sortOrder,
      group_by: reportConfig.value.groupBy || undefined,
      aggregations: reportConfig.value.aggregations,
      date_range: {
        start: reportConfig.value.dateRange.start || undefined,
        end: reportConfig.value.dateRange.end || undefined
      },
      limit: 10000
    }

    const response = await fetch('/api/v1/reports/query', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(queryConfig)
    })

    const result = await response.json()
    if (result.success) {
      reportData.value = result.data
      if (reportConfig.value.chartType !== 'table') {
        renderChart()
      }
    } else {
      alert('Error running report: ' + result.error)
    }
  } catch (error) {
    console.error('Error running report:', error)
    alert('Error running report')
  } finally {
    loading.value = false
  }
}

async function saveReport() {
  try {
    const reportData = {
      name: reportConfig.value.name,
      data_source: selectedDataSource.value,
      fields: selectedFields.value.map(f => f.field),
      filters: reportConfig.value.filters.filter(f => f.field && f.operator),
      sort_by: reportConfig.value.sortBy || undefined,
      sort_order: reportConfig.value.sortOrder,
      group_by: reportConfig.value.groupBy || undefined,
      aggregations: reportConfig.value.aggregations,
      date_range: {
        start: reportConfig.value.dateRange.start || undefined,
        end: reportConfig.value.dateRange.end || undefined
      }
    }

    const response = await fetch('/api/v1/reports', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reportData)
    })

    const result = await response.json()
    if (result.success) {
      alert('Report saved successfully!')
      fetchSavedReports()
    } else {
      alert('Error saving report: ' + result.error)
    }
  } catch (error) {
    console.error('Error saving report:', error)
    alert('Error saving report')
  }
}

async function saveSchedule() {
  if (!reportConfig.value.name) {
    alert('Please save the report first')
    return
  }

  try {
    // First save the report if not already saved
    const reportData = {
      name: reportConfig.value.name,
      data_source: selectedDataSource.value,
      fields: selectedFields.value.map(f => f.field),
      filters: reportConfig.value.filters.filter(f => f.field && f.operator),
      is_scheduled: true,
      schedule_config: {
        frequency: scheduleConfig.value.frequency,
        day_of_week: scheduleConfig.value.dayOfWeek,
        day_of_month: scheduleConfig.value.dayOfMonth,
        time: scheduleConfig.value.time,
        format: scheduleConfig.value.format,
        recipients: scheduleConfig.value.recipients.split(',').map(e => e.trim()).filter(Boolean)
      }
    }

    const response = await fetch('/api/v1/reports', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reportData)
    })

    const result = await response.json()
    if (result.success) {
      alert('Report scheduled successfully!')
      showScheduleModal.value = false
      fetchSavedReports()
    } else {
      alert('Error scheduling report: ' + result.error)
    }
  } catch (error) {
    console.error('Error scheduling report:', error)
    alert('Error scheduling report')
  }
}

async function exportReport(format) {
  if (!reportData.value) return

  try {
    const queryConfig = {
      data_source: selectedDataSource.value,
      fields: selectedFields.value.map(f => f.field),
      filters: reportConfig.value.filters.filter(f => f.field && f.operator),
      date_range: {
        start: reportConfig.value.dateRange.start || undefined,
        end: reportConfig.value.dateRange.end || undefined
      },
      format
    }

    const response = await fetch('/api/v1/reports/export', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(queryConfig)
    })

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report_${selectedDataSource.value}_${Date.now()}.${format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Error exporting report:', error)
    alert('Error exporting report')
  }
}

async function executeAndExport(reportId, format) {
  try {
    const response = await fetch(`/api/v1/reports/${reportId}/export/${format}`, {
      headers: {
        'Authorization': `Bearer ${authStore.token}`
      }
    })

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report_${reportId}_${Date.now()}.${format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Error exporting report:', error)
  }
}

function loadTemplate(template) {
  selectedDataSource.value = template.data_source

  // Wait for fields to load
  setTimeout(() => {
    selectedFields.value = availableFields.value.filter(f =>
      template.fields.includes(f.field)
    )
    reportConfig.value.name = template.name
    reportConfig.value.groupBy = template.groupBy || ''
    reportConfig.value.aggregations = template.aggregations || []
    showTemplatesModal.value = false
  }, 100)
}

function loadSavedReport(report) {
  selectedDataSource.value = report.data_source

  setTimeout(() => {
    const fields = typeof report.fields === 'string' ? JSON.parse(report.fields) : report.fields
    selectedFields.value = availableFields.value.filter(f =>
      fields.includes(f.field)
    )

    reportConfig.value.name = report.name
    reportConfig.value.filters = typeof report.filters === 'string' ? JSON.parse(report.filters) : (report.filters || [])
    reportConfig.value.groupBy = report.group_by || ''
    reportConfig.value.sortBy = report.sort_by || ''
    reportConfig.value.sortOrder = report.sort_order || 'DESC'
    reportConfig.value.aggregations = typeof report.aggregations === 'string' ? JSON.parse(report.aggregations) : (report.aggregations || [])

    const dateRange = typeof report.date_range === 'string' ? JSON.parse(report.date_range) : (report.date_range || {})
    reportConfig.value.dateRange = {
      start: dateRange.start || '',
      end: dateRange.end || ''
    }

    showSavedReportsModal.value = false
  }, 100)
}

async function deleteSavedReport(reportId) {
  if (!confirm('Are you sure you want to delete this report?')) return

  try {
    const response = await fetch(`/api/v1/reports/${reportId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authStore.token}`
      }
    })

    const result = await response.json()
    if (result.success) {
      fetchSavedReports()
    }
  } catch (error) {
    console.error('Error deleting report:', error)
  }
}

function renderChart() {
  if (!chartCanvas.value || !reportData.value || reportData.value.length === 0) return

  if (chartInstance.value) {
    chartInstance.value.destroy()
  }

  const ctx = chartCanvas.value.getContext('2d')
  const labels = reportData.value.map((row, i) =>
    row[reportConfig.value.groupBy] || row[selectedFields.value[0]?.field] || `Item ${i + 1}`
  )

  const datasets = []
  if (reportConfig.value.aggregations.length > 0) {
    reportConfig.value.aggregations.forEach((agg, index) => {
      const key = agg.alias || `${agg.function}_${agg.field}`
      datasets.push({
        label: `${agg.function.toUpperCase()}(${agg.field})`,
        data: reportData.value.map(row => parseFloat(row[key]) || 0),
        backgroundColor: getChartColor(index, 0.6),
        borderColor: getChartColor(index, 1),
        borderWidth: 1
      })
    })
  } else {
    const numField = selectedFields.value.find(f => ['number', 'decimal'].includes(f.type))
    if (numField) {
      datasets.push({
        label: numField.label,
        data: reportData.value.map(row => parseFloat(row[numField.field]) || 0),
        backgroundColor: getChartColor(0, 0.6),
        borderColor: getChartColor(0, 1),
        borderWidth: 1
      })
    }
  }

  const chartType = reportConfig.value.chartType === 'area' ? 'line' : reportConfig.value.chartType

  chartInstance.value = new Chart(ctx, {
    type: chartType,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top'
        }
      },
      scales: chartType !== 'pie' ? {
        y: {
          beginAtZero: true
        }
      } : undefined,
      elements: reportConfig.value.chartType === 'area' ? {
        line: {
          fill: true
        }
      } : undefined
    }
  })
}

function getChartColor(index, alpha) {
  const colors = [
    `rgba(59, 130, 246, ${alpha})`,
    `rgba(16, 185, 129, ${alpha})`,
    `rgba(245, 158, 11, ${alpha})`,
    `rgba(239, 68, 68, ${alpha})`,
    `rgba(139, 92, 246, ${alpha})`,
    `rgba(236, 72, 153, ${alpha})`
  ]
  return colors[index % colors.length]
}

function formatSourceName(source) {
  const names = {
    calls: 'Voice Calls',
    sms_messages: 'SMS Messages',
    emails: 'Emails',
    campaigns: 'Campaigns',
    agents: 'Agents',
    billing: 'Billing'
  }
  return names[source] || source
}

function formatValue(value, type) {
  if (value === null || value === undefined) return '-'
  if (type === 'datetime' || type === 'date') {
    return new Date(value).toLocaleString()
  }
  if (type === 'decimal') {
    return parseFloat(value).toFixed(2)
  }
  return value
}

function formatDate(date) {
  return new Date(date).toLocaleDateString()
}

// Watch for chart type changes
watch(() => reportConfig.value.chartType, () => {
  if (reportData.value && reportConfig.value.chartType !== 'table') {
    setTimeout(renderChart, 100)
  }
})

// Mount
onMounted(() => {
  fetchDataSources()
  fetchSavedReports()

  // Set default date range to last 30 days
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  reportConfig.value.dateRange.start = start.toISOString().split('T')[0]
  reportConfig.value.dateRange.end = end.toISOString().split('T')[0]
})

// Icon Components
function TableIcon(props) {
  return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', ...props }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' })
  ])
}

function BarChartIcon(props) {
  return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', ...props }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' })
  ])
}

function LineChartIcon(props) {
  return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', ...props }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16' })
  ])
}

function PieChartIcon(props) {
  return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', ...props }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z' }),
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z' })
  ])
}

function AreaChartIcon(props) {
  return h('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', ...props }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4 19h16M4 15l4-8 4 4 4-6 4 10' }),
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M4 19l4-4 4-4 4-2 4 6v4H4z', fill: 'currentColor', opacity: '0.2' })
  ])
}
</script>
