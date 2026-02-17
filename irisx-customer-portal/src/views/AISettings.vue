<template>
  <div class="ai-settings">
    <div class="page-header">
      <h1>AI Settings</h1>
      <p class="subtitle">Configure AI features for your contact center</p>
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

    <!-- General Settings Tab -->
    <div v-if="activeTab === 'general'" class="tab-content">
      <div class="card">
        <h3>AI Features</h3>
        <p class="card-description">Enable or disable AI-powered features for your organization.</p>

        <div class="toggle-group">
          <div class="toggle-item">
            <div class="toggle-info">
              <h4>AI Engine</h4>
              <p>Enable AI capabilities across all channels</p>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="settings.isEnabled" @change="saveSettings">
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="toggle-item">
            <div class="toggle-info">
              <h4>Agent Assist</h4>
              <p>Real-time AI suggestions for agents during conversations</p>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="enabledFeatures.agent_assist" @change="updateFeatures">
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="toggle-item">
            <div class="toggle-info">
              <h4>Auto-Summarization</h4>
              <p>Automatically summarize conversations after completion</p>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="enabledFeatures.auto_summarize" @change="updateFeatures">
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="toggle-item">
            <div class="toggle-info">
              <h4>Sentiment Analysis</h4>
              <p>Analyze customer sentiment in real-time</p>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="enabledFeatures.sentiment_analysis" @change="updateFeatures">
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="toggle-item">
            <div class="toggle-info">
              <h4>Content Moderation</h4>
              <p>Automatically moderate messages for policy violations</p>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="settings.contentModerationEnabled" @change="saveSettings">
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="toggle-item">
            <div class="toggle-info">
              <h4>AI Chatbot</h4>
              <p>Enable AI-powered chatbot for automated responses</p>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="enabledFeatures.chatbot" @change="updateFeatures">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Quality & Cost Settings</h3>

        <div class="form-group">
          <label>Default Quality Tier</label>
          <select v-model="settings.defaultQualityTier" @change="saveSettings">
            <option value="economy">Economy - Lower cost, faster responses</option>
            <option value="balanced">Balanced - Best value (Recommended)</option>
            <option value="premium">Premium - Highest quality</option>
          </select>
          <p class="help-text">Higher quality tiers use more advanced AI models</p>
        </div>

        <div class="form-group">
          <label>Maximum Cost per Request ($)</label>
          <input
            type="number"
            v-model.number="settings.maxCostPerRequest"
            step="0.01"
            min="0"
            @change="saveSettings"
          >
          <p class="help-text">Prevents requests that would exceed this cost</p>
        </div>

        <div class="form-group">
          <label>Monthly Budget ($)</label>
          <input
            type="number"
            v-model.number="settings.monthlyBudget"
            step="1"
            min="0"
            @change="saveSettings"
          >
          <p class="help-text">Alert when approaching this monthly spend limit</p>
        </div>
      </div>
    </div>

    <!-- Credentials Tab -->
    <div v-if="activeTab === 'credentials'" class="tab-content">
      <div class="card">
        <div class="card-header">
          <div>
            <h3>Your API Credentials</h3>
            <p class="card-description">Use your own API keys for AI providers (BYOK - Bring Your Own Keys)</p>
          </div>
          <button class="btn-primary" @click="showAddCredential = true">
            + Add Credential
          </button>
        </div>

        <div v-if="credentials.length === 0" class="empty-state">
          <div class="empty-icon">&#x1F511;</div>
          <h4>No Custom Credentials</h4>
          <p>Your organization is using platform-provided AI services. Add your own API keys to use your accounts directly.</p>
        </div>

        <table v-else class="data-table">
          <thead>
            <tr>
              <th>Provider</th>
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
                  {{ cred.display_name }}
                </div>
              </td>
              <td>
                <span :class="['status-badge', cred.is_active ? 'active' : 'inactive']">
                  {{ cred.is_active ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td>{{ formatDate(cred.created_at) }}</td>
              <td>
                <button class="btn-icon" @click="testCredential(cred)" title="Test">&#x1F50D;</button>
                <button class="btn-icon danger" @click="deleteCredential(cred)" title="Delete">&#x1F5D1;</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Models Tab -->
    <div v-if="activeTab === 'models'" class="tab-content">
      <div class="card">
        <h3>Available Models</h3>
        <p class="card-description">AI models available for your organization based on your settings and credentials.</p>

        <div class="model-grid">
          <div v-for="model in availableModels" :key="model.id" class="model-card">
            <div class="model-header">
              <div class="model-name">{{ model.display_name }}</div>
              <span :class="['quality-badge', model.quality_tier]">{{ model.quality_tier }}</span>
            </div>
            <div class="model-provider">{{ model.provider_display_name }}</div>
            <div class="model-capabilities">
              <span v-for="cap in model.capabilities" :key="cap" class="capability-tag">
                {{ cap }}
              </span>
            </div>
            <div class="model-meta">
              <span>Context: {{ formatNumber(model.context_window) }}</span>
              <span>${{ model.cost_per_1k_input?.toFixed(4) }}/1K tokens</span>
            </div>
            <label class="model-toggle">
              <input
                type="checkbox"
                :checked="isModelAllowed(model.model_id)"
                @change="toggleModel(model.model_id)"
              >
              <span>Enabled</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- Templates Tab -->
    <div v-if="activeTab === 'templates'" class="tab-content">
      <div class="card">
        <div class="card-header">
          <div>
            <h3>Custom Prompt Templates</h3>
            <p class="card-description">Customize AI prompts for your organization's needs</p>
          </div>
          <button class="btn-primary" @click="showAddTemplate = true">
            + Create Template
          </button>
        </div>

        <div class="templates-grid">
          <div v-for="template in templates" :key="template.id" class="template-card">
            <div class="template-header">
              <h4>{{ template.display_name }}</h4>
              <span :class="['use-case-badge', template.use_case]">{{ template.use_case }}</span>
            </div>
            <p class="template-description">{{ template.system_prompt.substring(0, 100) }}...</p>
            <div class="template-meta">
              <span v-if="template.tenant_id === null" class="badge badge-system">System Default</span>
              <span v-else class="badge badge-custom">Custom</span>
            </div>
            <div class="template-actions">
              <button class="btn-secondary" @click="viewTemplate(template)">View</button>
              <button v-if="template.tenant_id !== null" class="btn-icon" @click="editTemplate(template)">&#x270F;</button>
              <button v-if="template.tenant_id !== null" class="btn-icon danger" @click="deleteTemplate(template)">&#x1F5D1;</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Chatbots Tab -->
    <div v-if="activeTab === 'chatbots'" class="tab-content">
      <div class="card">
        <div class="card-header">
          <div>
            <h3>AI Chatbots</h3>
            <p class="card-description">Configure AI-powered chatbots for automated customer service</p>
          </div>
          <button class="btn-primary" @click="showAddChatbot = true">
            + Create Chatbot
          </button>
        </div>

        <div v-if="chatbots.length === 0" class="empty-state">
          <div class="empty-icon">&#x1F916;</div>
          <h4>No Chatbots Yet</h4>
          <p>Create your first AI chatbot to automate customer interactions.</p>
          <button class="btn-primary" @click="showAddChatbot = true">Create Chatbot</button>
        </div>

        <div v-else class="chatbot-grid">
          <div v-for="chatbot in chatbots" :key="chatbot.id" class="chatbot-card">
            <div class="chatbot-header">
              <h4>{{ chatbot.name }}</h4>
              <span :class="['status-badge', chatbot.is_active ? 'active' : 'inactive']">
                {{ chatbot.is_active ? 'Active' : 'Draft' }}
              </span>
            </div>
            <p class="chatbot-description">{{ chatbot.description || 'No description' }}</p>
            <div class="chatbot-channels">
              <span v-for="channel in chatbot.channels" :key="channel" class="channel-tag">
                {{ channel }}
              </span>
            </div>
            <div class="chatbot-stats">
              <div class="stat">
                <span class="stat-value">{{ chatbot.conversation_count || 0 }}</span>
                <span class="stat-label">Conversations</span>
              </div>
              <div class="stat">
                <span class="stat-value">{{ chatbot.message_count || 0 }}</span>
                <span class="stat-label">Messages</span>
              </div>
            </div>
            <div class="chatbot-actions">
              <button class="btn-secondary" @click="editChatbot(chatbot)">Configure</button>
              <button class="btn-icon" @click="toggleChatbot(chatbot)">
                {{ chatbot.is_active ? '&#x23F8;' : '&#x25B6;' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Usage Tab -->
    <div v-if="activeTab === 'usage'" class="tab-content">
      <div class="card">
        <div class="card-header">
          <h3>AI Usage & Costs</h3>
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
            <span class="summary-label">Budget Used</span>
            <span class="summary-value">{{ budgetPercentage }}%</span>
            <div class="budget-bar">
              <div
                class="budget-fill"
                :style="{ width: Math.min(budgetPercentage, 100) + '%' }"
                :class="{ warning: budgetPercentage > 80, danger: budgetPercentage > 95 }"
              ></div>
            </div>
          </div>
        </div>

        <h4>Usage by Model</h4>
        <table class="data-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Requests</th>
              <th>Input Tokens</th>
              <th>Output Tokens</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="stat in usageStats.byModel" :key="`${stat.model_id}-${stat.operation_type}`">
              <td>{{ stat.model_id }}</td>
              <td>{{ formatNumber(stat.request_count) }}</td>
              <td>{{ formatNumber(stat.total_input_tokens) }}</td>
              <td>{{ formatNumber(stat.total_output_tokens) }}</td>
              <td>${{ parseFloat(stat.total_cost || 0).toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add Credential Modal -->
    <div v-if="showAddCredential" class="modal-overlay" @click.self="showAddCredential = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Add API Credential</h3>
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

          <!-- Dynamic credential fields -->
          <template v-if="selectedProviderName">
            <div class="form-group">
              <label>API Key</label>
              <input v-model="credentialForm.credentials.api_key" type="password" required>
            </div>
            <template v-if="selectedProviderName === 'azure_openai'">
              <div class="form-group">
                <label>Endpoint URL</label>
                <input v-model="credentialForm.credentials.endpoint" type="url" required>
              </div>
              <div class="form-group">
                <label>Deployment Name</label>
                <input v-model="credentialForm.credentials.deployment_name" type="text" required>
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
          </template>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="showAddCredential = false">Cancel</button>
            <button type="submit" class="btn-primary">Add Credential</button>
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
            <label>System Prompt</label>
            <pre class="prompt-content">{{ viewingTemplate.system_prompt }}</pre>
          </div>
          <div v-if="viewingTemplate.user_prompt_template" class="template-section">
            <label>User Prompt Template</label>
            <pre class="prompt-content">{{ viewingTemplate.user_prompt_template }}</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Chatbot Modal -->
    <div v-if="showAddChatbot" class="modal-overlay" @click.self="showAddChatbot = false">
      <div class="modal modal-large">
        <div class="modal-header">
          <h3>{{ editingChatbot ? 'Edit' : 'Create' }} Chatbot</h3>
          <button class="modal-close" @click="closeChatbotModal">&times;</button>
        </div>
        <form @submit.prevent="saveChatbot">
          <div class="form-group">
            <label>Name</label>
            <input v-model="chatbotForm.name" type="text" required placeholder="e.g., Support Bot">
          </div>
          <div class="form-group">
            <label>Description</label>
            <input v-model="chatbotForm.description" type="text" placeholder="What does this chatbot do?">
          </div>
          <div class="form-group">
            <label>Welcome Message</label>
            <textarea v-model="chatbotForm.welcomeMessage" rows="2" placeholder="Hello! How can I help you today?"></textarea>
          </div>
          <div class="form-group">
            <label>System Prompt</label>
            <textarea v-model="chatbotForm.systemPrompt" rows="6" required placeholder="You are a helpful customer service assistant..."></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Temperature</label>
              <input v-model.number="chatbotForm.temperature" type="number" step="0.1" min="0" max="2">
            </div>
            <div class="form-group">
              <label>Max Tokens</label>
              <input v-model.number="chatbotForm.maxTokens" type="number" min="100" max="4000">
            </div>
          </div>
          <div class="form-group">
            <label>Channels</label>
            <div class="checkbox-group">
              <label><input type="checkbox" v-model="chatbotForm.channels" value="web"> Web Chat</label>
              <label><input type="checkbox" v-model="chatbotForm.channels" value="sms"> SMS</label>
              <label><input type="checkbox" v-model="chatbotForm.channels" value="whatsapp"> WhatsApp</label>
              <label><input type="checkbox" v-model="chatbotForm.channels" value="facebook"> Facebook</label>
            </div>
          </div>
          <div class="form-group">
            <label>Fallback Behavior</label>
            <select v-model="chatbotForm.fallbackBehavior">
              <option value="escalate">Escalate to Agent</option>
              <option value="retry">Retry with Different Response</option>
              <option value="end">End Conversation</option>
            </select>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="closeChatbotModal">Cancel</button>
            <button type="submit" class="btn-primary">{{ editingChatbot ? 'Update' : 'Create' }} Chatbot</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const activeTab = ref('general');
const tabs = [
  { id: 'general', name: 'General', icon: '&#x2699;' },
  { id: 'credentials', name: 'Credentials', icon: '&#x1F511;' },
  { id: 'models', name: 'Models', icon: '&#x1F9E0;' },
  { id: 'templates', name: 'Templates', icon: '&#x1F4DD;' },
  { id: 'chatbots', name: 'Chatbots', icon: '&#x1F916;' },
  { id: 'usage', name: 'Usage', icon: '&#x1F4CA;' }
];

// Data
const settings = ref({
  isEnabled: true,
  defaultQualityTier: 'balanced',
  maxCostPerRequest: 0.50,
  monthlyBudget: 500,
  contentModerationEnabled: false,
  allowedModels: []
});

const enabledFeatures = ref({
  agent_assist: true,
  auto_summarize: true,
  sentiment_analysis: true,
  chatbot: false
});

const providers = ref([]);
const credentials = ref([]);
const availableModels = ref([]);
const templates = ref([]);
const chatbots = ref([]);
const usagePeriod = ref(30);
const usageStats = ref({
  totalRequests: 0,
  totalTokens: 0,
  totalCost: 0,
  byModel: []
});

// Modals
const showAddCredential = ref(false);
const credentialForm = ref({ providerId: '', credentials: {} });
const viewingTemplate = ref(null);
const showAddTemplate = ref(false);
const showAddChatbot = ref(false);
const editingChatbot = ref(null);
const chatbotForm = ref({
  name: '',
  description: '',
  welcomeMessage: '',
  systemPrompt: '',
  temperature: 0.7,
  maxTokens: 1024,
  channels: ['web'],
  fallbackBehavior: 'escalate'
});

const selectedProviderName = computed(() => {
  const provider = providers.value.find(p => p.id === credentialForm.value.providerId);
  return provider?.name || '';
});

const budgetPercentage = computed(() => {
  if (!settings.value.monthlyBudget || settings.value.monthlyBudget === 0) return 0;
  return Math.round((usageStats.value.totalCost / settings.value.monthlyBudget) * 100);
});

// API calls
async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('token');
  return fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
}

async function loadSettings() {
  try {
    const res = await fetchWithAuth('/v1/ai/settings');
    const data = await res.json();
    if (data.success && data.data) {
      settings.value = {
        isEnabled: data.data.is_enabled ?? true,
        defaultQualityTier: data.data.default_quality_tier || 'balanced',
        maxCostPerRequest: data.data.max_cost_per_request || 0.50,
        monthlyBudget: data.data.monthly_budget || 500,
        contentModerationEnabled: data.data.content_moderation_enabled || false,
        allowedModels: data.data.allowed_models || []
      };
      if (data.data.enabled_features) {
        enabledFeatures.value = {
          agent_assist: data.data.enabled_features.includes('agent_assist'),
          auto_summarize: data.data.enabled_features.includes('auto_summarize'),
          sentiment_analysis: data.data.enabled_features.includes('sentiment_analysis'),
          chatbot: data.data.enabled_features.includes('chatbot')
        };
      }
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

async function saveSettings() {
  try {
    await fetchWithAuth('/v1/ai/settings', {
      method: 'PUT',
      body: JSON.stringify({
        isEnabled: settings.value.isEnabled,
        defaultQualityTier: settings.value.defaultQualityTier,
        maxCostPerRequest: settings.value.maxCostPerRequest,
        monthlyBudget: settings.value.monthlyBudget,
        contentModerationEnabled: settings.value.contentModerationEnabled,
        allowedModels: settings.value.allowedModels
      })
    });
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

async function updateFeatures() {
  const features = Object.keys(enabledFeatures.value).filter(f => enabledFeatures.value[f]);
  try {
    await fetchWithAuth('/v1/ai/settings', {
      method: 'PUT',
      body: JSON.stringify({ enabledFeatures: features })
    });
  } catch (error) {
    console.error('Failed to update features:', error);
  }
}

async function loadProviders() {
  try {
    const res = await fetchWithAuth('/v1/ai/providers');
    const data = await res.json();
    if (data.success) {
      providers.value = data.data;
    }
  } catch (error) {
    console.error('Failed to load providers:', error);
  }
}

async function loadCredentials() {
  try {
    const res = await fetchWithAuth('/v1/ai/credentials');
    const data = await res.json();
    if (data.success) {
      credentials.value = data.data;
    }
  } catch (error) {
    console.error('Failed to load credentials:', error);
  }
}

async function loadModels() {
  try {
    const res = await fetchWithAuth('/v1/ai/models');
    const data = await res.json();
    if (data.success) {
      availableModels.value = data.data;
    }
  } catch (error) {
    console.error('Failed to load models:', error);
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

async function loadChatbots() {
  try {
    const res = await fetchWithAuth('/v1/ai/chatbots');
    const data = await res.json();
    if (data.success) {
      chatbots.value = data.data;
    }
  } catch (error) {
    console.error('Failed to load chatbots:', error);
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

      let totalReqs = 0, totalToks = 0, totalCost = 0;
      data.data.forEach(stat => {
        totalReqs += parseInt(stat.request_count || 0);
        totalToks += parseInt(stat.total_input_tokens || 0) + parseInt(stat.total_output_tokens || 0);
        totalCost += parseFloat(stat.total_cost || 0);
      });

      usageStats.value.totalRequests = totalReqs;
      usageStats.value.totalTokens = totalToks;
      usageStats.value.totalCost = totalCost;
    }
  } catch (error) {
    console.error('Failed to load usage stats:', error);
  }
}

async function saveCredential() {
  try {
    await fetchWithAuth('/v1/ai/credentials', {
      method: 'POST',
      body: JSON.stringify({
        providerId: credentialForm.value.providerId,
        credentials: credentialForm.value.credentials
      })
    });
    showAddCredential.value = false;
    credentialForm.value = { providerId: '', credentials: {} };
    await loadCredentials();
  } catch (error) {
    console.error('Failed to save credential:', error);
  }
}

async function deleteCredential(cred) {
  if (!confirm('Delete this credential?')) return;
  try {
    await fetchWithAuth(`/v1/ai/credentials/${cred.id}`, { method: 'DELETE' });
    await loadCredentials();
  } catch (error) {
    console.error('Failed to delete credential:', error);
  }
}

async function testCredential(cred) {
  // Test functionality would need to be implemented
  alert('Credential test not yet implemented');
}

function isModelAllowed(modelId) {
  if (!settings.value.allowedModels || settings.value.allowedModels.length === 0) return true;
  return settings.value.allowedModels.includes(modelId);
}

async function toggleModel(modelId) {
  const allowed = [...(settings.value.allowedModels || [])];
  const index = allowed.indexOf(modelId);
  if (index === -1) {
    allowed.push(modelId);
  } else {
    allowed.splice(index, 1);
  }
  settings.value.allowedModels = allowed;
  await saveSettings();
}

function viewTemplate(template) {
  viewingTemplate.value = template;
}

function editTemplate(template) {
  // Template editing functionality
  console.log('Edit template:', template);
}

async function deleteTemplate(template) {
  if (!confirm('Delete this template?')) return;
  try {
    await fetchWithAuth(`/v1/ai/templates/${template.id}`, { method: 'DELETE' });
    await loadTemplates();
  } catch (error) {
    console.error('Failed to delete template:', error);
  }
}

function editChatbot(chatbot) {
  editingChatbot.value = chatbot;
  chatbotForm.value = {
    name: chatbot.name,
    description: chatbot.description || '',
    welcomeMessage: chatbot.welcome_message || '',
    systemPrompt: chatbot.system_prompt,
    temperature: chatbot.temperature || 0.7,
    maxTokens: chatbot.max_tokens || 1024,
    channels: chatbot.channels || ['web'],
    fallbackBehavior: chatbot.fallback_behavior || 'escalate'
  };
  showAddChatbot.value = true;
}

function closeChatbotModal() {
  showAddChatbot.value = false;
  editingChatbot.value = null;
  chatbotForm.value = {
    name: '',
    description: '',
    welcomeMessage: '',
    systemPrompt: '',
    temperature: 0.7,
    maxTokens: 1024,
    channels: ['web'],
    fallbackBehavior: 'escalate'
  };
}

async function saveChatbot() {
  try {
    const method = editingChatbot.value ? 'PUT' : 'POST';
    const url = editingChatbot.value
      ? `/v1/ai/chatbots/${editingChatbot.value.id}`
      : '/v1/ai/chatbots';

    await fetchWithAuth(url, {
      method,
      body: JSON.stringify(chatbotForm.value)
    });

    closeChatbotModal();
    await loadChatbots();
  } catch (error) {
    console.error('Failed to save chatbot:', error);
  }
}

async function toggleChatbot(chatbot) {
  try {
    await fetchWithAuth(`/v1/ai/chatbots/${chatbot.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...chatbot, is_active: !chatbot.is_active })
    });
    await loadChatbots();
  } catch (error) {
    console.error('Failed to toggle chatbot:', error);
  }
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

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num?.toString() || '0';
}

function formatDate(date) {
  return new Date(date).toLocaleDateString();
}

// Watch tab changes
watch(activeTab, (newTab) => {
  if (newTab === 'credentials') loadCredentials();
  if (newTab === 'models') loadModels();
  if (newTab === 'templates') loadTemplates();
  if (newTab === 'chatbots') loadChatbots();
  if (newTab === 'usage') loadUsageStats();
});

onMounted(() => {
  loadSettings();
  loadProviders();
});
</script>

<style scoped>
.ai-settings {
  padding: 24px;
  max-width: 1200px;
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

.card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 24px;
}

.card h3 {
  margin: 0 0 8px;
  font-size: 18px;
}

.card-description {
  color: #666;
  margin: 0 0 20px;
  font-size: 14px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.toggle-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toggle-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.toggle-info h4 {
  margin: 0;
  font-size: 15px;
}

.toggle-info p {
  margin: 4px 0 0;
  font-size: 13px;
  color: #666;
}

.toggle {
  position: relative;
  width: 48px;
  height: 26px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #ccc;
  border-radius: 26px;
  transition: 0.3s;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.3s;
}

.toggle input:checked + .toggle-slider {
  background: #4361ee;
}

.toggle input:checked + .toggle-slider:before {
  transform: translateX(22px);
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 14px;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.form-group textarea {
  resize: vertical;
}

.help-text {
  margin: 6px 0 0;
  font-size: 12px;
  color: #888;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: normal;
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
  gap: 8px;
}

.provider-icon {
  font-size: 18px;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
}

.status-badge.active {
  background: #e8f5e9;
  color: #2e7d32;
}

.status-badge.inactive {
  background: #fce4ec;
  color: #c62828;
}

.empty-state {
  text-align: center;
  padding: 48px 24px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-state h4 {
  margin: 0 0 8px;
}

.empty-state p {
  color: #666;
  margin: 0 0 20px;
}

.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.model-card {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 16px;
  border: 1px solid #e0e0e0;
}

.model-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.model-name {
  font-weight: 600;
}

.model-provider {
  font-size: 13px;
  color: #666;
  margin-bottom: 12px;
}

.model-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
}

.capability-tag {
  padding: 2px 8px;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 4px;
  font-size: 11px;
}

.model-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #666;
  margin-bottom: 12px;
}

.model-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.quality-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  text-transform: capitalize;
}

.quality-badge.economy { background: #fff3e0; color: #e65100; }
.quality-badge.balanced { background: #e3f2fd; color: #1976d2; }
.quality-badge.premium { background: #f3e5f5; color: #7b1fa2; }

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
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
}

.use-case-badge {
  padding: 2px 8px;
  background: #e0e0e0;
  border-radius: 4px;
  font-size: 11px;
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

.badge-system {
  background: #f3e5f5;
  color: #7b1fa2;
}

.badge-custom {
  background: #e8f5e9;
  color: #2e7d32;
}

.chatbot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.chatbot-card {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  border: 1px solid #e0e0e0;
}

.chatbot-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.chatbot-header h4 {
  margin: 0;
}

.chatbot-description {
  font-size: 13px;
  color: #666;
  margin: 0 0 12px;
}

.chatbot-channels {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
}

.channel-tag {
  padding: 2px 8px;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 4px;
  font-size: 11px;
}

.chatbot-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
}

.stat {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 20px;
  font-weight: 600;
}

.stat-label {
  font-size: 11px;
  color: #666;
}

.chatbot-actions {
  display: flex;
  gap: 8px;
}

.usage-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 20px;
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

.budget-bar {
  height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  margin-top: 8px;
}

.budget-fill {
  height: 100%;
  background: #4361ee;
  border-radius: 2px;
  transition: width 0.3s;
}

.budget-fill.warning {
  background: #ff9800;
}

.budget-fill.danger {
  background: #f44336;
}

.header-actions {
  display: flex;
  gap: 12px;
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
</style>
