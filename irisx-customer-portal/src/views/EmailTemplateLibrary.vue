<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Email Template Library</h1>
        <p class="text-sm text-gray-600 mt-1">Create and manage email templates with dynamic variables</p>
      </div>
      <button
        @click="showCreateModal = true"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        + Create Template
      </button>
    </div>

    <!-- Category Filter -->
    <div class="mb-6 flex space-x-2">
      <button
        v-for="category in categories"
        :key="category"
        @click="selectedCategory = category"
        :class="selectedCategory === category
          ? 'bg-blue-600 text-white'
          : 'bg-white text-gray-700 hover:bg-gray-50'"
        class="px-4 py-2 border rounded-md"
      >
        {{ category }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <svg style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; max-width: 24px; max-height: 24px;" class=" animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <!-- Templates Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="template in filteredTemplates"
        :key="template.id"
        class="bg-white rounded-lg shadow p-4 hover:shadow-lg transition-shadow cursor-pointer"
      >
        <div class="flex items-start justify-between mb-3">
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-900">{{ template.name }}</h3>
            <span class="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded mt-1">
              {{ template.category }}
            </span>
          </div>
        </div>

        <p class="text-sm text-gray-600 mb-4 line-clamp-2">{{ template.subject }}</p>

        <div class="text-xs text-gray-500 mb-4">
          Last updated: {{ formatDate(template.updated_at) }}
        </div>

        <div class="flex space-x-2">
          <button
            @click="previewTemplate(template)"
            class="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Preview
          </button>
          <button
            @click="editTemplate(template)"
            class="flex-1 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
          >
            Edit
          </button>
          <button
            @click="testTemplate(template)"
            class="px-3 py-2 text-sm text-green-600 hover:text-green-800"
          >
            Test
          </button>
          <button
            @click="deleteTemplate(template)"
            class="px-3 py-2 text-sm text-red-600 hover:text-red-800"
          >
            Delete
          </button>
        </div>
      </div>

      <div v-if="filteredTemplates.length === 0" class="col-span-full bg-white rounded-lg shadow p-12 text-center">
        <p class="text-gray-500 mb-4">No templates found in this category</p>
        <button
          @click="showCreateModal = true"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Create First Template
        </button>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div
      v-if="showCreateModal || editingTemplate"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click="closeModal"
    >
      <div class="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto" @click.stop>
        <h3 class="text-lg font-semibold mb-4">{{ editingTemplate ? 'Edit Template' : 'Create Template' }}</h3>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Template Name</label>
              <input
                v-model="templateForm.name"
                type="text"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Welcome Email"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Category</label>
              <select
                v-model="templateForm.category"
                class="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="Welcome">Welcome</option>
                <option value="Invoice">Invoice</option>
                <option value="Password Reset">Password Reset</option>
                <option value="Notification">Notification</option>
                <option value="Marketing">Marketing</option>
                <option value="Support">Support</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Subject Line</label>
            <input
              v-model="templateForm.subject"
              type="text"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Welcome to {{companyName}}!"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">HTML Content</label>
            <div class="mb-2 flex flex-wrap gap-2">
              <button
                v-for="variable in availableVariables"
                :key="variable.key"
                type="button"
                @click="insertVariable(variable.key, 'html')"
                class="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                {{ variable.label }}
              </button>
            </div>
            <textarea
              ref="htmlTextarea"
              v-model="templateForm.html_content"
              rows="10"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
              placeholder="<h1>Hello {{firstName}}!</h1>"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Plain Text Content</label>
            <div class="mb-2 flex flex-wrap gap-2">
              <button
                v-for="variable in availableVariables"
                :key="variable.key"
                type="button"
                @click="insertVariable(variable.key, 'text')"
                class="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                {{ variable.label }}
              </button>
            </div>
            <textarea
              ref="textTextarea"
              v-model="templateForm.text_content"
              rows="6"
              class="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
              placeholder="Hello {{firstName}}!"
            ></textarea>
          </div>

          <div class="bg-blue-50 p-4 rounded-md">
            <h4 class="text-sm font-semibold text-blue-900 mb-2">Available Variables</h4>
            <div class="grid grid-cols-2 gap-2 text-xs text-blue-800">
              <div v-for="variable in availableVariables" :key="variable.key">
                <code class="bg-white px-2 py-1 rounded">{{ variable.label }}</code>
                - {{ variable.description }}
              </div>
            </div>
          </div>

          <div class="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              @click="closeModal"
              class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="showPreview = true"
              class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Preview
            </button>
            <button
              type="submit"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              {{ editingTemplate ? 'Update' : 'Create' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Preview Modal -->
    <div
      v-if="showPreview"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click="showPreview = false"
    >
      <div class="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto" @click.stop>
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">Template Preview</h3>
          <button @click="showPreview = false" class="text-gray-500 hover:text-gray-700">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Subject</label>
            <div class="px-3 py-2 bg-gray-50 rounded-md">{{ renderPreview(templateForm.subject) }}</div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">HTML Preview</label>
            <div
              class="border rounded-md p-4 bg-white min-h-[200px]"
              v-html="renderPreview(templateForm.html_content)"
            ></div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Plain Text Preview</label>
            <div class="px-3 py-2 bg-gray-50 rounded-md whitespace-pre-wrap font-mono text-sm">
              {{ renderPreview(templateForm.text_content) }}
            </div>
          </div>
        </div>

        <div class="flex justify-end pt-4 border-t mt-4">
          <button
            @click="showPreview = false"
            class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Test Email Modal -->
    <div
      v-if="testingTemplate"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click="closeTestModal"
    >
      <div class="bg-white rounded-lg p-6 max-w-md w-full" @click.stop>
        <h3 class="text-lg font-semibold mb-4">Send Test Email</h3>

        <form @submit.prevent="sendTestEmail" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Send To</label>
            <input
              v-model="testEmailAddress"
              type="email"
              required
              class="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="test@example.com"
            />
          </div>

          <div class="bg-yellow-50 p-3 rounded-md text-sm text-yellow-800">
            This will send a test email with sample data to the specified address.
          </div>

          <div class="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              @click="closeTestModal"
              class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Send Test
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiClient } from '../utils/api'

const loading = ref(true)
const templates = ref([])
const showCreateModal = ref(false)
const editingTemplate = ref(null)
const showPreview = ref(false)
const testingTemplate = ref(null)
const testEmailAddress = ref('')
const selectedCategory = ref('All')
const htmlTextarea = ref(null)
const textTextarea = ref(null)

const categories = ['All', 'Welcome', 'Invoice', 'Password Reset', 'Notification', 'Marketing', 'Support']

const templateForm = ref({
  name: '',
  category: 'Welcome',
  subject: '',
  html_content: '',
  text_content: ''
})

const availableVariables = [
  { key: 'firstName', label: '{{firstName}}', description: 'Customer first name' },
  { key: 'lastName', label: '{{lastName}}', description: 'Customer last name' },
  { key: 'email', label: '{{email}}', description: 'Customer email' },
  { key: 'companyName', label: '{{companyName}}', description: 'Your company name' },
  { key: 'supportEmail', label: '{{supportEmail}}', description: 'Support email address' },
  { key: 'phoneNumber', label: '{{phoneNumber}}', description: 'Customer phone' },
  { key: 'accountNumber', label: '{{accountNumber}}', description: 'Account number' },
  { key: 'invoiceAmount', label: '{{invoiceAmount}}', description: 'Invoice amount' },
  { key: 'dueDate', label: '{{dueDate}}', description: 'Payment due date' },
  { key: 'resetLink', label: '{{resetLink}}', description: 'Password reset link' }
]

const sampleData = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  companyName: 'Tazzi Communications',
  supportEmail: 'support@irisx.com',
  phoneNumber: '+1-555-123-4567',
  accountNumber: 'ACC-12345',
  invoiceAmount: '$299.00',
  dueDate: 'December 15, 2025',
  resetLink: 'https://app.irisx.com/reset-password?token=abc123'
}

const filteredTemplates = computed(() => {
  if (selectedCategory.value === 'All') {
    return templates.value
  }
  return templates.value.filter(t => t.category === selectedCategory.value)
})

onMounted(() => {
  fetchTemplates()
})

async function fetchTemplates() {
  loading.value = true
  try {
    const response = await apiClient.get('/v1/email/templates')
    templates.value = response.data.templates || []
  } catch (error) {
    console.error('Failed to fetch templates:', error)
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  try {
    if (editingTemplate.value) {
      await apiClient.patch(`/v1/email/templates/${editingTemplate.value.id}`, templateForm.value)
    } else {
      await apiClient.post('/v1/email/templates', templateForm.value)
    }
    closeModal()
    await fetchTemplates()
  } catch (error) {
    console.error('Failed to save template:', error)
    alert('Failed to save template')
  }
}

function editTemplate(template) {
  editingTemplate.value = template
  templateForm.value = { ...template }
}

function previewTemplate(template) {
  templateForm.value = { ...template }
  showPreview.value = true
}

function testTemplate(template) {
  testingTemplate.value = template
  testEmailAddress.value = ''
}

async function sendTestEmail() {
  try {
    await apiClient.post(`/v1/email/templates/${testingTemplate.value.id}/test`, {
      to: testEmailAddress.value
    })
    alert('Test email sent successfully!')
    closeTestModal()
  } catch (error) {
    console.error('Failed to send test email:', error)
    alert('Failed to send test email')
  }
}

async function deleteTemplate(template) {
  if (!confirm(`Delete template "${template.name}"?`)) return
  try {
    await apiClient.delete(`/v1/email/templates/${template.id}`)
    await fetchTemplates()
  } catch (error) {
    alert('Failed to delete template')
  }
}

function insertVariable(key, field) {
  const textarea = field === 'html' ? htmlTextarea.value : textTextarea.value
  if (!textarea) return

  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const text = templateForm.value[field === 'html' ? 'html_content' : 'text_content']
  const before = text.substring(0, start)
  const after = text.substring(end)
  const variable = `{{${key}}}`

  if (field === 'html') {
    templateForm.value.html_content = before + variable + after
  } else {
    templateForm.value.text_content = before + variable + after
  }

  // Set cursor position after inserted variable
  setTimeout(() => {
    textarea.focus()
    textarea.setSelectionRange(start + variable.length, start + variable.length)
  }, 0)
}

function renderPreview(content) {
  if (!content) return ''
  let rendered = content
  for (const [key, value] of Object.entries(sampleData)) {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  return rendered
}

function closeModal() {
  showCreateModal.value = false
  editingTemplate.value = null
  showPreview.value = false
  templateForm.value = { name: '', category: 'Welcome', subject: '', html_content: '', text_content: '' }
}

function closeTestModal() {
  testingTemplate.value = null
  testEmailAddress.value = ''
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString()
}
</script>
