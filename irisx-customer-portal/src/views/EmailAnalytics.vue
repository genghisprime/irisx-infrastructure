<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import DashboardLayout from './dashboard/DashboardLayout.vue';
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
const dateRange = ref('30d'); // '7d', '30d', '90d', 'all'
const selectedCampaign = ref(null);

// Analytics data
const metrics = ref({
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  unsubscribed: 0,
  complained: 0,
  openRate: 0,
  clickRate: 0,
  bounceRate: 0,
});

const timelineData = ref([]);
const geographicData = ref([]);
const deviceData = ref({
  desktop: 0,
  mobile: 0,
  tablet: 0,
});
const clientData = ref({});
const linkClicksData = ref([]);
const bounceReasonsData = ref({});

// Date range options
const dateRanges = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: 'all', label: 'All Time' },
];

// Chart configurations
const timelineChartData = computed(() => {
  const days = dateRange.value === '7d' ? 7 : dateRange.value === '30d' ? 30 : 90;
  const labels = [];
  for (let i = days - 1; i >= 0; i--) {
    labels.push(format(subDays(new Date(), i), 'MMM d'));
  }

  return {
    labels,
    datasets: [
      {
        label: 'Sent',
        data: generateDemoData(days, 100, 500),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Delivered',
        data: generateDemoData(days, 95, 480),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Opened',
        data: generateDemoData(days, 40, 200),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Clicked',
        data: generateDemoData(days, 10, 80),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
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

const deviceChartData = computed(() => {
  return {
    labels: ['Desktop', 'Mobile', 'Tablet'],
    datasets: [
      {
        data: [deviceData.value.desktop, deviceData.value.mobile, deviceData.value.tablet],
        backgroundColor: ['#6366f1', '#10b981', '#f59e0b'],
        borderWidth: 0,
      },
    ],
  };
});

const deviceChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
    },
  },
};

const clientChartData = computed(() => {
  const clients = Object.keys(clientData.value);
  const values = Object.values(clientData.value);

  return {
    labels: clients,
    datasets: [
      {
        label: 'Opens by Email Client',
        data: values,
        backgroundColor: [
          '#6366f1',
          '#10b981',
          '#f59e0b',
          '#8b5cf6',
          '#ec4899',
          '#06b6d4',
        ],
      },
    ],
  };
});

const clientChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
    },
  },
  scales: {
    y: {
      beginAtZero: true,
    },
  },
};

const bounceChartData = computed(() => {
  const reasons = Object.keys(bounceReasonsData.value);
  const counts = Object.values(bounceReasonsData.value);

  return {
    labels: reasons,
    datasets: [
      {
        data: counts,
        backgroundColor: [
          '#ef4444',
          '#f59e0b',
          '#eab308',
          '#84cc16',
          '#22c55e',
        ],
        borderWidth: 0,
      },
    ],
  };
});

const bounceChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right',
    },
  },
};

// Computed metrics
const engagementScore = computed(() => {
  if (metrics.value.delivered === 0) return 0;
  const openWeight = 0.4;
  const clickWeight = 0.6;
  const score =
    (metrics.value.openRate * openWeight + metrics.value.clickRate * clickWeight) * 100;
  return Math.round(score);
});

// Methods
function generateDemoData(days, min, max) {
  const data = [];
  for (let i = 0; i < days; i++) {
    data.push(Math.floor(Math.random() * (max - min + 1)) + min);
  }
  return data;
}

async function fetchAnalytics() {
  loading.value = true;
  try {
    // Fetch metrics
    const metricsResponse = await fetch(
      `${import.meta.env.VITE_API_URL}/v1/email/stats?range=${dateRange.value}`,
      {
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
        },
      }
    );

    if (metricsResponse.ok) {
      const data = await metricsResponse.json();
      metrics.value = data.metrics || metrics.value;
    }

    // Fetch geographic data
    const geoResponse = await fetch(
      `${import.meta.env.VITE_API_URL}/v1/email/analytics/geographic?range=${dateRange.value}`,
      {
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
        },
      }
    );

    if (geoResponse.ok) {
      const data = await geoResponse.json();
      geographicData.value = data.countries || [];
    }

    // Set demo data for now
    setDemoData();
  } catch (error) {
    console.error('Failed to fetch analytics:', error);
    setDemoData();
  } finally {
    loading.value = false;
  }
}

function setDemoData() {
  metrics.value = {
    sent: 45230,
    delivered: 44105,
    opened: 18442,
    clicked: 3762,
    bounced: 1125,
    unsubscribed: 89,
    complained: 12,
    openRate: 41.8,
    clickRate: 8.5,
    bounceRate: 2.5,
  };

  deviceData.value = {
    desktop: 12500,
    mobile: 23000,
    tablet: 3200,
  };

  clientData.value = {
    'Gmail': 15000,
    'Apple Mail': 8500,
    'Outlook': 6200,
    'Yahoo': 3800,
    'Other': 4942,
  };

  bounceReasonsData.value = {
    'Invalid Email': 450,
    'Mailbox Full': 320,
    'Blocked': 180,
    'Spam': 125,
    'Other': 50,
  };

  linkClicksData.value = [
    { url: 'https://example.com/promo', clicks: 1520, uniqueClicks: 980 },
    { url: 'https://example.com/product', clicks: 850, uniqueClicks: 620 },
    { url: 'https://example.com/contact', clicks: 642, uniqueClicks: 510 },
    { url: 'https://example.com/blog', clicks: 480, uniqueClicks: 380 },
    { url: 'https://example.com/signup', clicks: 270, uniqueClicks: 230 },
  ];

  geographicData.value = [
    { country: 'United States', opens: 15200, clicks: 3100 },
    { country: 'United Kingdom', opens: 3800, clicks: 720 },
    { country: 'Canada', opens: 2400, clicks: 480 },
    { country: 'Australia', opens: 1900, clicks: 380 },
    { country: 'Germany', opens: 1600, clicks: 320 },
  ];
}

function changeRange(range) {
  dateRange.value = range;
  fetchAnalytics();
}

function exportData() {
  alert('Export functionality coming soon!');
}

onMounted(() => {
  fetchAnalytics();
});
</script>

<template>
  <DashboardLayout>
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
          <button @click="exportData" class="btn btn-outline">
            <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        </div>
      </div>

      <!-- Key Metrics Cards -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-label">Total Sent</div>
          <div class="metric-value">{{ metrics.sent.toLocaleString() }}</div>
          <div class="metric-trend positive">+12.5% from last period</div>
        </div>

        <div class="metric-card">
          <div class="metric-label">Delivered</div>
          <div class="metric-value">{{ metrics.delivered.toLocaleString() }}</div>
          <div class="metric-sublabel">{{ ((metrics.delivered / metrics.sent) * 100).toFixed(1) }}% delivery rate</div>
        </div>

        <div class="metric-card">
          <div class="metric-label">Opens</div>
          <div class="metric-value">{{ metrics.opened.toLocaleString() }}</div>
          <div class="metric-sublabel">{{ metrics.openRate }}% open rate</div>
        </div>

        <div class="metric-card">
          <div class="metric-label">Clicks</div>
          <div class="metric-value">{{ metrics.clicked.toLocaleString() }}</div>
          <div class="metric-sublabel">{{ metrics.clickRate }}% click rate</div>
        </div>

        <div class="metric-card">
          <div class="metric-label">Bounces</div>
          <div class="metric-value">{{ metrics.bounced.toLocaleString() }}</div>
          <div class="metric-sublabel">{{ metrics.bounceRate }}% bounce rate</div>
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
      <div class="chart-section">
        <div class="chart-header">
          <h2 class="chart-title">Engagement Timeline</h2>
          <p class="chart-description">Track email performance over time</p>
        </div>
        <div class="chart-container" style="height: 350px">
          <Line :data="timelineChartData" :options="timelineChartOptions" />
        </div>
      </div>

      <!-- Charts Grid -->
      <div class="charts-grid">
        <!-- Device Breakdown -->
        <div class="chart-section">
          <div class="chart-header">
            <h3 class="chart-title">Device Breakdown</h3>
            <p class="chart-description">Opens by device type</p>
          </div>
          <div class="chart-container" style="height: 300px">
            <Doughnut :data="deviceChartData" :options="deviceChartOptions" />
          </div>
          <div class="device-stats">
            <div class="device-stat">
              <span class="device-dot" style="background: #6366f1"></span>
              <span>Desktop: {{ deviceData.desktop.toLocaleString() }}</span>
            </div>
            <div class="device-stat">
              <span class="device-dot" style="background: #10b981"></span>
              <span>Mobile: {{ deviceData.mobile.toLocaleString() }}</span>
            </div>
            <div class="device-stat">
              <span class="device-dot" style="background: #f59e0b"></span>
              <span>Tablet: {{ deviceData.tablet.toLocaleString() }}</span>
            </div>
          </div>
        </div>

        <!-- Email Client Breakdown -->
        <div class="chart-section">
          <div class="chart-header">
            <h3 class="chart-title">Email Clients</h3>
            <p class="chart-description">Opens by email client</p>
          </div>
          <div class="chart-container" style="height: 300px">
            <Bar :data="clientChartData" :options="clientChartOptions" />
          </div>
        </div>
      </div>

      <!-- Geographic Data -->
      <div class="chart-section">
        <div class="chart-header">
          <h2 class="chart-title">Geographic Distribution</h2>
          <p class="chart-description">Email engagement by country</p>
        </div>
        <div class="geo-table">
          <table class="data-table">
            <thead>
              <tr>
                <th>Country</th>
                <th>Opens</th>
                <th>Clicks</th>
                <th>Click Rate</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="country in geographicData" :key="country.country">
                <td class="country-cell">
                  <span class="country-name">{{ country.country }}</span>
                </td>
                <td>{{ country.opens.toLocaleString() }}</td>
                <td>{{ country.clicks.toLocaleString() }}</td>
                <td>
                  <span class="rate-badge">
                    {{ ((country.clicks / country.opens) * 100).toFixed(1) }}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Link Clicks -->
      <div class="chart-section">
        <div class="chart-header">
          <h2 class="chart-title">Top Performing Links</h2>
          <p class="chart-description">Most clicked links in your emails</p>
        </div>
        <div class="links-list">
          <div v-for="(link, index) in linkClicksData" :key="index" class="link-item">
            <div class="link-rank">{{ index + 1 }}</div>
            <div class="link-info">
              <div class="link-url">{{ link.url }}</div>
              <div class="link-stats">
                <span>{{ link.clicks }} total clicks</span>
                <span class="separator">•</span>
                <span>{{ link.uniqueClicks }} unique</span>
              </div>
            </div>
            <div class="link-bar">
              <div
                class="link-bar-fill"
                :style="{ width: `${(link.clicks / linkClicksData[0].clicks) * 100}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bounce Reasons -->
      <div class="chart-section">
        <div class="chart-header">
          <h2 class="chart-title">Bounce Reasons</h2>
          <p class="chart-description">Why emails bounced</p>
        </div>
        <div class="chart-container" style="height: 300px">
          <Doughnut :data="bounceChartData" :options="bounceChartOptions" />
        </div>
      </div>
    </div>
  </DashboardLayout>
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

.metric-trend {
  font-size: 0.875rem;
  font-weight: 600;
}

.metric-trend.positive {
  color: #10b981;
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

.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.device-stats {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
}

.device-stat {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #6b7280;
}

.device-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

/* Geographic Table */
.geo-table {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  text-align: left;
  padding: 0.75rem;
  background: #f9fafb;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  border-bottom: 1px solid #e5e7eb;
}

.data-table td {
  padding: 0.75rem;
  font-size: 0.875rem;
  color: #6b7280;
  border-bottom: 1px solid #f3f4f6;
}

.country-name {
  font-weight: 500;
  color: #111827;
}

.rate-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: #eef2ff;
  color: #4f46e5;
  border-radius: 9999px;
  font-weight: 600;
  font-size: 0.75rem;
}

/* Links List */
.links-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.link-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.375rem;
}

.link-rank {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #4f46e5;
  color: white;
  border-radius: 50%;
  font-weight: 600;
  font-size: 0.875rem;
}

.link-info {
  flex: 1;
  min-width: 0;
}

.link-url {
  font-size: 0.875rem;
  color: #4f46e5;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 0.25rem;
}

.link-stats {
  font-size: 0.75rem;
  color: #6b7280;
}

.separator {
  margin: 0 0.5rem;
}

.link-bar {
  width: 120px;
  height: 8px;
  background: #e5e7eb;
  border-radius: 9999px;
  overflow: hidden;
}

.link-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%);
  transition: width 0.3s;
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

.btn-outline {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn-outline:hover {
  background: #f9fafb;
}

.icon-sm {
  width: 1rem;
  height: 1rem;
}

@media (max-width: 1024px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
