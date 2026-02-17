<template>
  <div class="min-h-screen bg-zinc-900 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">Agent Scripts</h1>
        <p class="text-zinc-400 mt-1">Create guided call scripts and workflows for agents</p>
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
        <button
          @click="showCreateModal = true"
          class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create Script
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <p class="text-zinc-400 text-sm">Total Scripts</p>
        <p class="text-2xl font-bold text-white">{{ scripts.length }}</p>
      </div>
      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <p class="text-zinc-400 text-sm">Active Scripts</p>
        <p class="text-2xl font-bold text-emerald-400">{{ scripts.filter(s => s.is_active).length }}</p>
      </div>
      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <p class="text-zinc-400 text-sm">Campaign Linked</p>
        <p class="text-2xl font-bold text-violet-400">{{ scripts.filter(s => s.campaign_id).length }}</p>
      </div>
      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <p class="text-zinc-400 text-sm">Queue Linked</p>
        <p class="text-2xl font-bold text-blue-400">{{ scripts.filter(s => s.queue_id).length }}</p>
      </div>
    </div>

    <!-- Scripts List -->
    <div class="bg-zinc-800 rounded-lg border border-zinc-700">
      <div class="p-4 border-b border-zinc-700">
        <h3 class="text-lg font-medium text-white">Your Scripts</h3>
      </div>

      <div v-if="scripts.length === 0" class="text-center py-12">
        <svg class="w-12 h-12 text-zinc-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p class="text-zinc-400 mb-4">No agent scripts yet</p>
        <button
          @click="showCreateModal = true"
          class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
        >
          Create Your First Script
        </button>
      </div>

      <div v-else class="divide-y divide-zinc-700">
        <div
          v-for="script in scripts"
          :key="script.id"
          class="p-4 hover:bg-zinc-700/30"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-lg flex items-center justify-center"
                   :class="script.is_default ? 'bg-violet-500/20' : 'bg-zinc-700'">
                <svg class="w-5 h-5" :class="script.is_default ? 'text-violet-400' : 'text-zinc-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h4 class="text-white font-medium">{{ script.name }}</h4>
                  <span v-if="script.is_default" class="px-2 py-0.5 bg-violet-500/20 text-violet-400 rounded text-xs">Default</span>
                </div>
                <div class="flex items-center gap-3 mt-1 text-sm text-zinc-400">
                  <span>{{ script.steps?.length || 0 }} steps</span>
                  <span v-if="script.campaign_name" class="text-zinc-600">•</span>
                  <span v-if="script.campaign_name">Campaign: {{ script.campaign_name }}</span>
                  <span v-if="script.queue_name" class="text-zinc-600">•</span>
                  <span v-if="script.queue_name">Queue: {{ script.queue_name }}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <button
                @click="previewScript(script)"
                class="px-3 py-1.5 text-sm text-zinc-400 border border-zinc-600 rounded-lg hover:bg-zinc-700"
              >
                Preview
              </button>
              <button
                @click="editScript(script)"
                class="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-700"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                @click="duplicateScript(script)"
                class="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-700"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                @click="deleteScript(script.id)"
                class="p-2 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-zinc-700"
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

    <!-- Create/Edit Modal -->
    <div
      v-if="showCreateModal || editingScript"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-8"
      @click.self="closeModal"
    >
      <div class="bg-zinc-800 rounded-lg p-6 w-full max-w-4xl mx-4">
        <h3 class="text-lg font-medium text-white mb-4">
          {{ editingScript ? 'Edit Script' : 'Create Agent Script' }}
        </h3>

        <div class="space-y-4 max-h-[70vh] overflow-y-auto">
          <!-- Basic Info -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-zinc-400 mb-1">Script Name</label>
              <input
                v-model="formData.name"
                type="text"
                placeholder="Sales Call Script"
                class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
              />
            </div>
            <div>
              <label class="block text-sm text-zinc-400 mb-1">Script Type</label>
              <select
                v-model="formData.script_type"
                class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
              >
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
                <option value="universal">Universal</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Description</label>
            <textarea
              v-model="formData.description"
              rows="2"
              placeholder="Brief description of when to use this script..."
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            ></textarea>
          </div>

          <div class="flex items-center gap-4">
            <label class="flex items-center gap-2">
              <input v-model="formData.is_default" type="checkbox" class="w-4 h-4 rounded" />
              <span class="text-sm text-zinc-400">Set as default script</span>
            </label>
          </div>

          <!-- Script Steps -->
          <div class="bg-zinc-900 rounded-lg p-4">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-white font-medium">Script Steps</h4>
              <button
                @click="addStep"
                class="px-3 py-1 bg-violet-600 text-white rounded text-sm hover:bg-violet-700"
              >
                Add Step
              </button>
            </div>

            <div v-if="formData.steps.length === 0" class="text-center py-8 text-zinc-500">
              No steps yet. Add your first step above.
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="(step, index) in formData.steps"
                :key="index"
                class="bg-zinc-800 rounded-lg p-4 border border-zinc-700"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1 space-y-3">
                    <div class="flex items-center gap-3">
                      <span class="w-6 h-6 bg-violet-500/20 text-violet-400 rounded flex items-center justify-center text-sm">
                        {{ index + 1 }}
                      </span>
                      <select
                        v-model="step.type"
                        class="px-3 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-white text-sm"
                      >
                        <option value="greeting">Greeting</option>
                        <option value="question">Question</option>
                        <option value="information">Information</option>
                        <option value="action">Action Required</option>
                        <option value="objection">Objection Handler</option>
                        <option value="closing">Closing</option>
                      </select>
                      <input
                        v-model="step.title"
                        type="text"
                        placeholder="Step Title"
                        class="flex-1 px-3 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-white text-sm"
                      />
                    </div>

                    <textarea
                      v-model="step.content"
                      rows="3"
                      placeholder="Script content for this step..."
                      class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm"
                    ></textarea>

                    <!-- Response Options (for questions) -->
                    <div v-if="step.type === 'question'" class="space-y-2">
                      <p class="text-xs text-zinc-500">Response Options:</p>
                      <div class="flex flex-wrap gap-2">
                        <span
                          v-for="(option, optIndex) in step.options || []"
                          :key="optIndex"
                          class="px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-xs flex items-center gap-1"
                        >
                          {{ option }}
                          <button @click="removeOption(step, optIndex)" class="text-zinc-500 hover:text-red-400">×</button>
                        </span>
                        <input
                          @keydown.enter.prevent="addOption(step, $event)"
                          type="text"
                          placeholder="Add option..."
                          class="px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-white text-xs w-24"
                        />
                      </div>
                    </div>
                  </div>

                  <div class="flex flex-col gap-1">
                    <button
                      @click="moveStep(index, -1)"
                      :disabled="index === 0"
                      class="p-1 text-zinc-400 hover:text-white disabled:opacity-30"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      @click="moveStep(index, 1)"
                      :disabled="index === formData.steps.length - 1"
                      class="p-1 text-zinc-400 hover:text-white disabled:opacity-30"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      @click="removeStep(index)"
                      class="p-1 text-zinc-400 hover:text-red-400"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button
            @click="closeModal"
            class="px-4 py-2 text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            @click="saveScript"
            :disabled="!formData.name"
            class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            {{ editingScript ? 'Save Changes' : 'Create Script' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Preview Modal -->
    <div
      v-if="previewingScript"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="previewingScript = null"
    >
      <div class="bg-zinc-800 rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-medium text-white">{{ previewingScript.name }}</h3>
          <button @click="previewingScript = null" class="text-zinc-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="space-y-4">
          <div
            v-for="(step, index) in previewingScript.steps"
            :key="index"
            class="bg-zinc-900 rounded-lg p-4"
          >
            <div class="flex items-center gap-3 mb-2">
              <span class="w-6 h-6 bg-violet-500/20 text-violet-400 rounded flex items-center justify-center text-sm">
                {{ index + 1 }}
              </span>
              <span
                :class="[
                  'px-2 py-0.5 rounded text-xs',
                  step.type === 'greeting' ? 'bg-emerald-500/20 text-emerald-400' :
                  step.type === 'question' ? 'bg-blue-500/20 text-blue-400' :
                  step.type === 'action' ? 'bg-amber-500/20 text-amber-400' :
                  step.type === 'objection' ? 'bg-red-500/20 text-red-400' :
                  step.type === 'closing' ? 'bg-violet-500/20 text-violet-400' :
                  'bg-zinc-700 text-zinc-400'
                ]"
              >
                {{ step.type }}
              </span>
              <span class="text-white font-medium">{{ step.title }}</span>
            </div>
            <p class="text-zinc-300 whitespace-pre-wrap">{{ step.content }}</p>
            <div v-if="step.options?.length" class="mt-3 flex flex-wrap gap-2">
              <span
                v-for="(option, optIndex) in step.options"
                :key="optIndex"
                class="px-3 py-1 bg-zinc-700 text-zinc-300 rounded-full text-sm"
              >
                {{ option }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const API_URL = import.meta.env.VITE_API_URL || '';

const loading = ref(false);
const scripts = ref([]);
const showCreateModal = ref(false);
const editingScript = ref(null);
const previewingScript = ref(null);

const defaultFormData = {
  name: '',
  description: '',
  script_type: 'universal',
  is_default: false,
  steps: []
};

const formData = ref({ ...defaultFormData, steps: [] });

async function fetchScripts() {
  try {
    const response = await fetch(`${API_URL}/scripts`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      scripts.value = data.data;
    }
  } catch (error) {
    console.error('Failed to fetch scripts:', error);
  }
}

function previewScript(script) {
  previewingScript.value = script;
}

function editScript(script) {
  editingScript.value = script;
  formData.value = {
    name: script.name,
    description: script.description || '',
    script_type: script.script_type || 'universal',
    is_default: script.is_default || false,
    steps: JSON.parse(JSON.stringify(script.steps || []))
  };
}

function duplicateScript(script) {
  formData.value = {
    name: `${script.name} (Copy)`,
    description: script.description || '',
    script_type: script.script_type || 'universal',
    is_default: false,
    steps: JSON.parse(JSON.stringify(script.steps || []))
  };
  showCreateModal.value = true;
}

function closeModal() {
  showCreateModal.value = false;
  editingScript.value = null;
  formData.value = { ...defaultFormData, steps: [] };
}

function addStep() {
  formData.value.steps.push({
    type: 'information',
    title: '',
    content: '',
    options: []
  });
}

function removeStep(index) {
  formData.value.steps.splice(index, 1);
}

function moveStep(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= formData.value.steps.length) return;
  const steps = formData.value.steps;
  [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];
}

function addOption(step, event) {
  const value = event.target.value.trim();
  if (value) {
    if (!step.options) step.options = [];
    step.options.push(value);
    event.target.value = '';
  }
}

function removeOption(step, optIndex) {
  step.options.splice(optIndex, 1);
}

async function saveScript() {
  try {
    const url = editingScript.value
      ? `${API_URL}/scripts/${editingScript.value.id}`
      : `${API_URL}/scripts`;

    const response = await fetch(url, {
      method: editingScript.value ? 'PUT' : 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData.value)
    });

    const data = await response.json();
    if (data.success || data.id) {
      closeModal();
      fetchScripts();
    } else {
      alert(data.error || 'Failed to save script');
    }
  } catch (error) {
    console.error('Failed to save script:', error);
    alert('Failed to save script');
  }
}

async function deleteScript(scriptId) {
  if (!confirm('Are you sure you want to delete this script?')) return;

  try {
    const response = await fetch(`${API_URL}/scripts/${scriptId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });

    const data = await response.json();
    if (data.success) {
      fetchScripts();
    }
  } catch (error) {
    console.error('Failed to delete script:', error);
  }
}

async function refreshData() {
  loading.value = true;
  await fetchScripts();
  loading.value = false;
}

onMounted(() => {
  refreshData();
});
</script>
