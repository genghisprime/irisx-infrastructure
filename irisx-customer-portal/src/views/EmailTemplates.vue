<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();

// State
const templates = ref([]);
const selectedTemplate = ref(null);
const isCreating = ref(false);
const isEditing = ref(false);
const searchQuery = ref('');
const loading = ref(false);
const saving = ref(false);
const showDeleteModal = ref(false);
const templateToDelete = ref(null);

// Form data
const formData = ref({
  name: '',
  slug: '',
  subject: '',
  description: '',
  bodyHtml: '',
  bodyText: '',
  variables: [],
});

// Methods
async function fetchTemplates() {
  loading.value = true;
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
  } finally {
    loading.value = false;
  }
}

const filteredTemplates = computed(() => {
  if (!searchQuery.value) return templates.value;
  const query = searchQuery.value.toLowerCase();
  return templates.value.filter(
    t => t.name?.toLowerCase().includes(query) || t.subject?.toLowerCase().includes(query)
  );
});

function createNew() {
  isCreating.value = true;
  isEditing.value = false;
  selectedTemplate.value = null;
  resetForm();
}

function selectTemplate(template) {
  selectedTemplate.value = template;
  isEditing.value = true;
  isCreating.value = false;

  formData.value = {
    name: template.name || '',
    slug: template.slug || '',
    subject: template.subject || '',
    description: template.description || '',
    bodyHtml: template.body_html || '',
    bodyText: template.body_text || '',
    variables: template.variables || [],
  };
}

function resetForm() {
  formData.value = {
    name: '',
    slug: '',
    subject: '',
    description: '',
    bodyHtml: '',
    bodyText: '',
    variables: [],
  };
}

function cancelEdit() {
  isCreating.value = false;
  isEditing.value = false;
  selectedTemplate.value = null;
  resetForm();
}

async function saveTemplate() {
  if (!formData.value.name || !formData.value.subject) {
    alert('Please fill in template name and subject');
    return;
  }

  // Auto-generate slug
  if (!formData.value.slug) {
    formData.value.slug = formData.value.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  saving.value = true;

  try {
    const url = isEditing.value
      ? `${import.meta.env.VITE_API_URL}/v1/email/templates/${selectedTemplate.value.slug}`
      : `${import.meta.env.VITE_API_URL}/v1/email/templates`;

    const method = isEditing.value ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData.value),
    });

    if (response.ok) {
      await fetchTemplates();
      cancelEdit();
      alert(isEditing.value ? 'Template updated!' : 'Template created!');
    } else {
      const error = await response.json();
      alert(`Failed to save template: ${error.message || error.error}`);
    }
  } catch (error) {
    console.error('Save template error:', error);
    alert('Failed to save template');
  } finally {
    saving.value = false;
  }
}

function confirmDelete(template) {
  templateToDelete.value = template;
  showDeleteModal.value = true;
}

async function deleteTemplate() {
  if (!templateToDelete.value) return;

  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/v1/email/templates/${templateToDelete.value.slug}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
        },
      }
    );

    if (response.ok) {
      await fetchTemplates();
      showDeleteModal.value = false;
      templateToDelete.value = null;
      if (selectedTemplate.value?.slug === templateToDelete.value?.slug) {
        cancelEdit();
      }
    }
  } catch (error) {
    console.error('Delete template error:', error);
    alert('Failed to delete template');
  }
}

function insertVariable(varName) {
  formData.value.bodyHtml += `{{${varName}}}`;
}

onMounted(() => {
  fetchTemplates();
});
</script>

<template>
  <div class="space-y-6">
      <!-- Action Bar -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p class="text-gray-600">Create and manage reusable email templates with dynamic variables.</p>
        <button
          @click="createNew"
          class="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          New Template
        </button>
      </div>

      <!-- Main Content -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Template List Panel -->
        <div class="lg:col-span-1 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <!-- Search -->
          <div class="p-4 border-b border-gray-200">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search templates..."
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <!-- Template List -->
          <div class="max-h-[500px] overflow-y-auto">
            <div v-if="loading" class="p-8 text-center text-gray-500">
              <div class="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2"></div>
              <p class="text-sm">Loading templates...</p>
            </div>

            <div v-else-if="filteredTemplates.length === 0" class="p-8 text-center text-gray-500">
              <svg class="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p class="text-sm font-medium">No templates yet</p>
              <p class="text-xs mt-1">Click "New Template" to create one</p>
            </div>

            <div v-else>
              <div
                v-for="template in filteredTemplates"
                :key="template.id"
                @click="selectTemplate(template)"
                class="p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                :class="{ 'bg-indigo-50 border-l-4 border-l-indigo-600': selectedTemplate?.id === template.id }"
              >
                <div class="flex items-start justify-between">
                  <div class="min-w-0 flex-1">
                    <h4 class="font-medium text-gray-900 truncate">{{ template.name }}</h4>
                    <p class="text-sm text-gray-500 truncate mt-0.5">{{ template.subject }}</p>
                  </div>
                  <button
                    @click.stop="confirmDelete(template)"
                    class="ml-2 p-1 text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Editor Panel -->
        <div class="lg:col-span-2 bg-white rounded-lg border border-gray-200 shadow-sm">
          <!-- Empty State -->
          <div v-if="!isCreating && !isEditing" class="p-12 text-center">
            <svg class="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h3 class="text-lg font-medium text-gray-900 mb-1">No Template Selected</h3>
            <p class="text-gray-500 mb-4">Select a template from the list or create a new one</p>
            <button
              @click="createNew"
              class="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
            >
              Create New Template
            </button>
          </div>

          <!-- Editor Form -->
          <div v-else class="p-6">
            <div class="flex items-center justify-between mb-6">
              <h3 class="text-lg font-semibold text-gray-900">
                {{ isEditing ? 'Edit Template' : 'New Template' }}
              </h3>
              <div class="flex gap-3">
                <button
                  @click="cancelEdit"
                  class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  @click="saveTemplate"
                  :disabled="saving"
                  class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {{ saving ? 'Saving...' : 'Save Template' }}
                </button>
              </div>
            </div>

            <div class="space-y-5">
              <!-- Name & Slug Row -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Template Name *</label>
                  <input
                    v-model="formData.name"
                    type="text"
                    placeholder="e.g., Welcome Email"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Slug (auto-generated)</label>
                  <input
                    v-model="formData.slug"
                    type="text"
                    placeholder="welcome-email"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50"
                  />
                </div>
              </div>

              <!-- Subject -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Subject Line *</label>
                <input
                  v-model="formData.subject"
                  type="text"
                  placeholder="Welcome to {{company_name}}!"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p class="text-xs text-gray-500 mt-1">Use &#123;&#123;variable_name&#125;&#125; for dynamic content</p>
              </div>

              <!-- Description -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  v-model="formData.description"
                  type="text"
                  placeholder="Brief description of when to use this template"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <!-- Variables Quick Insert -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Quick Insert Variables</label>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="v in ['first_name', 'last_name', 'email', 'company_name', 'phone']"
                    :key="v"
                    @click="insertVariable(v)"
                    class="px-3 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-full hover:bg-indigo-100 transition-colors"
                  >
                    &#123;&#123;{{ v }}&#125;&#125;
                  </button>
                </div>
              </div>

              <!-- HTML Body -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email Body (HTML) *</label>
                <textarea
                  v-model="formData.bodyHtml"
                  rows="12"
                  placeholder="<h1>Hello {{first_name}},</h1>
<p>Welcome to our platform!</p>
<p>Best regards,<br>The Team</p>"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                ></textarea>
              </div>

              <!-- Plain Text Body -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Plain Text Version</label>
                <textarea
                  v-model="formData.bodyText"
                  rows="4"
                  placeholder="Hello {{first_name}},

Welcome to our platform!

Best regards,
The Team"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                ></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div v-if="showDeleteModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl" @click.stop>
          <h3 class="text-lg font-semibold text-gray-900 mb-2">Delete Template?</h3>
          <p class="text-gray-600 mb-4">
            Are you sure you want to delete "<strong>{{ templateToDelete?.name }}</strong>"? This cannot be undone.
          </p>
          <div class="flex justify-end gap-3">
            <button
              @click="showDeleteModal = false"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              @click="deleteTemplate"
              class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
  </div>
</template>
