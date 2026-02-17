<template>
  <div class="p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Video Calling Management</h1>
        <p class="text-gray-500 mt-1">Manage video rooms, recordings, workers, and platform configuration</p>
      </div>
      <div class="flex items-center gap-3">
        <button @click="refreshData" class="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50">
          Refresh
        </button>
      </div>
    </div>

    <!-- Stats Overview -->
    <div class="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Active Rooms</p>
            <p class="text-2xl font-bold text-violet-600">{{ stats.activeRooms || 0 }}</p>
          </div>
          <div class="p-3 bg-violet-100 rounded-lg">
            <VideoCameraIcon class="h-6 w-6 text-violet-600" />
          </div>
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Participants</p>
            <p class="text-2xl font-bold text-emerald-600">{{ stats.connectedParticipants || 0 }}</p>
          </div>
          <div class="p-3 bg-emerald-100 rounded-lg">
            <UsersIcon class="h-6 w-6 text-emerald-600" />
          </div>
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Active Recordings</p>
            <p class="text-2xl font-bold text-red-600">{{ stats.activeRecordings || 0 }}</p>
          </div>
          <div class="p-3 bg-red-100 rounded-lg">
            <span class="h-3 w-3 bg-red-500 rounded-full animate-pulse inline-block"></span>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Workers</p>
            <p class="text-2xl font-bold text-blue-600">{{ stats.activeWorkers || 0 }}</p>
          </div>
          <div class="p-3 bg-blue-100 rounded-lg">
            <CpuChipIcon class="h-6 w-6 text-blue-600" />
          </div>
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Rooms (24h)</p>
            <p class="text-2xl font-bold text-orange-600">{{ stats.roomsLast24h || 0 }}</p>
          </div>
          <div class="p-3 bg-orange-100 rounded-lg">
            <CalendarIcon class="h-6 w-6 text-orange-600" />
          </div>
        </div>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Minutes (24h)</p>
            <p class="text-2xl font-bold text-cyan-600">{{ stats.minutesLast24h || 0 }}</p>
          </div>
          <div class="p-3 bg-cyan-100 rounded-lg">
            <ClockIcon class="h-6 w-6 text-cyan-600" />
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
        <!-- Active Rooms Tab -->
        <div v-if="activeTab === 'rooms'">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-4">
              <h3 class="font-semibold text-gray-900">Active Video Rooms</h3>
              <select v-model="roomFilter" class="px-3 py-1.5 border rounded-lg text-sm">
                <option value="active">Active Only</option>
                <option value="waiting">Waiting</option>
                <option value="all">All Rooms</option>
              </select>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Host</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Participants</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="room in rooms" :key="room.id">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p class="font-medium text-gray-900">{{ room.name }}</p>
                      <p class="text-sm text-gray-500">{{ room.roomCode }}</p>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-sm text-gray-900">{{ room.tenant?.name }}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-sm text-gray-500">{{ room.host?.email || 'N/A' }}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                      {{ room.participantCount }} / {{ room.maxParticipants }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span :class="getStatusClass(room.status)">
                      {{ room.status }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-sm text-gray-500">{{ formatDate(room.startedAt) }}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                      <button
                        @click="viewRoom(room)"
                        class="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="View Details"
                      >
                        <EyeIcon class="h-4 w-4" />
                      </button>
                      <button
                        v-if="room.status === 'active'"
                        @click="endRoom(room)"
                        class="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                        title="End Room"
                      >
                        <XCircleIcon class="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="rooms.length === 0">
                  <td colspan="7" class="px-6 py-8 text-center text-gray-500">
                    No video rooms found
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Workers Tab -->
        <div v-if="activeTab === 'workers'">
          <div class="mb-4">
            <h3 class="font-semibold text-gray-900">MediaSoup Workers</h3>
            <p class="text-sm text-gray-500">SFU worker instances handling video media</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="worker in workers"
              :key="worker.id"
              class="border rounded-lg p-4"
            >
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <CpuChipIcon class="h-5 w-5 text-gray-400" />
                  <span class="font-medium">{{ worker.workerId }}</span>
                </div>
                <span :class="[
                  'px-2 py-1 rounded-full text-xs',
                  worker.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                ]">
                  {{ worker.status }}
                </span>
              </div>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-500">Hostname</span>
                  <span class="text-gray-900">{{ worker.hostname }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">Port</span>
                  <span class="text-gray-900">{{ worker.port }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">PID</span>
                  <span class="text-gray-900">{{ worker.pid }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">Active Routers</span>
                  <span class="text-gray-900">{{ worker.activeRouters }} / {{ worker.maxRouters }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">RTP Ports</span>
                  <span class="text-gray-900">{{ worker.rtpPortRange }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">Last Heartbeat</span>
                  <span class="text-gray-900">{{ formatDate(worker.lastHeartbeatAt) }}</span>
                </div>
              </div>
            </div>
            <div v-if="workers.length === 0" class="col-span-full text-center py-8 text-gray-500">
              No workers registered. MediaSoup may not be running.
            </div>
          </div>
        </div>

        <!-- Recordings Tab -->
        <div v-if="activeTab === 'recordings'">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-gray-900">Video Recordings</h3>
            <select v-model="recordingFilter" class="px-3 py-1.5 border rounded-lg text-sm">
              <option value="">All Status</option>
              <option value="recording">Recording</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="recording in recordings" :key="recording.id">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p class="font-medium text-gray-900">{{ recording.roomName }}</p>
                      <p class="text-sm text-gray-500">{{ recording.roomCode }}</p>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-sm text-gray-900">{{ recording.tenantName }}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                      {{ recording.recordingType }} - {{ recording.resolution }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-sm text-gray-900">{{ formatDuration(recording.durationSeconds) }}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-sm text-gray-500">{{ formatFileSize(recording.fileSize) }}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span :class="getRecordingStatusClass(recording.status)">
                      {{ recording.status }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-sm text-gray-500">{{ formatDate(recording.createdAt) }}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                      <button
                        v-if="recording.status === 'completed'"
                        @click="downloadRecording(recording)"
                        class="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="Download"
                      >
                        <ArrowDownTrayIcon class="h-4 w-4" />
                      </button>
                      <button
                        @click="deleteRecording(recording)"
                        class="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <TrashIcon class="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="recordings.length === 0">
                  <td colspan="8" class="px-6 py-8 text-center text-gray-500">
                    No recordings found
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Tenants Tab -->
        <div v-if="activeTab === 'tenants'">
          <div class="mb-4">
            <h3 class="font-semibold text-gray-900">Tenant Video Settings</h3>
            <p class="text-sm text-gray-500">Configure video calling for each tenant</p>
          </div>

          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Video Enabled</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Max Rooms</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Max Participants</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recording</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="tenant in tenantSettings" :key="tenant.tenantId">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p class="font-medium text-gray-900">{{ tenant.tenantName }}</p>
                      <p class="text-sm text-gray-500">{{ tenant.subdomain }}</p>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <button
                      @click="toggleTenantVideo(tenant)"
                      :class="[
                        'px-3 py-1 rounded-full text-xs font-medium',
                        tenant.videoEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      ]"
                    >
                      {{ tenant.videoEnabled ? 'Enabled' : 'Disabled' }}
                    </button>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-sm text-gray-900">{{ tenant.maxConcurrentRooms }}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="text-sm text-gray-900">{{ tenant.maxRoomParticipants }}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span :class="[
                      'px-2 py-1 rounded-full text-xs',
                      tenant.recordingEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    ]">
                      {{ tenant.recordingEnabled ? 'Enabled' : 'Disabled' }}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <button
                      @click="editTenantSettings(tenant)"
                      class="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                      title="Edit Settings"
                    >
                      <PencilIcon class="h-4 w-4" />
                    </button>
                  </td>
                </tr>
                <tr v-if="tenantSettings.length === 0">
                  <td colspan="6" class="px-6 py-8 text-center text-gray-500">
                    No tenant settings found
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Config Tab -->
        <div v-if="activeTab === 'config'">
          <div class="mb-4">
            <h3 class="font-semibold text-gray-900">Platform Configuration</h3>
            <p class="text-sm text-gray-500">MediaSoup and video platform settings</p>
          </div>

          <div class="space-y-4">
            <div v-for="(config, key) in platformConfig" :key="key" class="border rounded-lg p-4">
              <div class="flex items-center justify-between mb-2">
                <div>
                  <h4 class="font-medium text-gray-900">{{ formatConfigKey(key) }}</h4>
                  <p class="text-sm text-gray-500">{{ config.description }}</p>
                </div>
                <div class="flex items-center gap-2">
                  <span :class="[
                    'px-2 py-1 rounded-full text-xs',
                    config.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                  ]">
                    {{ config.isActive ? 'Active' : 'Inactive' }}
                  </span>
                  <button
                    @click="editConfig(key, config)"
                    class="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                    title="Edit"
                  >
                    <PencilIcon class="h-4 w-4" />
                  </button>
                </div>
              </div>
              <pre class="mt-2 p-3 bg-gray-50 rounded text-xs overflow-x-auto">{{ JSON.stringify(config.value, null, 2) }}</pre>
            </div>
          </div>
        </div>

        <!-- Analytics Tab -->
        <div v-if="activeTab === 'analytics'">
          <div class="mb-6">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-gray-900">Video Analytics</h3>
              <div class="flex items-center gap-2">
                <input
                  type="date"
                  v-model="analyticsStartDate"
                  class="px-3 py-1.5 border rounded-lg text-sm"
                />
                <span class="text-gray-500">to</span>
                <input
                  type="date"
                  v-model="analyticsEndDate"
                  class="px-3 py-1.5 border rounded-lg text-sm"
                />
                <button @click="loadAnalytics" class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm">
                  Apply
                </button>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-gray-50 rounded-lg p-4 text-center">
              <p class="text-3xl font-bold text-violet-600">{{ analytics.overview?.totalRooms || 0 }}</p>
              <p class="text-sm text-gray-500">Total Rooms</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4 text-center">
              <p class="text-3xl font-bold text-emerald-600">{{ analytics.overview?.totalMinutes || 0 }}</p>
              <p class="text-sm text-gray-500">Total Minutes</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4 text-center">
              <p class="text-3xl font-bold text-blue-600">{{ analytics.overview?.totalParticipants || 0 }}</p>
              <p class="text-sm text-gray-500">Total Participants</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-4 text-center">
              <p class="text-3xl font-bold text-orange-600">{{ analytics.overview?.totalRecordings || 0 }}</p>
              <p class="text-sm text-gray-500">Recordings</p>
            </div>
          </div>

          <!-- Top Tenants -->
          <div class="mb-6">
            <h4 class="font-medium text-gray-900 mb-3">Top Tenants by Usage</h4>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rooms</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Minutes</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="tenant in analytics.topTenants" :key="tenant.id">
                    <td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{{ tenant.name }}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-gray-500">{{ tenant.roomCount }}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-gray-500">{{ tenant.totalMinutes }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Room Details Modal -->
    <div v-if="showRoomDetails" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto m-4">
        <div class="p-6 border-b">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">Room Details</h3>
            <button @click="showRoomDetails = false" class="text-gray-500 hover:text-gray-700">
              <XMarkIcon class="h-5 w-5" />
            </button>
          </div>
        </div>
        <div class="p-6" v-if="selectedRoom">
          <div class="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p class="text-sm text-gray-500">Room Name</p>
              <p class="font-medium">{{ selectedRoom.room?.name }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Room Code</p>
              <p class="font-medium">{{ selectedRoom.room?.roomCode }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Status</p>
              <span :class="getStatusClass(selectedRoom.room?.status)">{{ selectedRoom.room?.status }}</span>
            </div>
            <div>
              <p class="text-sm text-gray-500">Duration</p>
              <p class="font-medium">{{ formatDuration(selectedRoom.room?.durationSeconds) }}</p>
            </div>
          </div>

          <h4 class="font-medium mb-3">Participants ({{ selectedRoom.participants?.length || 0 }})</h4>
          <div class="space-y-2">
            <div v-for="p in selectedRoom.participants" :key="p.id" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-violet-100 rounded-full flex items-center justify-center">
                  <span class="text-violet-600 font-medium text-sm">{{ p.displayName?.charAt(0) }}</span>
                </div>
                <div>
                  <p class="font-medium text-sm">{{ p.displayName }}</p>
                  <p class="text-xs text-gray-500">{{ p.email }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span :class="p.isAudioEnabled ? 'text-green-500' : 'text-gray-400'">
                  <MicrophoneIcon class="h-4 w-4" />
                </span>
                <span :class="p.isVideoEnabled ? 'text-green-500' : 'text-gray-400'">
                  <VideoCameraIcon class="h-4 w-4" />
                </span>
                <span :class="['px-2 py-0.5 rounded text-xs', p.status === 'connected' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600']">
                  {{ p.status }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import api from '@/api';
import {
  VideoCameraIcon,
  UsersIcon,
  CpuChipIcon,
  CalendarIcon,
  ClockIcon,
  EyeIcon,
  XCircleIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  MicrophoneIcon
} from '@heroicons/vue/24/outline';

const stats = ref({});
const rooms = ref([]);
const workers = ref([]);
const recordings = ref([]);
const tenantSettings = ref([]);
const platformConfig = ref({});
const analytics = ref({});
const activeTab = ref('rooms');
const roomFilter = ref('active');
const recordingFilter = ref('');
const showRoomDetails = ref(false);
const selectedRoom = ref(null);
const analyticsStartDate = ref(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
const analyticsEndDate = ref(new Date().toISOString().split('T')[0]);

const tabs = ref([
  { id: 'rooms', name: 'Active Rooms' },
  { id: 'workers', name: 'Workers' },
  { id: 'recordings', name: 'Recordings' },
  { id: 'tenants', name: 'Tenant Settings' },
  { id: 'config', name: 'Configuration' },
  { id: 'analytics', name: 'Analytics' }
]);

onMounted(() => {
  refreshData();
});

watch(roomFilter, () => loadRooms());
watch(recordingFilter, () => loadRecordings());

async function refreshData() {
  await Promise.all([
    loadStats(),
    loadRooms(),
    loadWorkers(),
    loadRecordings(),
    loadTenantSettings(),
    loadConfig(),
    loadAnalytics()
  ]);
}

async function loadStats() {
  try {
    const response = await api.get('/admin/video/stats');
    stats.value = response.data.stats;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

async function loadRooms() {
  try {
    const response = await api.get('/admin/video/rooms', {
      params: { status: roomFilter.value === 'all' ? undefined : roomFilter.value }
    });
    rooms.value = response.data.rooms;
  } catch (error) {
    console.error('Failed to load rooms:', error);
  }
}

async function loadWorkers() {
  try {
    const response = await api.get('/admin/video/workers');
    workers.value = response.data.workers;
  } catch (error) {
    console.error('Failed to load workers:', error);
  }
}

async function loadRecordings() {
  try {
    const response = await api.get('/admin/video/recordings', {
      params: { status: recordingFilter.value || undefined }
    });
    recordings.value = response.data.recordings;
  } catch (error) {
    console.error('Failed to load recordings:', error);
  }
}

async function loadTenantSettings() {
  try {
    const response = await api.get('/admin/video/tenants');
    tenantSettings.value = response.data.tenants;
  } catch (error) {
    console.error('Failed to load tenant settings:', error);
  }
}

async function loadConfig() {
  try {
    const response = await api.get('/admin/video/config');
    platformConfig.value = response.data.config;
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

async function loadAnalytics() {
  try {
    const response = await api.get('/admin/video/analytics', {
      params: { startDate: analyticsStartDate.value, endDate: analyticsEndDate.value }
    });
    analytics.value = response.data.analytics;
  } catch (error) {
    console.error('Failed to load analytics:', error);
  }
}

async function viewRoom(room) {
  try {
    const response = await api.get(`/admin/video/rooms/${room.id}`);
    selectedRoom.value = response.data;
    showRoomDetails.value = true;
  } catch (error) {
    console.error('Failed to load room details:', error);
  }
}

async function endRoom(room) {
  if (!confirm(`End room "${room.name}"? All participants will be disconnected.`)) return;

  try {
    await api.post(`/admin/video/rooms/${room.id}/end`);
    await loadRooms();
    await loadStats();
  } catch (error) {
    console.error('Failed to end room:', error);
  }
}

async function toggleTenantVideo(tenant) {
  try {
    await api.patch(`/admin/video/tenants/${tenant.tenantId}`, {
      video_enabled: !tenant.videoEnabled
    });
    await loadTenantSettings();
  } catch (error) {
    console.error('Failed to toggle tenant video:', error);
  }
}

function editTenantSettings(tenant) {
  // TODO: Open settings modal
  alert('Edit tenant settings: ' + tenant.tenantName);
}

function editConfig(key, config) {
  // TODO: Open config editor modal
  alert('Edit config: ' + key);
}

async function deleteRecording(recording) {
  if (!confirm('Delete this recording? This action cannot be undone.')) return;

  try {
    await api.delete(`/admin/video/recordings/${recording.id}`);
    await loadRecordings();
  } catch (error) {
    console.error('Failed to delete recording:', error);
  }
}

function downloadRecording(recording) {
  // TODO: Get presigned URL and download
  alert('Download recording: ' + recording.id);
}

function getStatusClass(status) {
  const classes = {
    active: 'px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs',
    waiting: 'px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs',
    ended: 'px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs'
  };
  return classes[status] || classes.ended;
}

function getRecordingStatusClass(status) {
  const classes = {
    recording: 'px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs animate-pulse',
    processing: 'px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs',
    completed: 'px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs',
    failed: 'px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs'
  };
  return classes[status] || 'px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs';
}

function formatDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleString();
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatConfigKey(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
</script>
