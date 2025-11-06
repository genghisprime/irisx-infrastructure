<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-3xl font-bold text-gray-900 mb-6">Email Service Management</h1>

    <div class="space-y-6">
      <!-- SMTP Configuration -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">SMTP Configuration</h2>
        <form @submit.prevent="saveSmtpConfig" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
              <input v-model="smtpConfig.host" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
              <input v-model.number="smtpConfig.port" type="number" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input v-model="smtpConfig.username" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input v-model="smtpConfig.password" type="password" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
            </div>
          </div>
          <div class="flex items-center">
            <input v-model="smtpConfig.use_tls" type="checkbox" id="use_tls" class="w-4 h-4 text-blue-600">
            <label for="use_tls" class="ml-2 text-sm text-gray-700">Use TLS/SSL</label>
          </div>
          <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Configuration</button>
        </form>
      </div>

      <!-- Domain Verification -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Domain Verification</h2>
        <div class="space-y-4">
          <div v-for="domain in domains" :key="domain.domain" class="border border-gray-200 rounded-lg p-4">
            <div class="flex justify-between items-start">
              <div>
                <div class="text-lg font-medium text-gray-900">{{ domain.domain }}</div>
                <div class="text-sm text-gray-600 mt-1">Status:
                  <span :class="domain.verified ? 'text-green-600 font-medium' : 'text-yellow-600'">
                    {{ domain.verified ? 'Verified' : 'Pending Verification' }}
                  </span>
                </div>
              </div>
              <button @click="verifyDomain(domain.domain)" class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                Verify Now
              </button>
            </div>

            <!-- DNS Records -->
            <div class="mt-4 space-y-2">
              <div class="text-sm font-medium text-gray-700">Required DNS Records:</div>
              <div class="bg-gray-50 p-3 rounded text-xs font-mono space-y-2">
                <div>
                  <div class="text-gray-600">SPF Record:</div>
                  <div class="text-gray-900">{{ domain.spf_record }}</div>
                  <span :class="domain.spf_valid ? 'text-green-600' : 'text-red-600'">
                    {{ domain.spf_valid ? '✓ Valid' : '✗ Invalid' }}
                  </span>
                </div>
                <div>
                  <div class="text-gray-600">DKIM Record:</div>
                  <div class="text-gray-900">{{ domain.dkim_record }}</div>
                  <span :class="domain.dkim_valid ? 'text-green-600' : 'text-red-600'">
                    {{ domain.dkim_valid ? '✓ Valid' : '✗ Invalid' }}
                  </span>
                </div>
                <div>
                  <div class="text-gray-600">DMARC Record:</div>
                  <div class="text-gray-900">{{ domain.dmarc_record }}</div>
                  <span :class="domain.dmarc_valid ? 'text-green-600' : 'text-red-600'">
                    {{ domain.dmarc_valid ? '✓ Valid' : '✗ Invalid' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Deliverability Stats -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Deliverability Metrics (Last 30 Days)</h2>
        <div class="grid grid-cols-4 gap-4">
          <div class="text-center p-4 bg-green-50 rounded-lg">
            <div class="text-2xl font-bold text-green-600">{{ deliverability.delivered }}%</div>
            <div class="text-sm text-gray-600">Delivered</div>
          </div>
          <div class="text-center p-4 bg-yellow-50 rounded-lg">
            <div class="text-2xl font-bold text-yellow-600">{{ deliverability.bounced }}%</div>
            <div class="text-sm text-gray-600">Bounced</div>
          </div>
          <div class="text-center p-4 bg-red-50 rounded-lg">
            <div class="text-2xl font-bold text-red-600">{{ deliverability.complaints }}%</div>
            <div class="text-sm text-gray-600">Complaints</div>
          </div>
          <div class="text-center p-4 bg-blue-50 rounded-lg">
            <div class="text-2xl font-bold text-blue-600">{{ deliverability.reputation }}</div>
            <div class="text-sm text-gray-600">Reputation Score</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminAPI } from '../../../utils/api'

const smtpConfig = ref({
  host: 'smtp.sendgrid.net',
  port: 587,
  username: 'apikey',
  password: '',
  use_tls: true
})

const domains = ref([
  {
    domain: 'tazzi.com',
    verified: true,
    spf_record: 'v=spf1 include:sendgrid.net ~all',
    spf_valid: true,
    dkim_record: 'k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ...',
    dkim_valid: true,
    dmarc_record: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@tazzi.com',
    dmarc_valid: true
  }
])

const deliverability = ref({
  delivered: 98.5,
  bounced: 1.2,
  complaints: 0.3,
  reputation: 95
})

async function saveSmtpConfig() {
  try {
    await adminAPI.emailService.updateConfig(smtpConfig.value)
    alert('SMTP configuration saved successfully')
  } catch (err) {
    console.error('Failed to save config:', err)
    alert('This feature requires backend implementation')
  }
}

async function verifyDomain(domain) {
  try {
    await adminAPI.emailService.verifyDomain(domain)
    alert(`Domain ${domain} verification initiated. Please check DNS records.`)
  } catch (err) {
    alert('Domain verification failed')
  }
}

async function fetchDeliverability() {
  try {
    const response = await adminAPI.emailService.getDeliverability()
    deliverability.value = response.data
  } catch (err) {
    console.error('Failed to fetch deliverability:', err)
  }
}

onMounted(() => {
  fetchDeliverability()
})
</script>
