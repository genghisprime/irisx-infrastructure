<template>
  <div class="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900">Usage & Billing</h1>
        <p class="mt-2 text-sm text-gray-600">
          Track your API usage and monitor costs in real-time
        </p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center items-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6">
        <div class="flex items-start">
          <svg class="w-6 h-6 text-red-400 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
          </svg>
          <div>
            <h3 class="text-sm font-medium text-red-800">Error loading usage data</h3>
            <p class="mt-1 text-sm text-red-700">{{ error }}</p>
            <button @click="fetchUsage" class="mt-3 text-sm font-medium text-red-600 hover:text-red-500">
              Try again
            </button>
          </div>
        </div>
      </div>

      <!-- Usage Dashboard -->
      <div v-else class="space-y-6">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <!-- Total Cost Card -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-600">Current Period</p>
                <p class="mt-2 text-3xl font-bold text-gray-900">
                  ${{ usageData.summary?.totalCost || '0.00' }}
                </p>
              </div>
              <div class="p-3 bg-purple-100 rounded-full">
                <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
            </div>
            <p class="mt-2 text-xs text-gray-500">
              {{ usageData.periodStart }} to {{ usageData.periodEnd }}
            </p>
          </div>

          <!-- Credit Balance Card -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-600">Credit Balance</p>
                <p class="mt-2 text-3xl font-bold text-green-600">
                  ${{ usageData.summary?.creditBalance || '0.00' }}
                </p>
              </div>
              <div class="p-3 bg-green-100 rounded-full">
                <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
            </div>
            <p class="mt-2 text-xs text-gray-500">
              Remaining: ${{ usageData.summary?.remainingCredits || '0.00' }}
            </p>
          </div>

          <!-- Total Transactions Card -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-600">Transactions</p>
                <p class="mt-2 text-3xl font-bold text-gray-900">
                  {{ usageData.summary?.totalRecords?.toLocaleString() || '0' }}
                </p>
              </div>
              <div class="p-3 bg-blue-100 rounded-full">
                <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path>
                </svg>
              </div>
            </div>
            <p class="mt-2 text-xs text-gray-500">
              This billing period
            </p>
          </div>

          <!-- Plan Card -->
          <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-600">Current Plan</p>
                <p class="mt-2 text-xl font-bold text-gray-900">
                  {{ usageData.plan?.displayName || 'Free Trial' }}
                </p>
              </div>
              <div class="p-3 bg-yellow-100 rounded-full">
                <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>
                </svg>
              </div>
            </div>
            <p class="mt-2 text-xs text-gray-500">
              ${{ usageData.plan?.includedCredits || '0' }} included credits
            </p>
          </div>
        </div>

        <!-- Usage by Channel -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div class="px-6 py-5 border-b border-gray-200">
            <h2 class="text-lg font-semibold text-gray-900">Usage by Channel</h2>
            <p class="mt-1 text-sm text-gray-500">Breakdown of API usage across all communication channels</p>
          </div>

          <div v-if="usageData.byChannel && usageData.byChannel.length > 0" class="divide-y divide-gray-200">
            <div v-for="channel in usageData.byChannel" :key="channel.channel" class="p-6 hover:bg-gray-50 transition">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center space-x-3">
                    <!-- Channel Icon -->
                    <div :class="getChannelIconClass(channel.channel)">
                      <component :is="getChannelIcon(channel.channel)" class="w-5 h-5" />
                    </div>
                    <div>
                      <h3 class="text-base font-semibold text-gray-900 capitalize">{{ channel.channel }}</h3>
                      <p class="text-sm text-gray-500">{{ channel.recordCount }} transactions</p>
                    </div>
                  </div>

                  <!-- Resources Breakdown -->
                  <div class="mt-4 ml-11 space-y-2">
                    <div v-for="resource in channel.resources" :key="resource.resourceType" class="flex items-center justify-between text-sm">
                      <span class="text-gray-600 capitalize">{{ resource.resourceType }}</span>
                      <div class="flex items-center space-x-4">
                        <span class="text-gray-900 font-medium">{{ formatQuantity(resource.quantity, resource.resourceType) }}</span>
                        <span class="text-gray-500 min-w-[80px] text-right">${{ resource.cost }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Total Cost -->
                <div class="ml-6 text-right">
                  <p class="text-2xl font-bold text-gray-900">${{ channel.totalCost.toFixed(4) }}</p>
                  <p class="mt-1 text-xs text-gray-500">Total cost</p>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="p-12 text-center">
            <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
            <h3 class="mt-2 text-sm font-medium text-gray-900">No usage data</h3>
            <p class="mt-1 text-sm text-gray-500">Start using the API to see usage statistics here</p>
          </div>
        </div>

        <!-- Billing History Link -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-gray-900">Billing History</h3>
              <p class="mt-1 text-sm text-gray-500">View past invoices and payment history</p>
            </div>
            <router-link
              to="/billing-history"
              class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition"
            >
              View Invoices
              <svg class="ml-2 -mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, h } from 'vue';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// State
const loading = ref(true);
const error = ref(null);
const usageData = ref({
  summary: {},
  byChannel: [],
  plan: {},
  periodStart: '',
  periodEnd: ''
});

// Channel icons (SVG components)
const getChannelIcon = (channel) => {
  const icons = {
    voice: (props) => h('svg', { ...props, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' })
    ]),
    sms: (props) => h('svg', { ...props, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' })
    ]),
    email: (props) => h('svg', { ...props, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' })
    ]),
    whatsapp: (props) => h('svg', { ...props, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' })
    ]),
    social: (props) => h('svg', { ...props, fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z' })
    ])
  };
  return icons[channel] || icons.sms;
};

const getChannelIconClass = (channel) => {
  const classes = {
    voice: 'p-2 bg-blue-100 rounded-lg',
    sms: 'p-2 bg-green-100 rounded-lg',
    email: 'p-2 bg-purple-100 rounded-lg',
    whatsapp: 'p-2 bg-emerald-100 rounded-lg',
    social: 'p-2 bg-pink-100 rounded-lg'
  };
  return classes[channel] || 'p-2 bg-gray-100 rounded-lg';
};

const formatQuantity = (quantity, resourceType) => {
  if (resourceType === 'minute') {
    return `${quantity.toFixed(2)} min`;
  }
  return quantity.toLocaleString();
};

// Fetch usage data
const fetchUsage = async () => {
  try {
    loading.value = true;
    error.value = null;

    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await axios.get(`${API_URL}/v1/usage/current-period`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.success) {
      usageData.value = response.data.data;
    } else {
      throw new Error(response.data.error || 'Failed to fetch usage data');
    }
  } catch (err) {
    console.error('Error fetching usage:', err);
    error.value = err.response?.data?.message || err.message || 'Failed to load usage data';
  } finally {
    loading.value = false;
  }
};

// Lifecycle
onMounted(() => {
  fetchUsage();
});
</script>

<style scoped>
/* Add any custom styles here if needed */
</style>
