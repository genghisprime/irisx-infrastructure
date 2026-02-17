<template>
  <div class="min-h-screen bg-zinc-900 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">Answering Machine Detection</h1>
        <p class="text-zinc-400 mt-1">Configure AMD settings for outbound campaigns</p>
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
          Create Configuration
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <p class="text-zinc-400 text-sm">Configurations</p>
        <p class="text-2xl font-bold text-white">{{ configurations.length }}</p>
      </div>
      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <p class="text-zinc-400 text-sm">Detections Today</p>
        <p class="text-2xl font-bold text-emerald-400">{{ stats.detectionsToday || 0 }}</p>
      </div>
      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <p class="text-zinc-400 text-sm">Human Rate</p>
        <p class="text-2xl font-bold text-blue-400">{{ stats.humanRate || 0 }}%</p>
      </div>
      <div class="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
        <p class="text-zinc-400 text-sm">Accuracy</p>
        <p class="text-2xl font-bold text-violet-400">{{ stats.accuracy || 0 }}%</p>
      </div>
    </div>

    <!-- Configurations List -->
    <div class="bg-zinc-800 rounded-lg border border-zinc-700">
      <div class="p-4 border-b border-zinc-700">
        <h3 class="text-lg font-medium text-white">AMD Configurations</h3>
      </div>

      <div v-if="configurations.length === 0" class="text-center py-12">
        <svg class="w-12 h-12 text-zinc-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p class="text-zinc-400 mb-4">No AMD configurations yet</p>
        <button
          @click="showCreateModal = true"
          class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
        >
          Create Your First Configuration
        </button>
      </div>

      <div v-else class="divide-y divide-zinc-700">
        <div
          v-for="config in configurations"
          :key="config.id"
          class="p-4 hover:bg-zinc-700/30"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-lg flex items-center justify-center"
                   :class="config.enabled ? 'bg-emerald-500/20' : 'bg-zinc-700'">
                <svg class="w-5 h-5" :class="config.enabled ? 'text-emerald-400' : 'text-zinc-500'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h4 class="text-white font-medium">{{ config.name }}</h4>
                <div class="flex items-center gap-3 mt-1 text-sm text-zinc-400">
                  <span>Mode: {{ config.detection_mode }}</span>
                  <span class="text-zinc-600">•</span>
                  <span>Human: {{ config.human_action }}</span>
                  <span class="text-zinc-600">•</span>
                  <span>Machine: {{ config.machine_action }}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span
                :class="[
                  'px-2 py-1 rounded text-xs',
                  config.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-400'
                ]"
              >
                {{ config.enabled ? 'Enabled' : 'Disabled' }}
              </span>
              <button
                @click="editConfig(config)"
                class="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-700"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                @click="deleteConfig(config.id)"
                class="p-2 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-zinc-700"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Expanded Details -->
          <div class="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div class="bg-zinc-900 rounded-lg p-3">
              <p class="text-zinc-500 text-xs mb-1">Detection Settings</p>
              <p class="text-zinc-300">Initial Silence: {{ config.initial_silence_ms }}ms</p>
              <p class="text-zinc-300">Max Greeting: {{ config.greeting_max_ms }}ms</p>
              <p class="text-zinc-300">Total Analysis: {{ config.total_analysis_ms }}ms</p>
            </div>
            <div class="bg-zinc-900 rounded-lg p-3">
              <p class="text-zinc-500 text-xs mb-1">Actions</p>
              <p class="text-zinc-300">Human: {{ config.human_action }}</p>
              <p class="text-zinc-300">Machine: {{ config.machine_action }}</p>
              <p class="text-zinc-300">Uncertain: {{ config.uncertain_action }}</p>
            </div>
            <div class="bg-zinc-900 rounded-lg p-3">
              <p class="text-zinc-500 text-xs mb-1">Adaptive Learning</p>
              <p class="text-zinc-300">{{ config.adaptive_enabled ? 'Enabled' : 'Disabled' }}</p>
              <p v-if="config.adaptive_enabled" class="text-zinc-300">Rate: {{ config.learning_rate }}</p>
              <p v-if="config.adaptive_enabled" class="text-zinc-300">Min Samples: {{ config.min_samples_for_adaptation }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div
      v-if="showCreateModal || editingConfig"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-8"
      @click.self="closeModal"
    >
      <div class="bg-zinc-800 rounded-lg p-6 w-full max-w-2xl mx-4">
        <h3 class="text-lg font-medium text-white mb-4">
          {{ editingConfig ? 'Edit Configuration' : 'Create AMD Configuration' }}
        </h3>

        <div class="space-y-4 max-h-[70vh] overflow-y-auto">
          <!-- Basic Info -->
          <div>
            <label class="block text-sm text-zinc-400 mb-1">Configuration Name</label>
            <input
              v-model="formData.name"
              type="text"
              placeholder="Default AMD Config"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            />
          </div>

          <div class="flex items-center gap-2">
            <input
              v-model="formData.enabled"
              type="checkbox"
              id="enabled"
              class="w-4 h-4 rounded"
            />
            <label for="enabled" class="text-sm text-zinc-400">Enabled</label>
          </div>

          <div>
            <label class="block text-sm text-zinc-400 mb-1">Detection Mode</label>
            <select
              v-model="formData.detection_mode"
              class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
            >
              <option value="sync">Synchronous (Wait for result)</option>
              <option value="async">Asynchronous (Background)</option>
            </select>
          </div>

          <!-- Detection Timings -->
          <div class="bg-zinc-900 rounded-lg p-4">
            <h4 class="text-white font-medium mb-3">Detection Timings</h4>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-zinc-400 mb-1">Initial Silence (ms)</label>
                <input
                  v-model.number="formData.initial_silence_ms"
                  type="number"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                />
              </div>
              <div>
                <label class="block text-sm text-zinc-400 mb-1">Max Greeting (ms)</label>
                <input
                  v-model.number="formData.greeting_max_ms"
                  type="number"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                />
              </div>
              <div>
                <label class="block text-sm text-zinc-400 mb-1">After Greeting Silence (ms)</label>
                <input
                  v-model.number="formData.after_greeting_silence_ms"
                  type="number"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                />
              </div>
              <div>
                <label class="block text-sm text-zinc-400 mb-1">Total Analysis Time (ms)</label>
                <input
                  v-model.number="formData.total_analysis_ms"
                  type="number"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                />
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="bg-zinc-900 rounded-lg p-4">
            <h4 class="text-white font-medium mb-3">Actions</h4>
            <div class="grid grid-cols-3 gap-4">
              <div>
                <label class="block text-sm text-zinc-400 mb-1">Human Detected</label>
                <select
                  v-model="formData.human_action"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                >
                  <option value="connect">Connect to Agent</option>
                  <option value="transfer">Transfer</option>
                  <option value="ivr">Send to IVR</option>
                </select>
              </div>
              <div>
                <label class="block text-sm text-zinc-400 mb-1">Machine Detected</label>
                <select
                  v-model="formData.machine_action"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                >
                  <option value="hangup">Hang Up</option>
                  <option value="voicemail">Leave Voicemail</option>
                  <option value="callback">Schedule Callback</option>
                </select>
              </div>
              <div>
                <label class="block text-sm text-zinc-400 mb-1">Uncertain Result</label>
                <select
                  v-model="formData.uncertain_action"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                >
                  <option value="connect">Connect to Agent</option>
                  <option value="hangup">Hang Up</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Beep Detection -->
          <div class="bg-zinc-900 rounded-lg p-4">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-white font-medium">Beep Detection</h4>
              <input
                v-model="formData.beep_detection_enabled"
                type="checkbox"
                class="w-4 h-4 rounded"
              />
            </div>
            <div v-if="formData.beep_detection_enabled" class="grid grid-cols-3 gap-4">
              <div>
                <label class="block text-sm text-zinc-400 mb-1">Min Frequency (Hz)</label>
                <input
                  v-model.number="formData.beep_frequency_min"
                  type="number"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                />
              </div>
              <div>
                <label class="block text-sm text-zinc-400 mb-1">Max Frequency (Hz)</label>
                <input
                  v-model.number="formData.beep_frequency_max"
                  type="number"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                />
              </div>
              <div>
                <label class="block text-sm text-zinc-400 mb-1">Min Duration (ms)</label>
                <input
                  v-model.number="formData.beep_duration_min_ms"
                  type="number"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                />
              </div>
            </div>
          </div>

          <!-- Adaptive Learning -->
          <div class="bg-zinc-900 rounded-lg p-4">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-white font-medium">Adaptive Learning</h4>
              <input
                v-model="formData.adaptive_enabled"
                type="checkbox"
                class="w-4 h-4 rounded"
              />
            </div>
            <p class="text-zinc-500 text-sm mb-3">Automatically adjust detection parameters based on verified results.</p>
            <div v-if="formData.adaptive_enabled" class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-zinc-400 mb-1">Learning Rate</label>
                <input
                  v-model.number="formData.learning_rate"
                  type="number"
                  step="0.01"
                  min="0.001"
                  max="0.5"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                />
              </div>
              <div>
                <label class="block text-sm text-zinc-400 mb-1">Min Samples for Adaptation</label>
                <input
                  v-model.number="formData.min_samples_for_adaptation"
                  type="number"
                  min="10"
                  class="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white"
                />
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
            @click="saveConfig"
            :disabled="!formData.name"
            class="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
          >
            {{ editingConfig ? 'Save Changes' : 'Create Configuration' }}
          </button>
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
const configurations = ref([]);
const stats = ref({});
const showCreateModal = ref(false);
const editingConfig = ref(null);

const defaultFormData = {
  name: '',
  enabled: true,
  detection_mode: 'sync',
  initial_silence_ms: 2500,
  greeting_max_ms: 1500,
  after_greeting_silence_ms: 800,
  total_analysis_ms: 5000,
  min_word_length_ms: 100,
  between_words_silence_ms: 50,
  max_number_of_words: 5,
  machine_greeting_min_ms: 1500,
  beep_detection_enabled: true,
  beep_frequency_min: 350,
  beep_frequency_max: 950,
  beep_duration_min_ms: 200,
  human_action: 'connect',
  machine_action: 'hangup',
  uncertain_action: 'connect',
  adaptive_enabled: false,
  learning_rate: 0.1,
  min_samples_for_adaptation: 50
};

const formData = ref({ ...defaultFormData });

async function fetchConfigurations() {
  try {
    const response = await fetch(`${API_URL}/amd/configurations`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      configurations.value = data.configurations;
    }
  } catch (error) {
    console.error('Failed to fetch configurations:', error);
  }
}

async function fetchStats() {
  try {
    const response = await fetch(`${API_URL}/amd/stats`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });
    const data = await response.json();
    if (data.success) {
      stats.value = data.stats;
    }
  } catch (error) {
    console.error('Failed to fetch stats:', error);
  }
}

function editConfig(config) {
  editingConfig.value = config;
  formData.value = { ...config };
}

function closeModal() {
  showCreateModal.value = false;
  editingConfig.value = null;
  formData.value = { ...defaultFormData };
}

async function saveConfig() {
  try {
    const url = editingConfig.value
      ? `${API_URL}/amd/configurations/${editingConfig.value.id}`
      : `${API_URL}/amd/configurations`;

    const response = await fetch(url, {
      method: editingConfig.value ? 'PUT' : 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData.value)
    });

    const data = await response.json();
    if (data.success) {
      closeModal();
      fetchConfigurations();
    } else {
      alert(data.error || 'Failed to save configuration');
    }
  } catch (error) {
    console.error('Failed to save configuration:', error);
    alert('Failed to save configuration');
  }
}

async function deleteConfig(configId) {
  if (!confirm('Are you sure you want to delete this configuration?')) return;

  try {
    const response = await fetch(`${API_URL}/amd/configurations/${configId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authStore.token}` }
    });

    const data = await response.json();
    if (data.success) {
      fetchConfigurations();
    }
  } catch (error) {
    console.error('Failed to delete configuration:', error);
  }
}

async function refreshData() {
  loading.value = true;
  await Promise.all([fetchConfigurations(), fetchStats()]);
  loading.value = false;
}

onMounted(() => {
  refreshData();
});
</script>
