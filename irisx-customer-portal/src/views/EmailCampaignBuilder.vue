<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import DashboardLayout from '../components/DashboardLayout.vue';

const router = useRouter();
const authStore = useAuthStore();

// Wizard state
const currentStep = ref(1);
const totalSteps = 4;

// Campaign data
const campaignData = ref({
  // Step 1: Details
  name: '',
  description: '',
  type: 'one-time', // 'one-time', 'drip', 'ab-test'

  // Step 2: Recipients
  contactListIds: [],
  segmentFilters: {
    tags: [],
    customFields: {},
  },
  estimatedRecipients: 0,

  // Step 3: Content
  templateId: null,
  selectedTemplate: null,
  abTestVariant: null, // For A/B testing
  abTestSplitPercentage: 50,

  // Step 4: Schedule
  sendNow: true,
  scheduledAt: null,
  timezone: 'America/New_York',
  optimizeSendTime: false,

  // Metadata
  status: 'draft',
});

// Lists and data
const contactLists = ref([]);
const templates = ref([]);
const availableTags = ref([]);
const loading = ref(false);
const saving = ref(false);
const previewContacts = ref([]);

// Step 1: Campaign Types
const campaignTypes = [
  {
    value: 'one-time',
    label: 'One-Time Campaign',
    description: 'Send a single email to your audience',
    icon: '📧',
  },
  {
    value: 'drip',
    label: 'Drip Campaign',
    description: 'Send a series of emails over time',
    icon: '💧',
  },
  {
    value: 'ab-test',
    label: 'A/B Test',
    description: 'Test two versions to optimize performance',
    icon: '🧪',
  },
];

// Step 4: Timezones
const timezones = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
];

// Computed
const canProceed = computed(() => {
  switch (currentStep.value) {
    case 1:
      return campaignData.value.name && campaignData.value.type;
    case 2:
      return campaignData.value.contactListIds.length > 0;
    case 3:
      return campaignData.value.templateId !== null;
    case 4:
      return campaignData.value.sendNow || campaignData.value.scheduledAt;
    default:
      return false;
  }
});

const selectedContactLists = computed(() => {
  return contactLists.value.filter(list =>
    campaignData.value.contactListIds.includes(list.id)
  );
});

const totalSelectedRecipients = computed(() => {
  return selectedContactLists.value.reduce((sum, list) => sum + (list.contact_count || 0), 0);
});

// Methods
async function fetchContactLists() {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/contacts/lists`, {
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      contactLists.value = data.lists || [];
    }
  } catch (error) {
    console.error('Failed to fetch contact lists:', error);
  }
}

async function fetchTemplates() {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/email/templates`, {
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      templates.value = data.templates || [];
    }
  } catch (error) {
    console.error('Failed to fetch templates:', error);
  }
}

async function fetchPreviewContacts() {
  if (campaignData.value.contactListIds.length === 0) {
    previewContacts.value = [];
    return;
  }

  loading.value = true;
  try {
    const listIds = campaignData.value.contactListIds.join(',');
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/v1/contacts?list_ids=${listIds}&limit=10`,
      {
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      previewContacts.value = data.contacts || [];
    }
  } catch (error) {
    console.error('Failed to fetch preview contacts:', error);
  } finally {
    loading.value = false;
  }
}

function selectTemplate(template) {
  campaignData.value.templateId = template.id;
  campaignData.value.selectedTemplate = template;
}

function nextStep() {
  if (canProceed.value && currentStep.value < totalSteps) {
    currentStep.value++;

    // Fetch preview contacts when moving to step 3
    if (currentStep.value === 3) {
      fetchTemplates();
    }
  }
}

function previousStep() {
  if (currentStep.value > 1) {
    currentStep.value--;
  }
}

function toggleContactList(listId) {
  const index = campaignData.value.contactListIds.indexOf(listId);
  if (index === -1) {
    campaignData.value.contactListIds.push(listId);
  } else {
    campaignData.value.contactListIds.splice(index, 1);
  }

  // Update estimated recipients
  campaignData.value.estimatedRecipients = totalSelectedRecipients.value;

  // Fetch preview contacts
  fetchPreviewContacts();
}

function addTag(tag) {
  if (tag && !campaignData.value.segmentFilters.tags.includes(tag)) {
    campaignData.value.segmentFilters.tags.push(tag);
  }
}

function removeTag(tag) {
  const index = campaignData.value.segmentFilters.tags.indexOf(tag);
  if (index !== -1) {
    campaignData.value.segmentFilters.tags.splice(index, 1);
  }
}

async function saveDraft() {
  saving.value = true;
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/campaigns`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...campaignData.value,
        status: 'draft',
      }),
    });

    if (response.ok) {
      alert('Campaign saved as draft!');
      router.push('/dashboard/emails');
    } else {
      const error = await response.json();
      alert(`Failed to save: ${error.message}`);
    }
  } catch (error) {
    console.error('Save draft error:', error);
    alert('Failed to save campaign');
  } finally {
    saving.value = false;
  }
}

async function launchCampaign() {
  if (!confirm('Are you sure you want to launch this campaign? This cannot be undone.')) {
    return;
  }

  saving.value = true;
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/campaigns`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...campaignData.value,
        status: campaignData.value.sendNow ? 'sending' : 'scheduled',
      }),
    });

    if (response.ok) {
      const data = await response.json();
      alert(
        campaignData.value.sendNow
          ? 'Campaign launched! Emails are being sent.'
          : 'Campaign scheduled successfully!'
      );
      router.push(`/dashboard/emails?campaign=${data.campaign.id}`);
    } else {
      const error = await response.json();
      alert(`Failed to launch: ${error.message}`);
    }
  } catch (error) {
    console.error('Launch campaign error:', error);
    alert('Failed to launch campaign');
  } finally {
    saving.value = false;
  }
}

function cancel() {
  if (confirm('Are you sure? All unsaved changes will be lost.')) {
    router.push('/dashboard/emails');
  }
}

onMounted(() => {
  fetchContactLists();
});
</script>

<template>
  <DashboardLayout>
    <div class="campaign-builder">
      <!-- Header -->
      <div class="builder-header">
        <div>
          <h1 class="page-title">Create Email Campaign</h1>
          <p class="page-description">{{ campaignTypes.find(t => t.value === campaignData.type)?.description || 'Build your email campaign' }}</p>
        </div>
        <div class="header-actions">
          <button @click="cancel" class="btn btn-secondary">Cancel</button>
          <button @click="saveDraft" class="btn btn-outline" :disabled="saving">
            {{ saving ? 'Saving...' : 'Save Draft' }}
          </button>
        </div>
      </div>

      <!-- Progress Steps -->
      <div class="progress-steps">
        <div
          v-for="step in totalSteps"
          :key="step"
          :class="['step', { active: currentStep === step, completed: currentStep > step }]"
        >
          <div class="step-number">
            <span v-if="currentStep > step">✓</span>
            <span v-else>{{ step }}</span>
          </div>
          <div class="step-label">
            <span v-if="step === 1">Details</span>
            <span v-else-if="step === 2">Recipients</span>
            <span v-else-if="step === 3">Content</span>
            <span v-else>Schedule</span>
          </div>
        </div>
      </div>

      <!-- Step Content -->
      <div class="step-content">
        <!-- Step 1: Campaign Details -->
        <div v-if="currentStep === 1" class="step-panel">
          <h2 class="step-title">Campaign Details</h2>
          <p class="step-description">Choose your campaign type and provide basic information</p>

          <div class="form-section">
            <label class="form-label">Campaign Type *</label>
            <div class="type-grid">
              <div
                v-for="type in campaignTypes"
                :key="type.value"
                @click="campaignData.type = type.value"
                :class="['type-card', { selected: campaignData.type === type.value }]"
              >
                <div class="type-icon">{{ type.icon }}</div>
                <div class="type-label">{{ type.label }}</div>
                <div class="type-description">{{ type.description }}</div>
              </div>
            </div>
          </div>

          <div class="form-section">
            <label class="form-label">Campaign Name *</label>
            <input
              v-model="campaignData.name"
              type="text"
              class="input"
              placeholder="e.g., Summer Sale 2025"
            />
          </div>

          <div class="form-section">
            <label class="form-label">Description (Optional)</label>
            <textarea
              v-model="campaignData.description"
              class="input textarea"
              rows="3"
              placeholder="Internal notes about this campaign..."
            ></textarea>
          </div>

          <!-- A/B Test Settings -->
          <div v-if="campaignData.type === 'ab-test'" class="form-section">
            <label class="form-label">A/B Test Split</label>
            <div class="split-slider">
              <input
                v-model="campaignData.abTestSplitPercentage"
                type="range"
                min="10"
                max="90"
                step="10"
                class="slider"
              />
              <div class="split-labels">
                <span>Variant A: {{ campaignData.abTestSplitPercentage }}%</span>
                <span>Variant B: {{ 100 - campaignData.abTestSplitPercentage }}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 2: Recipients -->
        <div v-if="currentStep === 2" class="step-panel">
          <h2 class="step-title">Select Recipients</h2>
          <p class="step-description">Choose contact lists and optionally apply filters</p>

          <div class="recipients-layout">
            <!-- Contact Lists -->
            <div class="lists-section">
              <h3 class="section-title">Contact Lists</h3>

              <div v-if="contactLists.length === 0" class="empty-state">
                <p>No contact lists found</p>
                <button class="btn btn-sm btn-primary">Create List</button>
              </div>

              <div class="contact-lists">
                <div
                  v-for="list in contactLists"
                  :key="list.id"
                  @click="toggleContactList(list.id)"
                  :class="['list-card', { selected: campaignData.contactListIds.includes(list.id) }]"
                >
                  <div class="list-checkbox">
                    <input
                      type="checkbox"
                      :checked="campaignData.contactListIds.includes(list.id)"
                      @click.stop
                    />
                  </div>
                  <div class="list-info">
                    <div class="list-name">{{ list.name }}</div>
                    <div class="list-count">{{ list.contact_count || 0 }} contacts</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Preview & Summary -->
            <div class="preview-section">
              <div class="recipients-summary">
                <h3 class="section-title">Summary</h3>
                <div class="summary-stat">
                  <div class="stat-value">{{ totalSelectedRecipients }}</div>
                  <div class="stat-label">Total Recipients</div>
                </div>
                <div class="summary-stat">
                  <div class="stat-value">{{ campaignData.contactListIds.length }}</div>
                  <div class="stat-label">Lists Selected</div>
                </div>
              </div>

              <div class="contact-preview" v-if="previewContacts.length > 0">
                <h4 class="preview-title">Preview (First 10)</h4>
                <div class="preview-list">
                  <div v-for="contact in previewContacts" :key="contact.id" class="preview-item">
                    <div class="preview-name">{{ contact.first_name }} {{ contact.last_name }}</div>
                    <div class="preview-email">{{ contact.email }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 3: Content -->
        <div v-if="currentStep === 3" class="step-panel">
          <h2 class="step-title">Choose Template</h2>
          <p class="step-description">Select an email template for your campaign</p>

          <div class="templates-grid">
            <div
              v-for="template in templates"
              :key="template.id"
              @click="selectTemplate(template)"
              :class="['template-card', { selected: campaignData.templateId === template.id }]"
            >
              <div class="template-preview">
                <div class="template-icon">📧</div>
              </div>
              <div class="template-info">
                <div class="template-name">{{ template.name }}</div>
                <div class="template-subject">{{ template.subject }}</div>
                <div class="template-category">{{ template.category }}</div>
              </div>
              <div v-if="campaignData.templateId === template.id" class="selected-badge">
                ✓ Selected
              </div>
            </div>
          </div>

          <div v-if="templates.length === 0" class="empty-state">
            <p>No templates found</p>
            <button @click="$router.push('/dashboard/email-templates')" class="btn btn-primary">
              Create Template
            </button>
          </div>

          <!-- Template Preview -->
          <div v-if="campaignData.selectedTemplate" class="template-preview-full">
            <h3 class="preview-title">Template Preview</h3>
            <div class="preview-box">
              <div class="preview-header">
                <strong>Subject:</strong> {{ campaignData.selectedTemplate.subject }}
              </div>
              <div class="preview-body" v-html="campaignData.selectedTemplate.html_body"></div>
            </div>
          </div>
        </div>

        <!-- Step 4: Schedule -->
        <div v-if="currentStep === 4" class="step-panel">
          <h2 class="step-title">Schedule & Launch</h2>
          <p class="step-description">Choose when to send your campaign</p>

          <div class="schedule-options">
            <div
              @click="campaignData.sendNow = true"
              :class="['schedule-option', { selected: campaignData.sendNow }]"
            >
              <div class="option-radio">
                <input type="radio" :checked="campaignData.sendNow" />
              </div>
              <div class="option-content">
                <div class="option-title">Send Now</div>
                <div class="option-description">Send immediately after launch</div>
              </div>
            </div>

            <div
              @click="campaignData.sendNow = false"
              :class="['schedule-option', { selected: !campaignData.sendNow }]"
            >
              <div class="option-radio">
                <input type="radio" :checked="!campaignData.sendNow" />
              </div>
              <div class="option-content">
                <div class="option-title">Schedule for Later</div>
                <div class="option-description">Choose a specific date and time</div>
              </div>
            </div>
          </div>

          <div v-if="!campaignData.sendNow" class="schedule-form">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Send Date & Time *</label>
                <input
                  v-model="campaignData.scheduledAt"
                  type="datetime-local"
                  class="input"
                />
              </div>
              <div class="form-group">
                <label class="form-label">Timezone</label>
                <select v-model="campaignData.timezone" class="input">
                  <option v-for="tz in timezones" :key="tz.value" :value="tz.value">
                    {{ tz.label }}
                  </option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input v-model="campaignData.optimizeSendTime" type="checkbox" />
                <span>Optimize send time for each recipient (AI-powered)</span>
              </label>
              <p class="form-hint">
                AI will analyze each recipient's engagement patterns and send at their optimal time
              </p>
            </div>
          </div>

          <!-- Final Review -->
          <div class="final-review">
            <h3 class="review-title">Campaign Summary</h3>
            <div class="review-grid">
              <div class="review-item">
                <div class="review-label">Campaign Name</div>
                <div class="review-value">{{ campaignData.name }}</div>
              </div>
              <div class="review-item">
                <div class="review-label">Type</div>
                <div class="review-value">{{ campaignTypes.find(t => t.value === campaignData.type)?.label }}</div>
              </div>
              <div class="review-item">
                <div class="review-label">Recipients</div>
                <div class="review-value">{{ totalSelectedRecipients }} contacts</div>
              </div>
              <div class="review-item">
                <div class="review-label">Template</div>
                <div class="review-value">{{ campaignData.selectedTemplate?.name }}</div>
              </div>
              <div class="review-item">
                <div class="review-label">Schedule</div>
                <div class="review-value">
                  {{ campaignData.sendNow ? 'Send immediately' : `Scheduled for ${campaignData.scheduledAt}` }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Navigation -->
      <div class="step-navigation">
        <button
          v-if="currentStep > 1"
          @click="previousStep"
          class="btn btn-secondary"
        >
          Previous
        </button>
        <div class="nav-spacer"></div>
        <button
          v-if="currentStep < totalSteps"
          @click="nextStep"
          class="btn btn-primary"
          :disabled="!canProceed"
        >
          Next Step
        </button>
        <button
          v-if="currentStep === totalSteps"
          @click="launchCampaign"
          class="btn btn-success"
          :disabled="!canProceed || saving"
        >
          {{ saving ? 'Launching...' : '🚀 Launch Campaign' }}
        </button>
      </div>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.campaign-builder {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.builder-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.page-title {
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
}

.page-description {
  color: #6b7280;
  margin-top: 0.25rem;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
}

/* Progress Steps */
.progress-steps {
  display: flex;
  justify-content: space-between;
  margin-bottom: 3rem;
  position: relative;
}

.progress-steps::before {
  content: '';
  position: absolute;
  top: 20px;
  left: 10%;
  right: 10%;
  height: 2px;
  background: #e5e7eb;
  z-index: 0;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  position: relative;
  z-index: 1;
}

.step-number {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: white;
  border: 2px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: #6b7280;
}

.step.active .step-number {
  background: #4f46e5;
  border-color: #4f46e5;
  color: white;
}

.step.completed .step-number {
  background: #10b981;
  border-color: #10b981;
  color: white;
}

.step-label {
  font-size: 0.875rem;
  color: #6b7280;
  font-weight: 500;
}

.step.active .step-label {
  color: #4f46e5;
  font-weight: 600;
}

/* Step Content */
.step-content {
  background: white;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  padding: 2rem;
  min-height: 500px;
  margin-bottom: 2rem;
}

.step-panel {
  max-width: 900px;
  margin: 0 auto;
}

.step-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
}

.step-description {
  color: #6b7280;
  margin-bottom: 2rem;
}

.form-section {
  margin-bottom: 2rem;
}

.form-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.5rem;
}

.input {
  width: 100%;
  padding: 0.625rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.textarea {
  resize: vertical;
}

/* Type Grid */
.type-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.type-card {
  padding: 1.5rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  cursor: pointer;
  text-align: center;
  transition: all 0.2s;
}

.type-card:hover {
  border-color: #4f46e5;
  background: #f9fafb;
}

.type-card.selected {
  border-color: #4f46e5;
  background: #eef2ff;
}

.type-icon {
  font-size: 2rem;
  margin-bottom: 0.75rem;
}

.type-label {
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.5rem;
}

.type-description {
  font-size: 0.875rem;
  color: #6b7280;
}

/* Recipients Layout */
.recipients-layout {
  display: grid;
  grid-template-columns: 1fr 350px;
  gap: 2rem;
}

.section-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.contact-lists {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.list-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s;
}

.list-card:hover {
  background: #f9fafb;
  border-color: #4f46e5;
}

.list-card.selected {
  background: #eef2ff;
  border-color: #4f46e5;
}

.list-name {
  font-weight: 600;
  color: #111827;
}

.list-count {
  font-size: 0.875rem;
  color: #6b7280;
}

.recipients-summary {
  background: #f9fafb;
  padding: 1.5rem;
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
}

.summary-stat {
  margin-bottom: 1rem;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #4f46e5;
}

.stat-label {
  font-size: 0.875rem;
  color: #6b7280;
}

/* Templates Grid */
.templates-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-bottom: 2rem;
}

.template-card {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.template-card:hover {
  border-color: #4f46e5;
  background: #f9fafb;
}

.template-card.selected {
  border-color: #4f46e5;
  background: #eef2ff;
}

.template-icon {
  font-size: 2rem;
  text-align: center;
  margin-bottom: 0.75rem;
}

.template-name {
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.25rem;
}

.template-subject {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.template-category {
  font-size: 0.75rem;
  color: #9ca3af;
  text-transform: uppercase;
}

.selected-badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: #10b981;
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

/* Schedule Options */
.schedule-options {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 2rem;
}

.schedule-option {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.schedule-option:hover {
  border-color: #4f46e5;
  background: #f9fafb;
}

.schedule-option.selected {
  border-color: #4f46e5;
  background: #eef2ff;
}

.option-title {
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.25rem;
}

.option-description {
  font-size: 0.875rem;
  color: #6b7280;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #374151;
  cursor: pointer;
}

.form-hint {
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.5rem;
}

/* Final Review */
.final-review {
  background: #f9fafb;
  padding: 1.5rem;
  border-radius: 0.5rem;
  margin-top: 2rem;
}

.review-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.review-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.review-item {
  padding: 1rem;
  background: white;
  border-radius: 0.375rem;
}

.review-label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  margin-bottom: 0.25rem;
}

.review-value {
  font-weight: 600;
  color: #111827;
}

/* Navigation */
.step-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nav-spacer {
  flex: 1;
}

/* Buttons */
.btn {
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #4f46e5;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #4338ca;
}

.btn-primary:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

.btn-outline {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn-outline:hover {
  background: #f9fafb;
}

.btn-success {
  background: #10b981;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #059669;
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: #6b7280;
}

.preview-body {
  padding: 1rem;
  font-size: 0.875rem;
  line-height: 1.6;
}
</style>
