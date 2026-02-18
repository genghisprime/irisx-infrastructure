<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { downloadMultiSheetExcel } from '../utils/excelExport';
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
  Filler,
} from 'chart.js';
import { format, subDays } from 'date-fns';

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

const authStore = useAuthStore();

// State
const loading = ref(false);
const dateRange = ref('30d');
const hasData = ref(false);

// Analytics data from API
const metrics = ref({
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  failed: 0,
  deliveryRate: 0,
  openRate: 0,
});

const timelineData = ref([]);

// Date range options
const dateRanges = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: 'all', label: 'All Time' },
];

// Chart configurations
const timelineChartData = computed(() => {
  if (timelineData.value.length === 0) {
    return { labels: [], datasets: [] };
  }

  return {
    labels: timelineData.value.map(d => d.date),
    datasets: [
      {
        label: 'Sent',
        data: timelineData.value.map(d => d.sent),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Delivered',
        data: timelineData.value.map(d => d.delivered),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Opened',
        data: timelineData.value.map(d => d.opened),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };
});

const timelineChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
    },
    tooltip: {
      mode: 'index',
      intersect: false,
    },
  },
  scales: {
    y: {
      beginAtZero: true,
    },
  },
};

// Computed metrics
const engagementScore = computed(() => {
  if (metrics.value.delivered === 0) return 0;
  const openWeight = 0.4;
  const clickWeight = 0.6;
  const openRate = metrics.value.openRate || 0;
  const clickRate = metrics.value.delivered > 0
    ? (metrics.value.clicked / metrics.value.delivered) * 100
    : 0;
  const score = (openRate * openWeight + clickRate * clickWeight);
  return Math.round(score);
});

const bounceRate = computed(() => {
  if (metrics.value.sent === 0) return 0;
  return ((metrics.value.bounced / metrics.value.sent) * 100).toFixed(1);
});

const clickRate = computed(() => {
  if (metrics.value.delivered === 0) return 0;
  return ((metrics.value.clicked / metrics.value.delivered) * 100).toFixed(1);
});

// Methods
async function fetchAnalytics() {
  loading.value = true;
  hasData.value = false;

  try {
    // Fetch email stats from API
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/v1/emails/stats`,
      {
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
        },
      }
    );

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        metrics.value = {
          sent: result.data.sent || 0,
          delivered: result.data.delivered || 0,
          opened: result.data.opened || 0,
          clicked: result.data.clicked || 0,
          bounced: result.data.bounced || 0,
          failed: result.data.failed || 0,
          deliveryRate: result.data.deliveryRate || 0,
          openRate: result.data.openRate || 0,
        };
        hasData.value = result.data.total > 0;
      }
    }

    // Fetch timeline data
    const days = dateRange.value === '7d' ? 7 : dateRange.value === '30d' ? 30 : 90;
    const timelineResponse = await fetch(
      `${import.meta.env.VITE_API_URL}/v1/emails/stats/timeline?days=${days}`,
      {
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
        },
      }
    );

    if (timelineResponse.ok) {
      const result = await timelineResponse.json();
      if (result.success && result.data) {
        timelineData.value = result.data;
      }
    } else {
      // Generate empty timeline labels if endpoint doesn't exist
      const labels = [];
      for (let i = days - 1; i >= 0; i--) {
        labels.push({
          date: format(subDays(new Date(), i), 'MMM d'),
          sent: 0,
          delivered: 0,
          opened: 0,
        });
      }
      timelineData.value = labels;
    }
  } catch (error) {
    console.error('Failed to fetch analytics:', error);
  } finally {
    loading.value = false;
  }
}

function exportData() {
  const filename = `email-analytics-${dateRange.value}`;

  const sheets = [
    {
      name: 'Overview',
      data: [
        { metric: 'Total Sent', value: metrics.value.sent },
        { metric: 'Delivered', value: metrics.value.delivered },
        { metric: 'Opens', value: metrics.value.opened },
        { metric: 'Clicks', value: metrics.value.clicked },
        { metric: 'Bounces', value: metrics.value.bounced },
        { metric: 'Failed', value: metrics.value.failed },
        { metric: 'Delivery Rate', value: `${metrics.value.deliveryRate}%` },
        { metric: 'Open Rate', value: `${metrics.value.openRate}%` },
        { metric: 'Bounce Rate', value: `${bounceRate.value}%` },
        { metric: 'Engagement Score', value: engagementScore.value },
      ],
      columns: [
        { key: 'metric', label: 'Metric', width: 150 },
        { key: 'value', label: 'Value', width: 100 }
      ]
    },
  ];

  downloadMultiSheetExcel(sheets, filename);
}

onMounted(() => {
  fetchAnalytics();
});
</script>

<template>
  <div class="analytics-page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Email Analytics</h1>
        <p class="page-description">Track performance and engagement metrics</p>
      </div>
      <div class="header-actions">
        <!-- Date Range Selector -->
        <select v-model="dateRange" @change="fetchAnalytics" class="date-select">
          <option v-for="range in dateRanges" :key="range.value" :value="range.value">
            {{ range.label }}
          </option>
        </select>
        <button @click="exportData" class="btn btn-outline" :disabled="!hasData">
          <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading analytics...</p>
    </div>

    <!-- No Data State -->
    <div v-else-if="!hasData" class="empty-state">
      <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <h3>No Email Data Yet</h3>
      <p>Start sending emails to see your analytics here.</p>
    </div>

    <!-- Analytics Content -->
    <template v-else>
      <!-- Key Metrics Cards -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-label">Total Sent</div>
          <div class="metric-value">{{ metrics.sent.toLocaleString() }}</div>
        </div>

        <div class="metric-card">
          <div class="metric-label">Delivered</div>
          <div class="metric-value">{{ metrics.delivered.toLocaleString() }}</div>
          <div class="metric-sublabel">{{ metrics.deliveryRate }}% delivery rate</div>
        </div>

        <div class="metric-card">
          <div class="metric-label">Opens</div>
          <div class="metric-value">{{ metrics.opened.toLocaleString() }}</div>
          <div class="metric-sublabel">{{ metrics.openRate }}% open rate</div>
        </div>

        <div class="metric-card">
          <div class="metric-label">Clicks</div>
          <div class="metric-value">{{ metrics.clicked.toLocaleString() }}</div>
          <div class="metric-sublabel">{{ clickRate }}% click rate</div>
        </div>

        <div class="metric-card">
          <div class="metric-label">Bounces</div>
          <div class="metric-value">{{ metrics.bounced.toLocaleString() }}</div>
          <div class="metric-sublabel">{{ bounceRate }}% bounce rate</div>
        </div>

        <div class="metric-card highlight">
          <div class="metric-label">Engagement Score</div>
          <div class="metric-value">{{ engagementScore }}/100</div>
          <div class="metric-sublabel">
            <span :class="['score-badge', engagementScore >= 70 ? 'excellent' : engagementScore >= 40 ? 'good' : 'needs-improvement']">
              {{ engagementScore >= 70 ? 'Excellent' : engagementScore >= 40 ? 'Good' : 'Needs Improvement' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Timeline Chart -->
      <div class="chart-section" v-if="timelineData.length > 0">
        <div class="chart-header">
          <h2 class="chart-title">Engagement Timeline</h2>
          <p class="chart-description">Track email performance over time</p>
        </div>
        <div class="chart-container" style="height: 350px">
          <Line :data="timelineChartData" :options="timelineChartOptions" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.analytics-page {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
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

.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.date-select {
  padding: 0.625rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background: white;
  cursor: pointer;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  color: #6b7280;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e5e7eb;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  background: white;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  text-align: center;
}

.empty-icon {
  width: 64px;
  height: 64px;
  color: #d1d5db;
  margin-bottom: 1rem;
}

.empty-state h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #374151;
  margin: 0 0 0.5rem 0;
}

.empty-state p {
  color: #6b7280;
  margin: 0;
}

/* Metrics Grid */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.metric-card {
  background: white;
  padding: 1.5rem;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
}

.metric-card.highlight {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  border: none;
}

.metric-card.highlight .metric-label,
.metric-card.highlight .metric-sublabel {
  color: rgba(255, 255, 255, 0.9);
}

.metric-label {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.metric-value {
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.25rem;
}

.metric-card.highlight .metric-value {
  color: white;
}

.metric-sublabel {
  font-size: 0.875rem;
  color: #9ca3af;
}

.score-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.score-badge.excellent {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.score-badge.good {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.score-badge.needs-improvement {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

/* Chart Sections */
.chart-section {
  background: white;
  padding: 1.5rem;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  margin-bottom: 2rem;
}

.chart-header {
  margin-bottom: 1.5rem;
}

.chart-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 0.25rem 0;
}

.chart-description {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0;
}

.chart-container {
  position: relative;
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-outline {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn-outline:hover:not(:disabled) {
  background: #f9fafb;
}

.icon-sm {
  width: 1rem;
  height: 1rem;
}

@media (max-width: 768px) {
  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
