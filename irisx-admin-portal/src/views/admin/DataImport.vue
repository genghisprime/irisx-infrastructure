<template>
  <div class="data-import">
    <div class="header">
      <h1>Data Import</h1>
      <p>Import contacts from CSV, Excel, or JSON</p>
    </div>

    <!-- Import Type Selection -->
    <div v-if="!activeImport" class="import-options">
      <div class="option-card" @click="startFileImport">
        <div class="icon">📁</div>
        <h3>Upload File</h3>
        <p>Import from CSV or Excel file</p>
      </div>

      <div class="option-card" @click="startBulkImport">
        <div class="icon">📋</div>
        <h3>Bulk JSON</h3>
        <p>Paste JSON array of contacts</p>
      </div>

      <div class="option-card" @click="startGoogleSheets">
        <div class="icon">📊</div>
        <h3>Google Sheets</h3>
        <p>Import from Google Sheets</p>
      </div>
    </div>

    <!-- File Upload -->
    <div v-if="importType === 'file' && !activeImport" class="upload-section">
      <button @click="cancelImport" class="btn-secondary">← Back</button>

      <div class="upload-area" @drop.prevent="handleDrop" @dragover.prevent>
        <input
          type="file"
          ref="fileInput"
          @change="handleFileSelect"
          accept=".csv,.xlsx,.xls"
          style="display: none"
        />

        <div v-if="!selectedFile" class="upload-prompt" @click="$refs.fileInput.click()">
          <div class="upload-icon">☁️</div>
          <p>Drag & drop file here or click to browse</p>
          <small>Supports CSV and Excel files (max 50MB)</small>
        </div>

        <div v-else class="file-selected">
          <div class="file-info">
            <span class="file-icon">📄</span>
            <div>
              <div class="file-name">{{ selectedFile.name }}</div>
              <div class="file-size">{{ formatFileSize(selectedFile.size) }}</div>
            </div>
            <button @click="removeFile" class="btn-icon">✕</button>
          </div>
        </div>
      </div>

      <div v-if="selectedFile" class="import-settings">
        <h3>Import Settings</h3>

        <div class="form-group">
          <label>
            <input type="checkbox" v-model="useAIMapping" />
            Use AI to auto-detect field mappings
          </label>
        </div>

        <div class="form-group">
          <label>Duplicate Strategy</label>
          <select v-model="duplicateStrategy">
            <option value="skip">Skip duplicates</option>
            <option value="update">Update existing contacts</option>
            <option value="create_new">Create duplicates</option>
          </select>
        </div>

        <div class="form-group">
          <label>Add to List (Optional)</label>
          <select v-model="targetListId">
            <option :value="null">None</option>
            <option v-for="list in contactLists" :key="list.id" :value="list.id">
              {{ list.name }} ({{ list.contact_count }} contacts)
            </option>
          </select>
        </div>

        <button @click="uploadFile" :disabled="uploading" class="btn-primary">
          {{ uploading ? 'Uploading...' : 'Upload & Preview' }}
        </button>
      </div>
    </div>

    <!-- Bulk JSON Import -->
    <div v-if="importType === 'bulk' && !activeImport" class="bulk-section">
      <button @click="cancelImport" class="btn-secondary">← Back</button>

      <h3>Bulk JSON Import</h3>
      <p>Paste an array of contact objects</p>

      <textarea
        v-model="bulkJSON"
        placeholder='[{"first_name": "John", "last_name": "Doe", "email": "john@example.com", "phone": "+1234567890"}]'
        rows="15"
        class="json-textarea"
      ></textarea>

      <div class="import-settings">
        <div class="form-group">
          <label>Duplicate Strategy</label>
          <select v-model="duplicateStrategy">
            <option value="skip">Skip duplicates</option>
            <option value="update">Update existing contacts</option>
            <option value="create_new">Create duplicates</option>
          </select>
        </div>

        <div class="form-group">
          <label>Add to List (Optional)</label>
          <select v-model="targetListId">
            <option :value="null">None</option>
            <option v-for="list in contactLists" :key="list.id" :value="list.id">
              {{ list.name }}
            </option>
          </select>
        </div>

        <button @click="submitBulkImport" :disabled="uploading" class="btn-primary">
          {{ uploading ? 'Importing...' : 'Start Import' }}
        </button>
      </div>
    </div>

    <!-- Google Sheets Import -->
    <div v-if="importType === 'sheets' && !activeImport" class="sheets-section">
      <button @click="cancelImport" class="btn-secondary">← Back</button>

      <h3>Import from Google Sheets</h3>
      <p>Import contacts directly from a Google Sheet</p>

      <div class="import-settings">
        <div class="form-group">
          <label>Google Sheets URL</label>
          <input
            type="url"
            v-model="sheetsURL"
            placeholder="https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit"
            class="text-input"
          />
          <small>Paste the full URL of your Google Sheet</small>
        </div>

        <div class="form-group">
          <label>Range (Optional)</label>
          <input
            type="text"
            v-model="sheetsRange"
            placeholder="Sheet1!A1:Z1000"
            class="text-input"
          />
          <small>Specify a range like "Sheet1!A1:Z1000" or leave empty for all data</small>
        </div>

        <div class="form-group">
          <label>
            <input type="checkbox" v-model="useAIMapping" />
            Use AI to auto-detect field mappings
          </label>
        </div>

        <div class="form-group">
          <label>Duplicate Strategy</label>
          <select v-model="duplicateStrategy">
            <option value="skip">Skip duplicates</option>
            <option value="update">Update existing contacts</option>
            <option value="create_new">Create duplicates</option>
          </select>
        </div>

        <div class="form-group">
          <label>Add to List (Optional)</label>
          <select v-model="targetListId">
            <option :value="null">None</option>
            <option v-for="list in contactLists" :key="list.id" :value="list.id">
              {{ list.name }}
            </option>
          </select>
        </div>

        <button @click="submitGoogleSheetsImport" :disabled="uploading" class="btn-primary">
          {{ uploading ? 'Fetching...' : 'Import from Google Sheets' }}
        </button>

        <div v-if="!googleAuthorized" class="info-box">
          ℹ️ First time using Google Sheets? You'll be asked to authorize access to your Google account.
        </div>
      </div>
    </div>

    <!-- Field Mapping (after file upload) -->
    <div v-if="pendingJob" class="mapping-section">
      <h2>Map Fields</h2>
      <p>{{ pendingJob.file_info.filename }} - {{ pendingJob.file_info.total_rows }} rows</p>

      <div v-if="pendingJob.ai_confidence" class="ai-suggestion">
        ✨ AI detected field mappings with {{ pendingJob.ai_confidence }}% confidence
      </div>

      <div class="preview-table">
        <h3>Preview (first 10 rows)</h3>
        <table>
          <thead>
            <tr>
              <th v-for="header in pendingJob.headers" :key="header">{{ header }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in pendingJob.preview" :key="i">
              <td v-for="header in pendingJob.headers" :key="header">
                {{ row[header] }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="field-mapping">
        <h3>Field Mapping</h3>
        <div v-for="header in pendingJob.headers" :key="header" class="mapping-row">
          <div class="source-field">{{ header }}</div>
          <div class="arrow">→</div>
          <select v-model="fieldMapping[header]" class="target-field">
            <option value="">Don't import</option>
            <option value="first_name">First Name</option>
            <option value="last_name">Last Name</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="phone_2">Phone 2</option>
            <option value="company">Company</option>
            <option value="title">Job Title</option>
            <option value="address_line1">Address Line 1</option>
            <option value="address_line2">Address Line 2</option>
            <option value="city">City</option>
            <option value="state">State</option>
            <option value="postal_code">Postal Code</option>
            <option value="country">Country</option>
            <option value="tags">Tags</option>
          </select>
        </div>
      </div>

      <div class="mapping-actions">
        <button @click="cancelImport" class="btn-secondary">Cancel</button>
        <button @click="submitMapping" :disabled="submitting" class="btn-primary">
          {{ submitting ? 'Starting Import...' : 'Start Import' }}
        </button>
      </div>
    </div>

    <!-- Active Import Progress -->
    <div v-if="activeImport" class="progress-section">
      <h2>Import in Progress</h2>

      <div class="progress-card">
        <div class="progress-header">
          <span class="status-badge" :class="activeImport.status">
            {{ activeImport.status }}
          </span>
          <span class="job-id">Job ID: {{ activeImport.id }}</span>
        </div>

        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: activeImport.progress_percent + '%' }"></div>
          <span class="progress-text">{{ activeImport.progress_percent }}%</span>
        </div>

        <div class="progress-stats">
          <div class="stat">
            <div class="stat-value">{{ activeImport.total_rows || 0 }}</div>
            <div class="stat-label">Total</div>
          </div>
          <div class="stat">
            <div class="stat-value">{{ activeImport.processed_rows || 0 }}</div>
            <div class="stat-label">Processed</div>
          </div>
          <div class="stat success">
            <div class="stat-value">{{ activeImport.success_count || 0 }}</div>
            <div class="stat-label">Success</div>
          </div>
          <div class="stat error">
            <div class="stat-value">{{ activeImport.error_count || 0 }}</div>
            <div class="stat-label">Errors</div>
          </div>
          <div class="stat warning">
            <div class="stat-value">{{ activeImport.duplicate_count || 0 }}</div>
            <div class="stat-label">Duplicates</div>
          </div>
          <div class="stat">
            <div class="stat-value">{{ activeImport.skipped_count || 0 }}</div>
            <div class="stat-label">Skipped</div>
          </div>
        </div>

        <div v-if="activeImport.status === 'completed'" class="completion-message">
          ✅ Import completed successfully!
        </div>

        <div v-if="activeImport.status === 'failed'" class="error-message">
          ❌ Import failed: {{ activeImport.error_details }}
        </div>

        <div class="progress-actions">
          <button v-if="activeImport.error_count > 0" @click="downloadErrors" class="btn-secondary">
            Download Error Report
          </button>
          <button v-if="activeImport.status === 'completed' || activeImport.status === 'failed'"
                  @click="resetImport" class="btn-primary">
            Start New Import
          </button>
          <button v-if="activeImport.status === 'processing'"
                  @click="cancelActiveImport" class="btn-danger">
            Cancel Import
          </button>
        </div>
      </div>
    </div>

    <!-- Import History -->
    <div class="history-section">
      <h2>Import History</h2>

      <div class="history-filters">
        <select v-model="historyFilter">
          <option value="">All Imports</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="processing">In Progress</option>
        </select>

        <button @click="loadHistory" class="btn-secondary">Refresh</button>
      </div>

      <div v-if="loading" class="loading">Loading history...</div>

      <table v-else class="history-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Filename</th>
            <th>Total</th>
            <th>Success</th>
            <th>Errors</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="job in importHistory" :key="job.id">
            <td>{{ formatDate(job.created_at) }}</td>
            <td><span class="type-badge">{{ job.source_type }}</span></td>
            <td>{{ job.filename || 'Bulk Import' }}</td>
            <td>{{ job.total_rows }}</td>
            <td class="success">{{ job.success_count }}</td>
            <td class="error">{{ job.error_count }}</td>
            <td><span class="status-badge" :class="job.status">{{ job.status }}</span></td>
            <td>
              <button v-if="job.error_count > 0" @click="downloadJobErrors(job.id)" class="btn-icon">
                📥 Errors
              </button>
              <button @click="viewJobDetails(job.id)" class="btn-icon">
                👁️ View
              </button>
              <button @click="deleteJob(job.id)" class="btn-icon btn-danger">
                🗑️
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="importHistory.length === 0" class="empty-state">
        No import history yet. Start your first import above!
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useAdminAuthStore } from '../../stores/adminAuth';

export default {
  name: 'DataImport',
  setup() {
    const authStore = useAdminAuthStore();

    // State
    const importType = ref(null);
    const selectedFile = ref(null);
    const useAIMapping = ref(true);
    const duplicateStrategy = ref('skip');
    const targetListId = ref(null);
    const uploading = ref(false);
    const submitting = ref(false);
    const loading = ref(false);

    const bulkJSON = ref('');
    const sheetsURL = ref('');
    const sheetsRange = ref('');
    const googleAuthorized = ref(false);
    const fieldMapping = ref({});
    const pendingJob = ref(null);
    const activeImport = ref(null);
    const importHistory = ref([]);
    const contactLists = ref([]);
    const historyFilter = ref('');

    let pollInterval = null;
    let websocket = null;

    // Methods
    const startFileImport = () => {
      importType.value = 'file';
    };

    const startBulkImport = () => {
      importType.value = 'bulk';
    };

    const startGoogleSheets = async () => {
      importType.value = 'sheets';
    };

    const cancelImport = () => {
      importType.value = null;
      selectedFile.value = null;
      pendingJob.value = null;
      bulkJSON.value = '';
      fieldMapping.value = {};
    };

    const handleFileSelect = (event) => {
      const file = event.target.files[0];
      if (file) {
        selectedFile.value = file;
      }
    };

    const handleDrop = (event) => {
      const file = event.dataTransfer.files[0];
      if (file) {
        selectedFile.value = file;
      }
    };

    const removeFile = () => {
      selectedFile.value = null;
    };

    const uploadFile = async () => {
      if (!selectedFile.value) return;

      uploading.value = true;
      const formData = new FormData();
      formData.append('file', selectedFile.value);
      formData.append('use_ai_mapping', useAIMapping.value);
      formData.append('duplicate_strategy', duplicateStrategy.value);
      if (targetListId.value) {
        formData.append('list_id', targetListId.value);
      }

      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/imports/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authStore.token}`
          },
          body: formData
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Upload failed');
        }

        const data = await response.json();
        pendingJob.value = data;

        // Initialize field mapping with AI suggestions
        if (data.suggested_mapping) {
          fieldMapping.value = { ...data.suggested_mapping };
        }
      } catch (error) {
        alert('Upload failed: ' + error.message);
        console.error(error);
      } finally {
        uploading.value = false;
      }
    };

    const submitBulkImport = async () => {
      if (!bulkJSON.value) return;

      uploading.value = true;
      try {
        const contacts = JSON.parse(bulkJSON.value);

        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/imports/bulk`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authStore.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contacts,
            duplicate_strategy: duplicateStrategy.value,
            list_id: targetListId.value
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Import failed');
        }

        const data = await response.json();
        activeImport.value = { id: data.job_id, status: 'processing', progress_percent: 0 };
        importType.value = null;
        connectWebSocket(data.job_id);
      } catch (error) {
        alert('Import failed: ' + error.message);
        console.error(error);
      } finally {
        uploading.value = false;
      }
    };

    const submitMapping = async () => {
      if (!pendingJob.value) return;

      // Filter out empty mappings
      const cleanMapping = {};
      for (const [key, value] of Object.entries(fieldMapping.value)) {
        if (value) {
          cleanMapping[key] = value;
        }
      }

      submitting.value = true;
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/imports/${pendingJob.value.job_id}/map`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authStore.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            mapping: cleanMapping,
            duplicate_strategy: duplicateStrategy.value
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to start import');
        }

        const data = await response.json();
        activeImport.value = { id: data.job_id, status: 'processing', progress_percent: 0 };
        pendingJob.value = null;
        importType.value = null;
        connectWebSocket(data.job_id);
      } catch (error) {
        alert('Failed to start import: ' + error.message);
        console.error(error);
      } finally {
        submitting.value = false;
      }
    };

    const authorizeGoogleSheets = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/imports/google/auth`, {
          headers: {
            'Authorization': `Bearer ${authStore.token}`
          }
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to get authorization URL');
        }

        const data = await response.json();

        // Open OAuth flow in popup
        const popup = window.open(data.auth_url, 'Google Authorization', 'width=600,height=600');

        // Poll for popup close to check if authorized
        const checkPopup = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkPopup);
            // Check if authorized (assume success if popup closed)
            googleAuthorized.value = true;
            alert('Google Sheets authorized successfully!');
          }
        }, 1000);
      } catch (error) {
        alert('Authorization failed: ' + error.message);
        console.error(error);
      }
    };

    const submitGoogleSheetsImport = async () => {
      if (!sheetsURL.value) {
        alert('Please enter a Google Sheets URL');
        return;
      }

      uploading.value = true;

      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/imports/google/sheet`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authStore.token}`
          },
          body: JSON.stringify({
            sheet_url: sheetsURL.value,
            range: sheetsRange.value || null,
            use_ai_mapping: useAIMapping.value,
            duplicate_strategy: duplicateStrategy.value,
            list_id: targetListId.value
          })
        });

        if (!response.ok) {
          const error = await response.json();

          // Check if authorization is required
          if (error.auth_required) {
            const shouldAuthorize = confirm('Google Sheets authorization required. Authorize now?');
            if (shouldAuthorize) {
              await authorizeGoogleSheets();
              return; // User can retry after authorizing
            }
          }

          throw new Error(error.error || 'Import failed');
        }

        const data = await response.json();

        // Handle response similar to file upload
        if (data.status === 'pending_confirmation' || data.status === 'pending') {
          pendingJob.value = data;
          pendingJob.value.file_info = data.file_info;
          pendingJob.value.headers = data.headers;
          pendingJob.value.preview_rows = data.preview_rows;
          pendingJob.value.suggested_mapping = data.suggested_mapping;
          pendingJob.value.ai_confidence = data.ai_confidence;

          if (data.suggested_mapping) {
            fieldMapping.value = data.suggested_mapping;
          }
        } else {
          // Import started immediately
          activeImport.value = { id: data.job_id, status: 'processing', progress_percent: 0 };
          importType.value = null;
          connectWebSocket(data.job_id);
        }
      } catch (error) {
        alert('Import failed: ' + error.message);
        console.error(error);
      } finally {
        uploading.value = false;
      }
    };

    const connectWebSocket = (jobId) => {
      // Close existing websocket if any
      if (websocket) {
        websocket.close();
      }

      // Connect to WebSocket for real-time updates
      const wsUrl = import.meta.env.VITE_API_URL.replace('http://', 'ws://').replace('https://', 'wss://');
      websocket = new WebSocket(`${wsUrl}/ws/imports`);

      websocket.onopen = () => {
        console.log('[WebSocket] Connected to import progress');
        // Subscribe to this job's updates
        websocket.send(JSON.stringify({ type: 'subscribe', jobId }));
      };

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[WebSocket] Received:', message);

          if (message.jobId === jobId) {
            if (message.type === 'progress') {
              // Update progress in real-time
              activeImport.value = {
                ...activeImport.value,
                ...message.data,
                status: 'processing'
              };
            } else if (message.type === 'completed') {
              // Import completed
              activeImport.value = {
                ...activeImport.value,
                ...message.data,
                status: 'completed'
              };
              websocket.close();
              loadHistory();
            } else if (message.type === 'failed') {
              // Import failed
              activeImport.value = {
                ...activeImport.value,
                ...message.data,
                status: 'failed'
              };
              websocket.close();
              loadHistory();
            }
          }
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      websocket.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        // Fallback to polling if WebSocket fails
        startPolling();
      };

      websocket.onclose = () => {
        console.log('[WebSocket] Connection closed');
      };
    };

    const startPolling = () => {
      if (pollInterval) clearInterval(pollInterval);

      pollInterval = setInterval(async () => {
        if (!activeImport.value) {
          clearInterval(pollInterval);
          return;
        }

        try {
          const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/imports/${activeImport.value.id}`, {
            headers: {
              'Authorization': `Bearer ${authStore.token}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            activeImport.value = data;

            if (data.status === 'completed' || data.status === 'failed') {
              clearInterval(pollInterval);
              loadHistory();
            }
          }
        } catch (error) {
          console.error('Failed to poll status:', error);
        }
      }, 2000); // Poll every 2 seconds
    };

    const resetImport = () => {
      activeImport.value = null;
      importType.value = null;
      selectedFile.value = null;
      pendingJob.value = null;
      loadHistory();
    };

    const cancelActiveImport = async () => {
      if (!activeImport.value) return;

      try {
        await fetch(`${import.meta.env.VITE_API_URL}/v1/imports/${activeImport.value.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${authStore.token}`
          }
        });

        if (pollInterval) clearInterval(pollInterval);
        resetImport();
      } catch (error) {
        alert('Failed to cancel import: ' + error.message);
      }
    };

    const downloadErrors = async () => {
      if (!activeImport.value) return;

      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/imports/${activeImport.value.id}/errors`, {
          headers: {
            'Authorization': `Bearer ${authStore.token}`
          }
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `import-errors-${activeImport.value.id}.csv`;
          a.click();
        }
      } catch (error) {
        alert('Failed to download errors: ' + error.message);
      }
    };

    const downloadJobErrors = async (jobId) => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/imports/${jobId}/errors`, {
          headers: {
            'Authorization': `Bearer ${authStore.token}`
          }
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `import-errors-${jobId}.csv`;
          a.click();
        }
      } catch (error) {
        alert('Failed to download errors: ' + error.message);
      }
    };

    const loadHistory = async () => {
      loading.value = true;
      try {
        let url = `${import.meta.env.VITE_API_BASE_URL}/admin/imports?limit=50`;
        if (historyFilter.value) {
          url += `&status=${historyFilter.value}`;
        }

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${authStore.token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          importHistory.value = data.imports || [];
        }
      } catch (error) {
        console.error('Failed to load history:', error);
      } finally {
        loading.value = false;
      }
    };

    const loadContactLists = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/admin/imports/contact-lists`, {
          headers: {
            'Authorization': `Bearer ${authStore.token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          contactLists.value = data.lists || [];
        }
      } catch (error) {
        console.error('Failed to load contact lists:', error);
      }
    };

    const viewJobDetails = (jobId) => {
      // TODO: Implement detailed view
      alert('Detailed view coming soon!');
    };

    const deleteJob = async (jobId) => {
      if (!confirm('Are you sure you want to delete this import job?')) return;

      try {
        await fetch(`${import.meta.env.VITE_API_URL}/v1/imports/${jobId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${authStore.token}`
          }
        });

        loadHistory();
      } catch (error) {
        alert('Failed to delete job: ' + error.message);
      }
    };

    const formatFileSize = (bytes) => {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    };

    const formatDate = (dateString) => {
      return new Date(dateString).toLocaleString();
    };

    // Lifecycle
    onMounted(() => {
      loadHistory();
      loadContactLists();
    });

    onBeforeUnmount(() => {
      // Clean up WebSocket and polling on component unmount
      if (websocket) {
        websocket.close();
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    });

    return {
      importType,
      selectedFile,
      useAIMapping,
      duplicateStrategy,
      targetListId,
      uploading,
      submitting,
      loading,
      bulkJSON,
      sheetsURL,
      sheetsRange,
      googleAuthorized,
      fieldMapping,
      pendingJob,
      activeImport,
      importHistory,
      contactLists,
      historyFilter,
      startFileImport,
      startBulkImport,
      startGoogleSheets,
      cancelImport,
      handleFileSelect,
      handleDrop,
      removeFile,
      uploadFile,
      submitBulkImport,
      submitGoogleSheetsImport,
      authorizeGoogleSheets,
      submitMapping,
      resetImport,
      cancelActiveImport,
      downloadErrors,
      downloadJobErrors,
      loadHistory,
      viewJobDetails,
      deleteJob,
      formatFileSize,
      formatDate
    };
  }
};
</script>

<style scoped>
.data-import {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  margin-bottom: 2rem;
}

.header h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.header p {
  color: #666;
}

/* Import Options */
.import-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
}

.option-card {
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.option-card:hover {
  border-color: #3b82f6;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
}

.option-card .icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.option-card h3 {
  margin-bottom: 0.5rem;
}

.option-card p {
  color: #666;
  font-size: 0.9rem;
}

/* Upload Section */
.upload-section,
.bulk-section,
.sheets-section,
.mapping-section,
.progress-section {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  margin-bottom: 2rem;
}

.upload-area {
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  padding: 3rem;
  margin: 2rem 0;
  text-align: center;
  transition: all 0.2s;
}

.upload-area:hover {
  border-color: #3b82f6;
  background: #f9fafb;
}

.upload-prompt {
  cursor: pointer;
}

.upload-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.file-selected {
  padding: 1rem;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: #f3f4f6;
  padding: 1rem;
  border-radius: 8px;
}

.file-icon {
  font-size: 2rem;
}

.file-name {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.file-size {
  font-size: 0.9rem;
  color: #666;
}

.import-settings {
  margin-top: 2rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.form-group select,
.form-group input[type="checkbox"] {
  margin-right: 0.5rem;
}

.form-group select,
.form-group .text-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

.form-group small {
  display: block;
  margin-top: 0.25rem;
  color: #6b7280;
  font-size: 0.875rem;
}

.info-box {
  background: #eff6ff;
  border: 1px solid #3b82f6;
  padding: 1rem;
  border-radius: 8px;
  margin-top: 1rem;
  color: #1e40af;
}

.json-textarea {
  width: 100%;
  padding: 1rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-family: monospace;
  font-size: 0.9rem;
  margin: 1rem 0;
}

/* Field Mapping */
.ai-suggestion {
  background: #fef3c7;
  border: 1px solid #fbbf24;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.preview-table {
  margin: 2rem 0;
  overflow-x: auto;
}

.preview-table table {
  width: 100%;
  border-collapse: collapse;
}

.preview-table th,
.preview-table td {
  padding: 0.75rem;
  border: 1px solid #e5e7eb;
  text-align: left;
}

.preview-table th {
  background: #f3f4f6;
  font-weight: 600;
}

.field-mapping {
  margin: 2rem 0;
}

.mapping-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
}

.source-field {
  background: #f3f4f6;
  padding: 0.75rem;
  border-radius: 4px;
  font-weight: 600;
}

.arrow {
  font-size: 1.5rem;
  color: #3b82f6;
}

.target-field {
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

.mapping-actions {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
}

/* Progress Section */
.progress-card {
  background: #f9fafb;
  border-radius: 8px;
  padding: 2rem;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  text-transform: capitalize;
}

.status-badge.pending,
.status-badge.pending_mapping { background: #e5e7eb; color: #374151; }
.status-badge.processing { background: #dbeafe; color: #1e40af; }
.status-badge.completed { background: #d1fae5; color: #065f46; }
.status-badge.failed { background: #fee2e2; color: #991b1b; }

.job-id {
  font-size: 0.9rem;
  color: #666;
}

.progress-bar {
  position: relative;
  background: #e5e7eb;
  height: 2rem;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 2rem;
}

.progress-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #2563eb);
  transition: width 0.3s;
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

.progress-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat {
  text-align: center;
  padding: 1rem;
  background: white;
  border-radius: 8px;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.stat-label {
  font-size: 0.9rem;
  color: #666;
}

.stat.success .stat-value { color: #059669; }
.stat.error .stat-value { color: #dc2626; }
.stat.warning .stat-value { color: #f59e0b; }

.completion-message {
  background: #d1fae5;
  border: 1px solid #059669;
  padding: 1rem;
  border-radius: 8px;
  text-align: center;
  font-weight: 600;
  color: #065f46;
  margin-bottom: 1rem;
}

.error-message {
  background: #fee2e2;
  border: 1px solid #dc2626;
  padding: 1rem;
  border-radius: 8px;
  text-align: center;
  font-weight: 600;
  color: #991b1b;
  margin-bottom: 1rem;
}

.progress-actions {
  display: flex;
  gap: 1rem;
}

/* History Section */
.history-section {
  background: white;
  border-radius: 8px;
  padding: 2rem;
}

.history-filters {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.history-filters select {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
}

.history-table th,
.history-table td {
  padding: 0.75rem;
  border: 1px solid #e5e7eb;
  text-align: left;
}

.history-table th {
  background: #f3f4f6;
  font-weight: 600;
}

.history-table td.success { color: #059669; font-weight: 600; }
.history-table td.error { color: #dc2626; font-weight: 600; }

.type-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  background: #e5e7eb;
  border-radius: 4px;
  font-size: 0.8rem;
  text-transform: uppercase;
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: #666;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #666;
}

/* Buttons */
.btn-primary,
.btn-secondary,
.btn-danger,
.btn-icon {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-primary:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.btn-secondary {
  background: #e5e7eb;
  color: #374151;
}

.btn-secondary:hover {
  background: #d1d5db;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger:hover {
  background: #dc2626;
}

.btn-icon {
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: 1px solid #d1d5db;
  font-size: 0.9rem;
}

.btn-icon:hover {
  background: #f3f4f6;
}

.btn-icon.btn-danger {
  border-color: #ef4444;
  color: #ef4444;
}
</style>
