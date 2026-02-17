<template>
  <div class="p-6 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Quality Management</h1>
        <p class="text-gray-500">Evaluate calls, track performance, and coach agents</p>
      </div>
      <div class="flex items-center gap-3">
        <button @click="activeTab = 'scorecards'" :class="tabClass('scorecards')">Scorecards</button>
        <button @click="activeTab = 'evaluations'" :class="tabClass('evaluations')">Evaluations</button>
        <button @click="activeTab = 'coaching'" :class="tabClass('coaching')">Coaching</button>
        <button @click="activeTab = 'analytics'" :class="tabClass('analytics')">Analytics</button>
      </div>
    </div>

    <!-- Scorecards Tab -->
    <div v-if="activeTab === 'scorecards'">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <select v-model="categoryFilter" class="px-3 py-2 border rounded-lg">
            <option value="">All Categories</option>
            <option value="general">General</option>
            <option value="sales">Sales</option>
            <option value="support">Support</option>
            <option value="compliance">Compliance</option>
          </select>
        </div>
        <button @click="showScorecardModal = true" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
          <PlusIcon class="h-5 w-5" />
          New Scorecard
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="scorecard in filteredScorecards"
          :key="scorecard.id"
          class="bg-white border rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer"
          @click="selectScorecard(scorecard)"
        >
          <div class="flex items-start justify-between mb-3">
            <div>
              <h3 class="font-semibold text-gray-900">{{ scorecard.name }}</h3>
              <p class="text-sm text-gray-500">{{ scorecard.description || 'No description' }}</p>
            </div>
            <span :class="['px-2 py-1 rounded-full text-xs font-medium', getCategoryBadge(scorecard.category)]">
              {{ scorecard.category }}
            </span>
          </div>
          <div class="flex items-center gap-4 text-sm text-gray-500">
            <span>{{ scorecard.section_count }} sections</span>
            <span>Passing: {{ scorecard.passing_score }}%</span>
            <span>{{ scorecard.usage_count }} evaluations</span>
          </div>
          <div class="mt-3 flex items-center justify-between">
            <span :class="['text-xs font-medium', scorecard.is_active ? 'text-green-600' : 'text-gray-400']">
              {{ scorecard.is_active ? 'Active' : 'Inactive' }}
            </span>
            <button @click.stop="editScorecard(scorecard)" class="text-blue-600 text-sm hover:underline">
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Evaluations Tab -->
    <div v-if="activeTab === 'evaluations'">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <select v-model="evalStatusFilter" class="px-3 py-2 border rounded-lg">
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="completed">Completed</option>
            <option value="disputed">Disputed</option>
          </select>
          <select v-model="evalAgentFilter" class="px-3 py-2 border rounded-lg">
            <option value="">All Agents</option>
            <option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
          </select>
        </div>
        <button @click="showNewEvalModal = true" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
          <PlusIcon class="h-5 w-5" />
          New Evaluation
        </button>
      </div>

      <div class="bg-white border rounded-xl overflow-hidden">
        <table class="w-full">
          <thead class="bg-gray-50 border-b">
            <tr>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">Agent</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">Scorecard</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">Evaluator</th>
              <th class="px-4 py-3 text-center text-sm font-medium text-gray-500">Score</th>
              <th class="px-4 py-3 text-center text-sm font-medium text-gray-500">Status</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">Date</th>
              <th class="px-4 py-3 text-right text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="eval_ in filteredEvaluations" :key="eval_.id" class="border-b last:border-b-0 hover:bg-gray-50">
              <td class="px-4 py-3 font-medium">{{ eval_.agent_name }}</td>
              <td class="px-4 py-3 text-gray-600">{{ eval_.scorecard_name }}</td>
              <td class="px-4 py-3 text-gray-600">{{ eval_.evaluator_name }}</td>
              <td class="px-4 py-3 text-center">
                <span v-if="eval_.total_score !== null" :class="['font-semibold', getScoreColor(eval_.total_score, eval_.passing_score)]">
                  {{ Math.round(eval_.total_score) }}%
                </span>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="px-4 py-3 text-center">
                <span :class="['px-2 py-1 rounded-full text-xs font-medium', getStatusBadge(eval_.status)]">
                  {{ eval_.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-gray-600">{{ formatDate(eval_.created_at) }}</td>
              <td class="px-4 py-3 text-right">
                <button @click="viewEvaluation(eval_)" class="text-blue-600 hover:underline text-sm">View</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Coaching Tab -->
    <div v-if="activeTab === 'coaching'">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <select v-model="coachingStatusFilter" class="px-3 py-2 border rounded-lg">
            <option value="">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <button @click="showCoachingModal = true" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
          <PlusIcon class="h-5 w-5" />
          Schedule Coaching
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="session in filteredCoachingSessions"
          :key="session.id"
          class="bg-white border rounded-xl p-5"
        >
          <div class="flex items-start justify-between mb-3">
            <div>
              <h3 class="font-semibold text-gray-900">{{ session.title || 'Coaching Session' }}</h3>
              <p class="text-sm text-gray-500">Agent: {{ session.agent_name }}</p>
            </div>
            <span :class="['px-2 py-1 rounded-full text-xs font-medium', getCoachingStatusBadge(session.status)]">
              {{ session.status.replace('_', ' ') }}
            </span>
          </div>
          <div class="flex items-center gap-4 text-sm text-gray-500 mb-3">
            <span>Coach: {{ session.coach_name }}</span>
            <span v-if="session.scheduled_at">{{ formatDateTime(session.scheduled_at) }}</span>
          </div>
          <div v-if="session.focus_areas?.length" class="flex flex-wrap gap-2 mb-3">
            <span v-for="area in session.focus_areas" :key="area" class="px-2 py-1 bg-gray-100 rounded text-xs">
              {{ area }}
            </span>
          </div>
          <div class="flex items-center justify-end gap-2">
            <button @click="editCoachingSession(session)" class="text-blue-600 text-sm hover:underline">Edit</button>
            <button v-if="session.status !== 'completed'" @click="completeCoaching(session)" class="text-green-600 text-sm hover:underline">Complete</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Analytics Tab -->
    <div v-if="activeTab === 'analytics'">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white border rounded-xl p-5">
          <p class="text-sm text-gray-500 mb-1">Avg Score</p>
          <p class="text-3xl font-bold text-gray-900">{{ teamStats.avg_score || 0 }}%</p>
        </div>
        <div class="bg-white border rounded-xl p-5">
          <p class="text-sm text-gray-500 mb-1">Pass Rate</p>
          <p class="text-3xl font-bold text-green-600">{{ teamStats.pass_rate || 0 }}%</p>
        </div>
        <div class="bg-white border rounded-xl p-5">
          <p class="text-sm text-gray-500 mb-1">Total Evaluations</p>
          <p class="text-3xl font-bold text-gray-900">{{ teamStats.total_evaluations || 0 }}</p>
        </div>
        <div class="bg-white border rounded-xl p-5">
          <p class="text-sm text-gray-500 mb-1">Coaching Sessions</p>
          <p class="text-3xl font-bold text-blue-600">{{ coachingSessions.length }}</p>
        </div>
      </div>

      <!-- Agent Leaderboard -->
      <div class="bg-white border rounded-xl overflow-hidden mb-6">
        <div class="px-5 py-3 border-b">
          <h3 class="font-semibold">Agent Quality Leaderboard</h3>
        </div>
        <table class="w-full">
          <thead class="bg-gray-50 border-b">
            <tr>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">Rank</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">Agent</th>
              <th class="px-4 py-3 text-center text-sm font-medium text-gray-500">Evaluations</th>
              <th class="px-4 py-3 text-center text-sm font-medium text-gray-500">Avg Score</th>
              <th class="px-4 py-3 text-center text-sm font-medium text-gray-500">Pass Rate</th>
              <th class="px-4 py-3 text-center text-sm font-medium text-gray-500">Auto-Fails</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(agent, i) in agentStats" :key="agent.agent_id" class="border-b last:border-b-0">
              <td class="px-4 py-3">
                <span :class="['w-6 h-6 inline-flex items-center justify-center rounded-full text-xs font-bold', getRankBadge(i)]">
                  {{ i + 1 }}
                </span>
              </td>
              <td class="px-4 py-3 font-medium">{{ agent.agent_name }}</td>
              <td class="px-4 py-3 text-center">{{ agent.evaluations }}</td>
              <td class="px-4 py-3 text-center">
                <span :class="['font-semibold', agent.avg_score >= 80 ? 'text-green-600' : agent.avg_score >= 60 ? 'text-yellow-600' : 'text-red-600']">
                  {{ Math.round(agent.avg_score) }}%
                </span>
              </td>
              <td class="px-4 py-3 text-center">{{ agent.pass_rate }}%</td>
              <td class="px-4 py-3 text-center text-red-600">{{ agent.auto_fails }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Trends Chart Placeholder -->
      <div class="bg-white border rounded-xl p-5">
        <h3 class="font-semibold mb-4">Quality Trends (Last 30 Days)</h3>
        <div class="h-64 flex items-center justify-center text-gray-400">
          <p>Chart visualization would be rendered here</p>
        </div>
      </div>
    </div>

    <!-- New Scorecard Modal -->
    <div v-if="showScorecardModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div class="p-4 border-b flex items-center justify-between">
          <h3 class="font-semibold text-lg">{{ editingScorecard ? 'Edit Scorecard' : 'New Scorecard' }}</h3>
          <button @click="closeScorecardModal" class="text-gray-500 hover:text-gray-700">
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input v-model="scorecardForm.name" type="text" class="w-full px-3 py-2 border rounded-lg" placeholder="Scorecard name" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea v-model="scorecardForm.description" rows="2" class="w-full px-3 py-2 border rounded-lg" placeholder="Description"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select v-model="scorecardForm.category" class="w-full px-3 py-2 border rounded-lg">
                <option value="general">General</option>
                <option value="sales">Sales</option>
                <option value="support">Support</option>
                <option value="compliance">Compliance</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Passing Score (%)</label>
              <input v-model.number="scorecardForm.passing_score" type="number" min="0" max="100" class="w-full px-3 py-2 border rounded-lg" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <input type="checkbox" v-model="scorecardForm.auto_fail_enabled" id="autoFail" class="rounded" />
            <label for="autoFail" class="text-sm text-gray-700">Enable auto-fail criteria</label>
          </div>
        </div>
        <div class="p-4 border-t flex justify-end gap-3">
          <button @click="closeScorecardModal" class="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
          <button @click="saveScorecard" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            {{ editingScorecard ? 'Save Changes' : 'Create Scorecard' }}
          </button>
        </div>
      </div>
    </div>

    <!-- New Evaluation Modal -->
    <div v-if="showNewEvalModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div class="p-4 border-b flex items-center justify-between">
          <h3 class="font-semibold text-lg">Start New Evaluation</h3>
          <button @click="showNewEvalModal = false" class="text-gray-500 hover:text-gray-700">
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Agent to Evaluate</label>
            <select v-model="evalForm.agent_id" class="w-full px-3 py-2 border rounded-lg">
              <option value="">Select agent...</option>
              <option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Scorecard</label>
            <select v-model="evalForm.scorecard_id" class="w-full px-3 py-2 border rounded-lg">
              <option value="">Select scorecard...</option>
              <option v-for="sc in scorecards.filter(s => s.is_active)" :key="sc.id" :value="sc.id">{{ sc.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Call ID (optional)</label>
            <input v-model="evalForm.call_id" type="text" class="w-full px-3 py-2 border rounded-lg" placeholder="Enter call UUID" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Evaluation Type</label>
            <select v-model="evalForm.evaluation_type" class="w-full px-3 py-2 border rounded-lg">
              <option value="random">Random</option>
              <option value="targeted">Targeted</option>
              <option value="self">Self Evaluation</option>
            </select>
          </div>
        </div>
        <div class="p-4 border-t flex justify-end gap-3">
          <button @click="showNewEvalModal = false" class="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
          <button @click="startEvaluation" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Start Evaluation
          </button>
        </div>
      </div>
    </div>

    <!-- Coaching Session Modal -->
    <div v-if="showCoachingModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div class="p-4 border-b flex items-center justify-between">
          <h3 class="font-semibold text-lg">Schedule Coaching Session</h3>
          <button @click="showCoachingModal = false" class="text-gray-500 hover:text-gray-700">
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Agent</label>
            <select v-model="coachingForm.agent_id" class="w-full px-3 py-2 border rounded-lg">
              <option value="">Select agent...</option>
              <option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Session Title</label>
            <input v-model="coachingForm.title" type="text" class="w-full px-3 py-2 border rounded-lg" placeholder="e.g., Weekly Check-in" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Session Type</label>
            <select v-model="coachingForm.session_type" class="w-full px-3 py-2 border rounded-lg">
              <option value="one_on_one">One-on-One</option>
              <option value="side_by_side">Side-by-Side</option>
              <option value="group">Group Session</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Scheduled Date & Time</label>
            <input v-model="coachingForm.scheduled_at" type="datetime-local" class="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Focus Areas</label>
            <input v-model="coachingForm.focus_areas_text" type="text" class="w-full px-3 py-2 border rounded-lg" placeholder="Comma-separated areas" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea v-model="coachingForm.notes" rows="2" class="w-full px-3 py-2 border rounded-lg" placeholder="Session notes"></textarea>
          </div>
        </div>
        <div class="p-4 border-t flex justify-end gap-3">
          <button @click="showCoachingModal = false" class="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
          <button @click="scheduleCoaching" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Schedule
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/utils/api'

// Icon Components
const PlusIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M12 4.5v15m7.5-7.5h-15' })]) }
const XMarkIcon = { render: () => h('svg', { xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24', 'stroke-width': '1.5', stroke: 'currentColor' }, [h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M6 18L18 6M6 6l12 12' })]) }

const router = useRouter()

// State
const activeTab = ref('scorecards')
const scorecards = ref([])
const evaluations = ref([])
const coachingSessions = ref([])
const agents = ref([])
const teamStats = ref({})
const agentStats = ref([])

// Filters
const categoryFilter = ref('')
const evalStatusFilter = ref('')
const evalAgentFilter = ref('')
const coachingStatusFilter = ref('')

// Modals
const showScorecardModal = ref(false)
const showNewEvalModal = ref(false)
const showCoachingModal = ref(false)
const editingScorecard = ref(null)

// Forms
const scorecardForm = reactive({
  name: '',
  description: '',
  category: 'general',
  passing_score: 70,
  auto_fail_enabled: false,
})

const evalForm = reactive({
  agent_id: '',
  scorecard_id: '',
  call_id: '',
  evaluation_type: 'random',
})

const coachingForm = reactive({
  agent_id: '',
  title: '',
  session_type: 'one_on_one',
  scheduled_at: '',
  focus_areas_text: '',
  notes: '',
})

// Computed
const filteredScorecards = computed(() => {
  return scorecards.value.filter(sc => {
    if (categoryFilter.value && sc.category !== categoryFilter.value) return false
    return true
  })
})

const filteredEvaluations = computed(() => {
  return evaluations.value.filter(e => {
    if (evalStatusFilter.value && e.status !== evalStatusFilter.value) return false
    if (evalAgentFilter.value && e.agent_id !== parseInt(evalAgentFilter.value)) return false
    return true
  })
})

const filteredCoachingSessions = computed(() => {
  return coachingSessions.value.filter(s => {
    if (coachingStatusFilter.value && s.status !== coachingStatusFilter.value) return false
    return true
  })
})

// Lifecycle
onMounted(async () => {
  await Promise.all([
    loadScorecards(),
    loadEvaluations(),
    loadCoachingSessions(),
    loadAgents(),
    loadTeamStats(),
    loadAgentStats(),
  ])
})

// Methods
async function loadScorecards() {
  try {
    const { data } = await api.get('/quality/scorecards')
    scorecards.value = data.scorecards || []
  } catch (error) {
    console.error('Failed to load scorecards:', error)
  }
}

async function loadEvaluations() {
  try {
    const { data } = await api.get('/quality/evaluations')
    evaluations.value = data.evaluations || []
  } catch (error) {
    console.error('Failed to load evaluations:', error)
  }
}

async function loadCoachingSessions() {
  try {
    const { data } = await api.get('/quality/coaching')
    coachingSessions.value = data.sessions || []
  } catch (error) {
    console.error('Failed to load coaching sessions:', error)
  }
}

async function loadAgents() {
  try {
    const { data } = await api.get('/agents')
    agents.value = data.agents || []
  } catch (error) {
    console.error('Failed to load agents:', error)
  }
}

async function loadTeamStats() {
  try {
    const { data } = await api.get('/quality/analytics/team')
    // Aggregate team stats
    const stats = data.stats || []
    if (stats.length > 0) {
      const total = stats.reduce((acc, s) => acc + s.evaluations, 0)
      const avgScore = stats.reduce((acc, s) => acc + (s.avg_score * s.evaluations), 0) / (total || 1)
      const avgPassRate = stats.reduce((acc, s) => acc + parseFloat(s.pass_rate || 0), 0) / (stats.length || 1)
      teamStats.value = {
        total_evaluations: total,
        avg_score: Math.round(avgScore),
        pass_rate: Math.round(avgPassRate),
      }
    }
  } catch (error) {
    console.error('Failed to load team stats:', error)
  }
}

async function loadAgentStats() {
  try {
    const { data } = await api.get('/quality/analytics/team')
    agentStats.value = data.stats || []
  } catch (error) {
    console.error('Failed to load agent stats:', error)
  }
}

function tabClass(tab) {
  return activeTab.value === tab
    ? 'px-4 py-2 bg-blue-600 text-white rounded-lg'
    : 'px-4 py-2 border rounded-lg hover:bg-gray-50'
}

function getCategoryBadge(category) {
  const colors = {
    general: 'bg-gray-100 text-gray-800',
    sales: 'bg-green-100 text-green-800',
    support: 'bg-blue-100 text-blue-800',
    compliance: 'bg-purple-100 text-purple-800',
  }
  return colors[category] || colors.general
}

function getStatusBadge(status) {
  const colors = {
    draft: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    disputed: 'bg-red-100 text-red-800',
    reviewed: 'bg-blue-100 text-blue-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

function getCoachingStatusBadge(status) {
  const colors = {
    scheduled: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

function getScoreColor(score, passing) {
  if (score >= passing) return 'text-green-600'
  if (score >= passing - 10) return 'text-yellow-600'
  return 'text-red-600'
}

function getRankBadge(index) {
  if (index === 0) return 'bg-yellow-400 text-yellow-900'
  if (index === 1) return 'bg-gray-300 text-gray-700'
  if (index === 2) return 'bg-orange-300 text-orange-800'
  return 'bg-gray-100 text-gray-600'
}

function formatDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleDateString()
}

function formatDateTime(date) {
  if (!date) return ''
  return new Date(date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function selectScorecard(scorecard) {
  router.push(`/quality/scorecard/${scorecard.id}`)
}

function editScorecard(scorecard) {
  editingScorecard.value = scorecard
  scorecardForm.name = scorecard.name
  scorecardForm.description = scorecard.description || ''
  scorecardForm.category = scorecard.category
  scorecardForm.passing_score = scorecard.passing_score
  scorecardForm.auto_fail_enabled = scorecard.auto_fail_enabled
  showScorecardModal.value = true
}

function closeScorecardModal() {
  showScorecardModal.value = false
  editingScorecard.value = null
  scorecardForm.name = ''
  scorecardForm.description = ''
  scorecardForm.category = 'general'
  scorecardForm.passing_score = 70
  scorecardForm.auto_fail_enabled = false
}

async function saveScorecard() {
  try {
    if (editingScorecard.value) {
      await api.put(`/quality/scorecards/${editingScorecard.value.id}`, scorecardForm)
    } else {
      await api.post('/quality/scorecards', scorecardForm)
    }
    await loadScorecards()
    closeScorecardModal()
  } catch (error) {
    console.error('Failed to save scorecard:', error)
  }
}

async function startEvaluation() {
  if (!evalForm.agent_id || !evalForm.scorecard_id) return
  try {
    const { data } = await api.post('/quality/evaluations', {
      agent_id: parseInt(evalForm.agent_id),
      scorecard_id: parseInt(evalForm.scorecard_id),
      call_id: evalForm.call_id || undefined,
      evaluation_type: evalForm.evaluation_type,
    })
    showNewEvalModal.value = false
    router.push(`/quality/evaluate/${data.evaluation.id}`)
  } catch (error) {
    console.error('Failed to start evaluation:', error)
  }
}

function viewEvaluation(eval_) {
  router.push(`/quality/evaluation/${eval_.id}`)
}

async function scheduleCoaching() {
  if (!coachingForm.agent_id) return
  try {
    const focusAreas = coachingForm.focus_areas_text
      ? coachingForm.focus_areas_text.split(',').map(a => a.trim()).filter(Boolean)
      : []

    await api.post('/quality/coaching', {
      agent_id: parseInt(coachingForm.agent_id),
      title: coachingForm.title,
      session_type: coachingForm.session_type,
      scheduled_at: coachingForm.scheduled_at || undefined,
      focus_areas: focusAreas,
      notes: coachingForm.notes,
    })
    await loadCoachingSessions()
    showCoachingModal.value = false

    // Reset form
    coachingForm.agent_id = ''
    coachingForm.title = ''
    coachingForm.session_type = 'one_on_one'
    coachingForm.scheduled_at = ''
    coachingForm.focus_areas_text = ''
    coachingForm.notes = ''
  } catch (error) {
    console.error('Failed to schedule coaching:', error)
  }
}

function editCoachingSession(session) {
  console.log('Edit coaching session:', session.id)
}

async function completeCoaching(session) {
  try {
    await api.put(`/quality/coaching/${session.id}`, { status: 'completed' })
    await loadCoachingSessions()
  } catch (error) {
    console.error('Failed to complete coaching:', error)
  }
}
</script>
