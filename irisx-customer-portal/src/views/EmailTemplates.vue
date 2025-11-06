<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import DashboardLayout from './dashboard/DashboardLayout.vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';

const router = useRouter();
const authStore = useAuthStore();

// State
const templates = ref([]);
const selectedTemplate = ref(null);
const isCreating = ref(false);
const isEditing = ref(false);
const searchQuery = ref('');
const selectedCategory = ref('all');
const loading = ref(false);
const saving = ref(false);
const showDeleteModal = ref(false);
const templateToDelete = ref(null);

// Form data
const formData = ref({
  name: '',
  slug: '',
  subject: '',
  category: 'transactional',
  html_body: '',
  text_body: '',
  description: '',
  variables: [],
});

// Available variables for template
const availableVariables = ref([
  { key: 'first_name', label: 'First Name', example: 'John' },
  { key: 'last_name', label: 'Last Name', example: 'Doe' },
  { key: 'email', label: 'Email', example: 'john@example.com' },
  { key: 'company', label: 'Company', example: 'Acme Inc' },
  { key: 'phone', label: 'Phone', example: '+1-555-0123' },
  { key: 'custom_field', label: 'Custom Field', example: 'Value' },
]);

// Sample data for preview
const previewData = ref({
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  company: 'Acme Inc',
  phone: '+1-555-0123',
  custom_field: 'Sample Value',
});

// TipTap Editor
const editor = useEditor({
  content: formData.value.html_body,
  extensions: [
    StarterKit.configure({
      link: false, // Disable built-in link to avoid duplicate
    }),
    Placeholder.configure({
      placeholder: 'Write your email content here...',
    }),
    Link.configure({
      openOnClick: false,
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    TextStyle,
    Color,
  ],
  onUpdate: ({ editor }) => {
    formData.value.html_body = editor.getHTML();
    formData.value.text_body = editor.getText();
  },
});

// Categories
const categories = [
  { value: 'all', label: 'All Templates' },
  { value: 'transactional', label: 'Transactional' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'notification', label: 'Notification' },
  { value: 'welcome', label: 'Welcome' },
  { value: 'support', label: 'Support' },
];

// Computed
const filteredTemplates = computed(() => {
  let filtered = templates.value;

  // Filter by category
  if (selectedCategory.value !== 'all') {
    filtered = filtered.filter(t => t.category === selectedCategory.value);
  }

  // Filter by search
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(
      t =>
        t.name.toLowerCase().includes(query) ||
        t.subject.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query)
    );
  }

  return filtered;
});

const previewHtml = computed(() => {
  let html = formData.value.html_body;

  // Replace variables with preview data
  Object.keys(previewData.value).forEach(key => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    html = html.replace(regex, previewData.value[key]);
  });

  return html;
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

function createNew() {
  isCreating.value = true;
  isEditing.value = false;
  selectedTemplate.value = null;
  resetForm();
  editor.value?.commands.setContent('');
}

function selectTemplate(template) {
  selectedTemplate.value = template;
  isEditing.value = true;
  isCreating.value = false;

  formData.value = {
    name: template.name,
    slug: template.slug,
    subject: template.subject,
    category: template.category,
    html_body: template.html_body,
    text_body: template.text_body,
    description: template.description || '',
    variables: template.variables || [],
  };

  editor.value?.commands.setContent(template.html_body || '');
}

function resetForm() {
  formData.value = {
    name: '',
    slug: '',
    subject: '',
    category: 'transactional',
    html_body: '',
    text_body: '',
    description: '',
    variables: [],
  };
}

function cancelEdit() {
  isCreating.value = false;
  isEditing.value = false;
  selectedTemplate.value = null;
  resetForm();
  editor.value?.commands.setContent('');
}

async function saveTemplate() {
  if (!formData.value.name || !formData.value.subject) {
    alert('Please fill in template name and subject');
    return;
  }

  // Auto-generate slug from name if empty
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
      alert(`Failed to save template: ${error.message}`);
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

      if (selectedTemplate.value?.id === templateToDelete.value?.id) {
        cancelEdit();
      }

      alert('Template deleted!');
    }
  } catch (error) {
    console.error('Delete template error:', error);
    alert('Failed to delete template');
  }
}

function insertVariable(variable) {
  editor.value?.commands.insertContent(`{{${variable.key}}}`);
}

function setLink() {
  const url = prompt('Enter URL:');
  if (url) {
    editor.value?.chain().focus().setLink({ href: url }).run();
  }
}

function duplicateTemplate(template) {
  formData.value = {
    name: `${template.name} (Copy)`,
    slug: '',
    subject: template.subject,
    category: template.category,
    html_body: template.html_body,
    text_body: template.text_body,
    description: template.description,
    variables: template.variables || [],
  };

  isCreating.value = true;
  isEditing.value = false;
  selectedTemplate.value = null;
  editor.value?.commands.setContent(template.html_body || '');
}

onMounted(() => {
  fetchTemplates();
});
</script>

<template>
  <DashboardLayout>
    <div class="email-templates-page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">Email Templates</h1>
          <p class="page-description">Create and manage email templates with variables</p>
        </div>
        <button @click="createNew" class="btn btn-primary">
          <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class=" icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          New Template
        </button>
      </div>

      <div class="content-wrapper">
        <!-- Sidebar: Template List -->
        <div class="sidebar">
          <!-- Search -->
          <div class="search-box">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search templates..."
              class="search-input"
            />
          </div>

          <!-- Category Filter -->
          <div class="category-tabs">
            <button
              v-for="cat in categories"
              :key="cat.value"
              @click="selectedCategory = cat.value"
              :class="['category-tab', { active: selectedCategory === cat.value }]"
            >
              {{ cat.label }}
              <span class="count" v-if="cat.value === 'all'">{{ templates.length }}</span>
            </button>
          </div>

          <!-- Template List -->
          <div class="template-list">
            <div v-if="loading" class="loading">Loading templates...</div>

            <div v-else-if="filteredTemplates.length === 0" class="empty-state">
              <p>No templates found</p>
            </div>

            <div
              v-for="template in filteredTemplates"
              :key="template.id"
              @click="selectTemplate(template)"
              :class="['template-item', { active: selectedTemplate?.id === template.id }]"
            >
              <div class="template-item-header">
                <h3 class="template-name">{{ template.name }}</h3>
                <span :class="['category-badge', template.category]">
                  {{ template.category }}
                </span>
              </div>
              <p class="template-subject">{{ template.subject }}</p>
              <p class="template-description" v-if="template.description">
                {{ template.description }}
              </p>
              <div class="template-actions">
                <button @click.stop="duplicateTemplate(template)" class="action-btn" title="Duplicate">
                  <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class=" icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button @click.stop="confirmDelete(template)" class="action-btn danger" title="Delete">
                  <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class=" icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Main Editor Area -->
        <div class="main-editor" v-if="isCreating || isEditing">
          <div class="editor-header">
            <h2>{{ isEditing ? 'Edit Template' : 'New Template' }}</h2>
            <div class="editor-actions">
              <button @click="cancelEdit" class="btn btn-secondary">Cancel</button>
              <button @click="saveTemplate" class="btn btn-primary" :disabled="saving">
                {{ saving ? 'Saving...' : 'Save Template' }}
              </button>
            </div>
          </div>

          <!-- Template Form -->
          <div class="template-form">
            <div class="form-row">
              <div class="form-group">
                <label>Template Name *</label>
                <input v-model="formData.name" type="text" class="input" placeholder="Welcome Email" />
              </div>
              <div class="form-group">
                <label>Category</label>
                <select v-model="formData.category" class="input">
                  <option value="transactional">Transactional</option>
                  <option value="marketing">Marketing</option>
                  <option value="notification">Notification</option>
                  <option value="welcome">Welcome</option>
                  <option value="support">Support</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label>Subject Line *</label>
              <input v-model="formData.subject" type="text" class="input" placeholder="Welcome to {{company}}!" />
              <p class="form-hint">Use {{variable}} syntax for dynamic content</p>
            </div>

            <div class="form-group">
              <label>Description (optional)</label>
              <input v-model="formData.description" type="text" class="input" placeholder="Brief description of this template" />
            </div>

            <!-- Rich Text Editor -->
            <div class="form-group">
              <label>Email Content *</label>

              <!-- Editor Toolbar -->
              <div class="editor-toolbar" v-if="editor">
                <button @click="editor.chain().focus().toggleBold().run()" :class="{ active: editor.isActive('bold') }" class="toolbar-btn" title="Bold">
                  <strong>B</strong>
                </button>
                <button @click="editor.chain().focus().toggleItalic().run()" :class="{ active: editor.isActive('italic') }" class="toolbar-btn" title="Italic">
                  <em>I</em>
                </button>
                <button @click="editor.chain().focus().toggleStrike().run()" :class="{ active: editor.isActive('strike') }" class="toolbar-btn" title="Strikethrough">
                  <s>S</s>
                </button>

                <div class="toolbar-divider"></div>

                <button @click="editor.chain().focus().toggleHeading({ level: 2 }).run()" :class="{ active: editor.isActive('heading', { level: 2 }) }" class="toolbar-btn">
                  H2
                </button>
                <button @click="editor.chain().focus().toggleHeading({ level: 3 }).run()" :class="{ active: editor.isActive('heading', { level: 3 }) }" class="toolbar-btn">
                  H3
                </button>

                <div class="toolbar-divider"></div>

                <button @click="editor.chain().focus().toggleBulletList().run()" :class="{ active: editor.isActive('bulletList') }" class="toolbar-btn" title="Bullet List">
                  •
                </button>
                <button @click="editor.chain().focus().toggleOrderedList().run()" :class="{ active: editor.isActive('orderedList') }" class="toolbar-btn" title="Numbered List">
                  1.
                </button>

                <div class="toolbar-divider"></div>

                <button @click="setLink" :class="{ active: editor.isActive('link') }" class="toolbar-btn" title="Insert Link">
                  🔗
                </button>

                <button @click="editor.chain().focus().setTextAlign('left').run()" :class="{ active: editor.isActive({ textAlign: 'left' }) }" class="toolbar-btn" title="Align Left">
                  ⬅
                </button>
                <button @click="editor.chain().focus().setTextAlign('center').run()" :class="{ active: editor.isActive({ textAlign: 'center' }) }" class="toolbar-btn" title="Align Center">
                  ↔
                </button>
                <button @click="editor.chain().focus().setTextAlign('right').run()" :class="{ active: editor.isActive({ textAlign: 'right' }) }" class="toolbar-btn" title="Align Right">
                  ➡
                </button>
              </div>

              <!-- TipTap Editor -->
              <EditorContent :editor="editor" class="tiptap-editor" />
            </div>
          </div>
        </div>

        <!-- Preview Panel -->
        <div class="preview-panel" v-if="isCreating || isEditing">
          <h3 class="preview-title">Preview</h3>

          <!-- Variable Inserter -->
          <div class="variables-section">
            <h4 class="variables-title">Insert Variables</h4>
            <div class="variables-grid">
              <button
                v-for="variable in availableVariables"
                :key="variable.key"
                @click="insertVariable(variable)"
                class="variable-btn"
                :title="`Insert {{${variable.key}}}`"
              >
                {{ variable.label }}
              </button>
            </div>
          </div>

          <!-- Email Preview -->
          <div class="email-preview">
            <div class="email-preview-header">
              <strong>From:</strong> noreply@yourdomain.com<br />
              <strong>Subject:</strong> {{ formData.subject.replace(/\{\{(\w+)\}\}/g, (_, key) => previewData[key] || '') }}
            </div>
            <div class="email-preview-body" v-html="previewHtml"></div>
          </div>
        </div>

        <!-- Empty State -->
        <div class="empty-editor" v-if="!isCreating && !isEditing">
          <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class=" empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <h3>No Template Selected</h3>
          <p>Select a template from the list or create a new one</p>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div v-if="showDeleteModal" class="modal-overlay" @click="showDeleteModal = false">
        <div class="modal" @click.stop>
          <h3>Delete Template?</h3>
          <p>Are you sure you want to delete "<strong>{{ templateToDelete?.name }}</strong>"? This action cannot be undone.</p>
          <div class="modal-actions">
            <button @click="showDeleteModal = false" class="btn btn-secondary">Cancel</button>
            <button @click="deleteTemplate" class="btn btn-danger">Delete</button>
          </div>
        </div>
      </div>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.email-templates-page {
  padding: 2rem;
}

.page-header {
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

.content-wrapper {
  display: grid;
  grid-template-columns: 320px 1fr 350px;
  gap: 1.5rem;
  min-height: 600px;
}

/* Sidebar */
.sidebar {
  background: white;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.search-box {
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.search-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.category-tabs {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid #e5e7eb;
}

.category-tab {
  padding: 0.75rem 1rem;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  color: #6b7280;
  font-size: 0.875rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.category-tab:hover {
  background: #f9fafb;
}

.category-tab.active {
  background: #eef2ff;
  color: #4f46e5;
  font-weight: 600;
}

.count {
  background: #e5e7eb;
  color: #6b7280;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
}

.template-list {
  flex: 1;
  overflow-y: auto;
}

.template-item {
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
  cursor: pointer;
  transition: background 0.2s;
}

.template-item:hover {
  background: #f9fafb;
}

.template-item.active {
  background: #eef2ff;
  border-left: 3px solid #4f46e5;
}

.template-item-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 0.5rem;
}

.template-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.category-badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background: #e5e7eb;
  color: #6b7280;
  text-transform: uppercase;
}

.template-subject {
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0.25rem 0;
}

.template-description {
  font-size: 0.75rem;
  color: #9ca3af;
  margin: 0.25rem 0;
}

.template-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.action-btn {
  padding: 0.25rem;
  background: none;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  cursor: pointer;
  color: #6b7280;
}

.action-btn:hover {
  background: #f3f4f6;
}

.action-btn.danger:hover {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #dc2626;
}

/* Main Editor */
.main-editor {
  background: white;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  padding: 1.5rem;
  overflow-y: auto;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.editor-actions {
  display: flex;
  gap: 0.75rem;
}

.template-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.5rem;
}

.input {
  padding: 0.625rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.form-hint {
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

/* TipTap Editor */
.editor-toolbar {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem;
  background: #f9fafb;
  border: 1px solid #d1d5db;
  border-bottom: none;
  border-radius: 0.375rem 0.375rem 0 0;
}

.toolbar-btn {
  padding: 0.25rem 0.5rem;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: #374151;
}

.toolbar-btn:hover {
  background: #f3f4f6;
}

.toolbar-btn.active {
  background: #4f46e5;
  color: white;
  border-color: #4f46e5;
}

.toolbar-divider {
  width: 1px;
  background: #d1d5db;
  margin: 0 0.25rem;
}

.tiptap-editor {
  border: 1px solid #d1d5db;
  border-radius: 0 0 0.375rem 0.375rem;
  min-height: 300px;
  padding: 1rem;
  font-size: 0.875rem;
}

/* Preview Panel */
.preview-panel {
  background: white;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  padding: 1.5rem;
  overflow-y: auto;
}

.preview-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.variables-section {
  margin-bottom: 1.5rem;
}

.variables-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.75rem;
}

.variables-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.variable-btn {
  padding: 0.5rem;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.75rem;
  color: #4f46e5;
  font-weight: 500;
}

.variable-btn:hover {
  background: #eef2ff;
  border-color: #4f46e5;
}

.email-preview {
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  overflow: hidden;
}

.email-preview-header {
  background: #f9fafb;
  padding: 0.75rem;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.75rem;
  color: #6b7280;
  line-height: 1.5;
}

.email-preview-body {
  padding: 1rem;
  font-size: 0.875rem;
  line-height: 1.6;
}

/* Empty State */
.empty-editor {
  grid-column: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  color: #6b7280;
}

.empty-icon {
  width: 4rem;
  height: 4rem;
  color: #d1d5db;
  margin-bottom: 1rem;
}

/* Buttons */
.btn {
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary {
  background: #4f46e5;
  color: white;
}

.btn-primary:hover {
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

.btn-danger {
  background: #dc2626;
  color: white;
}

.btn-danger:hover {
  background: #b91c1c;
}

.icon {
  width: 1.25rem;
  height: 1.25rem;
}

.icon-sm {
  width: 1rem;
  height: 1rem;
}

/* Modal */
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
  padding: 2rem;
  border-radius: 0.5rem;
  max-width: 400px;
  width: 90%;
}

.modal h3 {
  margin-top: 0;
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.loading,
.empty-state {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}
</style>
