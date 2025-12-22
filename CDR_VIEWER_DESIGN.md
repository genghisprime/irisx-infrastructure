# CDR Viewer - Complete Design Specification

**Feature:** Call Detail Records (CDR) Viewer & Analytics
**Priority:** CRITICAL - Core telecom functionality
**Estimated Effort:** 20-25 hours
**Target Completion:** December 2-3, 2025

---

## Executive Summary

The CDR Viewer provides administrators with comprehensive visibility into all voice call activity across all tenants. This is essential for:
- **Troubleshooting:** Identify call quality issues, dropped calls, routing problems
- **Billing Verification:** Audit call costs, verify carrier charges, validate tenant billing
- **Compliance:** TCPA compliance, call recording verification, consent tracking
- **Performance Analysis:** Track call success rates, duration patterns, quality metrics

---

## Database Schema (Already Exists ✅)

The `calls` table is already in production with all required fields:

### Key Fields Available:
```sql
-- Identifiers
id, uuid, call_sid, tenant_id

-- Call Details
direction (inbound/outbound), status, call_type
from_number, to_number
initiated_at, answered_at, ended_at
duration_seconds, billable_seconds

-- Quality Metrics
mos_score, jitter_ms, packet_loss_percent

-- Recording
recording_url, recording_sid, recording_duration_seconds
transcription_text, transcription_confidence

-- Pricing
cost_cents, rate_cents_per_minute
carrier_id, carrier_rate, carrier_cost (from migration 022)

-- Metadata
hangup_cause, hangup_by
metadata (JSONB), tags (array)
```

**Indexes Already Exist:**
- `idx_calls_tenant_id`
- `idx_calls_initiated_at` (DESC for fast recent queries)
- `idx_calls_tenant_initiated` (composite for tenant filtering)
- `idx_calls_status`, `idx_calls_direction`

---

## Backend Implementation

### File: `api/src/routes/admin-cdrs.js`

#### Endpoints to Build:

**1. GET /admin/cdrs - List/Search CDRs**
```javascript
Query Parameters:
- page, limit (pagination)
- tenant_id (filter by tenant)
- direction (inbound|outbound)
- status (initiated|ringing|answered|completed|failed|busy|no-answer)
- from_number, to_number (partial match with ILIKE)
- date_from, date_to (initiated_at range)
- min_duration, max_duration (billable_seconds)
- has_recording (true|false)
- hangup_cause (filter by specific causes)
- sort_by (initiated_at|duration|cost - default: initiated_at DESC)

Response:
{
  cdrs: [...],
  total: 5234,
  page: 1,
  limit: 50,
  total_pages: 105
}
```

**2. GET /admin/cdrs/:id - Get CDR Details**
```javascript
Response:
{
  cdr: {
    id, uuid, call_sid,
    tenant: { id, name },
    direction, status, call_type,
    from_number, to_number,
    user: { id, email } // if assigned to agent,
    initiated_at, ringing_at, answered_at, ended_at,
    duration_seconds, billable_seconds,
    mos_score, jitter_ms, packet_loss_percent,
    recording_url, recording_sid,
    transcription_text,
    cost_cents, rate_cents_per_minute,
    carrier: { id, name, rate, cost },
    hangup_cause, hangup_by,
    metadata, tags
  },
  events: [...] // From call_logs table
}
```

**3. GET /admin/cdrs/stats - CDR Statistics**
```javascript
Query Parameters:
- tenant_id (optional)
- date_from, date_to (default: last 30 days)

Response:
{
  summary: {
    total_calls: 15234,
    total_duration_minutes: 45678,
    total_cost_dollars: 1234.56,
    avg_duration_seconds: 180,
    avg_mos_score: 4.2
  },
  by_status: {
    completed: 12500,
    failed: 1234,
    busy: 800,
    no_answer: 700
  },
  by_direction: {
    inbound: 8500,
    outbound: 6734
  },
  quality_metrics: {
    excellent_mos: 10500, // MOS >= 4.0
    good_mos: 3500,       // MOS 3.0-3.9
    poor_mos: 1234        // MOS < 3.0
  },
  hourly_distribution: [...], // Calls by hour of day
  top_destinations: [...],    // Most called numbers
  top_sources: [...]          // Most calling numbers
}
```

**4. GET /admin/cdrs/export - Export to CSV**
```javascript
Query Parameters:
- Same filters as /admin/cdrs list
- format (csv|json - default: csv)

Response: CSV file download
Headers: Call SID, Tenant, Direction, From, To, Status, Initiated, Duration, Cost, MOS, Hangup Cause
```

**5. GET /admin/cdrs/timeline/:id - Call Event Timeline**
```javascript
// Get detailed event log for a specific call from call_logs table

Response:
{
  events: [
    { timestamp, event_type, description, metadata },
    ...
  ]
}
```

**6. GET /admin/cdrs/quality-alerts - Call Quality Alerts**
```javascript
// Calls with quality issues (low MOS, high packet loss, etc.)

Query Parameters:
- date_from, date_to
- min_mos_threshold (default: 3.0)
- max_packet_loss (default: 5%)

Response:
{
  alerts: [
    {
      call_sid, tenant_id, tenant_name,
      from_number, to_number,
      initiated_at, duration_seconds,
      mos_score, jitter_ms, packet_loss_percent,
      issue_summary: "Low MOS (2.8), High Packet Loss (8%)"
    },
    ...
  ],
  total_alerts: 45
}
```

---

## Frontend Implementation

### File: `irisx-admin-portal/src/views/admin/cdrs/CDRViewer.vue`

#### UI Components:

**1. Statistics Dashboard (Top Section)**
```vue
<div class="grid grid-cols-1 md:grid-cols-5 gap-6">
  <!-- Total Calls -->
  <StatCard title="Total Calls" :value="stats.total_calls" icon="phone" />

  <!-- Total Duration -->
  <StatCard title="Total Minutes" :value="formatDuration(stats.total_duration_minutes)" icon="clock" />

  <!-- Total Cost -->
  <StatCard title="Total Cost" :value="formatCurrency(stats.total_cost_dollars)" icon="dollar" color="green" />

  <!-- Average MOS -->
  <StatCard title="Avg Quality" :value="stats.avg_mos_score" subtitle="MOS Score" :color="getMosColor(stats.avg_mos_score)" />

  <!-- Success Rate -->
  <StatCard title="Success Rate" :value="getSuccessRate()" suffix="%" color="blue" />
</div>
```

**2. Filters Section**
```vue
<div class="bg-white rounded-xl shadow-md p-6">
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
    <!-- Tenant Filter -->
    <select v-model="filters.tenant_id">
      <option value="">All Tenants</option>
      <option v-for="tenant in tenants" :value="tenant.id">{{ tenant.name }}</option>
    </select>

    <!-- Direction Filter -->
    <select v-model="filters.direction">
      <option value="">All Directions</option>
      <option value="inbound">Inbound</option>
      <option value="outbound">Outbound</option>
    </select>

    <!-- Status Filter -->
    <select v-model="filters.status">
      <option value="">All Status</option>
      <option value="completed">Completed</option>
      <option value="failed">Failed</option>
      <option value="busy">Busy</option>
      <option value="no-answer">No Answer</option>
    </select>

    <!-- Search by Number -->
    <input
      v-model="filters.search"
      placeholder="Search by phone number..."
      class="px-4 py-2 border rounded-lg"
    />
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
    <!-- Date Range -->
    <input v-model="filters.date_from" type="datetime-local" />
    <input v-model="filters.date_to" type="datetime-local" />

    <!-- Quality Filter -->
    <select v-model="filters.quality">
      <option value="">All Quality</option>
      <option value="excellent">Excellent (MOS ≥ 4.0)</option>
      <option value="good">Good (MOS 3.0-3.9)</option>
      <option value="poor">Poor (MOS < 3.0)</option>
    </select>
  </div>

  <div class="mt-4 flex gap-2">
    <button @click="applyFilters" class="px-4 py-2 bg-blue-600 text-white rounded-lg">
      Apply Filters
    </button>
    <button @click="clearFilters" class="px-4 py-2 text-gray-700">
      Clear
    </button>
    <button @click="exportCDRs" class="px-4 py-2 bg-green-600 text-white rounded-lg ml-auto">
      Export CSV
    </button>
  </div>
</div>
```

**3. CDR Data Table**
```vue
<div class="bg-white rounded-xl shadow-md overflow-hidden">
  <table class="w-full">
    <thead class="bg-gray-50">
      <tr>
        <th>Call SID</th>
        <th>Tenant</th>
        <th>Direction</th>
        <th>From</th>
        <th>To</th>
        <th>Status</th>
        <th>Initiated</th>
        <th>Duration</th>
        <th>Quality (MOS)</th>
        <th>Cost</th>
        <th>Recording</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="cdr in cdrs" :key="cdr.id" class="border-b hover:bg-gray-50">
        <td class="px-4 py-3">
          <span class="font-mono text-sm">{{ truncate(cdr.call_sid, 12) }}</span>
        </td>
        <td class="px-4 py-3">{{ cdr.tenant_name }}</td>
        <td class="px-4 py-3">
          <span :class="getDirectionBadge(cdr.direction)">
            {{ cdr.direction }}
          </span>
        </td>
        <td class="px-4 py-3 font-mono text-sm">{{ formatPhone(cdr.from_number) }}</td>
        <td class="px-4 py-3 font-mono text-sm">{{ formatPhone(cdr.to_number) }}</td>
        <td class="px-4 py-3">
          <span :class="getStatusBadge(cdr.status)">
            {{ cdr.status }}
          </span>
        </td>
        <td class="px-4 py-3 text-sm">{{ formatDateTime(cdr.initiated_at) }}</td>
        <td class="px-4 py-3 text-sm">{{ formatDuration(cdr.duration_seconds) }}</td>
        <td class="px-4 py-3">
          <span :class="getMosBadge(cdr.mos_score)">
            {{ cdr.mos_score || 'N/A' }}
          </span>
        </td>
        <td class="px-4 py-3 text-sm">${{ (cdr.cost_cents / 100).toFixed(4) }}</td>
        <td class="px-4 py-3">
          <button
            v-if="cdr.recording_url"
            @click="playRecording(cdr)"
            class="text-blue-600 hover:text-blue-800"
          >
            <svg><!-- Play icon --></svg>
          </button>
          <span v-else class="text-gray-400">—</span>
        </td>
        <td class="px-4 py-3">
          <button @click="viewDetails(cdr.id)" class="text-blue-600 hover:text-blue-800">
            View
          </button>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- Pagination -->
  <div class="px-6 py-4 border-t flex justify-between items-center">
    <div class="text-sm text-gray-600">
      Showing {{ (page - 1) * limit + 1 }} to {{ Math.min(page * limit, total) }} of {{ total }} calls
    </div>
    <div class="flex gap-2">
      <button @click="prevPage" :disabled="page === 1">Previous</button>
      <span class="px-4 py-2">Page {{ page }} of {{ totalPages }}</span>
      <button @click="nextPage" :disabled="page === totalPages">Next</button>
    </div>
  </div>
</div>
```

**4. CDR Details Modal**
```vue
<Modal v-if="selectedCDR" @close="selectedCDR = null">
  <div class="p-6">
    <h2 class="text-2xl font-bold mb-6">Call Details</h2>

    <!-- Call Information Grid -->
    <div class="grid grid-cols-2 gap-6 mb-6">
      <div>
        <h3 class="font-semibold mb-3">Call Information</h3>
        <div class="space-y-2 text-sm">
          <div><strong>Call SID:</strong> {{ selectedCDR.call_sid }}</div>
          <div><strong>Direction:</strong> {{ selectedCDR.direction }}</div>
          <div><strong>Status:</strong> {{ selectedCDR.status }}</div>
          <div><strong>From:</strong> {{ selectedCDR.from_number }}</div>
          <div><strong>To:</strong> {{ selectedCDR.to_number }}</div>
          <div><strong>Tenant:</strong> {{ selectedCDR.tenant.name }}</div>
        </div>
      </div>

      <div>
        <h3 class="font-semibold mb-3">Timing</h3>
        <div class="space-y-2 text-sm">
          <div><strong>Initiated:</strong> {{ formatDateTime(selectedCDR.initiated_at) }}</div>
          <div><strong>Ringing:</strong> {{ formatDateTime(selectedCDR.ringing_at) }}</div>
          <div><strong>Answered:</strong> {{ formatDateTime(selectedCDR.answered_at) }}</div>
          <div><strong>Ended:</strong> {{ formatDateTime(selectedCDR.ended_at) }}</div>
          <div><strong>Duration:</strong> {{ formatDuration(selectedCDR.duration_seconds) }}</div>
          <div><strong>Billable:</strong> {{ formatDuration(selectedCDR.billable_seconds) }}</div>
        </div>
      </div>
    </div>

    <!-- Quality Metrics -->
    <div class="mb-6">
      <h3 class="font-semibold mb-3">Quality Metrics</h3>
      <div class="grid grid-cols-3 gap-4">
        <div class="p-4 bg-gray-50 rounded-lg">
          <div class="text-sm text-gray-600">MOS Score</div>
          <div class="text-2xl font-bold" :class="getMosColor(selectedCDR.mos_score)">
            {{ selectedCDR.mos_score || 'N/A' }}
          </div>
        </div>
        <div class="p-4 bg-gray-50 rounded-lg">
          <div class="text-sm text-gray-600">Jitter</div>
          <div class="text-2xl font-bold">{{ selectedCDR.jitter_ms || 'N/A' }} ms</div>
        </div>
        <div class="p-4 bg-gray-50 rounded-lg">
          <div class="text-sm text-gray-600">Packet Loss</div>
          <div class="text-2xl font-bold">{{ selectedCDR.packet_loss_percent || 'N/A' }}%</div>
        </div>
      </div>
    </div>

    <!-- Pricing -->
    <div class="mb-6">
      <h3 class="font-semibold mb-3">Pricing</h3>
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div><strong>Rate:</strong> ${{ (selectedCDR.rate_cents_per_minute / 100).toFixed(4) }}/min</div>
        <div><strong>Total Cost:</strong> ${{ (selectedCDR.cost_cents / 100).toFixed(4) }}</div>
        <div v-if="selectedCDR.carrier"><strong>Carrier:</strong> {{ selectedCDR.carrier.name }}</div>
        <div v-if="selectedCDR.carrier_cost"><strong>Carrier Cost:</strong> ${{ selectedCDR.carrier_cost }}</div>
      </div>
    </div>

    <!-- Recording & Transcription -->
    <div v-if="selectedCDR.recording_url || selectedCDR.transcription_text" class="mb-6">
      <h3 class="font-semibold mb-3">Recording & Transcription</h3>
      <div v-if="selectedCDR.recording_url" class="mb-4">
        <audio controls :src="selectedCDR.recording_url" class="w-full"></audio>
        <div class="text-sm text-gray-600 mt-2">
          Duration: {{ formatDuration(selectedCDR.recording_duration_seconds) }}
        </div>
      </div>
      <div v-if="selectedCDR.transcription_text" class="p-4 bg-gray-50 rounded-lg">
        <div class="text-sm text-gray-600 mb-2">Transcription ({{ selectedCDR.transcription_confidence }}% confidence)</div>
        <div class="text-sm">{{ selectedCDR.transcription_text }}</div>
      </div>
    </div>

    <!-- Event Timeline -->
    <div v-if="callEvents.length" class="mb-6">
      <h3 class="font-semibold mb-3">Call Events Timeline</h3>
      <div class="space-y-2">
        <div v-for="event in callEvents" :key="event.id" class="flex items-start gap-3 text-sm">
          <div class="w-32 text-gray-600">{{ formatTime(event.timestamp) }}</div>
          <div class="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
            <div class="w-2 h-2 rounded-full bg-blue-600"></div>
          </div>
          <div class="flex-1">
            <div class="font-medium">{{ event.event_type }}</div>
            <div class="text-gray-600">{{ event.description }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Hangup Information -->
    <div v-if="selectedCDR.hangup_cause" class="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <div class="text-sm">
        <strong>Hangup Cause:</strong> {{ selectedCDR.hangup_cause }}
      </div>
      <div class="text-sm">
        <strong>Hangup By:</strong> {{ selectedCDR.hangup_by }}
      </div>
    </div>
  </div>
</Modal>
```

**5. Quality Alerts Section**
```vue
<div class="bg-white rounded-xl shadow-md p-6 mb-6">
  <h3 class="text-lg font-semibold mb-4">Recent Call Quality Alerts</h3>
  <div class="space-y-2">
    <div v-for="alert in qualityAlerts" :key="alert.call_sid"
         class="p-3 bg-red-50 border border-red-200 rounded-lg flex justify-between items-center">
      <div>
        <div class="font-medium">{{ alert.tenant_name }}</div>
        <div class="text-sm text-gray-600">
          {{ alert.from_number }} → {{ alert.to_number }}
        </div>
        <div class="text-sm text-red-600 mt-1">{{ alert.issue_summary }}</div>
      </div>
      <div class="text-right">
        <div class="text-sm text-gray-600">{{ formatDateTime(alert.initiated_at) }}</div>
        <button @click="viewDetails(alert.call_sid)" class="text-blue-600 text-sm hover:text-blue-800 mt-1">
          View Details
        </button>
      </div>
    </div>
  </div>
</div>
```

---

## API Client Methods

### File: `irisx-admin-portal/src/utils/api.js`

```javascript
cdrs: {
  // List CDRs with filters
  list: (params) => api.get('/admin/cdrs', { params }),

  // Get single CDR with full details
  getDetails: (id) => api.get(`/admin/cdrs/${id}`),

  // Get CDR statistics
  getStats: (params) => api.get('/admin/cdrs/stats', { params }),

  // Get call event timeline
  getTimeline: (id) => api.get(`/admin/cdrs/timeline/${id}`),

  // Get quality alerts
  getQualityAlerts: (params) => api.get('/admin/cdrs/quality-alerts', { params }),

  // Export to CSV
  export: (params) => api.get('/admin/cdrs/export', {
    params,
    responseType: 'blob'
  })
}
```

---

## Router Configuration

### File: `irisx-admin-portal/src/router/index.js`

```javascript
{
  path: 'cdrs',
  name: 'CDRViewer',
  component: () => import('../views/admin/cdrs/CDRViewer.vue'),
  meta: { requiresRole: 'admin' }
}
```

---

## Sidebar Navigation

### File: `irisx-admin-portal/src/components/admin/layout/AdminLayout.vue`

```vue
<RouterLink
  v-if="authStore.isAdmin"
  to="/dashboard/cdrs"
  class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
  :class="{ 'bg-gray-800': $route.path === '/dashboard/cdrs' }"
>
  <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
  Call Records
</RouterLink>
```

---

## Implementation Checklist

### Backend (api/src/routes/admin-cdrs.js)
- [ ] GET /admin/cdrs - List with filters
- [ ] GET /admin/cdrs/:id - Get details
- [ ] GET /admin/cdrs/stats - Statistics
- [ ] GET /admin/cdrs/timeline/:id - Event timeline
- [ ] GET /admin/cdrs/quality-alerts - Quality alerts
- [ ] GET /admin/cdrs/export - CSV export
- [ ] Add audit logging for all endpoints
- [ ] Add role-based access control
- [ ] Optimize queries with proper indexes

### Frontend (irisx-admin-portal/src/views/admin/cdrs/CDRViewer.vue)
- [ ] Build statistics dashboard
- [ ] Build filter section
- [ ] Build CDR data table
- [ ] Build CDR details modal
- [ ] Build quality alerts section
- [ ] Add audio player for recordings
- [ ] Add CSV export functionality
- [ ] Add loading states and error handling

### Integration
- [ ] Add API client methods to api.js
- [ ] Add route to router
- [ ] Add sidebar navigation link
- [ ] Add page title mapping

### Testing
- [ ] Test with various filter combinations
- [ ] Test pagination with large datasets
- [ ] Test export functionality
- [ ] Test recording playback
- [ ] Test quality alerts
- [ ] Verify performance with 100k+ CDRs

---

## Key Features Summary

✅ **Search & Filter:**
- By tenant, direction, status, phone numbers
- Date range filtering
- Duration range filtering
- Quality score filtering

✅ **Statistics Dashboard:**
- Total calls, duration, cost
- Success rate, average quality
- Hourly distribution
- Top destinations/sources

✅ **Call Quality Monitoring:**
- MOS score visualization
- Jitter and packet loss tracking
- Quality alerts for poor calls
- Trend analysis

✅ **Recording Integration:**
- Inline audio player
- Transcription viewing
- Download functionality

✅ **Export Capabilities:**
- CSV export with all filters
- Custom date ranges
- Selective field export

✅ **Detailed Call View:**
- Complete call timeline
- Event log integration
- Quality metrics breakdown
- Pricing breakdown (customer & carrier)

---

## Performance Considerations

1. **Database Queries:**
   - Use existing indexes on `calls` table
   - Add composite indexes if needed for common filters
   - Limit default queries to last 30 days

2. **Pagination:**
   - Default: 50 CDRs per page
   - Max: 200 CDRs per page
   - Use cursor-based pagination for large datasets

3. **Caching:**
   - Cache statistics for 5 minutes
   - Cache tenant list for 15 minutes
   - Cache carrier list for 1 hour

4. **Export:**
   - Limit exports to 10,000 CDRs max
   - Stream CSV generation for memory efficiency
   - Queue large exports for background processing

---

## Next Steps After CDR Viewer

With CDR Viewer complete, the next logical features would be:

1. **Billing Rates Management** - Use CDR cost data to verify billing accuracy
2. **Cross-Tenant Analytics** - Aggregate CDR data for system-wide insights
3. **Voice Quality Dashboard** - Deep dive into MOS trends and quality issues

---

**This design provides a production-ready CDR Viewer that gives you complete visibility into your voice platform's call activity, quality, and costs.**
