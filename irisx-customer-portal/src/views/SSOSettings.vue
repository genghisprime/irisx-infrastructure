<template>
  <div class="min-h-screen bg-zinc-900 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">Single Sign-On (SSO)</h1>
        <p class="text-zinc-400 mt-1">Configure SAML 2.0 SSO for your organization</p>
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
      </div>
    </div>

    <!-- SSO Status Card -->
    <div class="bg-zinc-800 rounded-lg border border-zinc-700 p-6 mb-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-lg flex items-center justify-center"
               :class="config.is_active ? 'bg-emerald-500/20' : 'bg-zinc-700'">
            <svg class="w-6 h-6" :class="config.is_active ? 'text-emerald-400' : 'text-zinc-500'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h3 class="text-white font-medium">SAML 2.0 SSO</h3>
            <p class="text-sm text-zinc-400">
              {{ config.is_active ? 'SSO is enabled for your organization' : 'SSO is not configured' }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span
            :class="[
              'px-3 py-1 rounded-full text-sm',
              config.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-400'
            ]"
          >
            {{ config.is_active ? 'Active' : 'Inactive' }}
          </span>
          <button
            v-if="config.configured"
            @click="toggleSSO"
            :class="[
              'px-4 py-2 rounded-lg text-sm',
              config.is_active
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
            ]"
          >
            {{ config.is_active ? 'Disable SSO' : 'Enable SSO' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Configuration Tabs -->
    <div class="bg-zinc-800 rounded-lg border border-zinc-700">
      <div class="border-b border-zinc-700">
        <nav class="flex gap-4 px-4">
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

      <!-- Service Provider Info -->
      <div v-if="activeTab === 'sp'" class="p-6">
        <h3 class="text-lg font-medium text-white mb-4">Service Provider (SP) Information</h3>
        <p class="text-zinc-400 text-sm mb-6">Use these values when configuring your Identity Provider (IdP).</p>

        <div class="space-y-4">
          <div class="bg-zinc-900 rounded-lg p-4">
            <label class="block text-sm text-zinc-400 mb-1">SP Entity ID / Issuer</label>
            <div class="flex items-center gap-2">
              <input
                type="text"
                :value="spInfo.entityId"
                readonly
                class="flex-1 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white font-mono text-sm"
              />
              <button @click="copyToClipboard(spInfo.entityId)" class="px-3 py-2 bg-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-600">
                Copy
              </button>
            </div>
          </div>

          <div class="bg-zinc-900 rounded-lg p-4">
            <label class="block text-sm text-zinc-400 mb-1">ACS URL (Assertion Consumer Service)</label>
            <div class="flex items-center gap-2">
              <input
                type="text"
                :value="spInfo.acsUrl"
                readonly
                class="flex-1 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white font-mono text-sm"
              />
              <button @click="copyToClipboard(spInfo.acsUrl)" class="px-3 py-2 bg-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-600">
                Copy
              </button>
            </div>
          </div>

          <div class="bg-zinc-900 rounded-lg p-4">
            <label class="block text-sm text-zinc-400 mb-1">Single Logout URL (SLO)</label>
            <div class="flex items-center gap-2">
              <input
                type="text"
                :value="spInfo.sloUrl"
                readonly
                class="flex-1 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white font-mono text-sm"
              />
              <button @click="copyToClipboard(spInfo.sloUrl)" class="px-3 py-2 bg-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-600">
                Copy
              </button>
            </div>
          </div>

          <div class="bg-zinc-900 rounded-lg p-4">
            <label class="block text-sm text-zinc-400 mb-1">SP Metadata URL</label>
            <div class="flex items-center gap-2">
              <input
                type="text"
                :value="spInfo.metadataUrl"
                readonly
                class="flex-1 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white font-mono text-sm"
              />
              <button @click="copyToClipboard(spInfo.metadataUrl)" class="px-3 py-2 bg-zinc-700 text-zinc-300 rounded-lg hover:bg-zinc-600">
                Copy
              </button>
              <a :href="spInfo.metadataUrl" target="_blank" class="px-3 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700">
                Download
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- IdP Configuration -->
      <div v-if="activeTab === 'idp'" class="p-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-lg font-medium text-white">Identity Provider (IdP) Configuration</h3>
            <p class="text-zinc-400 text-sm">Enter your IdP details or import from metadata.</p>
          </div>
          <button
            @click="showImportModal = true"
            class="px-4 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600"
          >
            Import from Metadata
          </button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-zinc-400 mb-1">IdP Entity ID / Issuer</label>
            <input
              v-model="formData.idp_entity_id"
              type="text"
              placeholder="https://idp.example.com/saml"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            />
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">IdP SSO URL</label>
            <input
              v-model="formData.idp_sso_url"
              type="text"
              placeholder="https://idp.example.com/saml/sso"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            />
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">IdP Single Logout URL (optional)</label>
            <input
              v-model="formData.idp_slo_url"
              type="text"
              placeholder="https://idp.example.com/saml/slo"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            />
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">IdP X.509 Certificate (PEM format)</label>
            <textarea
              v-model="formData.idp_certificate"
              rows="6"
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white font-mono text-xs"
            ></textarea>
          </div>

          <div class="flex justify-end gap-3 pt-4">
            <button
              @click="testConfig"
              class="px-4 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600"
            >
              Test Configuration
            </button>
            <button
              @click="saveConfig"
              :disabled="!formData.idp_entity_id || !formData.idp_sso_url"
              class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>

      <!-- Attribute Mapping -->
      <div v-if="activeTab === 'mapping'" class="p-6">
        <h3 class="text-lg font-medium text-white mb-4">Attribute Mapping</h3>
        <p class="text-zinc-400 text-sm mb-6">Map SAML attributes from your IdP to user fields.</p>

        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-zinc-400 mb-1">Email Attribute</label>
              <input
                v-model="formData.attribute_email"
                type="text"
                placeholder="email or http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
                class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
              />
            </div>
            <div>
              <label class="block text-sm text-zinc-400 mb-1">Name ID Format</label>
              <select
                v-model="formData.name_id_format"
                class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
              >
                <option value="email">Email</option>
                <option value="persistent">Persistent</option>
                <option value="transient">Transient</option>
                <option value="unspecified">Unspecified</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-zinc-400 mb-1">First Name Attribute</label>
              <input
                v-model="formData.attribute_first_name"
                type="text"
                placeholder="firstName or givenName"
                class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
              />
            </div>
            <div>
              <label class="block text-sm text-zinc-400 mb-1">Last Name Attribute</label>
              <input
                v-model="formData.attribute_last_name"
                type="text"
                placeholder="lastName or surname"
                class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Role/Groups Attribute (optional)</label>
            <input
              v-model="formData.attribute_role"
              type="text"
              placeholder="role or memberOf"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            />
          </div>

          <div class="flex justify-end pt-4">
            <button
              @click="saveConfig"
              class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
            >
              Save Mappings
            </button>
          </div>
        </div>
      </div>

      <!-- Settings -->
      <div v-if="activeTab === 'settings'" class="p-6">
        <h3 class="text-lg font-medium text-white mb-4">SSO Settings</h3>

        <div class="space-y-6">
          <div class="bg-zinc-900 rounded-lg p-4">
            <div class="flex items-center justify-between">
              <div>
                <h4 class="text-white font-medium">Enforce SSO</h4>
                <p class="text-zinc-500 text-sm">Require all users to login via SSO (disables password login)</p>
              </div>
              <input
                v-model="formData.enforce_sso"
                type="checkbox"
                class="w-5 h-5 rounded"
              />
            </div>
          </div>

          <div class="bg-zinc-900 rounded-lg p-4">
            <div class="flex items-center justify-between">
              <div>
                <h4 class="text-white font-medium">Auto-Provision Users</h4>
                <p class="text-zinc-500 text-sm">Automatically create user accounts on first SSO login</p>
              </div>
              <input
                v-model="formData.auto_provision"
                type="checkbox"
                class="w-5 h-5 rounded"
              />
            </div>
          </div>

          <div class="bg-zinc-900 rounded-lg p-4">
            <div class="flex items-center justify-between">
              <div>
                <h4 class="text-white font-medium">Update User Profile on Login</h4>
                <p class="text-zinc-500 text-sm">Sync user attributes from IdP on each login</p>
              </div>
              <input
                v-model="formData.update_on_login"
                type="checkbox"
                class="w-5 h-5 rounded"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Default Role for New Users</label>
            <select
              v-model="formData.default_role"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            >
              <option value="user">User</option>
              <option value="agent">Agent</option>
              <option value="supervisor">Supervisor</option>
            </select>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Allowed Domains (comma-separated)</label>
            <input
              v-model="formData.allowed_domains"
              type="text"
              placeholder="example.com, company.org"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            />
            <p class="text-zinc-500 text-xs mt-1">Leave empty to allow all domains from your IdP</p>
          </div>

          <div class="flex justify-end pt-4">
            <button
              @click="saveConfig"
              class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>

      <!-- Audit Log -->
      <div v-if="activeTab === 'audit'" class="p-6">
        <h3 class="text-lg font-medium text-white mb-4">SSO Audit Log</h3>

        <div v-if="auditLog.length === 0" class="text-center py-12">
          <p class="text-zinc-500">No SSO events recorded yet</p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="text-left text-zinc-400 text-sm border-b border-zinc-700">
                <th class="pb-3 font-medium">Event</th>
                <th class="pb-3 font-medium">User</th>
                <th class="pb-3 font-medium">IP Address</th>
                <th class="pb-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody class="text-sm">
              <tr
                v-for="event in auditLog"
                :key="event.id"
                class="border-b border-zinc-700/50 hover:bg-zinc-700/30"
              >
                <td class="py-3">
                  <span
                    :class="[
                      'px-2 py-1 rounded text-xs',
                      event.event_type === 'login_success' ? 'bg-emerald-500/20 text-emerald-400' :
                      event.event_type === 'login_failure' ? 'bg-red-500/20 text-red-400' :
                      event.event_type === 'logout' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-zinc-700 text-zinc-400'
                    ]"
                  >
                    {{ formatEventType(event.event_type) }}
                  </span>
                </td>
                <td class="py-3 text-white">{{ event.user_email || '-' }}</td>
                <td class="py-3 text-zinc-400 font-mono text-xs">{{ event.ip_address || '-' }}</td>
                <td class="py-3 text-zinc-400">{{ formatDateTime(event.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Import Metadata Modal -->
    <div
      v-if="showImportModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="showImportModal = false"
    >
      <div class="bg-zinc-800 rounded-lg p-6 w-full max-w-lg mx-4">
        <h3 class="text-lg font-medium text-white mb-4">Import IdP Metadata</h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-zinc-400 mb-1">Metadata URL</label>
            <input
              v-model="importUrl"
              type="text"
              placeholder="https://idp.example.com/metadata.xml"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            />
          </div>

          <div class="text-center text-zinc-500">- OR -</div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Paste Metadata XML</label>
            <textarea
              v-model="importXml"
              rows="8"
              placeholder="<?xml version='1.0'?>..."
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white font-mono text-xs"
            ></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button
            @click="showImportModal = false"
            class="px-4 py-2 text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            @click="importMetadata"
            :disabled="!importUrl && !importXml"
            class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const API_URL = import.meta.env.VITE_API_URL || '';
const BASE_URL = import.meta.env.VITE_APP_URL || window.location.origin;

const loading = ref(false);
const activeTab = ref('sp');
const config = ref({ configured: false, is_active: false });
const auditLog = ref([]);
const showImportModal = ref(false);
const importUrl = ref('');
const importXml = ref('');

const tabs = [
  { id: 'sp', label: 'SP Info' },
  { id: 'idp', label: 'IdP Configuration' },
  { id: 'mapping', label: 'Attribute Mapping' },
  { id: 'settings', label: 'Settings' },
  { id: 'audit', label: 'Audit Log' }
];

const tenantId = computed(() => authStore.user?.tenantId);

const spInfo = computed(() => ({
  entityId: `${BASE_URL}/auth/saml/metadata/${tenantId.value}`,
  acsUrl: `${API_URL}/auth/saml/callback`,
  sloUrl: `${API_URL}/auth/saml/logout`,
  metadataUrl: `${API_URL}/auth/saml/metadata/${tenantId.value}`
}));

const formData = ref({
  idp_entity_id: '',
  idp_sso_url: '',
  idp_slo_url: '',
  idp_certificate: '',
  name_id_format: 'email',
  attribute_email: 'email',
  attribute_first_name: 'firstName',
  attribute_last_name: 'lastName',
  attribute_role: '',
  enforce_sso: false,
  auto_provision: true,
  update_on_login: true,
  default_role: 'user',
  allowed_domains: ''
});

async function fetchConfig() {
  try {
    const response = await fetch(`${API_URL}/auth/saml/config/${tenantId.value}`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    config.value = data;
    if (data.configured && data.config) {
      Object.assign(formData.value, {
        idp_entity_id: data.config.idp_entity_id || '',
        idp_sso_url: data.config.idp_sso_url || '',
        idp_slo_url: data.config.idp_slo_url || '',
        idp_certificate: data.config.idp_certificate === '[CONFIGURED]' ? '' : (data.config.idp_certificate || ''),
        name_id_format: data.config.name_id_format || 'email',
        attribute_email: data.config.attribute_email || 'email',
        attribute_first_name: data.config.attribute_first_name || 'firstName',
        attribute_last_name: data.config.attribute_last_name || 'lastName',
        attribute_role: data.config.attribute_role || '',
        enforce_sso: data.config.enforce_sso || false,
        auto_provision: data.config.auto_provision !== false,
        update_on_login: data.config.update_on_login !== false,
        default_role: data.config.default_role || 'user',
        allowed_domains: data.config.allowed_domains || ''
      });
    }
  } catch (error) {
    console.error('Failed to fetch SAML config:', error);
  }
}

async function fetchAuditLog() {
  try {
    const response = await fetch(`${API_URL}/auth/saml/audit/${tenantId.value}?limit=50`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    auditLog.value = data.events || [];
  } catch (error) {
    console.error('Failed to fetch audit log:', error);
  }
}

async function saveConfig() {
  try {
    const response = await fetch(`${API_URL}/auth/saml/config/${tenantId.value}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData.value)
    });

    const data = await response.json();
    if (data.success) {
      alert('Configuration saved successfully');
      fetchConfig();
    } else {
      alert(data.error || 'Failed to save configuration');
    }
  } catch (error) {
    console.error('Failed to save config:', error);
    alert('Failed to save configuration');
  }
}

async function toggleSSO() {
  try {
    const response = await fetch(`${API_URL}/auth/saml/config/${tenantId.value}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ is_active: !config.value.config?.is_active })
    });

    const data = await response.json();
    if (data.success) {
      fetchConfig();
    }
  } catch (error) {
    console.error('Failed to toggle SSO:', error);
  }
}

async function testConfig() {
  try {
    const response = await fetch(`${API_URL}/auth/saml/config/${tenantId.value}/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData.value)
    });

    const data = await response.json();
    if (data.success) {
      alert('Configuration test passed!');
    } else {
      alert(`Configuration test failed: ${data.error}`);
    }
  } catch (error) {
    console.error('Failed to test config:', error);
    alert('Failed to test configuration');
  }
}

async function importMetadata() {
  try {
    const response = await fetch(`${API_URL}/auth/saml/config/${tenantId.value}/import-metadata`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        metadata_url: importUrl.value || undefined,
        metadata_xml: importXml.value || undefined
      })
    });

    const data = await response.json();
    if (data.success && data.parsed) {
      formData.value.idp_entity_id = data.parsed.entityId || '';
      formData.value.idp_sso_url = data.parsed.ssoUrl || '';
      formData.value.idp_slo_url = data.parsed.sloUrl || '';
      formData.value.idp_certificate = data.parsed.certificate || '';
      showImportModal.value = false;
      importUrl.value = '';
      importXml.value = '';
      alert('Metadata imported successfully! Review the values and save.');
    } else {
      alert(data.error || 'Failed to import metadata');
    }
  } catch (error) {
    console.error('Failed to import metadata:', error);
    alert('Failed to import metadata');
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  alert('Copied to clipboard!');
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

function formatEventType(type) {
  const mapping = {
    'login_initiated': 'Login Started',
    'login_success': 'Login Success',
    'login_failure': 'Login Failed',
    'logout': 'Logout',
    'config_change': 'Config Changed'
  };
  return mapping[type] || type;
}

async function refreshData() {
  loading.value = true;
  await Promise.all([fetchConfig(), fetchAuditLog()]);
  loading.value = false;
}

onMounted(() => {
  if (tenantId.value) {
    refreshData();
  }
});
</script>
