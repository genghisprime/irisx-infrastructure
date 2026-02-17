<template>
  <div class="ai-management">
    <div class="page-header">
      <h1>AI Engine Management</h1>
      <p class="subtitle">Configure AI providers, models, and platform credentials</p>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >
        <span class="tab-icon">{{ tab.icon }}</span>
        {{ tab.name }}
      </button>
    </div>

    <!-- Overview Tab -->
    <div v-if="activeTab === 'overview'" class="tab-content">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon providers">&#x1F916;</div>
          <div class="stat-info">
            <span class="stat-value">{{ stats.activeProviders }}</span>
            <span class="stat-label">Active Providers</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon models">&#x1F4CA;</div>
          <div class="stat-info">
            <span class="stat-value">{{ stats.totalModels }}</span>
            <span class="stat-label">Available Models</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon requests">&#x26A1;</div>
          <div class="stat-info">
            <span class="stat-value">{{ formatNumber(stats.totalRequests) }}</span>
            <span class="stat-label">Total Requests (30d)</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon cost">&#x1F4B0;</div>
          <div class="stat-info">
            <span class="stat-value">${{ stats.totalCost.toFixed(2) }}</span>
            <span class="stat-label">Total Cost (30d)</span>
          </div>
        </div>
      </div>

      <!-- Usage by Provider Chart -->
      <div class="card">
        <h3>Usage by Provider (Last 30 Days)</h3>
        <div class="chart-container">
          <div v-for="(usage, provider) in usageByProvider" :key="provider" class="usage-bar">
            <div class="bar-label">{{ provider }}</div>
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{ width: (usage.requests / maxRequests * 100) + '%' }"
              ></div>
            </div>
            <div class="bar-value">{{ formatNumber(usage.requests) }} requests</div>
          </div>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="card">
        <h3>Recent AI Activity</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Model</th>
              <th>Operation</th>
              <th>Tokens</th>
              <th>Cost</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="activity in recentActivity" :key="activity.id">
              <td>{{ activity.tenant_name || 'Unknown' }}</td>
              <td>{{ activity.model_id }}</td>
              <td>
                <span :class="['badge', getBadgeClass(activity.operation_type)]">
                  {{ activity.operation_type }}
                </span>
              </td>
              <td>{{ activity.input_tokens + activity.output_tokens }}</td>
              <td>${{ activity.total_cost?.toFixed(4) || '0.0000' }}</td>
              <td>{{ formatDate(activity.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Providers Tab -->
    <div v-if="activeTab === 'providers'" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h3>AI Providers</h3>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Description</th>
              <th>Features</th>
              <th>Models</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="provider in providers" :key="provider.id">
              <td>
                <div class="provider-info">
                  <span class="provider-icon">{{ getProviderIcon(provider.name) }}</span>
                  <div>
                    <div class="provider-name">{{ provider.display_name }}</div>
                    <div class="provider-id">{{ provider.name }}</div>
                  </div>
                </div>
              </td>
              <td>{{ provider.description }}</td>
              <td>
                <div class="features-list">
                  <span
                    v-for="feature in (provider.supported_features || []).slice(0, 3)"
                    :key="feature"
                    class="feature-tag"
                  >
                    {{ feature }}
                  </span>
                  <span v-if="(provider.supported_features || []).length > 3" class="feature-more">
                    +{{ provider.supported_features.length - 3 }}
                  </span>
                </div>
              </td>
              <td>{{ getProviderModelCount(provider.id) }}</td>
              <td>
                <span :class="['status-badge', provider.is_active ? 'active' : 'inactive']">
                  {{ provider.is_active ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td>
                <button class="btn-icon" @click="toggleProvider(provider)" title="Toggle Status">
                  {{ provider.is_active ? '&#x23F8;' : '&#x25B6;' }}
                </button>
                <button class="btn-icon" @click="viewModels(provider)" title="View Models">
                  &#x1F4CB;
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Models Tab -->
    <div v-if="activeTab === 'models'" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h3>AI Models</h3>
          <div class="header-actions">
            <select v-model="modelFilter.provider" class="filter-select">
              <option value="">All Providers</option>
              <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.display_name }}</option>
            </select>
            <select v-model="modelFilter.capability" class="filter-select">
              <option value="">All Capabilities</option>
              <option value="chat">Chat</option>
              <option value="completion">Completion</option>
              <option value="embeddings">Embeddings</option>
              <option value="function_calling">Function Calling</option>
              <option value="vision">Vision</option>
            </select>
          </div>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Model ID</th>
              <th>Provider</th>
              <th>Capabilities</th>
              <th>Context</th>
              <th>Cost (Input/Output)</th>
              <th>Quality</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="model in filteredModels" :key="model.id">
              <td>
                <div class="model-info">
                  <div class="model-name">{{ model.display_name }}</div>
                  <div class="model-id">{{ model.model_id }}</div>
                </div>
              </td>
              <td>{{ model.provider_display_name }}</td>
              <td>
                <div class="capabilities-list">
                  <span
                    v-for="cap in model.capabilities"
                    :key="cap"
                    :class="['capability-tag', cap]"
                  >
                    {{ cap }}
                  </span>
                </div>
              </td>
              <td>{{ formatNumber(model.context_window) }}</td>
              <td>
                <div class="cost-info">
                  <span>${{ model.cost_per_1k_input?.toFixed(4) || '0.0000' }}/1K</span>
                  <span>${{ model.cost_per_1k_output?.toFixed(4) || '0.0000' }}/1K</span>
                </div>
              </td>
              <td>
                <span :class="['quality-badge', model.quality_tier]">
                  {{ model.quality_tier }}
                </span>
              </td>
              <td>
                <span :class="['status-badge', model.is_active ? 'active' : 'inactive']">
                  {{ model.is_active ? 'Active' : 'Inactive' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Credentials Tab -->
    <div v-if="activeTab === 'credentials'" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h3>Platform Credentials</h3>
          <button class="btn-primary" @click="showAddCredential = true">
            + Add Credential
          </button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Name</th>
              <th>Default</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cred in credentials" :key="cred.id">
              <td>
                <div class="provider-info">
                  <span class="provider-icon">{{ getProviderIcon(cred.provider_name) }}</span>
                  {{ cred.provider_display_name }}
                </div>
              </td>
              <td>{{ cred.name }}</td>
              <td>
                <span v-if="cred.is_default" class="badge badge-primary">Default</span>
              </td>
              <td>
                <span :class="['status-badge', cred.is_active ? 'active' : 'inactive']">
                  {{ cred.is_active ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td>{{ formatDate(cred.created_at) }}</td>
              <td>
                <button class="btn-icon" @click="editCredential(cred)" title="Edit">&#x270F;</button>
                <button class="btn-icon danger" @click="deleteCredential(cred)" title="Delete">&#x1F5D1;</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Templates Tab -->
    <div v-if="activeTab === 'templates'" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h3>Prompt Templates</h3>
          <button class="btn-primary" @click="showAddTemplate = true">
            + Add Template
          </button>
        </div>
        <div class="templates-grid">
          <div v-for="template in templates" :key="template.id" class="template-card">
            <div class="template-header">
              <h4>{{ template.display_name }}</h4>
              <span :class="['use-case-badge', template.use_case]">{{ template.use_case }}</span>
            </div>
            <p class="template-description">{{ template.system_prompt.substring(0, 150) }}...</p>
            <div class="template-meta">
              <span v-if="template.tenant_id === null" class="badge badge-system">System</span>
              <span v-else class="badge badge-custom">Custom</span>
            </div>
            <div class="template-actions">
              <button class="btn-secondary" @click="viewTemplate(template)">View</button>
              <button v-if="template.tenant_id !== null" class="btn-icon" @click="editTemplate(template)">&#x270F;</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Usage Tab -->
    <div v-if="activeTab === 'usage'" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h3>Usage Analytics</h3>
          <div class="header-actions">
            <select v-model="usagePeriod" @change="loadUsageStats">
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
            </select>
          </div>
        </div>

        <div class="usage-summary">
          <div class="summary-item">
            <span class="summary-label">Total Requests</span>
            <span class="summary-value">{{ formatNumber(usageStats.totalRequests) }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Total Tokens</span>
            <span class="summary-value">{{ formatNumber(usageStats.totalTokens) }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Total Cost</span>
            <span class="summary-value">${{ usageStats.totalCost.toFixed(2) }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Avg Latency</span>
            <span class="summary-value">{{ usageStats.avgLatency.toFixed(0) }}ms</span>
          </div>
        </div>

        <table class="data-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Provider</th>
              <th>Operation</th>
              <th>Requests</th>
              <th>Input Tokens</th>
              <th>Output Tokens</th>
              <th>Cost</th>
              <th>Avg Latency</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="stat in usageStats.byModel" :key="`${stat.model_id}-${stat.operation_type}`">
              <td>{{ stat.model_id }}</td>
              <td>{{ stat.provider }}</td>
              <td>{{ stat.operation_type }}</td>
              <td>{{ formatNumber(stat.request_count) }}</td>
              <td>{{ formatNumber(stat.total_input_tokens) }}</td>
              <td>{{ formatNumber(stat.total_output_tokens) }}</td>
              <td>${{ parseFloat(stat.total_cost || 0).toFixed(2) }}</td>
              <td>{{ parseFloat(stat.avg_latency_ms || 0).toFixed(0) }}ms</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add Credential Modal -->
    <div v-if="showAddCredential" class="modal-overlay" @click.self="showAddCredential = false">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ editingCredential ? 'Edit' : 'Add' }} Platform Credential</h3>
          <button class="modal-close" @click="showAddCredential = false">&times;</button>
        </div>
        <form @submit.prevent="saveCredential">
          <div class="form-group">
            <label>Provider</label>
            <select v-model="credentialForm.providerId" required>
              <option value="">Select Provider</option>
              <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.display_name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>Credential Name</label>
            <input v-model="credentialForm.name" type="text" required placeholder="e.g., Production API Key">
          </div>

          <!-- Dynamic credential fields based on provider -->
          <template v-if="selectedProviderName === 'openai' || selectedProviderName === 'anthropic' || selectedProviderName === 'google' || selectedProviderName === 'cohere' || selectedProviderName === 'mistral' || selectedProviderName === 'groq'">
            <div class="form-group">
              <label>API Key</label>
              <input v-model="credentialForm.credentials.api_key" type="password" required>
            </div>
          </template>

          <template v-if="selectedProviderName === 'aws_bedrock'">
            <div class="form-group">
              <label>Access Key ID</label>
              <input v-model="credentialForm.credentials.access_key_id" type="text" required>
            </div>
            <div class="form-group">
              <label>Secret Access Key</label>
              <input v-model="credentialForm.credentials.secret_access_key" type="password" required>
            </div>
            <div class="form-group">
              <label>Region</label>
              <input v-model="credentialForm.credentials.region" type="text" placeholder="us-east-1">
            </div>
          </template>

          <template v-if="selectedProviderName === 'azure_openai'">
            <div class="form-group">
              <label>API Key</label>
              <input v-model="credentialForm.credentials.api_key" type="password" required>
            </div>
            <div class="form-group">
              <label>Endpoint</label>
              <input v-model="credentialForm.credentials.endpoint" type="url" required placeholder="https://your-resource.openai.azure.com">
            </div>
            <div class="form-group">
              <label>Deployment Name</label>
              <input v-model="credentialForm.credentials.deployment_name" type="text" required>
            </div>
            <div class="form-group">
              <label>API Version</label>
              <input v-model="credentialForm.credentials.api_version" type="text" placeholder="2024-02-01">
            </div>
          </template>

          <div class="form-group checkbox">
            <label>
              <input type="checkbox" v-model="credentialForm.isDefault">
              Set as default credential for this provider
            </label>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="showAddCredential = false">Cancel</button>
            <button type="submit" class="btn-primary">{{ editingCredential ? 'Update' : 'Add' }} Credential</button>
          </div>
        </form>
      </div>
    </div>

    <!-- View Template Modal -->
    <div v-if="viewingTemplate" class="modal-overlay" @click.self="viewingTemplate = null">
      <div class="modal modal-large">
        <div class="modal-header">
          <h3>{{ viewingTemplate.display_name }}</h3>
          <button class="modal-close" @click="viewingTemplate = null">&times;</button>
        </div>
        <div class="template-view">
          <div class="template-section">
            <label>Use Case</label>
            <span :class="['use-case-badge', viewingTemplate.use_case]">{{ viewingTemplate.use_case }}</span>
          </div>
          <div class="template-section">
            <label>System Prompt</label>
            <pre class="prompt-content">{{ viewingTemplate.system_prompt }}</pre>
          </div>
          <div v-if="viewingTemplate.user_prompt_template" class="template-section">
            <label>User Prompt Template</label>
            <pre class="prompt-content">{{ viewingTemplate.user_prompt_template }}</pre>
          </div>
          <div v-if="viewingTemplate.variables && Object.keys(viewingTemplate.variables).length > 0" class="template-section">
            <label>Variables</label>
            <div class="variables-list">
              <span v-for="(desc, name) in viewingTemplate.variables" :key="name" class="variable-tag">
                {{ name }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const activeTab = ref('overview');
const tabs = [
  { id: 'overview', name: 'Overview', icon: '&#x1F4CA;' },
  { id: 'providers', name: 'Providers', icon: '&#x1F916;' },
  { id: 'models', name: 'Models', icon: '&#x1F9E0;' },
  { id: 'credentials', name: 'Credentials', icon: '&#x1F511;' },
  { id: 'templates', name: 'Templates', icon: '&#x1F4DD;' },
  { id: 'usage', name: 'Usage', icon: '&#x1F4C8;' }
];

// Data
const stats = ref({
  activeProviders: 0,
  totalModels: 0,
  totalRequests: 0,
  totalCost: 0
});
const providers = ref([]);
const models = ref([]);
const credentials = ref([]);
const templates = ref([]);
const recentActivity = ref([]);
const usageByProvider = ref({});
const maxRequests = ref(1);

// Filters
const modelFilter = ref({ provider: '', capability: '' });
const usagePeriod = ref(30);
const usageStats = ref({
  totalRequests: 0,
  totalTokens: 0,
  totalCost: 0,
  avgLatency: 0,
  byModel: []
});

// Modals
const showAddCredential = ref(false);
const editingCredential = ref(null);
const credentialForm = ref({
  providerId: '',
  name: '',
  credentials: {},
  isDefault: false
});
const viewingTemplate = ref(null);
const showAddTemplate = ref(false);

const selectedProviderName = computed(() => {
  const provider = providers.value.find(p => p.id === credentialForm.value.providerId);
  return provider?.name || '';
});

const filteredModels = computed(() => {
  return models.value.filter(m => {
    if (modelFilter.value.provider && m.provider_id !== modelFilter.value.provider) return false;
    if (modelFilter.value.capability && !m.capabilities?.includes(modelFilter.value.capability)) return false;
    return true;
  });
});

// API calls
async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('adminToken');
  return fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
}

async function loadOverview() {
  try {
    // Load providers
    const providersRes = await fetchWithAuth('/v1/ai/providers');
    const providersData = await providersRes.json();
    if (providersData.success) {
      providers.value = providersData.data;
      stats.value.activeProviders = providersData.data.filter(p => p.is_active).length;
    }

    // Load models
    const modelsRes = await fetchWithAuth('/v1/ai/models');
    const modelsData = await modelsRes.json();
    if (modelsData.success) {
      models.value = modelsData.data;
      stats.value.totalModels = modelsData.data.length;
    }

    // Load usage stats
    await loadUsageStats();
  } catch (error) {
    console.error('Failed to load overview:', error);
  }
}

async function loadUsageStats() {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - usagePeriod.value);

    const res = await fetchWithAuth(`/v1/ai/usage?start_date=${startDate.toISOString()}&end_date=${new Date().toISOString()}`);
    const data = await res.json();

    if (data.success) {
      usageStats.value.byModel = data.data;

      // Calculate totals
      let totalReqs = 0, totalToks = 0, totalCost = 0, totalLatency = 0;
      const byProvider = {};

      data.data.forEach(stat => {
        totalReqs += parseInt(stat.request_count || 0);
        totalToks += parseInt(stat.total_input_tokens || 0) + parseInt(stat.total_output_tokens || 0);
        totalCost += parseFloat(stat.total_cost || 0);
        totalLatency += parseFloat(stat.avg_latency_ms || 0);

        if (!byProvider[stat.provider]) {
          byProvider[stat.provider] = { requests: 0, cost: 0 };
        }
        byProvider[stat.provider].requests += parseInt(stat.request_count || 0);
        byProvider[stat.provider].cost += parseFloat(stat.total_cost || 0);
      });

      usageStats.value.totalRequests = totalReqs;
      usageStats.value.totalTokens = totalToks;
      usageStats.value.totalCost = totalCost;
      usageStats.value.avgLatency = data.data.length > 0 ? totalLatency / data.data.length : 0;

      stats.value.totalRequests = totalReqs;
      stats.value.totalCost = totalCost;

      usageByProvider.value = byProvider;
      maxRequests.value = Math.max(...Object.values(byProvider).map(p => p.requests), 1);
    }
  } catch (error) {
    console.error('Failed to load usage stats:', error);
  }
}

async function loadCredentials() {
  try {
    const res = await fetchWithAuth('/admin/ai/credentials');
    const data = await res.json();
    if (data.success) {
      credentials.value = data.data;
    }
  } catch (error) {
    console.error('Failed to load credentials:', error);
  }
}

async function loadTemplates() {
  try {
    const res = await fetchWithAuth('/v1/ai/templates');
    const data = await res.json();
    if (data.success) {
      templates.value = data.data;
    }
  } catch (error) {
    console.error('Failed to load templates:', error);
  }
}

async function toggleProvider(provider) {
  try {
    await fetchWithAuth(`/admin/ai/providers/${provider.id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: !provider.is_active })
    });
    provider.is_active = !provider.is_active;
  } catch (error) {
    console.error('Failed to toggle provider:', error);
  }
}

async function saveCredential() {
  try {
    const method = editingCredential.value ? 'PUT' : 'POST';
    const url = editingCredential.value
      ? `/admin/ai/credentials/${editingCredential.value.id}`
      : '/admin/ai/credentials';

    await fetchWithAuth(url, {
      method,
      body: JSON.stringify({
        providerId: credentialForm.value.providerId,
        name: credentialForm.value.name,
        credentials: credentialForm.value.credentials,
        isDefault: credentialForm.value.isDefault
      })
    });

    showAddCredential.value = false;
    editingCredential.value = null;
    credentialForm.value = { providerId: '', name: '', credentials: {}, isDefault: false };
    await loadCredentials();
  } catch (error) {
    console.error('Failed to save credential:', error);
  }
}

async function deleteCredential(cred) {
  if (!confirm(`Delete credential "${cred.name}"?`)) return;

  try {
    await fetchWithAuth(`/admin/ai/credentials/${cred.id}`, { method: 'DELETE' });
    await loadCredentials();
  } catch (error) {
    console.error('Failed to delete credential:', error);
  }
}

function editCredential(cred) {
  editingCredential.value = cred;
  credentialForm.value = {
    providerId: cred.provider_id,
    name: cred.name,
    credentials: {},
    isDefault: cred.is_default
  };
  showAddCredential.value = true;
}

function viewTemplate(template) {
  viewingTemplate.value = template;
}

function viewModels(provider) {
  modelFilter.value.provider = provider.id;
  activeTab.value = 'models';
}

function getProviderModelCount(providerId) {
  return models.value.filter(m => m.provider_id === providerId).length;
}

function getProviderIcon(name) {
  const icons = {
    openai: '&#x1F7E2;',
    anthropic: '&#x1F7E0;',
    google: '&#x1F534;',
    aws_bedrock: '&#x1F7E1;',
    azure_openai: '&#x1F535;',
    cohere: '&#x1F7E3;',
    mistral: '&#x26AA;',
    groq: '&#x26AB;'
  };
  return icons[name] || '&#x2B55;';
}

function getBadgeClass(operationType) {
  const classes = {
    chat_completion: 'badge-chat',
    embeddings: 'badge-embeddings',
    moderation: 'badge-moderation'
  };
  return classes[operationType] || 'badge-default';
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num?.toString() || '0';
}

function formatDate(date) {
  return new Date(date).toLocaleString();
}

// Watch for tab changes
watch(activeTab, (newTab) => {
  if (newTab === 'credentials') loadCredentials();
  if (newTab === 'templates') loadTemplates();
  if (newTab === 'usage') loadUsageStats();
});

onMounted(() => {
  loadOverview();
});
</script>

<style scoped>
.ai-management {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0;
  font-size: 28px;
  color: #1a1a2e;
}

.subtitle {
  margin: 4px 0 0;
  color: #666;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  border-bottom: 2px solid #e0e0e0;
  padding-bottom: 0;
}

.tab {
  padding: 12px 20px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
}

.tab:hover {
  color: #4361ee;
}

.tab.active {
  color: #4361ee;
  border-bottom-color: #4361ee;
}

.tab-icon {
  margin-right: 6px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.stat-icon.providers { background: #e3f2fd; }
.stat-icon.models { background: #f3e5f5; }
.stat-icon.requests { background: #fff3e0; }
.stat-icon.cost { background: #e8f5e9; }

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #1a1a2e;
}

.stat-label {
  font-size: 13px;
  color: #666;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 24px;
}

.card h3 {
  margin: 0 0 16px;
  font-size: 18px;
  color: #1a1a2e;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.card-header h3 {
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.data-table th {
  font-weight: 600;
  color: #666;
  font-size: 12px;
  text-transform: uppercase;
}

.provider-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.provider-icon {
  font-size: 20px;
}

.provider-name {
  font-weight: 500;
}

.provider-id {
  font-size: 12px;
  color: #999;
}

.features-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.feature-tag {
  padding: 2px 8px;
  background: #f0f0f0;
  border-radius: 4px;
  font-size: 11px;
}

.feature-more {
  padding: 2px 8px;
  background: #e0e0e0;
  border-radius: 4px;
  font-size: 11px;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.active {
  background: #e8f5e9;
  color: #2e7d32;
}

.status-badge.inactive {
  background: #fce4ec;
  color: #c62828;
}

.model-info {
  display: flex;
  flex-direction: column;
}

.model-name {
  font-weight: 500;
}

.model-id {
  font-size: 12px;
  color: #999;
  font-family: monospace;
}

.capabilities-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.capability-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  background: #e3f2fd;
  color: #1976d2;
}

.capability-tag.chat { background: #e8f5e9; color: #2e7d32; }
.capability-tag.embeddings { background: #f3e5f5; color: #7b1fa2; }
.capability-tag.function_calling { background: #fff3e0; color: #e65100; }
.capability-tag.vision { background: #e1f5fe; color: #0277bd; }

.cost-info {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  font-family: monospace;
}

.quality-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  text-transform: capitalize;
}

.quality-badge.economy { background: #fff3e0; color: #e65100; }
.quality-badge.balanced { background: #e3f2fd; color: #1976d2; }
.quality-badge.premium { background: #f3e5f5; color: #7b1fa2; }

.filter-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.btn-primary {
  padding: 10px 20px;
  background: #4361ee;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.btn-primary:hover {
  background: #3651d4;
}

.btn-secondary {
  padding: 8px 16px;
  background: #f0f0f0;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: #f0f0f0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-icon:hover {
  background: #e0e0e0;
}

.btn-icon.danger:hover {
  background: #ffebee;
  color: #c62828;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.template-card {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 16px;
  border: 1px solid #e0e0e0;
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.template-header h4 {
  margin: 0;
  font-size: 16px;
}

.use-case-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  background: #e0e0e0;
}

.template-description {
  font-size: 13px;
  color: #666;
  margin: 0 0 12px;
  line-height: 1.5;
}

.template-meta {
  margin-bottom: 12px;
}

.template-actions {
  display: flex;
  gap: 8px;
}

.badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
}

.badge-primary {
  background: #e3f2fd;
  color: #1976d2;
}

.badge-system {
  background: #f3e5f5;
  color: #7b1fa2;
}

.badge-custom {
  background: #e8f5e9;
  color: #2e7d32;
}

.badge-chat { background: #e8f5e9; color: #2e7d32; }
.badge-embeddings { background: #f3e5f5; color: #7b1fa2; }
.badge-moderation { background: #fff3e0; color: #e65100; }
.badge-default { background: #f0f0f0; color: #666; }

.chart-container {
  padding: 16px 0;
}

.usage-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.bar-label {
  width: 100px;
  font-size: 13px;
  font-weight: 500;
}

.bar-track {
  flex: 1;
  height: 24px;
  background: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #4361ee, #7209b7);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.bar-value {
  width: 120px;
  text-align: right;
  font-size: 13px;
  color: #666;
}

.usage-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 24px;
}

.summary-item {
  text-align: center;
}

.summary-label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.summary-value {
  font-size: 24px;
  font-weight: 600;
  color: #1a1a2e;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-large {
  max-width: 700px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
}

.modal-close {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
}

.modal form {
  padding: 24px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 14px;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.form-group.checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: normal;
}

.form-group.checkbox input {
  width: auto;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.template-view {
  padding: 24px;
}

.template-section {
  margin-bottom: 20px;
}

.template-section label {
  display: block;
  font-weight: 500;
  margin-bottom: 8px;
  color: #666;
  font-size: 12px;
  text-transform: uppercase;
}

.prompt-content {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  margin: 0;
  max-height: 300px;
  overflow-y: auto;
}

.variables-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.variable-tag {
  padding: 4px 12px;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
}
</style>
