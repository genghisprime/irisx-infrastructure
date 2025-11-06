<template>
  <div class="email-automation">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Email Automation</h1>
        <p class="page-description">
          Create trigger-based email workflows to engage customers automatically
        </p>
      </div>
      <button @click="showCreateModal = true" class="btn-primary">
        <svg class="h-6 w-6 icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Create Automation
      </button>
    </div>

    <!-- Filters and Stats -->
    <div class="stats-filters">
      <div class="stats-cards">
        <div class="stat-card">
          <div class="stat-label">Active Rules</div>
          <div class="stat-value">{{ activeRulesCount }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Executions (24h)</div>
          <div class="stat-value">{{ executionsLast24h }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Success Rate</div>
          <div class="stat-value">{{ successRate }}%</div>
        </div>
      </div>

      <div class="filters">
        <select v-model="filters.trigger_type" class="filter-select">
          <option value="">All Trigger Types</option>
          <option value="event">Event-based</option>
          <option value="time">Time-based</option>
          <option value="behavior">Behavior-based</option>
        </select>
        <select v-model="filters.enabled" class="filter-select">
          <option value="">All Statuses</option>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
        <input
          v-model="filters.search"
          type="text"
          placeholder="Search rules..."
          class="filter-search"
        />
      </div>
    </div>

    <!-- Automation Rules List -->
    <div class="rules-section">
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>Loading automation rules...</p>
      </div>

      <div v-else-if="filteredRules.length === 0" class="empty-state">
        <svg class="h-6 w-6 empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h3>No automation rules yet</h3>
        <p>Create your first automation rule to start engaging customers automatically</p>
        <button @click="showCreateModal = true" class="btn-primary">
          Create Your First Automation
        </button>
      </div>

      <div v-else class="rules-grid">
        <div
          v-for="rule in filteredRules"
          :key="rule.id"
          class="rule-card"
          :class="{ disabled: !rule.enabled }"
        >
          <div class="rule-header">
            <div>
              <h3 class="rule-name">{{ rule.name }}</h3>
              <span class="trigger-badge" :class="`trigger-${rule.trigger_type}`">
                {{ getTriggerTypeLabel(rule.trigger_type) }}
              </span>
            </div>
            <div class="rule-actions">
              <button
                @click="toggleRule(rule)"
                class="btn-icon"
                :title="rule.enabled ? 'Disable' : 'Enable'"
              >
                <svg class="h-6 w-6 icon text-green-500" v-if="rule.enabled"  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <svg class="h-6 w-6 icon text-gray-400" v-else  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <button @click="editRule(rule)" class="btn-icon" title="Edit">
                <svg class="h-6 w-6 icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button @click="confirmDelete(rule)" class="btn-icon text-red-500" title="Delete">
                <svg class="h-6 w-6 icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          <p class="rule-description">{{ rule.description }}</p>

          <div class="rule-details">
            <div class="detail-item">
              <span class="detail-label">Trigger:</span>
              <span class="detail-value">{{ formatTrigger(rule.trigger_config) }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Actions:</span>
              <span class="detail-value">{{ rule.actions.length }} action(s)</span>
            </div>
            <div v-if="rule.execution_count > 0" class="detail-item">
              <span class="detail-label">Executions:</span>
              <span class="detail-value">
                {{ rule.execution_count }} total
                ({{ calculateSuccessRate(rule.success_count, rule.execution_count) }}% success)
              </span>
            </div>
            <div v-if="rule.last_executed" class="detail-item">
              <span class="detail-label">Last executed:</span>
              <span class="detail-value">{{ formatDate(rule.last_executed) }}</span>
            </div>
          </div>

          <div class="rule-footer">
            <button @click="viewExecutions(rule)" class="btn-text">
              View Executions
            </button>
            <button @click="testRule(rule)" class="btn-text">
              Test Rule
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showCreateModal || showEditModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ showEditModal ? 'Edit' : 'Create' }} Automation Rule</h2>
          <button @click="closeModal" class="btn-icon">
            <svg class="h-6 w-6 icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="modal-body">
          <!-- Step 1: Basic Info -->
          <div class="form-section">
            <h3 class="form-section-title">Basic Information</h3>
            <div class="form-group">
              <label>Rule Name *</label>
              <input v-model="formData.name" type="text" placeholder="e.g., Welcome Email - New Users" class="input" />
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea v-model="formData.description" rows="2" placeholder="Describe what this automation does" class="input"></textarea>
            </div>
            <div class="form-group">
              <label>Priority</label>
              <input v-model.number="formData.priority" type="number" min="0" max="100" class="input" />
              <small class="form-hint">Higher priority rules execute first (0-100)</small>
            </div>
          </div>

          <!-- Step 2: Trigger Configuration -->
          <div class="form-section">
            <h3 class="form-section-title">Trigger Configuration</h3>
            <div class="form-group">
              <label>Trigger Type *</label>
              <select v-model="formData.trigger_type" class="input">
                <option value="">Select trigger type</option>
                <option value="event">Event-based (immediate)</option>
                <option value="time">Time-based (delayed)</option>
                <option value="behavior">Behavior-based (conditional)</option>
              </select>
            </div>

            <!-- Event-based trigger -->
            <div v-if="formData.trigger_type === 'event'" class="form-group">
              <label>Event Name *</label>
              <select v-model="formData.trigger_config.event_name" class="input">
                <option value="">Select event</option>
                <option value="user.created">User Created</option>
                <option value="contact.created">Contact Created</option>
                <option value="email.sent">Email Sent</option>
                <option value="call.completed">Call Completed</option>
                <option value="sms.received">SMS Received</option>
                <option value="purchase.completed">Purchase Completed</option>
              </select>
            </div>

            <!-- Time-based trigger -->
            <template v-if="formData.trigger_type === 'time'">
              <div class="form-group">
                <label>From Event *</label>
                <select v-model="formData.trigger_config.from_event" class="input">
                  <option value="">Select starting event</option>
                  <option value="user.created">User Created</option>
                  <option value="contact.created">Contact Created</option>
                  <option value="purchase.completed">Purchase Completed</option>
                </select>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Delay Value *</label>
                  <input v-model.number="formData.trigger_config.delay_value" type="number" min="1" class="input" />
                </div>
                <div class="form-group">
                  <label>Delay Unit *</label>
                  <select v-model="formData.trigger_config.delay_unit" class="input">
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
              </div>
            </template>

            <!-- Behavior-based trigger -->
            <template v-if="formData.trigger_type === 'behavior'">
              <div class="form-group">
                <label>Monitor Event *</label>
                <select v-model="formData.trigger_config.event_name" class="input">
                  <option value="">Select event to monitor</option>
                  <option value="email.opened">Email Opened</option>
                  <option value="email.clicked">Email Link Clicked</option>
                  <option value="cart.created">Cart Created</option>
                  <option value="page.visited">Page Visited</option>
                </select>
              </div>
              <div class="form-group">
                <label>Condition *</label>
                <select v-model="formData.trigger_config.condition" class="input">
                  <option value="">Select condition</option>
                  <option value="not_clicked">Did NOT click any links</option>
                  <option value="not_completed">Did NOT complete action</option>
                  <option value="abandoned">Abandoned process</option>
                </select>
              </div>
              <div class="form-group">
                <label>Within (hours) *</label>
                <input v-model.number="formData.trigger_config.within_hours" type="number" min="1" max="168" class="input" />
                <small class="form-hint">Check condition within this time period</small>
              </div>
            </template>
          </div>

          <!-- Step 3: Actions -->
          <div class="form-section">
            <h3 class="form-section-title">
              Actions
              <button @click="addAction" class="btn-text">+ Add Action</button>
            </h3>
            <div v-for="(action, index) in formData.actions" :key="index" class="action-item">
              <div class="action-header">
                <span class="action-number">Action {{ index + 1 }}</span>
                <button @click="removeAction(index)" class="btn-icon text-red-500">
                  <svg class="h-6 w-6 icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div class="form-group">
                <label>Action Type *</label>
                <select v-model="action.type" class="input">
                  <option value="">Select action</option>
                  <option value="send_email">Send Email</option>
                  <option value="webhook">Call Webhook</option>
                  <option value="update_contact">Update Contact</option>
                  <option value="add_tag">Add Tag</option>
                  <option value="wait">Wait/Delay</option>
                </select>
              </div>

              <!-- Send Email action -->
              <template v-if="action.type === 'send_email'">
                <div class="form-group">
                  <label>Email Template *</label>
                  <select v-model="action.template_slug" class="input">
                    <option value="">Select template</option>
                    <option value="welcome-email">Welcome Email</option>
                    <option value="7-day-checkin">7-Day Check-in</option>
                    <option value="abandoned-cart">Abandoned Cart</option>
                    <option value="reminder-email">Reminder Email</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Delay (minutes)</label>
                  <input v-model.number="action.delay_minutes" type="number" min="0" class="input" />
                  <small class="form-hint">Send after this many minutes (0 = immediate)</small>
                </div>
              </template>

              <!-- Webhook action -->
              <template v-if="action.type === 'webhook'">
                <div class="form-group">
                  <label>Webhook URL *</label>
                  <input v-model="action.url" type="url" placeholder="https://..." class="input" />
                </div>
                <div class="form-group">
                  <label>Method</label>
                  <select v-model="action.method" class="input">
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </div>
              </template>

              <!-- Add Tag action -->
              <template v-if="action.type === 'add_tag'">
                <div class="form-group">
                  <label>Tag Name *</label>
                  <input v-model="action.tag" type="text" placeholder="e.g., welcome-sent" class="input" />
                </div>
              </template>

              <!-- Wait action -->
              <template v-if="action.type === 'wait'">
                <div class="form-group">
                  <label>Wait Duration (seconds) *</label>
                  <input v-model.number="action.delay_seconds" type="number" min="1" class="input" />
                </div>
              </template>
            </div>
          </div>

          <!-- Step 4: Rate Limiting -->
          <div class="form-section">
            <h3 class="form-section-title">Rate Limiting (Optional)</h3>
            <div class="form-group">
              <label>Max Executions Per Contact Per Day</label>
              <input v-model.number="formData.max_executions_per_contact_per_day" type="number" min="1" class="input" />
              <small class="form-hint">Leave empty for unlimited</small>
            </div>
            <div class="form-group">
              <label>Cooldown Period (hours)</label>
              <input v-model.number="formData.cooldown_hours" type="number" min="1" class="input" />
              <small class="form-hint">Minimum hours between executions for same contact</small>
            </div>
          </div>

          <!-- Enable/Disable -->
          <div class="form-section">
            <label class="checkbox-label">
              <input v-model="formData.enabled" type="checkbox" />
              <span>Enable this automation rule immediately</span>
            </label>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="closeModal" class="btn-secondary">Cancel</button>
          <button @click="saveRule" class="btn-primary" :disabled="!isFormValid">
            {{ showEditModal ? 'Update' : 'Create' }} Rule
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h2>Delete Automation Rule</h2>
          <button @click="showDeleteModal = false" class="btn-icon">
            <svg class="h-6 w-6 icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <p>Are you sure you want to delete "<strong>{{ ruleToDelete?.name }}</strong>"?</p>
          <p class="text-sm text-gray-500 mt-2">This action cannot be undone.</p>
        </div>
        <div class="modal-footer">
          <button @click="showDeleteModal = false" class="btn-secondary">Cancel</button>
          <button @click="deleteRule" class="btn-danger">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();

// State
const rules = ref([]);
const loading = ref(true);
const showCreateModal = ref(false);
const showEditModal = ref(false);
const showDeleteModal = ref(false);
const ruleToDelete = ref(null);
const editingRule = ref(null);

// Filters
const filters = ref({
  trigger_type: '',
  enabled: '',
  search: '',
});

// Form data
const formData = ref({
  name: '',
  description: '',
  trigger_type: '',
  trigger_config: {},
  conditions: {},
  actions: [],
  enabled: true,
  priority: 0,
  max_executions_per_contact_per_day: null,
  cooldown_hours: null,
});

// Computed
const filteredRules = computed(() => {
  let filtered = rules.value;

  if (filters.value.trigger_type) {
    filtered = filtered.filter(r => r.trigger_type === filters.value.trigger_type);
  }

  if (filters.value.enabled !== '') {
    const enabled = filters.value.enabled === 'true';
    filtered = filtered.filter(r => r.enabled === enabled);
  }

  if (filters.value.search) {
    const search = filters.value.search.toLowerCase();
    filtered = filtered.filter(r =>
      r.name.toLowerCase().includes(search) ||
      (r.description && r.description.toLowerCase().includes(search))
    );
  }

  return filtered;
});

const activeRulesCount = computed(() => {
  return rules.value.filter(r => r.enabled).length;
});

const executionsLast24h = computed(() => {
  return rules.value.reduce((sum, r) => sum + (r.execution_count || 0), 0);
});

const successRate = computed(() => {
  const total = rules.value.reduce((sum, r) => sum + (r.execution_count || 0), 0);
  const success = rules.value.reduce((sum, r) => sum + (r.success_count || 0), 0);
  return total > 0 ? Math.round((success / total) * 100) : 0;
});

const isFormValid = computed(() => {
  return (
    formData.value.name &&
    formData.value.trigger_type &&
    formData.value.actions.length > 0 &&
    formData.value.actions.every(action => action.type)
  );
});

// Methods
async function fetchRules() {
  loading.value = true;
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/email/automation/rules`, {
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
      },
    });
    const data = await response.json();
    rules.value = data.rules || [];
  } catch (error) {
    console.error('Error fetching automation rules:', error);
  } finally {
    loading.value = false;
  }
}

async function toggleRule(rule) {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/v1/email/automation/rules/${rule.id}/toggle`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
        },
      }
    );
    const data = await response.json();
    if (data.success) {
      await fetchRules();
    }
  } catch (error) {
    console.error('Error toggling rule:', error);
  }
}

function editRule(rule) {
  editingRule.value = rule;
  formData.value = {
    name: rule.name,
    description: rule.description || '',
    trigger_type: rule.trigger_type,
    trigger_config: rule.trigger_config || {},
    conditions: rule.conditions || {},
    actions: JSON.parse(JSON.stringify(rule.actions || [])),
    enabled: rule.enabled,
    priority: rule.priority || 0,
    max_executions_per_contact_per_day: rule.max_executions_per_contact_per_day,
    cooldown_hours: rule.cooldown_hours,
  };
  showEditModal.value = true;
}

function confirmDelete(rule) {
  ruleToDelete.value = rule;
  showDeleteModal.value = true;
}

async function deleteRule() {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/v1/email/automation/rules/${ruleToDelete.value.id}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
        },
      }
    );
    const data = await response.json();
    if (data.success) {
      await fetchRules();
      showDeleteModal.value = false;
      ruleToDelete.value = null;
    }
  } catch (error) {
    console.error('Error deleting rule:', error);
  }
}

async function saveRule() {
  const method = showEditModal.value ? 'PUT' : 'POST';
  const url = showEditModal.value
    ? `${import.meta.env.VITE_API_URL}/v1/email/automation/rules/${editingRule.value.id}`
    : `${import.meta.env.VITE_API_URL}/v1/email/automation/rules`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData.value),
    });
    const data = await response.json();
    if (data.success) {
      await fetchRules();
      closeModal();
    }
  } catch (error) {
    console.error('Error saving rule:', error);
  }
}

function closeModal() {
  showCreateModal.value = false;
  showEditModal.value = false;
  editingRule.value = null;
  resetForm();
}

function resetForm() {
  formData.value = {
    name: '',
    description: '',
    trigger_type: '',
    trigger_config: {},
    conditions: {},
    actions: [],
    enabled: true,
    priority: 0,
    max_executions_per_contact_per_day: null,
    cooldown_hours: null,
  };
}

function addAction() {
  formData.value.actions.push({
    type: '',
    template_slug: '',
    delay_minutes: 0,
    url: '',
    method: 'POST',
    tag: '',
    delay_seconds: 60,
  });
}

function removeAction(index) {
  formData.value.actions.splice(index, 1);
}

function getTriggerTypeLabel(type) {
  const labels = {
    event: 'Event',
    time: 'Time',
    behavior: 'Behavior',
  };
  return labels[type] || type;
}

function formatTrigger(config) {
  if (!config) return 'N/A';
  if (config.event_name) return config.event_name;
  if (config.delay_value && config.delay_unit) {
    return `${config.delay_value} ${config.delay_unit} after ${config.from_event}`;
  }
  return 'Custom trigger';
}

function calculateSuccessRate(success, total) {
  return total > 0 ? Math.round((success / total) * 100) : 0;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function viewExecutions(rule) {
  console.log('View executions for rule:', rule.id);
  // TODO: Navigate to executions page or show modal
}

function testRule(rule) {
  console.log('Test rule:', rule.id);
  // TODO: Open test modal with sample data
}

// Lifecycle
onMounted(() => {
  fetchRules();
});
</script>

<style scoped>
/* ... (CSS will be in the same comprehensive style as EmailAnalytics.vue) ... */
.email-automation {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
}

.page-title {
  font-size: 2rem;
  font-weight: 700;
  color: #1a202c;
  margin: 0;
}

.page-description {
  color: #718096;
  margin-top: 0.5rem;
}

.stats-filters {
  margin-bottom: 2rem;
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: white;
  padding: 1.5rem;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
}

.stat-label {
  font-size: 0.875rem;
  color: #718096;
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #2d3748;
}

.filters {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.filter-select, .filter-search {
  padding: 0.5rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.filter-search {
  flex: 1;
  min-width: 200px;
}

.loading-state, .empty-state {
  text-align: center;
  padding: 4rem 2rem;
  background: white;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
}

.spinner {
  width: 3rem;
  height: 3rem;
  border: 3px solid #e2e8f0;
  border-top-color: #4f46e5;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-icon {
  width: 4rem;
  height: 4rem;
  color: #cbd5e0;
  margin: 0 auto 1rem;
}

.rules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
}

.rule-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 1.5rem;
  transition: all 0.2s;
}

.rule-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.rule-card.disabled {
  opacity: 0.6;
}

.rule-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.rule-name {
  font-size: 1.125rem;
  font-weight: 600;
  color: #1a202c;
  margin: 0 0 0.5rem 0;
}

.trigger-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.trigger-event { background: #e0f2fe; color: #0369a1; }
.trigger-time { background: #fef3c7; color: #92400e; }
.trigger-behavior { background: #ddd6fe; color: #5b21b6; }

.rule-actions {
  display: flex;
  gap: 0.5rem;
}

.rule-description {
  color: #718096;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.rule-details {
  margin-bottom: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
}

.detail-label {
  color: #718096;
}

.detail-value {
  color: #2d3748;
  font-weight: 500;
}

.rule-footer {
  display: flex;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
}

/* Modal styles */
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
  padding: 1rem;
}

.modal {
  background: white;
  border-radius: 0.5rem;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-sm {
  max-width: 500px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1.5rem;
  border-top: 1px solid #e2e8f0;
}

.form-section {
  margin-bottom: 2rem;
}

.form-section-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.5rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.form-hint {
  display: block;
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.action-item {
  background: #f9fafb;
  padding: 1rem;
  border-radius: 0.375rem;
  margin-bottom: 1rem;
  border: 1px solid #e5e7eb;
}

.action-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.action-number {
  font-weight: 600;
  color: #374151;
}

/* Buttons */
.btn-primary, .btn-secondary, .btn-danger, .btn-text, .btn-icon {
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary {
  background: #4f46e5;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #4338ca;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #e5e7eb;
  color: #374151;
}

.btn-secondary:hover {
  background: #d1d5db;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
}

.btn-text {
  background: transparent;
  color: #4f46e5;
  padding: 0.25rem 0.5rem;
}

.btn-text:hover {
  background: #eef2ff;
}

.btn-icon {
  background: transparent;
  padding: 0.25rem;
}

.btn-icon:hover {
  background: #f3f4f6;
}

.icon {
  width: 1.25rem;
  height: 1.25rem;
}

.text-red-500 {
  color: #ef4444;
}

.text-green-500 {
  color: #10b981;
}

.text-gray-400 {
  color: #9ca3af;
}
</style>
