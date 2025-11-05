<template>
  <div class="alert-management">
    <div class="page-header">
      <div>
        <h1>Alert Management</h1>
        <p class="subtitle">Manage email and SMS subscriptions for production alerts</p>
      </div>
      <div class="header-actions">
        <button @click="sendTestAlert" class="test-btn" :disabled="sending">
          <span v-if="sending">Sending...</span>
          <span v-else>📧 Send Test Alert</span>
        </button>
        <button @click="showAddDialog = true" class="add-btn">
          + Add Subscription
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div v-if="stats" class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Email Subscriptions</div>
        <div class="stat-value">{{ stats.email_count || 0 }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">SMS Subscriptions</div>
        <div class="stat-value">{{ stats.sms_count || 0 }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Active</div>
        <div class="stat-value">{{ stats.total || 0 }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">SNS Topic</div>
        <div class="stat-value small">IRISX-Production-Alerts</div>
      </div>
    </div>

    <!-- Subscriptions Table -->
    <div class="section">
      <h2>Active Subscriptions</h2>
      <div v-if="loading && subscriptions.length === 0" class="loading">
        Loading subscriptions...
      </div>

      <div v-else-if="subscriptions.length === 0" class="empty-state">
        <p>No alert subscriptions configured.</p>
        <p class="empty-hint">Add email addresses or phone numbers to receive production alerts.</p>
      </div>

      <table v-else class="subscriptions-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Contact</th>
            <th>Status</th>
            <th>Added By</th>
            <th>Added At</th>
            <th>Notes</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="sub in subscriptions" :key="sub.id">
            <td>
              <span class="type-badge" :class="sub.subscription_type">
                {{ sub.subscription_type === 'email' ? '📧 Email' : '📱 SMS' }}
              </span>
            </td>
            <td class="contact-cell">{{ sub.contact_value }}</td>
            <td>
              <span class="status-badge" :class="sub.status">
                {{ formatStatus(sub.status) }}
              </span>
            </td>
            <td>{{ sub.added_by_name || sub.added_by_email || 'System' }}</td>
            <td>{{ formatDate(sub.added_at) }}</td>
            <td class="notes-cell">{{ sub.notes || '-' }}</td>
            <td>
              <button @click="confirmRemove(sub)" class="remove-btn" title="Unsubscribe">
                🗑️ Remove
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Alert History -->
    <div class="section">
      <h2>Recent Alerts (Last 7 Days)</h2>
      <div v-if="history.length === 0" class="empty-state">
        <p>No alerts fired in the last 7 days.</p>
        <p class="empty-hint">This is good news! Your system is healthy. 🎉</p>
      </div>

      <table v-else class="history-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Alarm Name</th>
            <th>State</th>
            <th>Reason</th>
            <th>Notified</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="alert in history" :key="alert.id">
            <td>{{ formatDate(alert.state_changed_at) }}</td>
            <td>{{ alert.alarm_name }}</td>
            <td>
              <span class="alarm-state" :class="alert.alarm_state.toLowerCase()">
                {{ alert.alarm_state }}
              </span>
            </td>
            <td class="reason-cell">{{ alert.alarm_reason || '-' }}</td>
            <td>{{ alert.notification_count }} people</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add Subscription Dialog -->
    <div v-if="showAddDialog" class="modal-overlay" @click.self="showAddDialog = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Add Alert Subscription</h3>
          <button @click="showAddDialog = false" class="close-btn">×</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label>Subscription Type</label>
            <div class="radio-group">
              <label class="radio-label">
                <input type="radio" v-model="newSubscription.type" value="email" />
                📧 Email
              </label>
              <label class="radio-label">
                <input type="radio" v-model="newSubscription.type" value="sms" />
                📱 SMS
              </label>
            </div>
          </div>

          <div v-if="newSubscription.type === 'email'" class="form-group">
            <label for="email">Email Address</label>
            <input
              type="email"
              id="email"
              v-model="newSubscription.email"
              placeholder="engineer@company.com"
              class="input"
            />
            <p class="input-hint">AWS will send a confirmation email. Click the link to activate.</p>
          </div>

          <div v-if="newSubscription.type === 'sms'" class="form-group">
            <label for="phone">Phone Number (E.164 format)</label>
            <input
              type="tel"
              id="phone"
              v-model="newSubscription.phone"
              placeholder="+12345678900"
              class="input"
            />
            <p class="input-hint">Include country code. Example: +1 for USA, +44 for UK</p>
          </div>

          <div class="form-group">
            <label for="notes">Notes (Optional)</label>
            <input
              type="text"
              id="notes"
              v-model="newSubscription.notes"
              placeholder="e.g., On-call engineer, DevOps team lead"
              class="input"
            />
          </div>

          <div v-if="addError" class="error-message">
            {{ addError }}
          </div>
        </div>

        <div class="modal-footer">
          <button @click="showAddDialog = false" class="cancel-btn">Cancel</button>
          <button @click="addSubscription" class="submit-btn" :disabled="adding">
            <span v-if="adding">Adding...</span>
            <span v-else>Add Subscription</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Remove Confirmation Dialog -->
    <div v-if="removeTarget" class="modal-overlay" @click.self="removeTarget = null">
      <div class="modal small">
        <div class="modal-header">
          <h3>Confirm Unsubscribe</h3>
          <button @click="removeTarget = null" class="close-btn">×</button>
        </div>

        <div class="modal-body">
          <p>Are you sure you want to unsubscribe?</p>
          <p class="confirm-detail">
            <strong>{{ removeTarget.subscription_type === 'email' ? '📧' : '📱' }}
            {{ removeTarget.contact_value }}</strong>
          </p>
          <p class="warning">This person will no longer receive production alerts.</p>
        </div>

        <div class="modal-footer">
          <button @click="removeTarget = null" class="cancel-btn">Cancel</button>
          <button @click="removeSubscription" class="danger-btn" :disabled="removing">
            <span v-if="removing">Removing...</span>
            <span v-else">Unsubscribe</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const loading = ref(true)
const sending = ref(false)
const adding = ref(false)
const removing = ref(false)
const subscriptions = ref([])
const history = ref([])
const stats = ref(null)
const showAddDialog = ref(false)
const removeTarget = ref(null)
const addError = ref(null)

const newSubscription = ref({
  type: 'email',
  email: '',
  phone: '',
  notes: ''
})

async function fetchData() {
  loading.value = true
  try {
    const token = localStorage.getItem('adminToken')
    const headers = { Authorization: `Bearer ${token}` }

    const [subsRes, historyRes, statsRes] = await Promise.all([
      axios.get(`${API_BASE_URL}/admin/alerts/subscriptions`, { headers }),
      axios.get(`${API_BASE_URL}/admin/alerts/history`, { headers }),
      axios.get(`${API_BASE_URL}/admin/alerts/stats`, { headers })
    ])

    subscriptions.value = subsRes.data.subscriptions || []
    history.value = historyRes.data.alerts || []
    stats.value = statsRes.data
  } catch (error) {
    console.error('Failed to fetch alert data:', error)
  } finally {
    loading.value = false
  }
}

async function addSubscription() {
  addError.value = null
  adding.value = true

  try {
    const token = localStorage.getItem('adminToken')
    const headers = { Authorization: `Bearer ${token}` }

    const endpoint = newSubscription.value.type === 'email'
      ? '/admin/alerts/subscriptions/email'
      : '/admin/alerts/subscriptions/sms'

    const payload = newSubscription.value.type === 'email'
      ? { email: newSubscription.value.email, notes: newSubscription.value.notes }
      : { phone: newSubscription.value.phone, notes: newSubscription.value.notes }

    const response = await axios.post(`${API_BASE_URL}${endpoint}`, payload, { headers })

    alert(response.data.message)
    showAddDialog.value = false
    newSubscription.value = { type: 'email', email: '', phone: '', notes: '' }
    await fetchData()
  } catch (error) {
    console.error('Failed to add subscription:', error)
    addError.value = error.response?.data?.error || 'Failed to add subscription'
  } finally {
    adding.value = false
  }
}

async function removeSubscription() {
  removing.value = true
  try {
    const token = localStorage.getItem('adminToken')
    const headers = { Authorization: `Bearer ${token}` }

    await axios.delete(
      `${API_BASE_URL}/admin/alerts/subscriptions/${removeTarget.value.id}`,
      { headers }
    )

    alert('Subscription removed successfully')
    removeTarget.value = null
    await fetchData()
  } catch (error) {
    console.error('Failed to remove subscription:', error)
    alert('Failed to remove subscription')
  } finally {
    removing.value = false
  }
}

async function sendTestAlert() {
  if (!confirm('Send test alert to all subscribers?')) return

  sending.value = true
  try {
    const token = localStorage.getItem('adminToken')
    const headers = { Authorization: `Bearer ${token}` }

    const response = await axios.post(`${API_BASE_URL}/admin/alerts/test`, {}, { headers })

    alert('Test alert sent successfully! Check your email/SMS.')
  } catch (error) {
    console.error('Failed to send test alert:', error)
    alert('Failed to send test alert')
  } finally {
    sending.value = false
  }
}

function confirmRemove(subscription) {
  removeTarget.value = subscription
}

function formatStatus(status) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString()
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.alert-management {
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

.page-header h1 {
  font-size: 2rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #6b7280;
  font-size: 0.875rem;
}

.header-actions {
  display: flex;
  gap: 1rem;
}

.add-btn, .test-btn {
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 0.375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.add-btn {
  background-color: #3b82f6;
  color: white;
}

.add-btn:hover {
  background-color: #2563eb;
}

.test-btn {
  background-color: #10b981;
  color: white;
}

.test-btn:hover:not(:disabled) {
  background-color: #059669;
}

.test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: white;
  padding: 1.5rem;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  text-align: center;
}

.stat-label {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #1f2937;
}

.stat-value.small {
  font-size: 1rem;
}

.section {
  background: white;
  padding: 1.5rem;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  margin-bottom: 2rem;
}

.section h2 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 1rem;
}

.subscriptions-table, .history-table {
  width: 100%;
  border-collapse: collapse;
}

.subscriptions-table th, .history-table th {
  text-align: left;
  padding: 0.75rem 1rem;
  background-color: #f9fafb;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  border-bottom: 1px solid #e5e7eb;
}

.subscriptions-table td, .history-table td {
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  color: #6b7280;
  border-bottom: 1px solid #f3f4f6;
}

.type-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.type-badge.email {
  background-color: #dbeafe;
  color: #1e40af;
}

.type-badge.sms {
  background-color: #dcfce7;
  color: #15803d;
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
}

.status-badge.active {
  background-color: #d1fae5;
  color: #065f46;
}

.status-badge.pending_confirmation {
  background-color: #fef3c7;
  color: #92400e;
}

.contact-cell {
  font-family: monospace;
  font-weight: 500;
}

.notes-cell {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-btn {
  padding: 0.375rem 0.75rem;
  background-color: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.remove-btn:hover {
  background-color: #fecaca;
}

.alarm-state {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
}

.alarm-state.alarm {
  background-color: #fee2e2;
  color: #991b1b;
}

.alarm-state.ok {
  background-color: #d1fae5;
  color: #065f46;
}

.reason-cell {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loading, .empty-state {
  text-align: center;
  padding: 3rem;
  color: #6b7280;
}

.empty-hint {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #9ca3af;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  max-width: 500px;
  width: 100%;
}

.modal.small {
  max-width: 400px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #6b7280;
  cursor: pointer;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #1f2937;
}

.modal-body {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.5rem;
}

.radio-group {
  display: flex;
  gap: 1.5rem;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.radio-label input[type="radio"] {
  cursor: pointer;
}

.input {
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.input-hint {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.error-message {
  padding: 0.75rem;
  background-color: #fee2e2;
  color: #991b1b;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  margin-top: 1rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1.5rem;
  border-top: 1px solid #e5e7eb;
}

.cancel-btn, .submit-btn, .danger-btn {
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 0.375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn {
  background-color: #f3f4f6;
  color: #374151;
}

.cancel-btn:hover {
  background-color: #e5e7eb;
}

.submit-btn {
  background-color: #3b82f6;
  color: white;
}

.submit-btn:hover:not(:disabled) {
  background-color: #2563eb;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.danger-btn {
  background-color: #ef4444;
  color: white;
}

.danger-btn:hover:not(:disabled) {
  background-color: #dc2626;
}

.danger-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.confirm-detail {
  padding: 1rem;
  background-color: #f3f4f6;
  border-radius: 0.375rem;
  margin: 1rem 0;
  text-align: center;
}

.warning {
  color: #dc2626;
  font-size: 0.875rem;
  text-align: center;
}
</style>
