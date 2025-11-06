<template>
  <div class="email-deliverability">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Email Deliverability</h1>
        <p class="page-description">
          Monitor and optimize your email deliverability and sender reputation
        </p>
      </div>
      <button @click="runHealthCheck" class="btn-primary" :disabled="checking">
        <svg class="h-6 w-6 icon" v-if="!checking"  fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div v-else class="spinner-sm"></div>
        Run Health Check
      </button>
    </div>

    <!-- Overview Cards -->
    <div class="overview-cards">
      <div class="stat-card" :class="getScoreClass(overallScore)">
        <div class="stat-icon">
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <div class="stat-label">Overall Health Score</div>
          <div class="stat-value">{{ overallScore }}/100</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-blue-100 text-blue-600">
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <div class="stat-label">Sent (30 days)</div>
          <div class="stat-value">{{ formatNumber(stats.sent_30d) }}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-green-100 text-green-600">
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <div class="stat-label">Delivery Rate</div>
          <div class="stat-value">{{ stats.delivery_rate }}%</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-red-100 text-red-600">
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <div class="stat-label">Bounce Rate</div>
          <div class="stat-value">{{ stats.bounce_rate }}%</div>
        </div>
      </div>
    </div>

    <!-- DNS Records Check -->
    <div class="section-card">
      <div class="section-header">
        <h2 class="section-title">
          <svg class="h-6 w-6 icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          DNS Records Health
        </h2>
        <span class="section-subtitle">Last checked: {{ formatDate(lastChecked) }}</span>
      </div>

      <div class="dns-records">
        <div
          v-for="record in dnsRecords"
          :key="record.type"
          class="dns-record"
          :class="getRecordStatusClass(record.status)"
        >
          <div class="record-header">
            <div class="record-title">
              <svg class="h-6 w-6 status-icon text-green-500" v-if="record.status === 'valid'"  fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
              </svg>
              <svg class="h-6 w-6 status-icon text-yellow-500" v-else-if="record.status === 'warning'"  fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
              </svg>
              <svg class="h-6 w-6 status-icon text-red-500" v-else  fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
              </svg>
              <span class="record-type">{{ record.type }}</span>
              <span class="record-status">{{ record.status_text }}</span>
            </div>
            <button @click="toggleRecord(record.type)" class="btn-icon">
              <svg class="h-6 w-6 icon" v-if="expandedRecords.includes(record.type)"  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
              </svg>
              <svg class="h-6 w-6 icon" v-else  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          <p class="record-description">{{ record.description }}</p>

          <div v-if="expandedRecords.includes(record.type)" class="record-details">
            <div class="record-value">
              <label>Current Value:</label>
              <code>{{ record.value || 'Not configured' }}</code>
            </div>
            <div v-if="record.recommendation" class="record-recommendation">
              <label>Recommendation:</label>
              <p>{{ record.recommendation }}</p>
            </div>
            <div v-if="record.fix_instructions" class="record-fix">
              <label>How to Fix:</label>
              <ol>
                <li v-for="(step, idx) in record.fix_instructions" :key="idx">{{ step }}</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Email Validator -->
    <div class="section-card">
      <div class="section-header">
        <h2 class="section-title">
          <svg class="h-6 w-6 icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Email Address Validator
        </h2>
      </div>

      <div class="validator-form">
        <div class="form-row">
          <input
            v-model="emailToValidate"
            type="email"
            placeholder="Enter email address to validate"
            class="input flex-1"
            @keyup.enter="validateEmail"
          />
          <button @click="validateEmail" class="btn-primary" :disabled="validating || !emailToValidate">
            <div v-if="validating" class="spinner-sm"></div>
            <span v-else>Validate</span>
          </button>
        </div>

        <div v-if="validationResult" class="validation-result" :class="validationResult.valid ? 'valid' : 'invalid'">
          <div class="result-header">
            <svg class="h-6 w-6 result-icon text-green-500" v-if="validationResult.valid"  fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
            </svg>
            <svg class="h-6 w-6 result-icon text-red-500" v-else  fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
            </svg>
            <span class="result-status">
              {{ validationResult.valid ? 'Valid Email' : 'Invalid Email' }}
            </span>
          </div>

          <div class="result-checks">
            <div class="check-item" :class="validationResult.syntax_valid ? 'pass' : 'fail'">
              <svg class="h-6 w-6 check-icon" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
              </svg>
              <span>Syntax Valid</span>
            </div>
            <div class="check-item" :class="validationResult.mx_records_exist ? 'pass' : 'fail'">
              <svg class="h-6 w-6 check-icon" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
              </svg>
              <span>MX Records Exist</span>
            </div>
            <div class="check-item" :class="!validationResult.is_disposable ? 'pass' : 'fail'">
              <svg class="h-6 w-6 check-icon" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
              </svg>
              <span>{{ validationResult.is_disposable ? 'Disposable Email' : 'Not Disposable' }}</span>
            </div>
            <div class="check-item" :class="validationResult.risk_score < 50 ? 'pass' : 'fail'">
              <svg class="h-6 w-6 check-icon" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
              </svg>
              <span>Risk Score: {{ validationResult.risk_score }}/100</span>
            </div>
          </div>

          <div v-if="validationResult.message" class="result-message">
            {{ validationResult.message }}
          </div>
        </div>
      </div>
    </div>

    <!-- Suppression List -->
    <div class="section-card">
      <div class="section-header">
        <h2 class="section-title">
          <svg class="h-6 w-6 icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          Suppression List
        </h2>
        <button @click="showAddSuppressionModal = true" class="btn-secondary">
          + Add Address
        </button>
      </div>

      <div class="suppression-filters">
        <select v-model="suppressionFilter" class="filter-select">
          <option value="">All Reasons</option>
          <option value="bounce">Hard Bounce</option>
          <option value="complaint">Spam Complaint</option>
          <option value="unsubscribe">Unsubscribe</option>
          <option value="manual">Manual Block</option>
        </select>
        <input
          v-model="suppressionSearch"
          type="text"
          placeholder="Search email addresses..."
          class="filter-search"
        />
      </div>

      <div class="suppression-list">
        <div v-if="filteredSuppressionList.length === 0" class="empty-state-sm">
          <p>No suppressed emails found</p>
        </div>
        <div v-else class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Email Address</th>
                <th>Reason</th>
                <th>Date Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in paginatedSuppressionList" :key="item.id">
                <td>{{ item.email }}</td>
                <td>
                  <span class="reason-badge" :class="`reason-${item.reason}`">
                    {{ formatReason(item.reason) }}
                  </span>
                </td>
                <td>{{ formatDate(item.added_at) }}</td>
                <td>
                  <button @click="removeSuppression(item)" class="btn-text text-red-600">
                    Remove
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="totalSuppressionPages > 1" class="pagination">
          <button
            @click="suppressionPage--"
            :disabled="suppressionPage === 1"
            class="pagination-btn"
          >
            Previous
          </button>
          <span class="pagination-info">
            Page {{ suppressionPage }} of {{ totalSuppressionPages }}
          </span>
          <button
            @click="suppressionPage++"
            :disabled="suppressionPage === totalSuppressionPages"
            class="pagination-btn"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- Bounce Analysis -->
    <div class="section-card">
      <div class="section-header">
        <h2 class="section-title">
          <svg class="h-6 w-6 icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Bounce Analysis (Last 30 Days)
        </h2>
      </div>

      <div class="bounce-stats">
        <div class="bounce-stat">
          <div class="bounce-stat-header">
            <span class="bounce-type">Hard Bounces</span>
            <span class="bounce-count">{{ bounceStats.hard_bounces }}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill bg-red-500" :style="{ width: `${bounceStats.hard_bounce_percent}%` }"></div>
          </div>
          <p class="bounce-description">
            Permanent failures (invalid email, domain doesn't exist)
          </p>
        </div>

        <div class="bounce-stat">
          <div class="bounce-stat-header">
            <span class="bounce-type">Soft Bounces</span>
            <span class="bounce-count">{{ bounceStats.soft_bounces }}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill bg-yellow-500" :style="{ width: `${bounceStats.soft_bounce_percent}%` }"></div>
          </div>
          <p class="bounce-description">
            Temporary failures (mailbox full, server down)
          </p>
        </div>

        <div class="bounce-stat">
          <div class="bounce-stat-header">
            <span class="bounce-type">Spam Complaints</span>
            <span class="bounce-count">{{ bounceStats.spam_complaints }}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill bg-orange-500" :style="{ width: `${bounceStats.spam_complaint_percent}%` }"></div>
          </div>
          <p class="bounce-description">
            Recipient marked email as spam
          </p>
        </div>
      </div>

      <div class="insights-box">
        <h3 class="insights-title">Actionable Insights</h3>
        <ul class="insights-list">
          <li v-for="insight in insights" :key="insight.id">
            <svg class="h-6 w-6 insight-icon" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
            </svg>
            <span>{{ insight.text }}</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- Add Suppression Modal -->
    <div v-if="showAddSuppressionModal" class="modal-overlay" @click.self="showAddSuppressionModal = false">
      <div class="modal modal-sm">
        <div class="modal-header">
          <h2>Add Email to Suppression List</h2>
          <button @click="showAddSuppressionModal = false" class="btn-icon">
            <svg class="h-6 w-6 icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Email Address *</label>
            <input v-model="newSuppression.email" type="email" class="input" placeholder="user@example.com" />
          </div>
          <div class="form-group">
            <label>Reason *</label>
            <select v-model="newSuppression.reason" class="input">
              <option value="">Select reason</option>
              <option value="bounce">Hard Bounce</option>
              <option value="complaint">Spam Complaint</option>
              <option value="unsubscribe">Unsubscribe</option>
              <option value="manual">Manual Block</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showAddSuppressionModal = false" class="btn-secondary">Cancel</button>
          <button @click="addSuppression" class="btn-primary" :disabled="!newSuppression.email || !newSuppression.reason">
            Add to List
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();

// State
const checking = ref(false);
const lastChecked = ref(new Date());
const overallScore = ref(85);
const expandedRecords = ref([]);

// Stats
const stats = ref({
  sent_30d: 15234,
  delivery_rate: 98.5,
  bounce_rate: 1.5,
});

// DNS Records
const dnsRecords = ref([
  {
    type: 'SPF',
    status: 'valid',
    status_text: 'Configured',
    description: 'Sender Policy Framework - Authorizes mail servers to send on your behalf',
    value: 'v=spf1 include:_spf.elasticemail.com ~all',
    recommendation: null,
  },
  {
    type: 'DKIM',
    status: 'valid',
    status_text: 'Configured',
    description: 'DomainKeys Identified Mail - Cryptographically signs your emails',
    value: 'k=rsa; p=MIGfMA0GCSqGSIb3DQEBA...',
    recommendation: null,
  },
  {
    type: 'DMARC',
    status: 'warning',
    status_text: 'Partially Configured',
    description: 'Domain-based Message Authentication - Protects against email spoofing',
    value: 'v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com',
    recommendation: 'Set policy to "quarantine" or "reject" for better protection',
    fix_instructions: [
      'Log in to your DNS provider',
      'Add a TXT record for _dmarc.yourdomain.com',
      'Set value to: v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com',
      'Wait 24-48 hours for DNS propagation',
    ],
  },
  {
    type: 'MX',
    status: 'valid',
    status_text: 'Configured',
    description: 'Mail Exchange records - Routes incoming email to your mail server',
    value: '10 mail.yourdomain.com',
    recommendation: null,
  },
]);

// Email Validation
const emailToValidate = ref('');
const validating = ref(false);
const validationResult = ref(null);

// Suppression List
const showAddSuppressionModal = ref(false);
const suppressionFilter = ref('');
const suppressionSearch = ref('');
const suppressionPage = ref(1);
const suppressionPerPage = 10;
const suppressionList = ref([
  { id: 1, email: 'bounce@example.com', reason: 'bounce', added_at: new Date('2025-10-15') },
  { id: 2, email: 'spam@example.com', reason: 'complaint', added_at: new Date('2025-10-20') },
  { id: 3, email: 'unsubscribed@example.com', reason: 'unsubscribe', added_at: new Date('2025-10-25') },
]);

const newSuppression = ref({
  email: '',
  reason: '',
});

// Bounce Stats
const bounceStats = ref({
  hard_bounces: 156,
  hard_bounce_percent: 62,
  soft_bounces: 78,
  soft_bounce_percent: 31,
  spam_complaints: 18,
  spam_complaint_percent: 7,
});

const insights = ref([
  { id: 1, text: 'Your bounce rate is below the 2% industry threshold. Good job!' },
  { id: 2, text: 'Consider upgrading DMARC policy to "quarantine" for better security' },
  { id: 3, text: '18 spam complaints in 30 days - Review email content and targeting' },
]);

// Computed
const filteredSuppressionList = computed(() => {
  let filtered = suppressionList.value;

  if (suppressionFilter.value) {
    filtered = filtered.filter(item => item.reason === suppressionFilter.value);
  }

  if (suppressionSearch.value) {
    const search = suppressionSearch.value.toLowerCase();
    filtered = filtered.filter(item => item.email.toLowerCase().includes(search));
  }

  return filtered;
});

const paginatedSuppressionList = computed(() => {
  const start = (suppressionPage.value - 1) * suppressionPerPage;
  const end = start + suppressionPerPage;
  return filteredSuppressionList.value.slice(start, end);
});

const totalSuppressionPages = computed(() => {
  return Math.ceil(filteredSuppressionList.value.length / suppressionPerPage);
});

// Methods
async function runHealthCheck() {
  checking.value = true;
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 2000));
  lastChecked.value = new Date();
  checking.value = false;
}

function toggleRecord(type) {
  const index = expandedRecords.value.indexOf(type);
  if (index > -1) {
    expandedRecords.value.splice(index, 1);
  } else {
    expandedRecords.value.push(type);
  }
}

function getScoreClass(score) {
  if (score >= 80) return 'score-good';
  if (score >= 60) return 'score-warning';
  return 'score-poor';
}

function getRecordStatusClass(status) {
  return `record-${status}`;
}

async function validateEmail() {
  if (!emailToValidate.value) return;

  validating.value = true;
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Demo validation result
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToValidate.value);
  validationResult.value = {
    valid: isValid && !emailToValidate.value.includes('fake'),
    syntax_valid: isValid,
    mx_records_exist: isValid,
    is_disposable: emailToValidate.value.includes('temp') || emailToValidate.value.includes('disposable'),
    risk_score: isValid ? Math.floor(Math.random() * 30) : 85,
    message: isValid ? 'This email address appears to be valid and deliverable.' : 'This email address has issues and may not be deliverable.',
  };

  validating.value = false;
}

function formatReason(reason) {
  const reasons = {
    bounce: 'Hard Bounce',
    complaint: 'Spam Complaint',
    unsubscribe: 'Unsubscribed',
    manual: 'Manual Block',
  };
  return reasons[reason] || reason;
}

function addSuppression() {
  suppressionList.value.push({
    id: Date.now(),
    email: newSuppression.value.email,
    reason: newSuppression.value.reason,
    added_at: new Date(),
  });

  showAddSuppressionModal.value = false;
  newSuppression.value = { email: '', reason: '' };
}

function removeSuppression(item) {
  if (confirm(`Remove ${item.email} from suppression list?`)) {
    const index = suppressionList.value.findIndex(s => s.id === item.id);
    if (index > -1) {
      suppressionList.value.splice(index, 1);
    }
  }
}

function formatNumber(num) {
  return new Intl.NumberFormat().format(num);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Lifecycle
onMounted(() => {
  // Initial data load
});
</script>

<style scoped>
/* Base styles - reuse from previous components */
.email-deliverability {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
}

.page-title {
  font-size: 2rem;
  font-weight: 700;
  color: #1a202c;
  margin: 0;
}

.page-description {
  color: #718096;
  margin-top: 0.5rem;
}

.overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: white;
  padding: 1.5rem;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.stat-card.score-good {
  border-color: #10b981;
  background: linear-gradient(135deg, #d1fae5 0%, white 100%);
}

.stat-card.score-warning {
  border-color: #f59e0b;
  background: linear-gradient(135deg, #fef3c7 0%, white 100%);
}

.stat-card.score-poor {
  border-color: #ef4444;
  background: linear-gradient(135deg, #fee2e2 0%, white 100%);
}

.stat-icon {
  width: 3rem;
  height: 3rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon svg {
  width: 1.75rem;
  height: 1.75rem;
}

.bg-blue-100 {
  background: #dbeafe;
}

.text-blue-600 {
  color: #2563eb;
}

.bg-green-100 {
  background: #d1fae5;
}

.text-green-600 {
  color: #059669;
}

.bg-red-100 {
  background: #fee2e2;
}

.text-red-600 {
  color: #dc2626;
}

.stat-label {
  font-size: 0.875rem;
  color: #718096;
  margin-bottom: 0.25rem;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: #2d3748;
}

.section-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 2rem;
  margin-bottom: 2rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1a202c;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
}

.section-subtitle {
  font-size: 0.875rem;
  color: #718096;
}

.dns-records {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dns-record {
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  padding: 1rem;
  transition: all 0.2s;
}

.dns-record:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.record-valid {
  border-left: 4px solid #10b981;
}

.record-warning {
  border-left: 4px solid #f59e0b;
}

.record-invalid {
  border-left: 4px solid #ef4444;
}

.record-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.record-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.status-icon {
  width: 1.5rem;
  height: 1.5rem;
}

.record-type {
  font-weight: 600;
  color: #2d3748;
}

.record-status {
  font-size: 0.875rem;
  color: #718096;
}

.record-description {
  font-size: 0.875rem;
  color: #718096;
  margin: 0;
}

.record-details {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
}

.record-value,
.record-recommendation,
.record-fix {
  margin-bottom: 1rem;
}

.record-value label,
.record-recommendation label,
.record-fix label {
  display: block;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.5rem;
}

.record-value code {
  display: block;
  background: #f3f4f6;
  padding: 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  word-break: break-all;
}

.record-fix ol {
  margin: 0;
  padding-left: 1.5rem;
}

.record-fix li {
  margin-bottom: 0.5rem;
  color: #374151;
}

.validator-form {
  max-width: 600px;
}

.form-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.flex-1 {
  flex: 1;
}

.input {
  width: 100%;
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.validation-result {
  border: 2px solid;
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin-top: 1rem;
}

.validation-result.valid {
  border-color: #10b981;
  background: #d1fae5;
}

.validation-result.invalid {
  border-color: #ef4444;
  background: #fee2e2;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.result-icon {
  width: 2rem;
  height: 2rem;
}

.result-status {
  font-size: 1.125rem;
  font-weight: 600;
}

.result-checks {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.check-item.pass {
  color: #059669;
}

.check-item.fail {
  color: #dc2626;
}

.check-icon {
  width: 1.25rem;
  height: 1.25rem;
}

.result-message {
  font-size: 0.875rem;
  color: #374151;
  padding-top: 1rem;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

.suppression-filters {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.filter-select,
.filter-search {
  padding: 0.5rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.filter-search {
  flex: 1;
}

.table-container {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  text-align: left;
  padding: 0.75rem;
  border-bottom: 2px solid #e2e8f0;
  font-weight: 600;
  color: #374151;
  font-size: 0.875rem;
}

.data-table td {
  padding: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

.reason-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.reason-bounce {
  background: #fee2e2;
  color: #dc2626;
}

.reason-complaint {
  background: #fed7aa;
  color: #c2410c;
}

.reason-unsubscribe {
  background: #dbeafe;
  color: #1e40af;
}

.reason-manual {
  background: #e5e7eb;
  color: #374151;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 1.5rem;
}

.pagination-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: white;
  cursor: pointer;
  font-size: 0.875rem;
}

.pagination-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination-info {
  font-size: 0.875rem;
  color: #6b7280;
}

.bounce-stats {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.bounce-stat {
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.375rem;
}

.bounce-stat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.bounce-type {
  font-weight: 600;
  color: #374151;
}

.bounce-count {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1f2937;
}

.progress-bar {
  height: 0.5rem;
  background: #e5e7eb;
  border-radius: 9999px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  transition: width 0.3s;
}

.bg-red-500 {
  background: #ef4444;
}

.bg-yellow-500 {
  background: #f59e0b;
}

.bg-orange-500 {
  background: #f97316;
}

.bounce-description {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0;
}

.insights-box {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 0.5rem;
  padding: 1.5rem;
}

.insights-title {
  font-size: 1rem;
  font-weight: 600;
  color: #0c4a6e;
  margin: 0 0 1rem 0;
}

.insights-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.insights-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  color: #374151;
  font-size: 0.875rem;
}

.insight-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: #0369a1;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.empty-state-sm {
  text-align: center;
  padding: 2rem;
  color: #9ca3af;
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
  padding: 1rem;
}

.modal {
  background: white;
  border-radius: 0.5rem;
  max-width: 600px;
  width: 100%;
}

.modal-sm {
  max-width: 500px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.modal-body {
  padding: 1.5rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1.5rem;
  border-top: 1px solid #e2e8f0;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.5rem;
}

/* Buttons */
.btn-primary,
.btn-secondary,
.btn-text,
.btn-icon {
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary {
  background: #4f46e5;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #4338ca;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #e5e7eb;
  color: #374151;
}

.btn-secondary:hover {
  background: #d1d5db;
}

.btn-text {
  background: transparent;
  padding: 0.25rem 0.5rem;
}

.btn-icon {
  background: transparent;
  padding: 0.25rem;
}

.btn-icon:hover {
  background: #f3f4f6;
}

.icon {
  width: 1.25rem;
  height: 1.25rem;
}

.spinner-sm {
  width: 1rem;
  height: 1rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.text-green-500 {
  color: #10b981;
}

.text-yellow-500 {
  color: #f59e0b;
}

.text-red-500 {
  color: #ef4444;
}
</style>
