<template>
  <div class="p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Workforce Management</h1>
        <p class="text-gray-600">Schedule shifts, manage time-off, and monitor adherence</p>
      </div>
      <div class="flex items-center gap-3">
        <button
          @click="generateSchedule"
          class="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Auto-Generate Schedule
        </button>
        <button
          @click="showShiftModal = true"
          class="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          + Add Shift
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-gray-200 mb-6">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="[
          'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
          activeTab === tab.id
            ? 'border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'
        ]"
      >
        {{ tab.name }}
        <span v-if="tab.badge" class="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">
          {{ tab.badge }}
        </span>
      </button>
    </div>

    <!-- Schedule Tab -->
    <div v-show="activeTab === 'schedule'">
      <!-- Calendar Navigation -->
      <div class="bg-white rounded-lg shadow mb-6">
        <div class="flex items-center justify-between px-4 py-3 border-b">
          <div class="flex items-center gap-4">
            <button @click="prevWeek" class="p-1 hover:bg-gray-100 rounded">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 class="font-semibold text-gray-900">{{ formatWeekRange }}</h3>
            <button @click="nextWeek" class="p-1 hover:bg-gray-100 rounded">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button @click="goToToday" class="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200">
              Today
            </button>
          </div>
          <div class="flex items-center gap-2">
            <select v-model="viewMode" class="text-sm border-gray-300 rounded">
              <option value="week">Week View</option>
              <option value="day">Day View</option>
            </select>
            <select v-model="filterAgent" class="text-sm border-gray-300 rounded">
              <option value="">All Agents</option>
              <option v-for="agent in agents" :key="agent.id" :value="agent.id">
                {{ agent.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Week Calendar Grid -->
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="bg-gray-50">
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-40">Agent</th>
                <th
                  v-for="day in weekDays"
                  :key="day.date"
                  class="px-2 py-2 text-center text-xs font-medium uppercase min-w-[120px]"
                  :class="isToday(day.date) ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500'"
                >
                  <div>{{ day.dayName }}</div>
                  <div class="text-sm font-bold">{{ day.dayNum }}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="agent in filteredAgents" :key="agent.id" class="border-t">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-medium text-indigo-600">
                      {{ getInitials(agent.name) }}
                    </div>
                    <div>
                      <div class="text-sm font-medium text-gray-900">{{ agent.name }}</div>
                      <div class="text-xs text-gray-500">{{ agent.role }}</div>
                    </div>
                  </div>
                </td>
                <td
                  v-for="day in weekDays"
                  :key="day.date"
                  class="px-2 py-2 border-l"
                  :class="isToday(day.date) ? 'bg-indigo-50' : ''"
                >
                  <div
                    v-for="shift in getShiftsForAgentDay(agent.id, day.date)"
                    :key="shift.id"
                    class="mb-1 p-1.5 rounded text-xs cursor-pointer hover:opacity-80"
                    :style="{ backgroundColor: shift.color + '20', borderLeft: `3px solid ${shift.color}` }"
                    @click="editShift(shift)"
                  >
                    <div class="font-medium" :style="{ color: shift.color }">
                      {{ formatTime(shift.start_time) }} - {{ formatTime(shift.end_time) }}
                    </div>
                    <div v-if="shift.template_name" class="text-gray-600 truncate">
                      {{ shift.template_name }}
                    </div>
                  </div>
                  <!-- Time-off indicator -->
                  <div
                    v-if="hasTimeOff(agent.id, day.date)"
                    class="p-1.5 rounded text-xs bg-orange-100 text-orange-700"
                  >
                    Time Off
                  </div>
                  <!-- Empty slot for adding -->
                  <button
                    v-if="!getShiftsForAgentDay(agent.id, day.date).length && !hasTimeOff(agent.id, day.date)"
                    @click="addShiftForDay(agent.id, day.date)"
                    class="w-full p-2 text-xs text-gray-400 border border-dashed border-gray-300 rounded hover:border-indigo-400 hover:text-indigo-400"
                  >
                    + Add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Shift Templates -->
      <div class="bg-white rounded-lg shadow">
        <div class="flex items-center justify-between px-4 py-3 border-b">
          <h3 class="font-semibold text-gray-900">Shift Templates</h3>
          <button
            @click="showTemplateModal = true"
            class="text-sm text-indigo-600 hover:text-indigo-800"
          >
            + New Template
          </button>
        </div>
        <div class="p-4 flex flex-wrap gap-3">
          <div
            v-for="template in templates"
            :key="template.id"
            class="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer hover:shadow"
            :style="{ borderColor: template.color }"
            @click="editTemplate(template)"
          >
            <div class="w-3 h-3 rounded-full" :style="{ backgroundColor: template.color }"></div>
            <div>
              <div class="text-sm font-medium">{{ template.name }}</div>
              <div class="text-xs text-gray-500">
                {{ formatTime(template.start_time) }} - {{ formatTime(template.end_time) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Time-Off Tab -->
    <div v-show="activeTab === 'timeoff'">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Request Form -->
        <div class="bg-white rounded-lg shadow p-4">
          <h3 class="font-semibold text-gray-900 mb-4">Request Time Off</h3>
          <form @submit.prevent="submitTimeOff" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select v-model="timeOffForm.request_type" class="w-full border-gray-300 rounded-md">
                <option value="pto">PTO</option>
                <option value="sick">Sick Leave</option>
                <option value="personal">Personal</option>
                <option value="unpaid">Unpaid Leave</option>
                <option value="jury_duty">Jury Duty</option>
                <option value="bereavement">Bereavement</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" v-model="timeOffForm.start_date" class="w-full border-gray-300 rounded-md" required />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input type="date" v-model="timeOffForm.end_date" class="w-full border-gray-300 rounded-md" required />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <textarea v-model="timeOffForm.reason" rows="2" class="w-full border-gray-300 rounded-md"></textarea>
            </div>
            <button
              type="submit"
              :disabled="submittingTimeOff"
              class="w-full py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {{ submittingTimeOff ? 'Submitting...' : 'Submit Request' }}
            </button>
          </form>
        </div>

        <!-- Pending Requests -->
        <div class="lg:col-span-2 bg-white rounded-lg shadow">
          <div class="px-4 py-3 border-b flex items-center justify-between">
            <h3 class="font-semibold text-gray-900">Time-Off Requests</h3>
            <select v-model="timeOffFilter" class="text-sm border-gray-300 rounded">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
            </select>
          </div>
          <div class="divide-y max-h-[500px] overflow-y-auto">
            <div
              v-for="request in filteredTimeOffRequests"
              :key="request.id"
              class="p-4 hover:bg-gray-50"
            >
              <div class="flex items-start justify-between">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-gray-900">{{ request.agent_name }}</span>
                    <span
                      class="px-2 py-0.5 text-xs rounded-full"
                      :class="getStatusClass(request.status)"
                    >
                      {{ request.status }}
                    </span>
                  </div>
                  <div class="text-sm text-gray-600 mt-1">
                    {{ formatDate(request.start_date) }} - {{ formatDate(request.end_date) }}
                    <span class="text-gray-400">({{ request.request_type }})</span>
                  </div>
                  <div v-if="request.reason" class="text-sm text-gray-500 mt-1">
                    {{ request.reason }}
                  </div>
                </div>
                <div v-if="request.status === 'pending'" class="flex gap-2">
                  <button
                    @click="reviewTimeOff(request.id, 'approved')"
                    class="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
                  >
                    Approve
                  </button>
                  <button
                    @click="reviewTimeOff(request.id, 'denied')"
                    class="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    Deny
                  </button>
                </div>
              </div>
            </div>
            <div v-if="!filteredTimeOffRequests.length" class="p-8 text-center text-gray-500">
              No time-off requests found
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Preferences Tab -->
    <div v-show="activeTab === 'preferences'">
      <div class="max-w-4xl">
        <div class="bg-white rounded-lg shadow mb-6">
          <div class="px-4 py-3 border-b">
            <h3 class="font-semibold text-gray-900">Work Availability Preferences</h3>
            <p class="text-sm text-gray-500">Set your preferred working hours for each day of the week</p>
          </div>
          <div class="p-4">
            <form @submit.prevent="saveAvailability" class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div
                  v-for="day in daysOfWeek"
                  :key="day.value"
                  class="p-4 border rounded-lg"
                  :class="availability[day.value]?.is_available ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-gray-50'"
                >
                  <div class="flex items-center justify-between mb-3">
                    <span class="font-medium text-gray-900">{{ day.label }}</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        v-model="availability[day.value].is_available"
                        class="sr-only peer"
                      />
                      <div class="w-9 h-5 bg-gray-300 peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                  <div v-if="availability[day.value]?.is_available" class="space-y-3">
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">Earliest Start</label>
                      <input
                        type="time"
                        v-model="availability[day.value].preferred_start_time"
                        class="w-full text-sm border-gray-300 rounded"
                      />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">Latest End</label>
                      <input
                        type="time"
                        v-model="availability[day.value].preferred_end_time"
                        class="w-full text-sm border-gray-300 rounded"
                      />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">Max Hours</label>
                      <input
                        type="number"
                        v-model.number="availability[day.value].max_hours"
                        min="1"
                        max="12"
                        class="w-full text-sm border-gray-300 rounded"
                      />
                    </div>
                  </div>
                  <div v-else class="text-sm text-gray-400 text-center py-4">
                    Not Available
                  </div>
                </div>
              </div>
              <div class="flex justify-end pt-4">
                <button
                  type="submit"
                  :disabled="savingAvailability"
                  class="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {{ savingAvailability ? 'Saving...' : 'Save Preferences' }}
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Shift Preferences -->
        <div class="bg-white rounded-lg shadow mb-6">
          <div class="px-4 py-3 border-b">
            <h3 class="font-semibold text-gray-900">Shift Preferences</h3>
            <p class="text-sm text-gray-500">Indicate your preferred shift types</p>
          </div>
          <div class="p-4">
            <div class="space-y-4">
              <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p class="font-medium text-gray-900">Morning Shifts (6am - 2pm)</p>
                  <p class="text-sm text-gray-500">Early start times</p>
                </div>
                <select v-model="shiftPreferences.morning" class="border-gray-300 rounded">
                  <option value="preferred">Preferred</option>
                  <option value="acceptable">Acceptable</option>
                  <option value="avoid">Avoid if possible</option>
                </select>
              </div>
              <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p class="font-medium text-gray-900">Day Shifts (9am - 5pm)</p>
                  <p class="text-sm text-gray-500">Standard business hours</p>
                </div>
                <select v-model="shiftPreferences.day" class="border-gray-300 rounded">
                  <option value="preferred">Preferred</option>
                  <option value="acceptable">Acceptable</option>
                  <option value="avoid">Avoid if possible</option>
                </select>
              </div>
              <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p class="font-medium text-gray-900">Evening Shifts (2pm - 10pm)</p>
                  <p class="text-sm text-gray-500">Afternoon to late evening</p>
                </div>
                <select v-model="shiftPreferences.evening" class="border-gray-300 rounded">
                  <option value="preferred">Preferred</option>
                  <option value="acceptable">Acceptable</option>
                  <option value="avoid">Avoid if possible</option>
                </select>
              </div>
              <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p class="font-medium text-gray-900">Night Shifts (10pm - 6am)</p>
                  <p class="text-sm text-gray-500">Overnight shifts</p>
                </div>
                <select v-model="shiftPreferences.night" class="border-gray-300 rounded">
                  <option value="preferred">Preferred</option>
                  <option value="acceptable">Acceptable</option>
                  <option value="avoid">Avoid if possible</option>
                </select>
              </div>
              <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p class="font-medium text-gray-900">Weekend Work</p>
                  <p class="text-sm text-gray-500">Saturday and Sunday shifts</p>
                </div>
                <select v-model="shiftPreferences.weekend" class="border-gray-300 rounded">
                  <option value="preferred">Preferred</option>
                  <option value="acceptable">Acceptable</option>
                  <option value="avoid">Avoid if possible</option>
                </select>
              </div>
            </div>
            <div class="flex justify-end pt-4">
              <button
                @click="saveShiftPreferences"
                :disabled="savingShiftPreferences"
                class="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {{ savingShiftPreferences ? 'Saving...' : 'Save Shift Preferences' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Weekly Hours Target -->
        <div class="bg-white rounded-lg shadow">
          <div class="px-4 py-3 border-b">
            <h3 class="font-semibold text-gray-900">Weekly Hours</h3>
          </div>
          <div class="p-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Target Hours/Week</label>
                <input
                  type="number"
                  v-model.number="weeklyHours.target"
                  min="8"
                  max="60"
                  class="w-full border-gray-300 rounded-md"
                />
                <p class="text-xs text-gray-400 mt-1">Your desired weekly hours</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Maximum Hours/Week</label>
                <input
                  type="number"
                  v-model.number="weeklyHours.maximum"
                  min="8"
                  max="60"
                  class="w-full border-gray-300 rounded-md"
                />
                <p class="text-xs text-gray-400 mt-1">Maximum you're willing to work</p>
              </div>
            </div>
            <div class="flex items-center mt-4 p-3 bg-blue-50 rounded-lg">
              <input
                type="checkbox"
                v-model="weeklyHours.overtimeAvailable"
                class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <label class="ml-2 text-sm text-gray-700">
                I'm available for overtime when needed
              </label>
            </div>
            <div class="flex justify-end pt-4">
              <button
                @click="saveWeeklyHours"
                :disabled="savingWeeklyHours"
                class="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {{ savingWeeklyHours ? 'Saving...' : 'Save Hours' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Adherence Tab -->
    <div v-show="activeTab === 'adherence'">
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        <!-- Summary Cards -->
        <div class="bg-white rounded-lg shadow p-4">
          <div class="text-sm text-gray-500">Team Adherence</div>
          <div class="text-3xl font-bold text-green-600">{{ adherenceStats.teamAdherence }}%</div>
          <div class="text-xs text-gray-400 mt-1">Target: 95%</div>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <div class="text-sm text-gray-500">On Schedule</div>
          <div class="text-3xl font-bold text-indigo-600">{{ adherenceStats.onSchedule }}</div>
          <div class="text-xs text-gray-400 mt-1">of {{ adherenceStats.scheduled }} scheduled</div>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <div class="text-sm text-gray-500">Late Arrivals</div>
          <div class="text-3xl font-bold text-orange-600">{{ adherenceStats.lateArrivals }}</div>
          <div class="text-xs text-gray-400 mt-1">Today</div>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <div class="text-sm text-gray-500">Unplanned Absences</div>
          <div class="text-3xl font-bold text-red-600">{{ adherenceStats.absences }}</div>
          <div class="text-xs text-gray-400 mt-1">Today</div>
        </div>
      </div>

      <!-- Real-time Adherence -->
      <div class="bg-white rounded-lg shadow">
        <div class="px-4 py-3 border-b">
          <h3 class="font-semibold text-gray-900">Real-time Adherence</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scheduled</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actual Status</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Clock In</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Adherence</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="agent in adherenceData" :key="agent.id" class="hover:bg-gray-50">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-medium text-indigo-600">
                      {{ getInitials(agent.name) }}
                    </div>
                    <span class="font-medium text-gray-900">{{ agent.name }}</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">
                  {{ agent.scheduledStart }} - {{ agent.scheduledEnd }}
                </td>
                <td class="px-4 py-3">
                  <span
                    class="px-2 py-1 text-xs rounded-full"
                    :class="getAgentStatusClass(agent.actualStatus)"
                  >
                    {{ agent.actualStatus }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm">
                  <span :class="agent.clockInLate ? 'text-red-600' : 'text-gray-600'">
                    {{ agent.clockIn || '-' }}
                  </span>
                  <span v-if="agent.clockInLate" class="text-xs text-red-500 ml-1">
                    (+{{ agent.lateMinutes }}m)
                  </span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <div class="w-16 bg-gray-200 rounded-full h-2">
                      <div
                        class="h-2 rounded-full"
                        :class="agent.adherencePercent >= 95 ? 'bg-green-500' : agent.adherencePercent >= 80 ? 'bg-yellow-500' : 'bg-red-500'"
                        :style="{ width: `${agent.adherencePercent}%` }"
                      ></div>
                    </div>
                    <span class="text-sm font-medium">{{ agent.adherencePercent }}%</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span
                    class="px-2 py-1 text-xs rounded-full"
                    :class="agent.adherent ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
                  >
                    {{ agent.adherent ? 'Adherent' : 'Non-Adherent' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Shift Swaps Tab -->
    <div v-show="activeTab === 'swaps'">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Request Swap / Offer Shift Panel -->
        <div class="bg-white rounded-lg shadow p-4">
          <div class="flex border-b border-gray-200 mb-4">
            <button
              @click="swapMode = 'swap'"
              :class="[
                'flex-1 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                swapMode === 'swap'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              ]"
            >
              Request Swap
            </button>
            <button
              @click="swapMode = 'offer'"
              :class="[
                'flex-1 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                swapMode === 'offer'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              ]"
            >
              Offer Shift
            </button>
          </div>

          <!-- Request Swap Form -->
          <form v-if="swapMode === 'swap'" @submit.prevent="submitSwapRequest" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Your Shift to Swap</label>
              <select v-model="swapForm.shift_id" class="w-full border-gray-300 rounded-md" required>
                <option value="">Select a shift</option>
                <option v-for="shift in myUpcomingShifts" :key="shift.id" :value="shift.id">
                  {{ formatDate(shift.date) }} - {{ formatTime(shift.start_time) }} to {{ formatTime(shift.end_time) }}
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Request Swap With</label>
              <select v-model="swapForm.target_agent_id" class="w-full border-gray-300 rounded-md">
                <option value="">Anyone (Open Request)</option>
                <option v-for="agent in agents" :key="agent.id" :value="agent.id">
                  {{ agent.name }}
                </option>
              </select>
              <p class="mt-1 text-xs text-gray-500">Leave empty to allow any available agent to accept</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
              <textarea v-model="swapForm.notes" rows="2" class="w-full border-gray-300 rounded-md" placeholder="Why do you need to swap this shift?"></textarea>
            </div>
            <button
              type="submit"
              :disabled="submittingSwap"
              class="w-full py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {{ submittingSwap ? 'Submitting...' : 'Request Swap' }}
            </button>
          </form>

          <!-- Offer Shift Form -->
          <form v-else @submit.prevent="submitShiftOffer" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Shift to Offer</label>
              <select v-model="offerForm.shift_id" class="w-full border-gray-300 rounded-md" required>
                <option value="">Select a shift</option>
                <option v-for="shift in myUpcomingShifts" :key="shift.id" :value="shift.id">
                  {{ formatDate(shift.date) }} - {{ formatTime(shift.start_time) }} to {{ formatTime(shift.end_time) }}
                </option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Offer Type</label>
              <div class="space-y-2">
                <label class="flex items-center gap-2">
                  <input type="radio" v-model="offerForm.offer_type" value="giveaway" class="text-indigo-600" />
                  <span class="text-sm">Give Away (no exchange needed)</span>
                </label>
                <label class="flex items-center gap-2">
                  <input type="radio" v-model="offerForm.offer_type" value="trade" class="text-indigo-600" />
                  <span class="text-sm">Trade (want a shift in return)</span>
                </label>
              </div>
            </div>
            <div v-if="offerForm.offer_type === 'trade'">
              <label class="block text-sm font-medium text-gray-700 mb-1">Preferred Trade Date</label>
              <input type="date" v-model="offerForm.preferred_date" class="w-full border-gray-300 rounded-md" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea v-model="offerForm.notes" rows="2" class="w-full border-gray-300 rounded-md" placeholder="Additional details about the offer"></textarea>
            </div>
            <button
              type="submit"
              :disabled="submittingOffer"
              class="w-full py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {{ submittingOffer ? 'Posting...' : 'Post Shift Offer' }}
            </button>
          </form>
        </div>

        <!-- Swap Requests & Offers List -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Pending Requests for Me -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-4 py-3 border-b flex items-center justify-between">
              <h3 class="font-semibold text-gray-900">Swap Requests for You</h3>
              <span v-if="incomingSwaps.length" class="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded-full">
                {{ incomingSwaps.length }} pending
              </span>
            </div>
            <div class="divide-y max-h-64 overflow-y-auto">
              <div
                v-for="swap in incomingSwaps"
                :key="swap.id"
                class="p-4 hover:bg-gray-50"
              >
                <div class="flex items-start justify-between">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-gray-900">{{ swap.requester_name }}</span>
                      <span class="text-sm text-gray-500">wants to swap</span>
                    </div>
                    <div class="text-sm text-gray-600 mt-1">
                      <span class="font-medium">Their shift:</span> {{ formatDate(swap.shift_date) }} {{ formatTime(swap.shift_start) }} - {{ formatTime(swap.shift_end) }}
                    </div>
                    <div v-if="swap.notes" class="text-sm text-gray-500 mt-1 italic">
                      "{{ swap.notes }}"
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <button
                      @click="acceptSwap(swap.id)"
                      class="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
                    >
                      Accept
                    </button>
                    <button
                      @click="declineSwap(swap.id)"
                      class="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="!incomingSwaps.length" class="p-4 text-center text-gray-500">
                No pending swap requests
              </div>
            </div>
          </div>

          <!-- My Swap Requests -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-4 py-3 border-b">
              <h3 class="font-semibold text-gray-900">Your Swap Requests</h3>
            </div>
            <div class="divide-y max-h-64 overflow-y-auto">
              <div
                v-for="swap in mySwapRequests"
                :key="swap.id"
                class="p-4 hover:bg-gray-50"
              >
                <div class="flex items-start justify-between">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-gray-900">{{ formatDate(swap.shift_date) }}</span>
                      <span
                        class="px-2 py-0.5 text-xs rounded-full"
                        :class="getSwapStatusClass(swap.status)"
                      >
                        {{ swap.status }}
                      </span>
                    </div>
                    <div class="text-sm text-gray-600 mt-1">
                      {{ formatTime(swap.shift_start) }} - {{ formatTime(swap.shift_end) }}
                      <span v-if="swap.target_agent_name">→ Requested with {{ swap.target_agent_name }}</span>
                      <span v-else class="text-gray-400">→ Open to anyone</span>
                    </div>
                    <div v-if="swap.accepted_by_name" class="text-sm text-green-600 mt-1">
                      Accepted by {{ swap.accepted_by_name }}
                    </div>
                  </div>
                  <button
                    v-if="swap.status === 'pending'"
                    @click="cancelSwap(swap.id)"
                    class="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <div v-if="!mySwapRequests.length" class="p-4 text-center text-gray-500">
                You haven't requested any swaps
              </div>
            </div>
          </div>

          <!-- Open Shift Offers (from others) -->
          <div class="bg-white rounded-lg shadow">
            <div class="px-4 py-3 border-b flex items-center justify-between">
              <h3 class="font-semibold text-gray-900">Available Shift Offers</h3>
              <span v-if="openOffers.length" class="text-sm text-gray-500">
                {{ openOffers.length }} available
              </span>
            </div>
            <div class="divide-y max-h-64 overflow-y-auto">
              <div
                v-for="offer in openOffers"
                :key="offer.id"
                class="p-4 hover:bg-gray-50"
              >
                <div class="flex items-start justify-between">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-gray-900">{{ offer.agent_name }}</span>
                      <span
                        class="px-2 py-0.5 text-xs rounded-full"
                        :class="offer.offer_type === 'giveaway' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'"
                      >
                        {{ offer.offer_type === 'giveaway' ? 'Giving Away' : 'Looking to Trade' }}
                      </span>
                    </div>
                    <div class="text-sm text-gray-600 mt-1">
                      {{ formatDate(offer.shift_date) }} - {{ formatTime(offer.shift_start) }} to {{ formatTime(offer.shift_end) }}
                    </div>
                    <div v-if="offer.notes" class="text-sm text-gray-500 mt-1">
                      {{ offer.notes }}
                    </div>
                  </div>
                  <button
                    @click="claimOffer(offer.id)"
                    class="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  >
                    {{ offer.offer_type === 'giveaway' ? 'Take Shift' : 'Offer Trade' }}
                  </button>
                </div>
              </div>
              <div v-if="!openOffers.length" class="p-4 text-center text-gray-500">
                No shift offers available
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Forecasting Tab -->
    <div v-show="activeTab === 'forecast'">
      <div class="bg-white rounded-lg shadow mb-6">
        <div class="flex items-center justify-between px-4 py-3 border-b">
          <h3 class="font-semibold text-gray-900">Call Volume Forecast</h3>
          <button
            @click="regenerateForecast"
            :disabled="generatingForecast"
            class="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {{ generatingForecast ? 'Generating...' : 'Regenerate Forecast' }}
          </button>
        </div>
        <div class="p-4">
          <!-- Forecast Chart Placeholder -->
          <div class="h-64 bg-gray-50 rounded flex items-center justify-center text-gray-500">
            <div class="text-center">
              <svg class="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p class="mt-2">Forecast chart will appear here</p>
              <p class="text-xs">Click "Regenerate Forecast" to generate predictions</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Staffing Requirements -->
      <div class="bg-white rounded-lg shadow">
        <div class="px-4 py-3 border-b">
          <h3 class="font-semibold text-gray-900">Staffing Requirements</h3>
        </div>
        <div class="p-4">
          <div class="grid grid-cols-7 gap-2 text-center text-sm">
            <div v-for="(day, index) in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']" :key="day" class="font-medium text-gray-500">
              {{ day }}
            </div>
            <div v-for="(req, index) in staffingRequirements" :key="index" class="p-2 bg-gray-50 rounded">
              <div class="text-lg font-bold" :class="req.met ? 'text-green-600' : 'text-red-600'">
                {{ req.current }}/{{ req.required }}
              </div>
              <div class="text-xs text-gray-400">agents</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Shift Modal -->
    <div v-if="showShiftModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" @click.self="showShiftModal = false">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div class="flex items-center justify-between px-4 py-3 border-b">
          <h3 class="font-semibold text-gray-900">{{ editingShift ? 'Edit Shift' : 'Add Shift' }}</h3>
          <button @click="showShiftModal = false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form @submit.prevent="saveShift" class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Agent</label>
            <select v-model="shiftForm.agent_id" class="w-full border-gray-300 rounded-md" required>
              <option value="">Select Agent</option>
              <option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Template (optional)</label>
            <select v-model="shiftForm.shift_template_id" @change="applyTemplate" class="w-full border-gray-300 rounded-md">
              <option value="">Custom Shift</option>
              <option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input type="date" v-model="shiftForm.date" class="w-full border-gray-300 rounded-md" required />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input type="time" v-model="shiftForm.start_time" class="w-full border-gray-300 rounded-md" required />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input type="time" v-model="shiftForm.end_time" class="w-full border-gray-300 rounded-md" required />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea v-model="shiftForm.notes" rows="2" class="w-full border-gray-300 rounded-md"></textarea>
          </div>
          <div class="flex justify-end gap-3 pt-4">
            <button type="button" @click="showShiftModal = false" class="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">
              Cancel
            </button>
            <button
              v-if="editingShift"
              type="button"
              @click="deleteShift"
              class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Delete
            </button>
            <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
              {{ editingShift ? 'Update' : 'Create' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Template Modal -->
    <div v-if="showTemplateModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" @click.self="showTemplateModal = false">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div class="flex items-center justify-between px-4 py-3 border-b">
          <h3 class="font-semibold text-gray-900">{{ editingTemplate ? 'Edit Template' : 'New Template' }}</h3>
          <button @click="showTemplateModal = false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form @submit.prevent="saveTemplate" class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" v-model="templateForm.name" class="w-full border-gray-300 rounded-md" required />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input type="time" v-model="templateForm.start_time" class="w-full border-gray-300 rounded-md" required />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">End Time</label>
              <input type="time" v-model="templateForm.end_time" class="w-full border-gray-300 rounded-md" required />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Break Duration (minutes)</label>
            <input type="number" v-model.number="templateForm.break_minutes" min="0" max="120" class="w-full border-gray-300 rounded-md" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <div class="flex gap-2">
              <button
                v-for="color in templateColors"
                :key="color"
                type="button"
                @click="templateForm.color = color"
                class="w-8 h-8 rounded-full border-2"
                :class="templateForm.color === color ? 'border-gray-900' : 'border-transparent'"
                :style="{ backgroundColor: color }"
              ></button>
            </div>
          </div>
          <div class="flex justify-end gap-3 pt-4">
            <button type="button" @click="showTemplateModal = false" class="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">
              Cancel
            </button>
            <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
              {{ editingTemplate ? 'Update' : 'Create' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiClient } from '../utils/api'

// Tabs
const tabs = ref([
  { id: 'schedule', name: 'Schedule' },
  { id: 'timeoff', name: 'Time-Off', badge: 0 },
  { id: 'swaps', name: 'Shift Swaps', badge: 0 },
  { id: 'preferences', name: 'My Preferences' },
  { id: 'adherence', name: 'Adherence' },
  { id: 'forecast', name: 'Forecasting' }
])
const activeTab = ref('schedule')

// Calendar state
const currentWeekStart = ref(getMonday(new Date()))
const viewMode = ref('week')
const filterAgent = ref('')

// Data
const agents = ref([])
const shifts = ref([])
const templates = ref([])
const timeOffRequests = ref([])
const adherenceData = ref([])
const adherenceStats = ref({
  teamAdherence: 92,
  onSchedule: 18,
  scheduled: 20,
  lateArrivals: 2,
  absences: 1
})
const staffingRequirements = ref([
  { required: 5, current: 5, met: true },
  { required: 8, current: 8, met: true },
  { required: 8, current: 7, met: false },
  { required: 8, current: 8, met: true },
  { required: 8, current: 8, met: true },
  { required: 6, current: 6, met: true },
  { required: 4, current: 4, met: true }
])

// Modals
const showShiftModal = ref(false)
const showTemplateModal = ref(false)
const editingShift = ref(null)
const editingTemplate = ref(null)

// Forms
const shiftForm = ref({
  agent_id: '',
  shift_template_id: '',
  date: '',
  start_time: '09:00',
  end_time: '17:00',
  notes: ''
})

const templateForm = ref({
  name: '',
  start_time: '09:00',
  end_time: '17:00',
  break_minutes: 60,
  color: '#4F46E5'
})

const templateColors = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4']

const timeOffForm = ref({
  request_type: 'pto',
  start_date: '',
  end_date: '',
  reason: ''
})
const timeOffFilter = ref('')
const submittingTimeOff = ref(false)
const generatingForecast = ref(false)

// Shift Swap state
const swapMode = ref('swap') // 'swap' or 'offer'
const swapForm = ref({
  shift_id: '',
  target_agent_id: '',
  notes: ''
})
const offerForm = ref({
  shift_id: '',
  offer_type: 'giveaway',
  preferred_date: '',
  notes: ''
})
const myUpcomingShifts = ref([])
const incomingSwaps = ref([])
const mySwapRequests = ref([])
const openOffers = ref([])
const submittingSwap = ref(false)
const submittingOffer = ref(false)

// Availability Preferences
const daysOfWeek = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' }
]
const availability = ref({
  0: { is_available: false, preferred_start_time: '09:00', preferred_end_time: '17:00', max_hours: 8 },
  1: { is_available: true, preferred_start_time: '09:00', preferred_end_time: '17:00', max_hours: 8 },
  2: { is_available: true, preferred_start_time: '09:00', preferred_end_time: '17:00', max_hours: 8 },
  3: { is_available: true, preferred_start_time: '09:00', preferred_end_time: '17:00', max_hours: 8 },
  4: { is_available: true, preferred_start_time: '09:00', preferred_end_time: '17:00', max_hours: 8 },
  5: { is_available: true, preferred_start_time: '09:00', preferred_end_time: '17:00', max_hours: 8 },
  6: { is_available: false, preferred_start_time: '09:00', preferred_end_time: '17:00', max_hours: 8 }
})
const savingAvailability = ref(false)

const shiftPreferences = ref({
  morning: 'acceptable',
  day: 'preferred',
  evening: 'acceptable',
  night: 'avoid',
  weekend: 'acceptable'
})
const savingShiftPreferences = ref(false)

const weeklyHours = ref({
  target: 40,
  maximum: 45,
  overtimeAvailable: true
})
const savingWeeklyHours = ref(false)

// Computed
const weekDays = computed(() => {
  const days = []
  const start = new Date(currentWeekStart.value)
  for (let i = 0; i < 7; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    days.push({
      date: date.toISOString().split('T')[0],
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: date.getDate()
    })
  }
  return days
})

const formatWeekRange = computed(() => {
  const start = new Date(currentWeekStart.value)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
})

const filteredAgents = computed(() => {
  if (!filterAgent.value) return agents.value
  return agents.value.filter(a => a.id === filterAgent.value)
})

const filteredTimeOffRequests = computed(() => {
  if (!timeOffFilter.value) return timeOffRequests.value
  return timeOffRequests.value.filter(r => r.status === timeOffFilter.value)
})

// Methods
function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

function prevWeek() {
  const d = new Date(currentWeekStart.value)
  d.setDate(d.getDate() - 7)
  currentWeekStart.value = d
  fetchSchedule()
}

function nextWeek() {
  const d = new Date(currentWeekStart.value)
  d.setDate(d.getDate() + 7)
  currentWeekStart.value = d
  fetchSchedule()
}

function goToToday() {
  currentWeekStart.value = getMonday(new Date())
  fetchSchedule()
}

function isToday(dateStr) {
  return dateStr === new Date().toISOString().split('T')[0]
}

function getShiftsForAgentDay(agentId, date) {
  return shifts.value.filter(s => s.agent_id === agentId && s.date === date)
}

function hasTimeOff(agentId, date) {
  return timeOffRequests.value.some(r =>
    r.agent_id === agentId &&
    r.status === 'approved' &&
    date >= r.start_date &&
    date <= r.end_date
  )
}

function formatTime(time) {
  if (!time) return ''
  const [hours, minutes] = time.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${minutes} ${ampm}`
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function getStatusClass(status) {
  if (status === 'approved') return 'bg-green-100 text-green-700'
  if (status === 'denied') return 'bg-red-100 text-red-700'
  return 'bg-yellow-100 text-yellow-700'
}

function getAgentStatusClass(status) {
  if (status === 'Available') return 'bg-green-100 text-green-700'
  if (status === 'On Call') return 'bg-blue-100 text-blue-700'
  if (status === 'Break') return 'bg-yellow-100 text-yellow-700'
  if (status === 'Offline') return 'bg-gray-100 text-gray-700'
  return 'bg-gray-100 text-gray-700'
}

function addShiftForDay(agentId, date) {
  shiftForm.value = {
    agent_id: agentId,
    shift_template_id: '',
    date: date,
    start_time: '09:00',
    end_time: '17:00',
    notes: ''
  }
  editingShift.value = null
  showShiftModal.value = true
}

function editShift(shift) {
  shiftForm.value = { ...shift }
  editingShift.value = shift
  showShiftModal.value = true
}

function applyTemplate() {
  const template = templates.value.find(t => t.id === shiftForm.value.shift_template_id)
  if (template) {
    shiftForm.value.start_time = template.start_time
    shiftForm.value.end_time = template.end_time
  }
}

async function saveShift() {
  try {
    if (editingShift.value) {
      // Update
      await apiClient.put(`/v1/wfm/shifts/${editingShift.value.id}`, shiftForm.value)
    } else {
      // Create
      await apiClient.post('/v1/wfm/shifts', shiftForm.value)
    }
    showShiftModal.value = false
    await fetchSchedule()
  } catch (error) {
    console.error('Failed to save shift:', error)
  }
}

async function deleteShift() {
  if (!confirm('Are you sure you want to delete this shift?')) return
  try {
    await apiClient.delete(`/v1/wfm/shifts/${editingShift.value.id}`)
    showShiftModal.value = false
    await fetchSchedule()
  } catch (error) {
    console.error('Failed to delete shift:', error)
  }
}

function editTemplate(template) {
  templateForm.value = { ...template }
  editingTemplate.value = template
  showTemplateModal.value = true
}

async function saveTemplate() {
  try {
    if (editingTemplate.value) {
      await apiClient.put(`/v1/wfm/templates/${editingTemplate.value.id}`, templateForm.value)
    } else {
      await apiClient.post('/v1/wfm/templates', templateForm.value)
    }
    showTemplateModal.value = false
    await fetchTemplates()
  } catch (error) {
    console.error('Failed to save template:', error)
  }
}

async function submitTimeOff() {
  submittingTimeOff.value = true
  try {
    await apiClient.post('/v1/wfm/time-off', timeOffForm.value)
    timeOffForm.value = { request_type: 'pto', start_date: '', end_date: '', reason: '' }
    await fetchTimeOff()
  } catch (error) {
    console.error('Failed to submit time-off:', error)
  } finally {
    submittingTimeOff.value = false
  }
}

async function reviewTimeOff(requestId, decision) {
  try {
    await apiClient.put(`/v1/wfm/time-off/${requestId}/review`, { decision })
    await fetchTimeOff()
  } catch (error) {
    console.error('Failed to review time-off:', error)
  }
}

async function generateSchedule() {
  try {
    const startDate = weekDays.value[0].date
    const endDate = weekDays.value[6].date
    await apiClient.post('/v1/wfm/schedule/generate', { start_date: startDate, end_date: endDate })
    await fetchSchedule()
  } catch (error) {
    console.error('Failed to generate schedule:', error)
  }
}

async function regenerateForecast() {
  generatingForecast.value = true
  try {
    await apiClient.post('/v1/wfm/forecast/generate', { forecast_days: 14 })
  } catch (error) {
    console.error('Failed to regenerate forecast:', error)
  } finally {
    generatingForecast.value = false
  }
}

// Fetch functions
async function fetchAgents() {
  try {
    const response = await apiClient.get('/v1/agents')
    agents.value = response.data?.agents || []
  } catch (error) {
    console.error('Failed to fetch agents:', error)
    agents.value = []
  }
}

async function fetchSchedule() {
  try {
    const startDate = weekDays.value[0].date
    const endDate = weekDays.value[6].date
    const response = await apiClient.get(`/v1/wfm/schedule?start_date=${startDate}&end_date=${endDate}`)
    shifts.value = response.data?.data || []
  } catch (error) {
    console.error('Failed to fetch schedule:', error)
    shifts.value = []
  }
}

async function fetchTemplates() {
  try {
    const response = await apiClient.get('/v1/wfm/templates')
    templates.value = response.data?.data || []
  } catch (error) {
    console.error('Failed to fetch templates:', error)
    templates.value = []
  }
}

async function fetchTimeOff() {
  try {
    const response = await apiClient.get('/v1/wfm/time-off')
    timeOffRequests.value = response.data?.data || []
    tabs.value[1].badge = timeOffRequests.value.filter(r => r.status === 'pending').length
  } catch (error) {
    console.error('Failed to fetch time-off:', error)
    timeOffRequests.value = []
    tabs.value[1].badge = 0
  }
}

async function fetchAdherence() {
  try {
    const response = await apiClient.get('/v1/wfm/adherence/team/today')
    adherenceData.value = response.data?.data || []
  } catch (error) {
    console.error('Failed to fetch adherence:', error)
    adherenceData.value = []
  }
}

// Shift Swap Methods
async function fetchMyUpcomingShifts() {
  try {
    const today = new Date().toISOString().split('T')[0]
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const response = await apiClient.get(`/v1/wfm/schedule/my?start_date=${today}&end_date=${futureDate.toISOString().split('T')[0]}`)
    myUpcomingShifts.value = response.data?.data || []
  } catch (error) {
    console.error('Failed to fetch my shifts:', error)
    myUpcomingShifts.value = []
  }
}

async function fetchSwaps() {
  try {
    const response = await apiClient.get('/v1/wfm/swaps')
    const allSwaps = response.data?.data || []

    // Separate into incoming requests (targeted at me) and my requests
    mySwapRequests.value = allSwaps.filter(s => s.is_my_request)
    incomingSwaps.value = allSwaps.filter(s => s.is_incoming && s.status === 'pending')

    // Update badge count
    tabs.value[2].badge = incomingSwaps.value.length
  } catch (error) {
    console.error('Failed to fetch swaps:', error)
    incomingSwaps.value = []
    mySwapRequests.value = []
    tabs.value[2].badge = 0
  }
}

async function fetchOpenOffers() {
  try {
    const response = await apiClient.get('/v1/wfm/offers?status=open')
    openOffers.value = response.data?.data || []
  } catch (error) {
    console.error('Failed to fetch offers:', error)
    openOffers.value = []
  }
}

async function submitSwapRequest() {
  if (!swapForm.value.shift_id) return

  submittingSwap.value = true
  try {
    await apiClient.post('/v1/wfm/swaps', {
      shift_id: swapForm.value.shift_id,
      target_agent_id: swapForm.value.target_agent_id || null,
      notes: swapForm.value.notes
    })

    swapForm.value = { shift_id: '', target_agent_id: '', notes: '' }
    await fetchSwaps()
    alert('Swap request submitted successfully!')
  } catch (error) {
    console.error('Failed to submit swap request:', error)
    alert('Failed to submit swap request. Please try again.')
  } finally {
    submittingSwap.value = false
  }
}

async function submitShiftOffer() {
  if (!offerForm.value.shift_id) return

  submittingOffer.value = true
  try {
    await apiClient.post('/v1/wfm/offers', {
      shift_id: offerForm.value.shift_id,
      offer_type: offerForm.value.offer_type,
      preferred_date: offerForm.value.preferred_date || null,
      notes: offerForm.value.notes
    })

    offerForm.value = { shift_id: '', offer_type: 'giveaway', preferred_date: '', notes: '' }
    await fetchOpenOffers()
    alert('Shift offer posted successfully!')
  } catch (error) {
    console.error('Failed to post shift offer:', error)
    alert('Failed to post shift offer. Please try again.')
  } finally {
    submittingOffer.value = false
  }
}

async function acceptSwap(swapId) {
  try {
    await apiClient.post(`/v1/wfm/swaps/${swapId}/accept`)
    await fetchSwaps()
  } catch (error) {
    console.error('Failed to accept swap:', error)
    alert('Failed to accept swap. Please try again.')
  }
}

async function declineSwap(swapId) {
  try {
    await apiClient.post(`/v1/wfm/swaps/${swapId}/decline`)
    await fetchSwaps()
  } catch (error) {
    console.error('Failed to decline swap:', error)
    alert('Failed to decline swap. Please try again.')
  }
}

async function cancelSwap(swapId) {
  if (!confirm('Are you sure you want to cancel this swap request?')) return

  try {
    await apiClient.delete(`/v1/wfm/swaps/${swapId}`)
    await fetchSwaps()
  } catch (error) {
    console.error('Failed to cancel swap:', error)
    alert('Failed to cancel swap. Please try again.')
  }
}

async function claimOffer(offerId) {
  try {
    await apiClient.post(`/v1/wfm/offers/${offerId}/claim`)
    await fetchOpenOffers()
    alert('Shift claimed! Pending supervisor approval.')
  } catch (error) {
    console.error('Failed to claim offer:', error)
    alert('Failed to claim offer. Please try again.')
  }
}

function getSwapStatusClass(status) {
  if (status === 'approved' || status === 'completed') return 'bg-green-100 text-green-700'
  if (status === 'declined' || status === 'cancelled') return 'bg-red-100 text-red-700'
  if (status === 'accepted') return 'bg-blue-100 text-blue-700'
  return 'bg-yellow-100 text-yellow-700'
}

// Availability Preference Methods
async function fetchAvailability() {
  try {
    const response = await apiClient.get('/v1/wfm/availability')
    const data = response.data?.data || []

    // Map server data to local format
    for (const item of data) {
      if (availability.value[item.day_of_week]) {
        availability.value[item.day_of_week] = {
          is_available: item.is_available !== false,
          preferred_start_time: item.preferred_start_time || '09:00',
          preferred_end_time: item.preferred_end_time || '17:00',
          max_hours: item.max_hours || 8
        }
      }
    }
  } catch (error) {
    console.error('Failed to fetch availability:', error)
  }
}

async function saveAvailability() {
  savingAvailability.value = true
  try {
    const availabilityArray = Object.entries(availability.value).map(([day, prefs]) => ({
      day_of_week: parseInt(day),
      is_available: prefs.is_available,
      preferred_start_time: prefs.is_available ? prefs.preferred_start_time : null,
      preferred_end_time: prefs.is_available ? prefs.preferred_end_time : null,
      max_hours: prefs.is_available ? prefs.max_hours : null
    }))

    await apiClient.post('/v1/wfm/availability', { availability: availabilityArray })
    alert('Availability preferences saved successfully!')
  } catch (error) {
    console.error('Failed to save availability:', error)
    alert('Failed to save availability. Please try again.')
  } finally {
    savingAvailability.value = false
  }
}

async function saveShiftPreferences() {
  savingShiftPreferences.value = true
  try {
    await apiClient.post('/v1/wfm/preferences/shifts', shiftPreferences.value)
    alert('Shift preferences saved successfully!')
  } catch (error) {
    console.error('Failed to save shift preferences:', error)
    alert('Failed to save shift preferences. Please try again.')
  } finally {
    savingShiftPreferences.value = false
  }
}

async function saveWeeklyHours() {
  savingWeeklyHours.value = true
  try {
    await apiClient.post('/v1/wfm/preferences/hours', weeklyHours.value)
    alert('Weekly hours saved successfully!')
  } catch (error) {
    console.error('Failed to save weekly hours:', error)
    alert('Failed to save weekly hours. Please try again.')
  } finally {
    savingWeeklyHours.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    fetchAgents(),
    fetchTemplates(),
    fetchSchedule(),
    fetchTimeOff(),
    fetchAdherence(),
    fetchMyUpcomingShifts(),
    fetchSwaps(),
    fetchOpenOffers(),
    fetchAvailability()
  ])
})
</script>
