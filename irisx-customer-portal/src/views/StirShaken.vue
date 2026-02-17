<template>
  <div class="min-h-screen bg-zinc-900 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">STIR/SHAKEN Compliance</h1>
        <p class="text-zinc-400 mt-1">Manage caller ID authentication and call attestation</p>
      </div>
      <div class="flex gap-3">
        <button
          @click="refreshData"
          class="px-4 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600 flex items-center gap-2"
        >
          <svg class="w-4 h-4" :class="{ 'animate-spin': loading }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
        <button
          @click="showRequestCertModal = true"
          class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Request Certificate
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-zinc-400 text-sm">Active Certificates</p>
            <p class="text-2xl font-bold text-white">{{ certStats.active || 0 }}</p>
          </div>
          <div class="p-3 bg-emerald-500/20 rounded-lg">
            <svg class="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
        </div>
        <p v-if="certStats.expiring > 0" class="text-amber-400 text-xs mt-2">
          {{ certStats.expiring }} expiring soon
        </p>
      </div>

      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-zinc-400 text-sm">Outbound Calls (7d)</p>
            <p class="text-2xl font-bold text-white">{{ attestationStats.outbound?.total || 0 }}</p>
          </div>
          <div class="p-3 bg-violet-500/20 rounded-lg">
            <svg class="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
        </div>
        <div class="flex gap-2 mt-2 text-xs">
          <span class="text-emerald-400">A: {{ attestationStats.outbound?.A || 0 }}</span>
          <span class="text-amber-400">B: {{ attestationStats.outbound?.B || 0 }}</span>
          <span class="text-red-400">C: {{ attestationStats.outbound?.C || 0 }}</span>
        </div>
      </div>

      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-zinc-400 text-sm">Inbound Verified (7d)</p>
            <p class="text-2xl font-bold text-white">{{ attestationStats.inbound?.verified || 0 }}</p>
          </div>
          <div class="p-3 bg-blue-500/20 rounded-lg">
            <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <p class="text-zinc-500 text-xs mt-2">
          {{ attestationStats.inbound?.failed || 0 }} failed, {{ attestationStats.inbound?.noSignature || 0 }} unsigned
        </p>
      </div>

      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-zinc-400 text-sm">Authorized Numbers</p>
            <p class="text-2xl font-bold text-white">{{ authorizedNumbers.length }}</p>
          </div>
          <div class="p-3 bg-cyan-500/20 rounded-lg">
            <svg class="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
            </svg>
          </div>
        </div>
        <p class="text-zinc-500 text-xs mt-2">
          {{ authorizedNumbers.filter(n => n.verifiedOwner).length }} verified
        </p>
      </div>
    </div>

    <!-- Enable STIR/SHAKEN Banner -->
    <div v-if="!settings.stirShakenEnabled" class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <svg class="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p class="text-amber-400 font-medium">STIR/SHAKEN Not Enabled</p>
            <p class="text-zinc-400 text-sm">Enable STIR/SHAKEN to sign outbound calls and verify inbound calls.</p>
          </div>
        </div>
        <button
          @click="enableStirShaken"
          class="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
        >
          Enable Now
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="border-b border-zinc-700 mb-6">
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
          <h3 class="text-lg font-medium text-white">Your Certificates</h3>
          <button
            @click="showImportCertModal = true"
            class="px-3 py-1.5 bg-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-600 text-sm"
          >
            Import Certificate
          </button>
        </div>

        <div v-if="certificates.length === 0" class="text-center py-12">
          <svg class="w-12 h-12 text-zinc-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p class="text-zinc-400 mb-4">No certificates yet</p>
          <button
            @click="showRequestCertModal = true"
            class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
          >
            Request Your First Certificate
          </button>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="text-left text-zinc-400 text-sm border-b border-zinc-700">
                <th class="pb-3 font-medium">Common Name</th>
                <th class="pb-3 font-medium">Status</th>
                <th class="pb-3 font-medium">STI-CA</th>
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
                <td class="py-3 text-white">{{ cert.commonName }}</td>
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
                <td class="py-3 text-zinc-400">{{ cert.stiCaName || 'N/A' }}</td>
                <td class="py-3 text-zinc-400">{{ formatDate(cert.notAfter) }}</td>
                <td class="py-3">
                  <span v-if="cert.isPrimary" class="text-emerald-400">Primary</span>
                  <button
                    v-else
                    @click="setPrimaryCert(cert.id)"
                    class="text-zinc-500 hover:text-white text-xs"
                  >
                    Set Primary
                  </button>
                </td>
                <td class="py-3">
                  <div class="flex gap-2">
                    <button
                      @click="verifyCert(cert.id)"
                      class="p-1 text-zinc-400 hover:text-white"
                      title="Verify"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                    <button
                      @click="revokeCert(cert.id)"
                      class="p-1 text-zinc-400 hover:text-red-400"
                      title="Revoke"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Numbers Tab -->
      <div v-if="activeTab === 'numbers'" class="p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium text-white">Authorized Numbers</h3>
          <button
            @click="showAddNumberModal = true"
            class="px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm"
          >
            Add Number
          </button>
        </div>

        <p class="text-zinc-400 text-sm mb-4">
          Register phone numbers for Level A attestation. Verified numbers get full attestation.
        </p>

        <div v-if="authorizedNumbers.length === 0" class="text-center py-12">
          <p class="text-zinc-500">No authorized numbers registered</p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="text-left text-zinc-400 text-sm border-b border-zinc-700">
                <th class="pb-3 font-medium">Phone Number</th>
                <th class="pb-3 font-medium">Authority Type</th>
                <th class="pb-3 font-medium">Verified</th>
                <th class="pb-3 font-medium">Status</th>
                <th class="pb-3 font-medium">LOA Expiry</th>
              </tr>
            </thead>
            <tbody class="text-sm">
              <tr
                v-for="num in authorizedNumbers"
                :key="num.id"
                class="border-b border-zinc-700/50 hover:bg-zinc-700/30"
              >
                <td class="py-3 text-white font-mono">{{ num.phoneNumber }}</td>
                <td class="py-3">
                  <span class="px-2 py-1 bg-zinc-700 rounded text-xs text-zinc-300">
                    {{ num.authorityType }}
                  </span>
                </td>
                <td class="py-3">
                  <span :class="num.verifiedOwner ? 'text-emerald-400' : 'text-zinc-500'">
                    {{ num.verifiedOwner ? 'Yes' : 'No' }}
                  </span>
                </td>
                <td class="py-3">
                  <span
                    :class="[
                      'px-2 py-1 rounded text-xs',
                      num.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                      num.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-zinc-500/20 text-zinc-400'
                    ]"
                  >
                    {{ num.status }}
                  </span>
                </td>
                <td class="py-3 text-zinc-400">{{ num.loaExpiryDate ? formatDate(num.loaExpiryDate) : '-' }}</td>
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
          </div>
        </div>

        <div v-if="attestations.length === 0" class="text-center py-12">
          <p class="text-zinc-500">No attestations yet</p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="text-left text-zinc-400 text-sm border-b border-zinc-700">
                <th class="pb-3 font-medium">Direction</th>
                <th class="pb-3 font-medium">From</th>
                <th class="pb-3 font-medium">To</th>
                <th class="pb-3 font-medium">Level</th>
                <th class="pb-3 font-medium">Status</th>
                <th class="pb-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody class="text-sm">
              <tr
                v-for="att in attestations"
                :key="att.id"
                class="border-b border-zinc-700/50 hover:bg-zinc-700/30"
              >
                <td class="py-3">
                  <span :class="att.direction === 'outbound' ? 'text-violet-400' : 'text-blue-400'">
                    {{ att.direction }}
                  </span>
                </td>
                <td class="py-3 text-white font-mono">{{ att.origTn }}</td>
                <td class="py-3 text-white font-mono">{{ att.destTn }}</td>
                <td class="py-3">
                  <span
                    :class="[
                      'px-2 py-1 rounded text-xs',
                      att.attestationLevel === 'A' ? 'bg-emerald-500/20 text-emerald-400' :
                      att.attestationLevel === 'B' ? 'bg-amber-500/20 text-amber-400' :
                      att.attestationLevel === 'C' ? 'bg-red-500/20 text-red-400' :
                      'bg-zinc-500/20 text-zinc-400'
                    ]"
                  >
                    {{ att.attestationLevel || '-' }}
                  </span>
                </td>
                <td class="py-3">
                  <span
                    :class="[
                      att.verificationStatus === 'verified' ? 'text-emerald-400' :
                      att.verificationStatus === 'failed' ? 'text-red-400' :
                      'text-zinc-400'
                    ]"
                  >
                    {{ att.verificationStatus || 'signed' }}
                  </span>
                </td>
                <td class="py-3 text-zinc-400">{{ formatDateTime(att.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Reports Tab -->
      <div v-if="activeTab === 'reports'" class="p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium text-white">Compliance Reports</h3>
          <button
            @click="generateReport"
            class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 flex items-center gap-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Generate Report
          </button>
        </div>

        <div v-if="reports.length === 0" class="text-center py-12">
          <p class="text-zinc-500">No compliance reports generated yet</p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="text-left text-zinc-400 text-sm border-b border-zinc-700">
                <th class="pb-3 font-medium">Type</th>
                <th class="pb-3 font-medium">Period</th>
                <th class="pb-3 font-medium">Outbound</th>
                <th class="pb-3 font-medium">Inbound</th>
                <th class="pb-3 font-medium">Level A %</th>
                <th class="pb-3 font-medium">Generated</th>
              </tr>
            </thead>
            <tbody class="text-sm">
              <tr
                v-for="report in reports"
                :key="report.id"
                class="border-b border-zinc-700/50 hover:bg-zinc-700/30"
              >
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
                      calcAPercentage(report) >= 80 ? 'text-emerald-400' :
                      calcAPercentage(report) >= 50 ? 'text-amber-400' : 'text-red-400'
                    ]"
                  >
                    {{ calcAPercentage(report) }}%
                  </span>
                </td>
                <td class="py-3 text-zinc-400">{{ formatDateTime(report.generatedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Settings Tab -->
      <div v-if="activeTab === 'settings'" class="p-6">
        <h3 class="text-lg font-medium text-white mb-4">STIR/SHAKEN Settings</h3>

        <div class="space-y-6">
          <!-- Signing Settings -->
          <div class="bg-zinc-900 rounded-lg p-4">
            <h4 class="text-white font-medium mb-3">Outbound Signing</h4>
            <div class="space-y-3">
              <label class="flex items-center justify-between">
                <span class="text-zinc-400">Enable call signing</span>
                <input
                  type="checkbox"
                  v-model="settings.signingEnabled"
                  @change="saveSettings"
                  class="w-5 h-5 rounded"
                />
              </label>
              <div>
                <label class="text-zinc-400 text-sm block mb-1">Default attestation level</label>
                <select
                  v-model="settings.defaultAttestationLevel"
                  @change="saveSettings"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                >
                  <option value="A">Level A - Full Attestation</option>
                  <option value="B">Level B - Partial Attestation</option>
                  <option value="C">Level C - Gateway Attestation</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Verification Settings -->
          <div class="bg-zinc-900 rounded-lg p-4">
            <h4 class="text-white font-medium mb-3">Inbound Verification</h4>
            <div class="space-y-3">
              <label class="flex items-center justify-between">
                <span class="text-zinc-400">Enable call verification</span>
                <input
                  type="checkbox"
                  v-model="settings.verificationEnabled"
                  @change="saveSettings"
                  class="w-5 h-5 rounded"
                />
              </label>
              <label class="flex items-center justify-between">
                <span class="text-zinc-400">Accept unverified calls</span>
                <input
                  type="checkbox"
                  v-model="settings.acceptUnverifiedCalls"
                  @change="saveSettings"
                  class="w-5 h-5 rounded"
                />
              </label>
              <label class="flex items-center justify-between">
                <span class="text-zinc-400">Block failed verifications</span>
                <input
                  type="checkbox"
                  v-model="settings.blockFailedVerification"
                  @change="saveSettings"
                  class="w-5 h-5 rounded"
                />
              </label>
              <div>
                <label class="text-zinc-400 text-sm block mb-1">Block robocall score threshold (0-100)</label>
                <input
                  type="number"
                  v-model.number="settings.blockRobocallScoreThreshold"
                  @change="saveSettings"
                  min="0"
                  max="100"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                />
              </div>
            </div>
          </div>

          <!-- Certificate Settings -->
          <div class="bg-zinc-900 rounded-lg p-4">
            <h4 class="text-white font-medium mb-3">Certificate Management</h4>
            <div class="space-y-3">
              <label class="flex items-center justify-between">
                <span class="text-zinc-400">Auto-renew certificates</span>
                <input
                  type="checkbox"
                  v-model="settings.autoRenewCertificates"
                  @change="saveSettings"
                  class="w-5 h-5 rounded"
                />
              </label>
              <div>
                <label class="text-zinc-400 text-sm block mb-1">Notify before expiry (days)</label>
                <input
                  type="number"
                  v-model.number="settings.notifyCertExpiryDays"
                  @change="saveSettings"
                  min="1"
                  max="90"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                />
              </div>
            </div>
          </div>

          <!-- Compliance Settings -->
          <div class="bg-zinc-900 rounded-lg p-4">
            <h4 class="text-white font-medium mb-3">Compliance Reports</h4>
            <div class="space-y-3">
              <label class="flex items-center justify-between">
                <span class="text-zinc-400">Enable automatic reports</span>
                <input
                  type="checkbox"
                  v-model="settings.enableComplianceReports"
                  @change="saveSettings"
                  class="w-5 h-5 rounded"
                />
              </label>
              <div>
                <label class="text-zinc-400 text-sm block mb-1">Report frequency</label>
                <select
                  v-model="settings.reportFrequency"
                  @change="saveSettings"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Request Certificate Modal -->
    <div
      v-if="showRequestCertModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="showRequestCertModal = false"
    >
      <div class="bg-zinc-800 rounded-lg p-6 w-full max-w-md">
        <h3 class="text-lg font-medium text-white mb-4">Request STIR/SHAKEN Certificate</h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-zinc-400 mb-1">Common Name (CN)</label>
            <input
              v-model="newCert.commonName"
              type="text"
              placeholder="Your Company Name"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            />
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Organization (O)</label>
            <input
              v-model="newCert.organization"
              type="text"
              placeholder="Company Legal Name"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            />
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Country Code</label>
            <input
              v-model="newCert.country"
              type="text"
              placeholder="US"
              maxlength="2"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            />
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">STI-CA Provider</label>
            <select
              v-model="newCert.stiCaProvider"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            >
              <option value="iconectiv">iconectiv</option>
              <option value="transaction_network">Transaction Network Services</option>
              <option value="sansay">Sansay</option>
              <option value="netNumber">NetNumber</option>
            </select>
          </div>

          <div class="flex items-center gap-2">
            <input
              v-model="newCert.autoRenew"
              type="checkbox"
              id="autoRenew"
              class="w-4 h-4 rounded"
            />
            <label for="autoRenew" class="text-sm text-zinc-400">Auto-renew before expiry</label>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button
            @click="showRequestCertModal = false"
            class="px-4 py-2 text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            @click="requestCertificate"
            :disabled="!newCert.commonName || !newCert.organization"
            class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            Submit Request
          </button>
        </div>
      </div>
    </div>

    <!-- Import Certificate Modal -->
    <div
      v-if="showImportCertModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="showImportCertModal = false"
    >
      <div class="bg-zinc-800 rounded-lg p-6 w-full max-w-lg">
        <h3 class="text-lg font-medium text-white mb-4">Import Certificate</h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-zinc-400 mb-1">Public Certificate (PEM)</label>
            <textarea
              v-model="importCert.publicCertificate"
              rows="6"
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white font-mono text-xs"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Private Key (PEM) - Optional</label>
            <textarea
              v-model="importCert.privateKey"
              rows="6"
              placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white font-mono text-xs"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Certificate Chain (PEM) - Optional</label>
            <textarea
              v-model="importCert.certificateChain"
              rows="4"
              placeholder="Intermediate certificates..."
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white font-mono text-xs"
            ></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button
            @click="showImportCertModal = false"
            class="px-4 py-2 text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            @click="importCertificate"
            :disabled="!importCert.publicCertificate"
            class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            Import
          </button>
        </div>
      </div>
    </div>

    <!-- Add Number Modal -->
    <div
      v-if="showAddNumberModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="showAddNumberModal = false"
    >
      <div class="bg-zinc-800 rounded-lg p-6 w-full max-w-md">
        <h3 class="text-lg font-medium text-white mb-4">Add Authorized Number</h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-zinc-400 mb-1">Phone Number</label>
            <input
              v-model="newNumber.phoneNumber"
              type="text"
              placeholder="+1234567890"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            />
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Authority Type</label>
            <select
              v-model="newNumber.authorityType"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            >
              <option value="carrier_assigned">Carrier Assigned</option>
              <option value="ported">Ported Number</option>
              <option value="leased">Leased</option>
              <option value="loa">Letter of Authorization</option>
            </select>
          </div>

          <p class="text-zinc-500 text-xs">
            Numbers with verified ownership receive Level A attestation for outbound calls.
          </p>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button
            @click="showAddNumberModal = false"
            class="px-4 py-2 text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            @click="addNumber"
            :disabled="!newNumber.phoneNumber"
            class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            Add Number
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const API_URL = import.meta.env.VITE_API_URL || '';

const loading = ref(false);
const activeTab = ref('certificates');

const tabs = [
  { id: 'certificates', label: 'Certificates' },
  { id: 'numbers', label: 'Authorized Numbers' },
  { id: 'attestations', label: 'Attestations' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' }
];

// Data
const certificates = ref([]);
const certStats = ref({});
const attestationStats = ref({});
const authorizedNumbers = ref([]);
const attestations = ref([]);
const reports = ref([]);
const settings = ref({
  stirShakenEnabled: false,
  signingEnabled: false,
  verificationEnabled: false,
  defaultAttestationLevel: 'B',
  acceptUnverifiedCalls: true,
  blockFailedVerification: false,
  blockRobocallScoreThreshold: 80,
  autoRenewCertificates: true,
  notifyCertExpiryDays: 30,
  enableComplianceReports: false,
  reportFrequency: 'weekly'
});

// Filters
const attestationFilter = ref({ direction: '' });

// Modals
const showRequestCertModal = ref(false);
const showImportCertModal = ref(false);
const showAddNumberModal = ref(false);

const newCert = ref({
  commonName: '',
  organization: '',
  country: 'US',
  stiCaProvider: 'iconectiv',
  autoRenew: true
});

const importCert = ref({
  publicCertificate: '',
  privateKey: '',
  certificateChain: ''
});

const newNumber = ref({
  phoneNumber: '',
  authorityType: 'carrier_assigned'
});

// Fetch functions
async function fetchCertificates() {
  try {
    const response = await fetch(`${API_URL}/stir-shaken/certificates`, {
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

async function fetchCertStats() {
  try {
    const response = await fetch(`${API_URL}/stir-shaken/certificates/stats`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      certStats.value = data.stats;
    }
  } catch (error) {
    console.error('Failed to fetch cert stats:', error);
  }
}

async function fetchAttestationStats() {
  try {
    const response = await fetch(`${API_URL}/stir-shaken/stats`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      attestationStats.value = data.stats;
    }
  } catch (error) {
    console.error('Failed to fetch attestation stats:', error);
  }
}

async function fetchAuthorizedNumbers() {
  try {
    const response = await fetch(`${API_URL}/stir-shaken/numbers`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      authorizedNumbers.value = data.numbers;
    }
  } catch (error) {
    console.error('Failed to fetch numbers:', error);
  }
}

async function fetchAttestations() {
  try {
    let url = `${API_URL}/stir-shaken/attestations?limit=50`;
    if (attestationFilter.value.direction) {
      url += `&direction=${attestationFilter.value.direction}`;
    }
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      attestations.value = data.attestations;
    }
  } catch (error) {
    console.error('Failed to fetch attestations:', error);
  }
}

async function fetchReports() {
  try {
    const response = await fetch(`${API_URL}/stir-shaken/reports`, {
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

async function fetchSettings() {
  try {
    const response = await fetch(`${API_URL}/stir-shaken/settings`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      settings.value = { ...settings.value, ...data.settings };
    }
  } catch (error) {
    console.error('Failed to fetch settings:', error);
  }
}

// Actions
async function requestCertificate() {
  try {
    const response = await fetch(`${API_URL}/stir-shaken/certificates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newCert.value)
    });
    const data = await response.json();
    if (data.success) {
      showRequestCertModal.value = false;
      newCert.value = { commonName: '', organization: '', country: 'US', stiCaProvider: 'iconectiv', autoRenew: true };
      fetchCertificates();
      fetchCertStats();
      alert('Certificate request submitted. Await STI-CA approval.');
    } else {
      alert(data.error || 'Failed to request certificate');
    }
  } catch (error) {
    console.error('Failed to request certificate:', error);
    alert('Failed to request certificate');
  }
}

async function importCertificate() {
  try {
    const response = await fetch(`${API_URL}/stir-shaken/certificates/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(importCert.value)
    });
    const data = await response.json();
    if (data.success) {
      showImportCertModal.value = false;
      importCert.value = { publicCertificate: '', privateKey: '', certificateChain: '' };
      fetchCertificates();
      fetchCertStats();
      alert('Certificate imported successfully');
    } else {
      alert(data.error || 'Failed to import certificate');
    }
  } catch (error) {
    console.error('Failed to import certificate:', error);
    alert('Failed to import certificate');
  }
}

async function setPrimaryCert(certId) {
  try {
    const response = await fetch(`${API_URL}/stir-shaken/certificates/${certId}/set-primary`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      fetchCertificates();
    }
  } catch (error) {
    console.error('Failed to set primary certificate:', error);
  }
}

async function verifyCert(certId) {
  try {
    const response = await fetch(`${API_URL}/stir-shaken/certificates/${certId}/verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      alert(`Certificate verified: ${data.verification.valid ? 'Valid' : 'Invalid'}`);
      fetchCertificates();
    }
  } catch (error) {
    console.error('Failed to verify certificate:', error);
  }
}

async function revokeCert(certId) {
  if (!confirm('Are you sure you want to revoke this certificate?')) return;

  try {
    const response = await fetch(`${API_URL}/stir-shaken/certificates/${certId}/revoke`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      fetchCertificates();
      fetchCertStats();
    }
  } catch (error) {
    console.error('Failed to revoke certificate:', error);
  }
}

async function addNumber() {
  try {
    const response = await fetch(`${API_URL}/stir-shaken/numbers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newNumber.value)
    });
    const data = await response.json();
    if (data.success) {
      showAddNumberModal.value = false;
      newNumber.value = { phoneNumber: '', authorityType: 'carrier_assigned' };
      fetchAuthorizedNumbers();
    } else {
      alert(data.error || 'Failed to add number');
    }
  } catch (error) {
    console.error('Failed to add number:', error);
    alert('Failed to add number');
  }
}

async function generateReport() {
  try {
    const response = await fetch(`${API_URL}/stir-shaken/reports`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reportType: 'on_demand' })
    });
    const data = await response.json();
    if (data.success) {
      fetchReports();
      alert('Compliance report generated');
    }
  } catch (error) {
    console.error('Failed to generate report:', error);
  }
}

async function saveSettings() {
  try {
    const response = await fetch(`${API_URL}/stir-shaken/settings`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings.value)
    });
    const data = await response.json();
    if (!data.success) {
      console.error('Failed to save settings:', data.error);
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

async function enableStirShaken() {
  settings.value.stirShakenEnabled = true;
  settings.value.signingEnabled = true;
  settings.value.verificationEnabled = true;
  await saveSettings();
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

function calcAPercentage(report) {
  if (!report.totalOutboundCalls || report.totalOutboundCalls === 0) return 0;
  return Math.round((report.attestationACount / report.totalOutboundCalls) * 100);
}

async function refreshData() {
  loading.value = true;
  await Promise.all([
    fetchCertificates(),
    fetchCertStats(),
    fetchAttestationStats(),
    fetchAuthorizedNumbers(),
    fetchAttestations(),
    fetchReports(),
    fetchSettings()
  ]);
  loading.value = false;
}

// Watchers
watch(() => attestationFilter.value.direction, () => {
  fetchAttestations();
});

// Init
onMounted(() => {
  refreshData();
});
</script>
