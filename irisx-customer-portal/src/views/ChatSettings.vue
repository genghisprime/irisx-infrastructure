<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <div class="bg-white shadow-sm border-b">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="py-6">
          <h1 class="text-2xl font-bold text-gray-900">Chat Widget Settings</h1>
          <p class="mt-1 text-sm text-gray-500">
            Customize and manage your live chat widgets
          </p>
        </div>
      </div>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p class="mt-4 text-sm text-gray-500">Loading widgets...</p>
      </div>

      <!-- Widgets List or Empty State -->
      <div v-else>
        <!-- Empty State -->
        <div v-if="widgets.length === 0" class="bg-white rounded-lg shadow-sm border p-12 text-center">
          <svg class="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <h3 class="mt-4 text-lg font-medium text-gray-900">No chat widgets yet</h3>
          <p class="mt-2 text-sm text-gray-500">Get started by creating your first chat widget</p>
          <button
            @click="showCreateModal = true"
            class="mt-6 px-6 py-3 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 transition-colors"
          >
            Create Widget
          </button>
        </div>

        <!-- Widgets Grid -->
        <div v-else>
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-lg font-semibold text-gray-900">Your Widgets</h2>
            <button
              @click="showCreateModal = true"
              class="px-4 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 transition-colors"
            >
              + Create Widget
            </button>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div
              v-for="widget in widgets"
              :key="widget.id"
              class="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center space-x-3">
                    <div
                      class="w-10 h-10 rounded-lg flex items-center justify-center"
                      :style="{ backgroundColor: widget.primary_color }"
                    >
                      <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <div>
                      <h3 class="text-lg font-semibold text-gray-900">{{ widget.name }}</h3>
                      <p class="text-sm text-gray-500">{{ widget.description || 'No description' }}</p>
                    </div>
                  </div>

                  <div class="mt-4 space-y-2">
                    <div class="flex items-center text-sm">
                      <span class="text-gray-500 w-24">Status:</span>
                      <span
                        :class="[
                          'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                          widget.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        ]"
                      >
                        {{ widget.is_active ? 'Active' : 'Inactive' }}
                      </span>
                    </div>
                    <div class="flex items-center text-sm">
                      <span class="text-gray-500 w-24">Position:</span>
                      <span class="text-gray-900 capitalize">{{ widget.widget_position }}</span>
                    </div>
                    <div class="flex items-center text-sm">
                      <span class="text-gray-500 w-24">Color:</span>
                      <div class="flex items-center space-x-2">
                        <div
                          class="w-4 h-4 rounded border border-gray-300"
                          :style="{ backgroundColor: widget.primary_color }"
                        ></div>
                        <span class="text-gray-900 font-mono text-xs">{{ widget.primary_color }}</span>
                      </div>
                    </div>
                  </div>

                  <div class="mt-4 pt-4 border-t">
                    <button
                      @click="selectedWidget = widget; showInstallModal = true"
                      class="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      📋 View Installation Code
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Widget Modal -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b">
          <h3 class="text-lg font-semibold text-gray-900">Create Chat Widget</h3>
        </div>

        <form @submit.prevent="createWidget" class="px-6 py-4 space-y-6">
          <!-- Name -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Widget Name *
            </label>
            <input
              v-model="form.name"
              type="text"
              required
              maxlength="100"
              class="w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Main Website Chat"
            />
          </div>

          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              v-model="form.description"
              rows="2"
              maxlength="500"
              class="w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Support widget for homepage"
            ></textarea>
          </div>

          <!-- Primary Color -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Primary Color
            </label>
            <div class="flex items-center space-x-4">
              <input
                v-model="form.primaryColor"
                type="color"
                class="h-10 w-20 rounded border border-gray-300 cursor-pointer"
              />
              <input
                v-model="form.primaryColor"
                type="text"
                pattern="^#[0-9A-Fa-f]{6}$"
                class="flex-1 rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                placeholder="#667eea"
              />
            </div>
          </div>

          <!-- Widget Position -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Widget Position
            </label>
            <select
              v-model="form.widgetPosition"
              class="w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="bottom-right">Bottom Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="top-right">Top Right</option>
              <option value="top-left">Top Left</option>
            </select>
          </div>

          <!-- Greeting Message -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Greeting Message
            </label>
            <textarea
              v-model="form.greetingMessage"
              rows="2"
              maxlength="500"
              class="w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Hi! How can we help you today?"
            ></textarea>
          </div>

          <!-- Actions -->
          <div class="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              @click="showCreateModal = false; resetForm()"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="creating"
              class="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {{ creating ? 'Creating...' : 'Create Widget' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Installation Code Modal -->
    <div
      v-if="showInstallModal && selectedWidget"
      class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">Installation Code</h3>
          <button
            @click="showInstallModal = false; selectedWidget = null"
            class="text-gray-400 hover:text-gray-500"
          >
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="px-6 py-4 space-y-6">
          <div>
            <h4 class="text-sm font-semibold text-gray-900 mb-2">Widget Key</h4>
            <div class="flex items-center space-x-2">
              <code class="flex-1 px-3 py-2 bg-gray-50 border rounded text-sm font-mono">
                {{ selectedWidget.widget_key }}
              </code>
              <button
                @click="copyToClipboard(selectedWidget.widget_key)"
                class="px-3 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Copy
              </button>
            </div>
          </div>

          <div>
            <h4 class="text-sm font-semibold text-gray-900 mb-2">Installation Instructions</h4>
            <p class="text-sm text-gray-600 mb-4">
              Add this code snippet just before the closing <code>&lt;/body&gt;</code> tag on your website:
            </p>
            <div class="relative">
              <pre class="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs"><code>{{ getInstallationCode(selectedWidget.widget_key) }}</code></pre>
              <button
                @click="copyToClipboard(getInstallationCode(selectedWidget.widget_key))"
                class="absolute top-2 right-2 px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700"
              >
                Copy Code
              </button>
            </div>
          </div>

          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div class="flex">
              <div class="flex-shrink-0">
                <svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                </svg>
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-blue-800">Quick Start</h3>
                <div class="mt-2 text-sm text-blue-700">
                  <p>The widget will automatically appear on your website. Visitors can click the chat button to start a conversation with your team.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="px-6 py-4 border-t bg-gray-50">
          <button
            @click="showInstallModal = false; selectedWidget = null"
            class="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// State
const loading = ref(false);
const creating = ref(false);
const widgets = ref([]);
const showCreateModal = ref(false);
const showInstallModal = ref(false);
const selectedWidget = ref(null);

const form = ref({
  name: '',
  description: '',
  primaryColor: '#667eea',
  widgetPosition: 'bottom-right',
  greetingMessage: 'Hi! How can we help you today?'
});

// Get auth token
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = '/login';
}

// Load widgets
async function loadWidgets() {
  loading.value = true;
  try {
    // In production, add a GET /v1/chat/widgets endpoint
    // For now, we'll show a placeholder or handle gracefully
    // const response = await axios.get(`${API_URL}/v1/chat/widgets`, {
    //   headers: { 'Authorization': `Bearer ${token}` }
    // });
    // widgets.value = response.data.data;

    widgets.value = []; // Placeholder until GET endpoint is added
  } catch (error) {
    console.error('Error loading widgets:', error);
  } finally {
    loading.value = false;
  }
}

// Create widget
async function createWidget() {
  creating.value = true;
  try {
    const response = await axios.post(
      `${API_URL}/v1/chat/widgets`,
      {
        name: form.value.name,
        description: form.value.description,
        primaryColor: form.value.primaryColor,
        widgetPosition: form.value.widgetPosition,
        greetingMessage: form.value.greetingMessage
      },
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    widgets.value.push(response.data.data);
    showCreateModal.value = false;
    resetForm();

    // Show success message
    alert('Widget created successfully!');
  } catch (error) {
    console.error('Error creating widget:', error);
    alert('Failed to create widget. Please try again.');
  } finally {
    creating.value = false;
  }
}

// Reset form
function resetForm() {
  form.value = {
    name: '',
    description: '',
    primaryColor: '#667eea',
    widgetPosition: 'bottom-right',
    greetingMessage: 'Hi! How can we help you today?'
  };
}

// Get installation code
function getInstallationCode(widgetKey) {
  return `<!-- Tazzi Live Chat Widget -->
<script>
(function() {
  var WIDGET_KEY = '${widgetKey}';
  var API_URL = '${API_URL}/v1/chat';

  var script = document.createElement('script');
  script.src = 'https://cdn.tazzi.com/chat-widget.js';
  script.async = true;
  script.onload = function() {
    TazziChat.init({
      widgetKey: WIDGET_KEY,
      apiUrl: API_URL
    });
  };
  document.body.appendChild(script);
})();
</script>`;
}

// Copy to clipboard
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  } catch (error) {
    console.error('Failed to copy:', error);
    alert('Failed to copy. Please copy manually.');
  }
}

// Lifecycle
onMounted(() => {
  loadWidgets();
});
</script>
