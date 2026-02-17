<template>
  <div class="ai-agent-assist" :class="{ minimized: isMinimized }">
    <!-- Header -->
    <div class="assist-header" @click="toggleMinimize">
      <div class="header-left">
        <span class="ai-icon">&#x1F916;</span>
        <span class="title">AI Agent Assist</span>
        <span v-if="isAnalyzing" class="analyzing-badge">
          <span class="pulse"></span>
          Analyzing
        </span>
      </div>
      <div class="header-actions">
        <button class="icon-btn" @click.stop="refreshAnalysis" title="Refresh">&#x1F504;</button>
        <button class="icon-btn" @click.stop="toggleMinimize">
          {{ isMinimized ? '&#x25B2;' : '&#x25BC;' }}
        </button>
      </div>
    </div>

    <!-- Content -->
    <div v-if="!isMinimized" class="assist-content">
      <!-- Customer Sentiment -->
      <div class="section sentiment-section" v-if="sentiment">
        <h4>Customer Sentiment</h4>
        <div class="sentiment-display">
          <div :class="['sentiment-indicator', sentiment.sentiment]">
            <span class="sentiment-emoji">{{ getSentimentEmoji(sentiment.sentiment) }}</span>
            <span class="sentiment-text">{{ sentiment.sentiment }}</span>
          </div>
          <div class="sentiment-score">
            <span class="score-label">Score:</span>
            <span :class="['score-value', getScoreClass(sentiment.score)]">
              {{ (sentiment.score * 100).toFixed(0) }}%
            </span>
          </div>
        </div>
        <div v-if="sentiment.emotions && sentiment.emotions.length > 0" class="emotions">
          <span v-for="emotion in sentiment.emotions" :key="emotion" class="emotion-tag">
            {{ emotion }}
          </span>
        </div>
      </div>

      <!-- Intent Detection -->
      <div class="section intent-section" v-if="intent">
        <h4>Detected Intent</h4>
        <div class="intent-display">
          <span class="intent-name">{{ intent.intent }}</span>
          <span class="intent-confidence">{{ (intent.confidence * 100).toFixed(0) }}% confident</span>
        </div>
        <p v-if="intent.reasoning" class="intent-reasoning">{{ intent.reasoning }}</p>
      </div>

      <!-- Suggested Responses -->
      <div class="section suggestions-section" v-if="suggestedResponses.length > 0">
        <h4>Suggested Responses</h4>
        <div class="suggestions-list">
          <div
            v-for="(suggestion, index) in suggestedResponses"
            :key="index"
            class="suggestion-card"
          >
            <p class="suggestion-text">{{ suggestion.text }}</p>
            <div class="suggestion-actions">
              <button class="use-btn" @click="useSuggestion(suggestion)">
                Use This
              </button>
              <button class="edit-btn" @click="editSuggestion(suggestion)">
                Edit
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Knowledge Base Matches -->
      <div class="section kb-section" v-if="kbMatches.length > 0">
        <h4>Relevant Knowledge Base</h4>
        <div class="kb-list">
          <div
            v-for="article in kbMatches"
            :key="article.id"
            class="kb-card"
            @click="openArticle(article)"
          >
            <div class="kb-header">
              <span class="kb-title">{{ article.title }}</span>
              <span class="kb-score">{{ (article.similarity * 100).toFixed(0) }}% match</span>
            </div>
            <p class="kb-excerpt">{{ article.content_text?.substring(0, 120) }}...</p>
          </div>
        </div>
      </div>

      <!-- Coaching Tips -->
      <div class="section coaching-section" v-if="coachingTips.length > 0">
        <h4>&#x1F4A1; Coaching Tips</h4>
        <ul class="coaching-list">
          <li v-for="(tip, index) in coachingTips" :key="index">
            {{ tip }}
          </li>
        </ul>
      </div>

      <!-- Quick Actions -->
      <div class="section actions-section">
        <h4>Quick Actions</h4>
        <div class="quick-actions">
          <button class="action-btn" @click="summarizeConversation">
            <span class="action-icon">&#x1F4DD;</span>
            Summarize
          </button>
          <button class="action-btn" @click="generateResponse">
            <span class="action-icon">&#x2728;</span>
            Generate
          </button>
          <button class="action-btn" @click="searchKB">
            <span class="action-icon">&#x1F50D;</span>
            Search KB
          </button>
          <button class="action-btn" @click="escalate">
            <span class="action-icon">&#x1F6A8;</span>
            Escalate
          </button>
        </div>
      </div>

      <!-- Conversation Summary -->
      <div class="section summary-section" v-if="conversationSummary">
        <h4>Conversation Summary</h4>
        <p class="summary-text">{{ conversationSummary }}</p>
        <button class="copy-btn" @click="copySummary">Copy Summary</button>
      </div>
    </div>

    <!-- Summary Modal -->
    <div v-if="showSummaryModal" class="modal-overlay" @click.self="showSummaryModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Conversation Summary</h3>
          <button class="close-btn" @click="showSummaryModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="isGeneratingSummary" class="loading">
            <span class="spinner"></span>
            Generating summary...
          </div>
          <p v-else class="summary-content">{{ conversationSummary }}</p>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showSummaryModal = false">Close</button>
          <button class="btn-primary" @click="copySummary">Copy</button>
        </div>
      </div>
    </div>

    <!-- Generate Modal -->
    <div v-if="showGenerateModal" class="modal-overlay" @click.self="showGenerateModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Generate AI Response</h3>
          <button class="close-btn" @click="showGenerateModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>What should the response address?</label>
            <textarea
              v-model="generatePrompt"
              placeholder="e.g., Apologize for the delay and offer a discount..."
              rows="3"
            ></textarea>
          </div>
          <div v-if="generatedResponse" class="generated-response">
            <label>Generated Response:</label>
            <div class="response-text">{{ generatedResponse }}</div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showGenerateModal = false">Cancel</button>
          <button
            v-if="!generatedResponse"
            class="btn-primary"
            @click="doGenerate"
            :disabled="!generatePrompt.trim() || isGenerating"
          >
            Generate
          </button>
          <button
            v-else
            class="btn-primary"
            @click="useGenerated"
          >
            Use Response
          </button>
        </div>
      </div>
    </div>

    <!-- KB Search Modal -->
    <div v-if="showKBModal" class="modal-overlay" @click.self="showKBModal = false">
      <div class="modal modal-large">
        <div class="modal-header">
          <h3>Search Knowledge Base</h3>
          <button class="close-btn" @click="showKBModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="search-box">
            <input
              v-model="kbSearchQuery"
              type="text"
              placeholder="Search articles..."
              @input="debounceKBSearch"
            >
          </div>
          <div class="kb-results">
            <div v-if="isSearchingKB" class="loading">
              <span class="spinner"></span>
              Searching...
            </div>
            <div v-else-if="kbSearchResults.length === 0" class="empty-state">
              No articles found
            </div>
            <div
              v-else
              v-for="article in kbSearchResults"
              :key="article.content_id"
              class="kb-result-card"
              @click="selectKBArticle(article)"
            >
              <div class="result-header">
                <span class="result-title">{{ article.content_text?.substring(0, 50) }}</span>
                <span class="result-score">{{ (article.similarity * 100).toFixed(0) }}%</span>
              </div>
              <p class="result-excerpt">{{ article.content_text?.substring(0, 150) }}...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  conversationId: {
    type: String,
    required: true
  },
  conversationHistory: {
    type: Array,
    default: () => []
  },
  customerInfo: {
    type: Object,
    default: null
  },
  channel: {
    type: String,
    default: 'chat'
  },
  autoAnalyze: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['use-suggestion', 'edit-suggestion', 'escalate', 'insert-article']);

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// State
const isMinimized = ref(false);
const isAnalyzing = ref(false);
const sentiment = ref(null);
const intent = ref(null);
const suggestedResponses = ref([]);
const kbMatches = ref([]);
const coachingTips = ref([]);
const conversationSummary = ref('');

// Modals
const showSummaryModal = ref(false);
const isGeneratingSummary = ref(false);
const showGenerateModal = ref(false);
const generatePrompt = ref('');
const generatedResponse = ref('');
const isGenerating = ref(false);
const showKBModal = ref(false);
const kbSearchQuery = ref('');
const kbSearchResults = ref([]);
const isSearchingKB = ref(false);

// Debounce
let analysisTimer = null;
let kbSearchTimer = null;

// API calls
async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem('agentToken');
  return fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
}

function toggleMinimize() {
  isMinimized.value = !isMinimized.value;
}

async function refreshAnalysis() {
  if (props.conversationHistory.length === 0) return;

  isAnalyzing.value = true;

  try {
    // Analyze sentiment
    const lastMessages = props.conversationHistory.slice(-3);
    const customerMessage = lastMessages.filter(m => m.role === 'user').pop();

    if (customerMessage) {
      const sentimentRes = await fetchWithAuth('/v1/ai/agent/sentiment', {
        method: 'POST',
        body: JSON.stringify({ text: customerMessage.content })
      });
      const sentimentData = await sentimentRes.json();
      if (sentimentData.success) {
        sentiment.value = sentimentData.data;
      }

      // Analyze intent
      const intentRes = await fetchWithAuth('/v1/ai/agent/intent', {
        method: 'POST',
        body: JSON.stringify({ text: customerMessage.content })
      });
      const intentData = await intentRes.json();
      if (intentData.success) {
        intent.value = intentData.data;
      }

      // Search KB for relevant articles
      const kbRes = await fetchWithAuth('/v1/ai/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({
          text: customerMessage.content,
          contentType: 'knowledge_base',
          limit: 3,
          threshold: 0.6
        })
      });
      const kbData = await kbRes.json();
      if (kbData.success) {
        kbMatches.value = kbData.data;
      }
    }

    // Get AI suggestions
    const suggestRes = await fetchWithAuth('/v1/ai/agent/suggest', {
      method: 'POST',
      body: JSON.stringify({
        conversationHistory: props.conversationHistory,
        customerInfo: props.customerInfo,
        kbArticles: kbMatches.value,
        suggestionType: 'reply',
        conversationId: props.conversationId
      })
    });
    const suggestData = await suggestRes.json();
    if (suggestData.success && suggestData.data.suggestion) {
      suggestedResponses.value = [{
        text: suggestData.data.suggestion,
        confidence: 0.85
      }];
    }

    // Generate coaching tips based on conversation
    generateCoachingTips();

  } catch (error) {
    console.error('Analysis failed:', error);
  } finally {
    isAnalyzing.value = false;
  }
}

function generateCoachingTips() {
  const tips = [];

  if (sentiment.value?.sentiment === 'negative' || sentiment.value?.sentiment === 'frustrated') {
    tips.push('Acknowledge the customer\'s frustration before offering solutions');
    tips.push('Use empathetic language like "I understand how frustrating this must be"');
  }

  if (intent.value?.intent === 'complaint') {
    tips.push('Thank the customer for bringing this to your attention');
    tips.push('Offer a concrete resolution or next steps');
  }

  if (intent.value?.intent === 'billing') {
    tips.push('Verify the customer\'s account before discussing financial details');
  }

  if (props.conversationHistory.length > 10) {
    tips.push('Consider summarizing the conversation to ensure alignment');
  }

  coachingTips.value = tips;
}

function useSuggestion(suggestion) {
  emit('use-suggestion', suggestion.text);
}

function editSuggestion(suggestion) {
  emit('edit-suggestion', suggestion.text);
}

function openArticle(article) {
  emit('insert-article', article);
}

async function summarizeConversation() {
  showSummaryModal.value = true;
  isGeneratingSummary.value = true;

  try {
    const res = await fetchWithAuth('/v1/ai/agent/summarize', {
      method: 'POST',
      body: JSON.stringify({
        messages: props.conversationHistory
      })
    });
    const data = await res.json();
    if (data.success) {
      conversationSummary.value = data.data.summary;
    }
  } catch (error) {
    console.error('Summarization failed:', error);
  } finally {
    isGeneratingSummary.value = false;
  }
}

function generateResponse() {
  showGenerateModal.value = true;
  generatePrompt.value = '';
  generatedResponse.value = '';
}

async function doGenerate() {
  isGenerating.value = true;

  try {
    const res = await fetchWithAuth('/v1/ai/agent/suggest', {
      method: 'POST',
      body: JSON.stringify({
        conversationHistory: props.conversationHistory,
        customerInfo: props.customerInfo,
        kbArticles: kbMatches.value,
        suggestionType: 'reply',
        customPrompt: generatePrompt.value
      })
    });
    const data = await res.json();
    if (data.success) {
      generatedResponse.value = data.data.suggestion;
    }
  } catch (error) {
    console.error('Generation failed:', error);
  } finally {
    isGenerating.value = false;
  }
}

function useGenerated() {
  if (generatedResponse.value) {
    emit('use-suggestion', generatedResponse.value);
    showGenerateModal.value = false;
    generatedResponse.value = '';
    generatePrompt.value = '';
  }
}

function searchKB() {
  showKBModal.value = true;
  kbSearchQuery.value = '';
  kbSearchResults.value = [];
}

function debounceKBSearch() {
  clearTimeout(kbSearchTimer);
  kbSearchTimer = setTimeout(doKBSearch, 300);
}

async function doKBSearch() {
  if (!kbSearchQuery.value.trim()) {
    kbSearchResults.value = [];
    return;
  }

  isSearchingKB.value = true;

  try {
    const res = await fetchWithAuth('/v1/ai/embeddings/search', {
      method: 'POST',
      body: JSON.stringify({
        text: kbSearchQuery.value,
        contentType: 'knowledge_base',
        limit: 10,
        threshold: 0.5
      })
    });
    const data = await res.json();
    if (data.success) {
      kbSearchResults.value = data.data;
    }
  } catch (error) {
    console.error('KB search failed:', error);
  } finally {
    isSearchingKB.value = false;
  }
}

function selectKBArticle(article) {
  emit('insert-article', article);
  showKBModal.value = false;
}

function escalate() {
  emit('escalate', {
    conversationId: props.conversationId,
    sentiment: sentiment.value,
    intent: intent.value,
    summary: conversationSummary.value
  });
}

function copySummary() {
  navigator.clipboard.writeText(conversationSummary.value);
}

function getSentimentEmoji(sent) {
  const emojis = {
    positive: '&#x1F60A;',
    neutral: '&#x1F610;',
    negative: '&#x1F61F;',
    frustrated: '&#x1F620;'
  };
  return emojis[sent] || '&#x1F610;';
}

function getScoreClass(score) {
  if (score > 0.3) return 'positive';
  if (score < -0.3) return 'negative';
  return 'neutral';
}

// Watch conversation changes
watch(() => props.conversationHistory, () => {
  if (props.autoAnalyze) {
    clearTimeout(analysisTimer);
    analysisTimer = setTimeout(refreshAnalysis, 1000);
  }
}, { deep: true });

onMounted(() => {
  if (props.autoAnalyze && props.conversationHistory.length > 0) {
    refreshAnalysis();
  }
});

onUnmounted(() => {
  clearTimeout(analysisTimer);
  clearTimeout(kbSearchTimer);
});
</script>

<style scoped>
.ai-agent-assist {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: all 0.3s ease;
}

.ai-agent-assist.minimized {
  max-height: 48px;
}

.assist-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  cursor: pointer;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-icon {
  font-size: 20px;
}

.title {
  font-weight: 600;
  font-size: 14px;
}

.analyzing-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  font-size: 11px;
}

.pulse {
  width: 8px;
  height: 8px;
  background: #4ade80;
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

.header-actions {
  display: flex;
  gap: 4px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-size: 14px;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.assist-content {
  padding: 16px;
  max-height: 500px;
  overflow-y: auto;
}

.section {
  margin-bottom: 20px;
}

.section h4 {
  margin: 0 0 12px;
  font-size: 13px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Sentiment Section */
.sentiment-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
}

.sentiment-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sentiment-emoji {
  font-size: 24px;
}

.sentiment-text {
  font-weight: 600;
  text-transform: capitalize;
}

.sentiment-indicator.positive { color: #2e7d32; }
.sentiment-indicator.neutral { color: #616161; }
.sentiment-indicator.negative { color: #ef6c00; }
.sentiment-indicator.frustrated { color: #c62828; }

.sentiment-score {
  display: flex;
  align-items: center;
  gap: 6px;
}

.score-label {
  font-size: 12px;
  color: #666;
}

.score-value {
  font-weight: 600;
}

.score-value.positive { color: #2e7d32; }
.score-value.neutral { color: #616161; }
.score-value.negative { color: #c62828; }

.emotions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.emotion-tag {
  padding: 2px 10px;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 12px;
  font-size: 12px;
}

/* Intent Section */
.intent-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f3e5f5;
  border-radius: 8px;
}

.intent-name {
  font-weight: 600;
  color: #7b1fa2;
  text-transform: capitalize;
}

.intent-confidence {
  font-size: 12px;
  color: #666;
}

.intent-reasoning {
  margin: 8px 0 0;
  font-size: 13px;
  color: #666;
  font-style: italic;
}

/* Suggestions Section */
.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.suggestion-card {
  padding: 12px;
  background: #f8f9fa;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

.suggestion-text {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.5;
}

.suggestion-actions {
  display: flex;
  gap: 8px;
}

.use-btn {
  padding: 6px 14px;
  background: #4361ee;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.use-btn:hover {
  background: #3651d4;
}

.edit-btn {
  padding: 6px 14px;
  background: #f0f0f0;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.edit-btn:hover {
  background: #e0e0e0;
}

/* KB Section */
.kb-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kb-card {
  padding: 12px;
  background: #fff8e1;
  border: 1px solid #ffe082;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.kb-card:hover {
  border-color: #ffc107;
  box-shadow: 0 2px 8px rgba(255, 193, 7, 0.2);
}

.kb-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 6px;
}

.kb-title {
  font-weight: 500;
  font-size: 14px;
  color: #f57c00;
}

.kb-score {
  font-size: 11px;
  color: #666;
}

.kb-excerpt {
  margin: 0;
  font-size: 12px;
  color: #666;
  line-height: 1.4;
}

/* Coaching Section */
.coaching-list {
  margin: 0;
  padding-left: 20px;
}

.coaching-list li {
  margin-bottom: 8px;
  font-size: 13px;
  color: #555;
  line-height: 1.4;
}

/* Quick Actions */
.quick-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  background: #f0f0f0;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #e0e0e0;
}

.action-icon {
  font-size: 16px;
}

/* Summary Section */
.summary-text {
  margin: 0;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.copy-btn {
  margin-top: 10px;
  padding: 6px 14px;
  background: #f0f0f0;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

/* Modal Styles */
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
}

.modal {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-large {
  max-width: 600px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
}

.close-btn {
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 14px;
}

.form-group textarea,
.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.generated-response {
  margin-top: 16px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
}

.generated-response label {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}

.response-text {
  font-size: 14px;
  line-height: 1.5;
}

.search-box input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
}

.kb-results {
  margin-top: 16px;
  max-height: 300px;
  overflow-y: auto;
}

.kb-result-card {
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
}

.kb-result-card:hover {
  border-color: #4361ee;
  background: #f8f9ff;
}

.result-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.result-title {
  font-weight: 500;
}

.result-score {
  font-size: 12px;
  color: #4361ee;
}

.result-excerpt {
  margin: 0;
  font-size: 13px;
  color: #666;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: #666;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e0e0e0;
  border-top-color: #4361ee;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  text-align: center;
  padding: 24px;
  color: #666;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #eee;
}

.btn-primary {
  padding: 10px 20px;
  background: #4361ee;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 10px 20px;
  background: #f0f0f0;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.summary-content {
  margin: 0;
  line-height: 1.6;
}
</style>
