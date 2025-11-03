<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <div class="bg-white shadow-sm border-b">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="py-6">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-2xl font-bold text-gray-900">Unified Analytics</h1>
              <p class="mt-1 text-sm text-gray-500">
                Cross-channel insights across voice, SMS, email, WhatsApp, and social
              </p>
            </div>
            <div class="flex items-center space-x-3">
              <!-- Date Range Picker -->
              <select
                v-model="dateRange"
                @change="loadAnalytics"
                class="rounded-md border-gray-300 text-sm focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
      <p class="mt-4 text-sm text-gray-500">Loading analytics...</p>
    </div>

    <div v-else class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Overview Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div class="bg-white rounded-lg shadow-sm border p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Total Calls</p>
              <p class="mt-2 text-3xl font-bold text-gray-900">{{ formatNumber(overview.totalCalls) }}</p>
              <p class="mt-1 text-xs text-gray-500">{{ overview.totalCallMinutes }} minutes</p>
            </div>
            <div class="p-3 bg-indigo-50 rounded-lg">
              <svg class="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">SMS Messages</p>
              <p class="mt-2 text-3xl font-bold text-gray-900">{{ formatNumber(overview.totalSms) }}</p>
              <p class="mt-1 text-xs text-gray-500">{{ overview.smsDeliveryRate }}% delivery rate</p>
            </div>
            <div class="p-3 bg-green-50 rounded-lg">
              <svg class="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Emails</p>
              <p class="mt-2 text-3xl font-bold text-gray-900">{{ formatNumber(overview.totalEmails) }}</p>
              <p class="mt-1 text-xs text-gray-500">{{ overview.emailOpenRate }}% open rate</p>
            </div>
            <div class="p-3 bg-blue-50 rounded-lg">
              <svg class="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-lg shadow-sm border p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">WhatsApp</p>
              <p class="mt-2 text-3xl font-bold text-gray-900">{{ formatNumber(overview.totalWhatsApp) }}</p>
              <p class="mt-1 text-xs text-gray-500">{{ overview.whatsappDeliveryRate }}% delivery rate</p>
            </div>
            <div class="p-3 bg-purple-50 rounded-lg">
              <svg class="w-8 h-8 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Trend Chart -->
      <div class="bg-white rounded-lg shadow-sm border p-6 mb-8">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Communication Trends</h3>
        <Line :data="trendChartData" :options="trendChartOptions" />
      </div>

      <!-- Channel Breakdown -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <!-- Voice Metrics -->
        <div class="bg-white rounded-lg shadow-sm border p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Voice Channel</h3>
          <Bar :data="voiceChartData" :options="barChartOptions" />
        </div>

        <!-- SMS Metrics -->
        <div class="bg-white rounded-lg shadow-sm border p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">SMS Channel</h3>
          <Doughnut :data="smsChartData" :options="doughnutChartOptions" />
        </div>

        <!-- Email Metrics -->
        <div class="bg-white rounded-lg shadow-sm border p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Email Channel</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600">Delivery Rate</span>
              <span class="text-sm font-medium text-gray-900">{{ overview.emailDeliveryRate }}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div class="bg-blue-600 h-2 rounded-full" :style="{ width: overview.emailDeliveryRate + '%' }"></div>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600">Open Rate</span>
              <span class="text-sm font-medium text-gray-900">{{ overview.emailOpenRate }}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div class="bg-indigo-600 h-2 rounded-full" :style="{ width: overview.emailOpenRate + '%' }"></div>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600">Click Rate</span>
              <span class="text-sm font-medium text-gray-900">{{ overview.emailClickRate }}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div class="bg-purple-600 h-2 rounded-full" :style="{ width: overview.emailClickRate + '%' }"></div>
            </div>
          </div>
        </div>

        <!-- Cost Analysis -->
        <div class="bg-white rounded-lg shadow-sm border p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Cost by Channel</h3>
          <Doughnut :data="costChartData" :options="doughnutChartOptions" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { Line, Bar, Doughnut } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// State
const loading = ref(false);
const dateRange = ref(30);
const analytics = ref(null);
const overview = ref({
  totalCalls: 0,
  totalCallMinutes: 0,
  totalSms: 0,
  smsDeliveryRate: 0,
  totalEmails: 0,
  emailDeliveryRate: 0,
  emailOpenRate: 0,
  emailClickRate: 0,
  totalWhatsApp: 0,
  whatsappDeliveryRate: 0
});

// Get auth token
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = '/login';
}

// Format number with commas
function formatNumber(num) {
  return parseInt(num || 0).toLocaleString();
}

// Calculate date range
function getDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - dateRange.value);

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0]
  };
}

// Load analytics
async function loadAnalytics() {
  loading.value = true;
  try {
    const { startDate, endDate } = getDateRange();

    const response = await axios.get(`${API_URL}/v1/analytics/unified`, {
      params: { startDate, endDate },
      headers: { 'Authorization': `Bearer ${token}` }
    });

    analytics.value = response.data.data;
    overview.value = response.data.data.overview;
  } catch (error) {
    console.error('Error loading analytics:', error);
    alert('Failed to load analytics');
  } finally {
    loading.value = false;
  }
}

// Trend Chart Data
const trendChartData = computed(() => {
  if (!analytics.value) return { labels: [], datasets: [] };

  const trends = analytics.value.trends || [];
  const labels = trends.map(t => new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

  return {
    labels,
    datasets: [
      {
        label: 'Voice',
        data: trends.map(t => t.voice),
        borderColor: 'rgb(99, 102, 241)',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'SMS',
        data: trends.map(t => t.sms),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Email',
        data: trends.map(t => t.email),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'WhatsApp',
        data: trends.map(t => t.whatsapp),
        borderColor: 'rgb(168, 85, 247)',
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };
});

const trendChartOptions = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: {
      display: true,
      position: 'bottom'
    }
  },
  scales: {
    y: {
      beginAtZero: true
    }
  }
};

// Voice Chart Data
const voiceChartData = computed(() => {
  if (!analytics.value) return { labels: [], datasets: [] };

  const voice = analytics.value.voice?.statusBreakdown || [];

  return {
    labels: voice.map(v => v.status),
    datasets: [{
      label: 'Calls',
      data: voice.map(v => v.count),
      backgroundColor: [
        'rgba(34, 197, 94, 0.8)',
        'rgba(239, 68, 68, 0.8)',
        'rgba(234, 179, 8, 0.8)',
        'rgba(156, 163, 175, 0.8)'
      ]
    }]
  };
});

// SMS Chart Data
const smsChartData = computed(() => {
  if (!analytics.value) return { labels: [], datasets: [] };

  const sms = analytics.value.sms?.statusBreakdown || [];

  return {
    labels: sms.map(s => s.status),
    datasets: [{
      data: sms.map(s => s.count),
      backgroundColor: [
        'rgba(34, 197, 94, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(239, 68, 68, 0.8)',
        'rgba(156, 163, 175, 0.8)'
      ]
    }]
  };
});

// Cost Chart Data
const costChartData = computed(() => {
  if (!analytics.value) return { labels: [], datasets: [] };

  const cost = analytics.value.cost?.totals || [];

  return {
    labels: cost.map(c => c.channel),
    datasets: [{
      data: cost.map(c => c.totalCost),
      backgroundColor: [
        'rgba(99, 102, 241, 0.8)',
        'rgba(34, 197, 94, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(168, 85, 247, 0.8)',
        'rgba(234, 179, 8, 0.8)'
      ]
    }]
  };
});

const barChartOptions = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: {
      display: false
    }
  }
};

const doughnutChartOptions = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: {
      display: true,
      position: 'bottom'
    }
  }
};

// Lifecycle
onMounted(() => {
  loadAnalytics();
});
</script>
