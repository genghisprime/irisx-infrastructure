<template>
  <div class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
        <h3 class="text-lg font-semibold text-gray-900">
          Create Campaign - Step {{ currentStep }} of 3
        </h3>
        <button
          @click="$emit('close')"
          class="text-gray-400 hover:text-gray-500"
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Progress Steps -->
      <div class="px-6 py-4 border-b">
        <nav class="flex justify-center">
          <ol class="flex items-center space-x-4">
            <li
              v-for="step in steps"
              :key="step.number"
              class="flex items-center"
            >
              <div class="flex items-center space-x-2">
                <span
                  :class="[
                    'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium',
                    currentStep > step.number
                      ? 'bg-indigo-600 text-white'
                      : currentStep === step.number
                      ? 'border-2 border-indigo-600 text-indigo-600'
                      : 'border-2 border-gray-300 text-gray-400'
                  ]"
                >
                  {{ step.number }}
                </span>
                <span
                  :class="[
                    'text-sm font-medium',
                    currentStep >= step.number ? 'text-gray-900' : 'text-gray-400'
                  ]"
                >
                  {{ step.label }}
                </span>
              </div>
              <svg
                v-if="step.number < steps.length"
                class="w-5 h-5 text-gray-300 ml-4"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
              </svg>
            </li>
          </ol>
        </nav>
      </div>

      <form @submit.prevent="handleSubmit">
        <!-- Step 1: Campaign Details -->
        <div v-if="currentStep === 1" class="px-6 py-6 space-y-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Campaign Name *
            </label>
            <input
              v-model="form.name"
              type="text"
              required
              maxlength="255"
              class="w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Q4 2025 Sales Campaign"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              v-model="form.description"
              rows="3"
              class="w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Optional campaign description"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Caller ID (From Number) *
            </label>
            <input
              v-model="form.caller_id"
              type="tel"
              required
              pattern="^\+?[1-9]\d{1,14}$"
              class="w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="+15551234567"
            />
            <p class="mt-1 text-xs text-gray-500">Must be a verified number in E.164 format (e.g., +15551234567)</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Max Concurrent Calls
              </label>
              <input
                v-model.number="form.max_concurrent_calls"
                type="number"
                min="1"
                max="100"
                class="w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p class="mt-1 text-xs text-gray-500">1-100 calls</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Max Retries
              </label>
              <input
                v-model.number="form.max_retries"
                type="number"
                min="0"
                max="10"
                class="w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p class="mt-1 text-xs text-gray-500">0-10 retries</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Retry Delay (seconds)
              </label>
              <input
                v-model.number="form.retry_delay"
                type="number"
                min="60"
                max="86400"
                class="w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p class="mt-1 text-xs text-gray-500">60-86400 seconds</p>
            </div>
          </div>
        </div>

        <!-- Step 2: Upload Contacts -->
        <div v-if="currentStep === 2" class="px-6 py-6 space-y-6">
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div class="flex">
              <div class="flex-shrink-0">
                <svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                </svg>
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-blue-800">CSV Format Required</h3>
                <div class="mt-2 text-sm text-blue-700">
                  <p>Your CSV file should have these columns:</p>
                  <ul class="list-disc ml-5 mt-1">
                    <li><strong>phone_number</strong> (required) - E.164 format (e.g., +15551234567)</li>
                    <li><strong>first_name</strong> (optional)</li>
                    <li><strong>last_name</strong> (optional)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Upload Contact List (CSV)
            </label>
            <div class="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-indigo-400 transition-colors">
              <div class="space-y-1 text-center">
                <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <div class="flex text-sm text-gray-600">
                  <label class="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none">
                    <span>Upload a file</span>
                    <input
                      type="file"
                      accept=".csv"
                      @change="handleFileUpload"
                      class="sr-only"
                    />
                  </label>
                  <p class="pl-1">or drag and drop</p>
                </div>
                <p class="text-xs text-gray-500">CSV file up to 10MB</p>
              </div>
            </div>

            <div v-if="uploadedFile" class="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                  <svg class="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p class="text-sm font-medium text-green-900">{{ uploadedFile.name }}</p>
                    <p class="text-xs text-green-700">{{ contacts.length }} contacts ready to import</p>
                  </div>
                </div>
                <button
                  @click="clearFile"
                  type="button"
                  class="text-red-600 hover:text-red-700"
                >
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div v-if="uploadError" class="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p class="text-sm text-red-700">{{ uploadError }}</p>
            </div>
          </div>

          <!-- Contact Preview -->
          <div v-if="contacts.length > 0" class="border rounded-md overflow-hidden">
            <div class="bg-gray-50 px-4 py-2 border-b">
              <p class="text-sm font-medium text-gray-700">Contact Preview (first 5)</p>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Phone Number</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">First Name</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Last Name</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="(contact, idx) in contacts.slice(0, 5)" :key="idx">
                    <td class="px-4 py-2 text-sm text-gray-900">{{ contact.phone_number }}</td>
                    <td class="px-4 py-2 text-sm text-gray-900">{{ contact.first_name || '-' }}</td>
                    <td class="px-4 py-2 text-sm text-gray-900">{{ contact.last_name || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Step 3: Review & Launch -->
        <div v-if="currentStep === 3" class="px-6 py-6 space-y-6">
          <div class="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-6 border border-indigo-200">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Campaign Summary</h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p class="text-sm text-gray-600">Campaign Name</p>
                <p class="text-base font-medium text-gray-900">{{ form.name }}</p>
              </div>
              <div>
                <p class="text-sm text-gray-600">Caller ID</p>
                <p class="text-base font-medium text-gray-900">{{ form.caller_id }}</p>
              </div>
              <div>
                <p class="text-sm text-gray-600">Total Contacts</p>
                <p class="text-base font-medium text-gray-900">{{ contacts.length }}</p>
              </div>
              <div>
                <p class="text-sm text-gray-600">Max Concurrent Calls</p>
                <p class="text-base font-medium text-gray-900">{{ form.max_concurrent_calls }}</p>
              </div>
            </div>

            <div v-if="form.description" class="mt-4">
              <p class="text-sm text-gray-600">Description</p>
              <p class="text-sm text-gray-700">{{ form.description }}</p>
            </div>
          </div>

          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div class="flex">
              <div class="flex-shrink-0">
                <svg class="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-yellow-800">Important</h3>
                <div class="mt-2 text-sm text-yellow-700">
                  <ul class="list-disc ml-5 space-y-1">
                    <li>Campaign will be created in <strong>draft</strong> status</li>
                    <li>You can start it manually from the campaign dashboard</li>
                    <li>Ensure compliance with TCPA regulations before calling</li>
                    <li>Calls will be charged based on your usage plan</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="px-6 py-4 border-t bg-gray-50 flex justify-between">
          <button
            v-if="currentStep > 1"
            @click="previousStep"
            type="button"
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Previous
          </button>
          <div v-else></div>

          <div class="flex space-x-3">
            <button
              @click="$emit('close')"
              type="button"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              v-if="currentStep < 3"
              @click="nextStep"
              type="button"
              :disabled="!canProceed"
              class="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
            <button
              v-else
              type="submit"
              :disabled="creating"
              class="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {{ creating ? 'Creating...' : 'Create Campaign' }}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const emit = defineEmits(['close', 'created']);

// State
const currentStep = ref(1);
const creating = ref(false);
const uploadedFile = ref(null);
const uploadError = ref(null);
const contacts = ref([]);

const form = ref({
  name: '',
  description: '',
  caller_id: '',
  max_concurrent_calls: 5,
  max_retries: 3,
  retry_delay: 3600
});

const steps = [
  { number: 1, label: 'Details' },
  { number: 2, label: 'Contacts' },
  { number: 3, label: 'Review' }
];

// Get auth token
const token = localStorage.getItem('token');

// Can proceed to next step
const canProceed = computed(() => {
  if (currentStep.value === 1) {
    return form.value.name && form.value.caller_id;
  }
  if (currentStep.value === 2) {
    return contacts.value.length > 0;
  }
  return true;
});

// Next step
function nextStep() {
  if (currentStep.value < 3 && canProceed.value) {
    currentStep.value++;
  }
}

// Previous step
function previousStep() {
  if (currentStep.value > 1) {
    currentStep.value--;
  }
}

// Handle file upload
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  uploadError.value = null;
  uploadedFile.value = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        throw new Error('CSV file must have at least a header row and one data row');
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const phoneIndex = headers.indexOf('phone_number');
      const firstNameIndex = headers.indexOf('first_name');
      const lastNameIndex = headers.indexOf('last_name');

      if (phoneIndex === -1) {
        throw new Error('CSV must have a "phone_number" column');
      }

      const parsedContacts = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const phone = values[phoneIndex];

        if (!phone) continue;

        // Basic phone validation (E.164)
        if (!/^\+?[1-9]\d{1,14}$/.test(phone)) {
          uploadError.value = `Invalid phone number at line ${i + 1}: ${phone}`;
          return;
        }

        parsedContacts.push({
          phone_number: phone,
          first_name: values[firstNameIndex] || null,
          last_name: values[lastNameIndex] || null
        });
      }

      if (parsedContacts.length === 0) {
        throw new Error('No valid contacts found in CSV');
      }

      contacts.value = parsedContacts;
    } catch (error) {
      uploadError.value = error.message;
      uploadedFile.value = null;
      contacts.value = [];
    }
  };

  reader.readAsText(file);
}

// Clear file
function clearFile() {
  uploadedFile.value = null;
  contacts.value = [];
  uploadError.value = null;
}

// Handle submit
async function handleSubmit() {
  if (!canProceed.value) return;

  creating.value = true;
  try {
    // Step 1: Create campaign
    const campaignResponse = await axios.post(
      `${API_URL}/v1/campaigns`,
      {
        name: form.value.name,
        description: form.value.description,
        caller_id: form.value.caller_id,
        max_concurrent_calls: form.value.max_concurrent_calls,
        max_retries: form.value.max_retries,
        retry_delay: form.value.retry_delay
      },
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    const campaign = campaignResponse.data.campaign;

    // Step 2: Upload contacts
    await axios.post(
      `${API_URL}/v1/campaigns/${campaign.id}/contacts`,
      { contacts: contacts.value },
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    emit('created', campaign);
  } catch (error) {
    console.error('Error creating campaign:', error);
    alert('Failed to create campaign. Please try again.');
  } finally {
    creating.value = false;
  }
}
</script>
