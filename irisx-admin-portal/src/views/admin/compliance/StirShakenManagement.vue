<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">STIR/SHAKEN Compliance</h1>
        <p class="text-zinc-400 mt-1">Manage caller ID authentication certificates and call attestation</p>
      </div>
      <button
        @click="refreshData"
        class="px-4 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600 flex items-center gap-2"
      >
        <ArrowPathIcon class="h-4 w-4" :class="{ 'animate-spin': loading }" />
        Refresh
      </button>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-zinc-400 text-sm">Active Certificates</p>
            <p class="text-2xl font-bold text-white">{{ stats.certificates?.active || 0 }}</p>
          </div>
          <div class="p-3 bg-emerald-500/20 rounded-lg">
            <ShieldCheckIcon class="h-6 w-6 text-emerald-400" />
          </div>
        </div>
        <p v-if="stats.certificates?.expiring > 0" class="text-amber-400 text-xs mt-2">
          {{ stats.certificates.expiring }} expiring soon
        </p>
      </div>

      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-zinc-400 text-sm">Outbound Calls (24h)</p>
            <p class="text-2xl font-bold text-white">{{ stats.attestations?.outbound?.total || 0 }}</p>
          </div>
          <div class="p-3 bg-violet-500/20 rounded-lg">
            <PhoneArrowUpRightIcon class="h-6 w-6 text-violet-400" />
          </div>
        </div>
        <div class="flex gap-2 mt-2 text-xs">
          <span class="text-emerald-400">A: {{ stats.attestations?.outbound?.A || 0 }}</span>
          <span class="text-amber-400">B: {{ stats.attestations?.outbound?.B || 0 }}</span>
          <span class="text-red-400">C: {{ stats.attestations?.outbound?.C || 0 }}</span>
        </div>
      </div>

      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-zinc-400 text-sm">Inbound Verified (24h)</p>
            <p class="text-2xl font-bold text-white">{{ stats.attestations?.inbound?.verified || 0 }}</p>
          </div>
          <div class="p-3 bg-blue-500/20 rounded-lg">
            <PhoneArrowDownLeftIcon class="h-6 w-6 text-blue-400" />
          </div>
        </div>
        <p class="text-zinc-500 text-xs mt-2">
          {{ stats.attestations?.inbound?.failed || 0 }} failed,
          {{ stats.attestations?.inbound?.no_signature || 0 }} unsigned
        </p>
      </div>

      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-zinc-400 text-sm">Robocall DB Entries</p>
            <p class="text-2xl font-bold text-white">{{ stats.robocall?.total || 0 }}</p>
          </div>
          <div class="p-3 bg-red-500/20 rounded-lg">
            <ExclamationTriangleIcon class="h-6 w-6 text-red-400" />
          </div>
        </div>
        <p class="text-red-400 text-xs mt-2">
          {{ stats.robocall?.known_robocallers || 0 }} known robocallers
        </p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="border-b border-zinc-700">
      <nav class="flex gap-4">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === tab.id
              ? 'text-violet-400 border-violet-400'
              : 'text-zinc-400 border-transparent hover:text-white'
          ]"
        >
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- Tab Content -->
    <div class="bg-zinc-800 rounded-lg border border-zinc-700">
      <!-- Certificates Tab -->
      <div v-if="activeTab === 'certificates'" class="p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium text-white">Certificates</h3>
          <div class="flex gap-2">
            <select
              v-model="certFilter"
              class="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="expiring">Expiring</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
            </select>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="text-left text-zinc-400 text-sm border-b border-zinc-700">
                <th class="pb-3 font-medium">Tenant</th>
                <th class="pb-3 font-medium">Common Name</th>
                <th class="pb-3 font-medium">STI-CA</th>
                <th class="pb-3 font-medium">Status</th>
                <th class="pb-3 font-medium">Expires</th>
                <th class="pb-3 font-medium">Primary</th>
                <th class="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody class="text-sm">
              <tr
                v-for="cert in certificates"
                :key="cert.id"
                class="border-b border-zinc-700/50 hover:bg-zinc-700/30"
              >
                <td class="py-3">
                  <span class="text-white">{{ cert.tenantName }}</span>
                  <span class="block text-xs text-zinc-500">{{ cert.companyName }}</span>
                </td>
                <td class="py-3 text-white">{{ cert.commonName }}</td>
                <td class="py-3 text-zinc-400">{{ cert.stiCaName || '-' }}</td>
                <td class="py-3">
                  <span
                    :class="[
                      'px-2 py-1 rounded text-xs',
                      cert.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                      cert.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                      cert.status === 'expiring' ? 'bg-orange-500/20 text-orange-400' :
                      cert.status === 'expired' ? 'bg-red-500/20 text-red-400' :
                      'bg-zinc-500/20 text-zinc-400'
                    ]"
                  >
                    {{ cert.status }}
                  </span>
                </td>
                <td class="py-3 text-zinc-400">{{ formatDate(cert.notAfter) }}</td>
                <td class="py-3">
                  <CheckCircleIcon v-if="cert.isPrimary" class="h-5 w-5 text-emerald-400" />
                  <span v-else class="text-zinc-500">-</span>
                </td>
                <td class="py-3">
                  <div class="flex gap-2">
                    <button
                      @click="verifyCertificate(cert.id)"
                      class="p-1 text-zinc-400 hover:text-white"
                      title="Verify"
                    >
                      <ShieldCheckIcon class="h-4 w-4" />
                    </button>
                    <button
                      @click="updateCertStatus(cert.id, cert.status === 'active' ? 'revoked' : 'active')"
                      class="p-1 text-zinc-400 hover:text-white"
                      :title="cert.status === 'active' ? 'Revoke' : 'Activate'"
                    >
                      <NoSymbolIcon v-if="cert.status === 'active'" class="h-4 w-4" />
                      <CheckIcon v-else class="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="certificates.length === 0">
                <td colspan="7" class="py-8 text-center text-zinc-500">
                  No certificates found
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Attestations Tab -->
      <div v-if="activeTab === 'attestations'" class="p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium text-white">Recent Attestations</h3>
          <div class="flex gap-2">
            <select
              v-model="attestationFilter.direction"
              class="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm"
            >
              <option value="">All Directions</option>
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
            <select
              v-model="attestationFilter.status"
              class="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm"
            >
              <option value="">All Statuses</option>
              <option value="verified">Verified</option>
              <option value="failed">Failed</option>
              <option value="no_signature">No Signature</option>
            </select>
          </div>
        </div>

        <!-- Analytics Chart Placeholder -->
        <div class="bg-zinc-900 rounded-lg p-4 mb-4">
          <div class="grid grid-cols-3 gap-4 text-center">
            <div>
              <p class="text-zinc-400 text-sm">Level A (Full)</p>
              <p class="text-2xl font-bold text-emerald-400">
                {{ analytics.daily?.reduce((sum, d) => sum + (d.level_a || 0), 0) || 0 }}
              </p>
            </div>
            <div>
              <p class="text-zinc-400 text-sm">Level B (Partial)</p>
              <p class="text-2xl font-bold text-amber-400">
                {{ analytics.daily?.reduce((sum, d) => sum + (d.level_b || 0), 0) || 0 }}
              </p>
            </div>
            <div>
              <p class="text-zinc-400 text-sm">Level C (Gateway)</p>
              <p class="text-2xl font-bold text-red-400">
                {{ analytics.daily?.reduce((sum, d) => sum + (d.level_c || 0), 0) || 0 }}
              </p>
            </div>
          </div>
        </div>

        <!-- Verification Failures -->
        <div v-if="failures.length > 0" class="mb-4">
          <h4 class="text-sm font-medium text-red-400 mb-2">Recent Verification Failures</h4>
          <div class="space-y-2">
            <div
              v-for="failure in failures.slice(0, 5)"
              :key="failure.id"
              class="flex items-center justify-between p-3 bg-red-500/10 rounded-lg border border-red-500/20"
            >
              <div>
                <span class="text-white">{{ failure.origTn }}</span>
                <span class="text-zinc-500 mx-2">-></span>
                <span class="text-white">{{ failure.destTn }}</span>
                <span class="block text-xs text-red-400 mt-1">{{ failure.verificationError }}</span>
              </div>
              <span class="text-xs text-zinc-500">{{ formatDateTime(failure.createdAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Robocall Database Tab -->
      <div v-if="activeTab === 'robocall'" class="p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium text-white">Robocall Database</h3>
          <button
            @click="showAddRobocaller = true"
            class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 flex items-center gap-2"
          >
            <PlusIcon class="h-4 w-4" />
            Add Entry
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="text-left text-zinc-400 text-sm border-b border-zinc-700">
                <th class="pb-3 font-medium">Phone Number</th>
                <th class="pb-3 font-medium">Classification</th>
                <th class="pb-3 font-medium">Risk Score</th>
                <th class="pb-3 font-medium">Reports</th>
                <th class="pb-3 font-medium">Auto Block</th>
                <th class="pb-3 font-medium">Last Reported</th>
                <th class="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody class="text-sm">
              <tr
                v-for="entry in robocallEntries"
                :key="entry.id"
                class="border-b border-zinc-700/50 hover:bg-zinc-700/30"
              >
                <td class="py-3 text-white font-mono">{{ entry.phoneNumber }}</td>
                <td class="py-3">
                  <span
                    :class="[
                      'px-2 py-1 rounded text-xs',
                      entry.classification === 'known_robocaller' ? 'bg-red-500/20 text-red-400' :
                      entry.classification === 'suspected' ? 'bg-amber-500/20 text-amber-400' :
                      entry.classification === 'legitimate' ? 'bg-emerald-500/20 text-emerald-400' :
                      'bg-zinc-500/20 text-zinc-400'
                    ]"
                  >
                    {{ entry.classification }}
                  </span>
                </td>
                <td class="py-3">
                  <div class="flex items-center gap-2">
                    <div class="w-16 h-2 bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        :class="[
                          'h-full rounded-full',
                          entry.riskScore >= 80 ? 'bg-red-500' :
                          entry.riskScore >= 50 ? 'bg-amber-500' :
                          'bg-emerald-500'
                        ]"
                        :style="{ width: `${entry.riskScore}%` }"
                      ></div>
                    </div>
                    <span class="text-zinc-400">{{ entry.riskScore }}</span>
                  </div>
                </td>
                <td class="py-3 text-zinc-400">{{ entry.reportCount }}</td>
                <td class="py-3">
                  <button
                    @click="toggleAutoBlock(entry)"
                    :class="[
                      'px-2 py-1 rounded text-xs',
                      entry.autoBlock ? 'bg-red-500/20 text-red-400' : 'bg-zinc-700 text-zinc-400'
                    ]"
                  >
                    {{ entry.autoBlock ? 'Enabled' : 'Disabled' }}
                  </button>
                </td>
                <td class="py-3 text-zinc-400">{{ formatDate(entry.lastReportedAt) }}</td>
                <td class="py-3">
                  <button
                    @click="deleteRobocallEntry(entry.id)"
                    class="p-1 text-zinc-400 hover:text-red-400"
                    title="Delete"
                  >
                    <TrashIcon class="h-4 w-4" />
                  </button>
                </td>
              </tr>
              <tr v-if="robocallEntries.length === 0">
                <td colspan="7" class="py-8 text-center text-zinc-500">
                  No robocall entries found
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tenant Settings Tab -->
      <div v-if="activeTab === 'tenant-settings'" class="p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium text-white">Tenant Settings</h3>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="text-left text-zinc-400 text-sm border-b border-zinc-700">
                <th class="pb-3 font-medium">Tenant</th>
                <th class="pb-3 font-medium">STIR/SHAKEN</th>
                <th class="pb-3 font-medium">Signing</th>
                <th class="pb-3 font-medium">Verification</th>
                <th class="pb-3 font-medium">Default Level</th>
                <th class="pb-3 font-medium">Block Threshold</th>
                <th class="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody class="text-sm">
              <tr
                v-for="setting in tenantSettings"
                :key="setting.tenantId"
                class="border-b border-zinc-700/50 hover:bg-zinc-700/30"
              >
                <td class="py-3">
                  <span class="text-white">{{ setting.tenantName }}</span>
                  <span class="block text-xs text-zinc-500">{{ setting.companyName }}</span>
                </td>
                <td class="py-3">
                  <span :class="setting.stirShakenEnabled ? 'text-emerald-400' : 'text-zinc-500'">
                    {{ setting.stirShakenEnabled ? 'Enabled' : 'Disabled' }}
                  </span>
                </td>
                <td class="py-3">
                  <span :class="setting.signingEnabled ? 'text-emerald-400' : 'text-zinc-500'">
                    {{ setting.signingEnabled ? 'Yes' : 'No' }}
                  </span>
                </td>
                <td class="py-3">
                  <span :class="setting.verificationEnabled ? 'text-emerald-400' : 'text-zinc-500'">
                    {{ setting.verificationEnabled ? 'Yes' : 'No' }}
                  </span>
                </td>
                <td class="py-3">
                  <span
                    :class="[
                      'px-2 py-1 rounded text-xs',
                      setting.defaultAttestationLevel === 'A' ? 'bg-emerald-500/20 text-emerald-400' :
                      setting.defaultAttestationLevel === 'B' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-red-500/20 text-red-400'
                    ]"
                  >
                    Level {{ setting.defaultAttestationLevel }}
                  </span>
                </td>
                <td class="py-3 text-zinc-400">{{ setting.blockRobocallScoreThreshold }}%</td>
                <td class="py-3">
                  <button
                    @click="editTenantSettings(setting)"
                    class="p-1 text-zinc-400 hover:text-white"
                    title="Edit"
                  >
                    <PencilIcon class="h-4 w-4" />
                  </button>
                </td>
              </tr>
              <tr v-if="tenantSettings.length === 0">
                <td colspan="7" class="py-8 text-center text-zinc-500">
                  No tenant settings found
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Platform Config Tab -->
      <div v-if="activeTab === 'config'" class="p-6">
        <h3 class="text-lg font-medium text-white mb-4">Platform Configuration</h3>

        <div class="space-y-4">
          <div
            v-for="(config, key) in platformConfig"
            :key="key"
            class="p-4 bg-zinc-900 rounded-lg"
          >
            <div class="flex justify-between items-start">
              <div>
                <h4 class="text-white font-medium">{{ formatConfigKey(key) }}</h4>
                <p class="text-zinc-500 text-sm mt-1">{{ config.description }}</p>
              </div>
              <button
                @click="editConfig(key, config)"
                class="p-1 text-zinc-400 hover:text-white"
              >
                <PencilIcon class="h-4 w-4" />
              </button>
            </div>
            <pre class="mt-2 p-2 bg-zinc-800 rounded text-xs text-zinc-400 overflow-x-auto">{{ JSON.stringify(config.value, null, 2) }}</pre>
          </div>
        </div>
      </div>

      <!-- Reports Tab -->
      <div v-if="activeTab === 'reports'" class="p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium text-white">Compliance Reports</h3>
          <button
            @click="generateReports"
            class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 flex items-center gap-2"
          >
            <DocumentTextIcon class="h-4 w-4" />
            Generate Reports
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="text-left text-zinc-400 text-sm border-b border-zinc-700">
                <th class="pb-3 font-medium">Tenant</th>
                <th class="pb-3 font-medium">Type</th>
                <th class="pb-3 font-medium">Period</th>
                <th class="pb-3 font-medium">Outbound</th>
                <th class="pb-3 font-medium">Inbound</th>
                <th class="pb-3 font-medium">Attestation A %</th>
                <th class="pb-3 font-medium">Generated</th>
              </tr>
            </thead>
            <tbody class="text-sm">
              <tr
                v-for="report in reports"
                :key="report.id"
                class="border-b border-zinc-700/50 hover:bg-zinc-700/30"
              >
                <td class="py-3 text-white">{{ report.tenantName }}</td>
                <td class="py-3">
                  <span class="px-2 py-1 bg-zinc-700 rounded text-xs text-zinc-300">
                    {{ report.reportType }}
                  </span>
                </td>
                <td class="py-3 text-zinc-400">
                  {{ formatDate(report.periodStart) }} - {{ formatDate(report.periodEnd) }}
                </td>
                <td class="py-3 text-white">{{ report.totalOutboundCalls }}</td>
                <td class="py-3 text-white">{{ report.totalInboundCalls }}</td>
                <td class="py-3">
                  <span
                    :class="[
                      calculateAPercentage(report) >= 80 ? 'text-emerald-400' :
                      calculateAPercentage(report) >= 50 ? 'text-amber-400' : 'text-red-400'
                    ]"
                  >
                    {{ calculateAPercentage(report) }}%
                  </span>
                </td>
                <td class="py-3 text-zinc-400">{{ formatDateTime(report.generatedAt) }}</td>
              </tr>
              <tr v-if="reports.length === 0">
                <td colspan="7" class="py-8 text-center text-zinc-500">
                  No reports found
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Add Robocaller Modal -->
    <div
      v-if="showAddRobocaller"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="showAddRobocaller = false"
    >
      <div class="bg-zinc-800 rounded-lg p-6 w-full max-w-md">
        <h3 class="text-lg font-medium text-white mb-4">Add Robocaller Entry</h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-zinc-400 mb-1">Phone Number</label>
            <input
              v-model="newRobocaller.phoneNumber"
              type="text"
              placeholder="+1234567890"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            />
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Classification</label>
            <select
              v-model="newRobocaller.classification"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            >
              <option value="suspected">Suspected</option>
              <option value="known_robocaller">Known Robocaller</option>
              <option value="legitimate">Legitimate</option>
            </select>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Risk Score (0-100)</label>
            <input
              v-model.number="newRobocaller.riskScore"
              type="number"
              min="0"
              max="100"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            />
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Reported Reason</label>
            <textarea
              v-model="newRobocaller.reportedReason"
              rows="2"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            ></textarea>
          </div>

          <div class="flex items-center gap-2">
            <input
              v-model="newRobocaller.autoBlock"
              type="checkbox"
              id="autoBlock"
              class="w-4 h-4 rounded"
            />
            <label for="autoBlock" class="text-sm text-zinc-400">Auto-block calls from this number</label>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button
            @click="showAddRobocaller = false"
            class="px-4 py-2 text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            @click="addRobocaller"
            class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
          >
            Add Entry
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import {
  ShieldCheckIcon,
  ArrowPathIcon,
  PhoneArrowUpRightIcon,
  PhoneArrowDownLeftIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  NoSymbolIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  DocumentTextIcon
} from '@heroicons/vue/24/outline';
import { useAdminAuthStore } from '../../../stores/adminAuth';

const authStore = useAdminAuthStore();

const loading = ref(false);
const activeTab = ref('certificates');

const tabs = [
  { id: 'certificates', label: 'Certificates' },
  { id: 'attestations', label: 'Attestations' },
  { id: 'robocall', label: 'Robocall Database' },
  { id: 'tenant-settings', label: 'Tenant Settings' },
  { id: 'config', label: 'Platform Config' },
  { id: 'reports', label: 'Reports' }
];

// Data
const stats = ref({});
const certificates = ref([]);
const analytics = ref({});
const failures = ref([]);
const robocallEntries = ref([]);
const tenantSettings = ref([]);
const platformConfig = ref({});
const reports = ref([]);

// Filters
const certFilter = ref('');
const attestationFilter = ref({ direction: '', status: '' });

// Modals
const showAddRobocaller = ref(false);
const newRobocaller = ref({
  phoneNumber: '',
  classification: 'suspected',
  riskScore: 50,
  reportedReason: '',
  autoBlock: false
});

const API_URL = import.meta.env.VITE_API_URL || '';

// Fetch functions
async function fetchStats() {
  try {
    const response = await fetch(`${API_URL}/admin/stir-shaken/stats`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      stats.value = data.stats;
    }
  } catch (error) {
    console.error('Failed to fetch stats:', error);
  }
}

async function fetchCertificates() {
  try {
    let url = `${API_URL}/admin/stir-shaken/certificates`;
    if (certFilter.value) {
      url += `?status=${certFilter.value}`;
    }
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      certificates.value = data.certificates;
    }
  } catch (error) {
    console.error('Failed to fetch certificates:', error);
  }
}

async function fetchAnalytics() {
  try {
    const response = await fetch(`${API_URL}/admin/stir-shaken/attestations/analytics`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      analytics.value = data.analytics;
    }
  } catch (error) {
    console.error('Failed to fetch analytics:', error);
  }
}

async function fetchFailures() {
  try {
    const response = await fetch(`${API_URL}/admin/stir-shaken/attestations/failures?limit=10`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      failures.value = data.failures;
    }
  } catch (error) {
    console.error('Failed to fetch failures:', error);
  }
}

async function fetchRobocallEntries() {
  try {
    const response = await fetch(`${API_URL}/admin/stir-shaken/robocall`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      robocallEntries.value = data.entries;
    }
  } catch (error) {
    console.error('Failed to fetch robocall entries:', error);
  }
}

async function fetchTenantSettings() {
  try {
    const response = await fetch(`${API_URL}/admin/stir-shaken/tenant-settings`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      tenantSettings.value = data.settings;
    }
  } catch (error) {
    console.error('Failed to fetch tenant settings:', error);
  }
}

async function fetchPlatformConfig() {
  try {
    const response = await fetch(`${API_URL}/admin/stir-shaken/config`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      platformConfig.value = data.config;
    }
  } catch (error) {
    console.error('Failed to fetch platform config:', error);
  }
}

async function fetchReports() {
  try {
    const response = await fetch(`${API_URL}/admin/stir-shaken/reports`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      reports.value = data.reports;
    }
  } catch (error) {
    console.error('Failed to fetch reports:', error);
  }
}

// Actions
async function verifyCertificate(certId) {
  try {
    const response = await fetch(`${API_URL}/admin/stir-shaken/certificates/${certId}/verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      alert('Certificate verified successfully');
      fetchCertificates();
    }
  } catch (error) {
    console.error('Failed to verify certificate:', error);
  }
}

async function updateCertStatus(certId, status) {
  try {
    const response = await fetch(`${API_URL}/admin/stir-shaken/certificates/${certId}/status`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status })
    });
    const data = await response.json();
    if (data.success) {
      fetchCertificates();
    }
  } catch (error) {
    console.error('Failed to update certificate status:', error);
  }
}

async function addRobocaller() {
  try {
    const response = await fetch(`${API_URL}/admin/stir-shaken/robocall`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newRobocaller.value)
    });
    const data = await response.json();
    if (data.success) {
      showAddRobocaller.value = false;
      newRobocaller.value = {
        phoneNumber: '',
        classification: 'suspected',
        riskScore: 50,
        reportedReason: '',
        autoBlock: false
      };
      fetchRobocallEntries();
    }
  } catch (error) {
    console.error('Failed to add robocaller:', error);
  }
}

async function toggleAutoBlock(entry) {
  try {
    const response = await fetch(`${API_URL}/admin/stir-shaken/robocall/${entry.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ autoBlock: !entry.autoBlock })
    });
    const data = await response.json();
    if (data.success) {
      fetchRobocallEntries();
    }
  } catch (error) {
    console.error('Failed to toggle auto block:', error);
  }
}

async function deleteRobocallEntry(entryId) {
  if (!confirm('Are you sure you want to delete this entry?')) return;

  try {
    const response = await fetch(`${API_URL}/admin/stir-shaken/robocall/${entryId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      fetchRobocallEntries();
    }
  } catch (error) {
    console.error('Failed to delete robocall entry:', error);
  }
}

async function generateReports() {
  try {
    const response = await fetch(`${API_URL}/admin/stir-shaken/reports/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reportType: 'on_demand'
      })
    });
    const data = await response.json();
    if (data.success) {
      alert(`Generated ${data.reports.length} reports`);
      fetchReports();
    }
  } catch (error) {
    console.error('Failed to generate reports:', error);
  }
}

function editTenantSettings(setting) {
  alert('Tenant settings editor coming soon');
}

function editConfig(key, config) {
  alert('Config editor coming soon');
}

// Helpers
function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString();
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

function formatConfigKey(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function calculateAPercentage(report) {
  if (!report.totalOutboundCalls || report.totalOutboundCalls === 0) return 0;
  return Math.round((report.attestationACount / report.totalOutboundCalls) * 100);
}

async function refreshData() {
  loading.value = true;
  await Promise.all([
    fetchStats(),
    fetchCertificates(),
    fetchAnalytics(),
    fetchFailures(),
    fetchRobocallEntries(),
    fetchTenantSettings(),
    fetchPlatformConfig(),
    fetchReports()
  ]);
  loading.value = false;
}

// Watchers
watch(certFilter, () => {
  fetchCertificates();
});

// Init
onMounted(() => {
  refreshData();
});
</script>
