<template>
  <div class="ai-message-composer">
    <!-- AI Suggestions Panel -->
    <div v-if="showSuggestions && suggestions.length > 0" class="suggestions-panel">
      <div class="suggestions-header">
        <span class="ai-icon">&#x1F916;</span>
        <span>AI Suggestions</span>
        <button class="close-btn" @click="dismissSuggestions">&times;</button>
      </div>
      <div class="suggestions-list">
        <button
          v-for="(suggestion, index) in suggestions"
          :key="index"
          class="suggestion-item"
          @click="useSuggestion(suggestion)"
        >
          <span class="suggestion-text">{{ suggestion.text }}</span>
          <span class="suggestion-confidence">{{ Math.round(suggestion.confidence * 100) }}%</span>
        </button>
      </div>
    </div>

    <!-- Main Composer -->
    <div class="composer-container">
      <div class="composer-toolbar">
        <button
          class="toolbar-btn"
          :class="{ active: aiMode === 'assist' }"
          @click="toggleAIMode('assist')"
          title="AI Assist - Get suggestions as you type"
        >
          <span class="icon">&#x2728;</span>
          Assist
        </button>
        <button
          class="toolbar-btn"
          :class="{ active: aiMode === 'generate' }"
          @click="toggleAIMode('generate')"
          title="AI Generate - Create a complete response"
        >
          <span class="icon">&#x1F4DD;</span>
          Generate
        </button>
        <button
          class="toolbar-btn"
          @click="improveMessage"
          :disabled="!message.trim()"
          title="Improve your message with AI"
        >
          <span class="icon">&#x2B06;</span>
          Improve
        </button>
        <button
          class="toolbar-btn"
          @click="translateMessage"
          :disabled="!message.trim()"
          title="Translate message"
        >
          <span class="icon">&#x1F310;</span>
          Translate
        </button>
        <div class="toolbar-spacer"></div>
        <button
          class="toolbar-btn tone-btn"
          @click="showToneMenu = !showToneMenu"
          title="Set message tone"
        >
          <span class="icon">&#x1F3A8;</span>
          {{ selectedTone }}
        </button>
      </div>

      <!-- Tone Menu -->
      <div v-if="showToneMenu" class="tone-menu">
        <button
          v-for="tone in tones"
          :key="tone.id"
          :class="['tone-option', { active: selectedTone === tone.id }]"
          @click="selectTone(tone.id)"
        >
          {{ tone.icon }} {{ tone.label }}
        </button>
      </div>

      <!-- Text Area -->
      <div class="textarea-wrapper">
        <textarea
          ref="textareaRef"
          v-model="message"
          :placeholder="placeholder"
          @input="onInput"
          @keydown="onKeyDown"
          :disabled="isGenerating"
          rows="3"
        ></textarea>

        <!-- Loading Indicator -->
        <div v-if="isGenerating" class="generating-indicator">
          <span class="spinner"></span>
          <span>{{ generatingText }}</span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="composer-actions">
        <div class="context-info" v-if="conversationContext">
          <span class="context-badge">
            &#x1F4AC; {{ conversationContext.channel }}
          </span>
          <span v-if="conversationContext.sentiment" :class="['sentiment-badge', conversationContext.sentiment]">
            {{ getSentimentEmoji(conversationContext.sentiment) }} {{ conversationContext.sentiment }}
          </span>
        </div>
        <div class="action-buttons">
          <button class="btn-secondary" @click="clearMessage" :disabled="!message">
            Clear
          </button>
          <button class="btn-primary" @click="sendMessage" :disabled="!message.trim() || isGenerating">
            <span v-if="channel === 'voice'">&#x1F399;</span>
            <span v-else-if="channel === 'email'">&#x2709;</span>
            <span v-else>&#x27A4;</span>
            Send
          </button>
        </div>
      </div>
    </div>

    <!-- AI Generate Modal -->
    <div v-if="showGenerateModal" class="modal-overlay" @click.self="showGenerateModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>&#x1F916; Generate AI Response</h3>
          <button class="close-btn" @click="showGenerateModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>What should the response address?</label>
            <textarea
              v-model="generatePrompt"
              placeholder="e.g., Explain our return policy for electronics purchased more than 30 days ago..."
              rows="3"
            ></textarea>
          </div>
          <div class="form-group">
            <label>Response Length</label>
            <div class="length-options">
              <button
                v-for="len in ['short', 'medium', 'long']"
                :key="len"
                :class="['length-btn', { active: responseLength === len }]"
                @click="responseLength = len"
              >
                {{ len }}
              </button>
            </div>
          </div>
          <div class="form-group checkbox">
            <label>
              <input type="checkbox" v-model="includeKB">
              Include knowledge base context
            </label>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showGenerateModal = false">Cancel</button>
          <button class="btn-primary" @click="generateResponse" :disabled="!generatePrompt.trim()">
            Generate
          </button>
        </div>
      </div>
    </div>

    <!-- Translate Modal -->
    <div v-if="showTranslateModal" class="modal-overlay" @click.self="showTranslateModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>&#x1F310; Translate Message</h3>
          <button class="close-btn" @click="showTranslateModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Target Language</label>
            <select v-model="targetLanguage">
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="pt">Portuguese</option>
              <option value="it">Italian</option>
              <option value="zh">Chinese (Simplified)</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="ar">Arabic</option>
              <option value="hi">Hindi</option>
            </select>
          </div>
          <div class="translation-preview" v-if="translatedText">
            <label>Preview:</label>
            <div class="preview-text">{{ translatedText }}</div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showTranslateModal = false">Cancel</button>
          <button class="btn-primary" @click="applyTranslation" :disabled="!translatedText">
            Use Translation
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  channel: {
    type: String,
    default: 'chat'
  },
  conversationId: {
    type: String,
    default: null
  },
  conversationContext: {
    type: Object,
    default: null
  },
  conversationHistory: {
    type: Array,
    default: () => []
  },
  customerInfo: {
    type: Object,
    default: null
  },
  kbArticles: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['send', 'typing']);

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// State
const message = ref('');
const textareaRef = ref(null);
const aiMode = ref('off'); // 'off', 'assist', 'generate'
const isGenerating = ref(false);
const generatingText = ref('Generating...');
const suggestions = ref([]);
const showSuggestions = ref(false);
const selectedTone = ref('professional');
const showToneMenu = ref(false);
const debounceTimer = ref(null);

// Generate modal
const showGenerateModal = ref(false);
const generatePrompt = ref('');
const responseLength = ref('medium');
const includeKB = ref(true);

// Translate modal
const showTranslateModal = ref(false);
const targetLanguage = ref('es');
const translatedText = ref('');

const tones = [
  { id: 'professional', label: 'Professional', icon: '&#x1F454;' },
  { id: 'friendly', label: 'Friendly', icon: '&#x1F60A;' },
  { id: 'empathetic', label: 'Empathetic', icon: '&#x1F49C;' },
  { id: 'concise', label: 'Concise', icon: '&#x26A1;' },
  { id: 'detailed', label: 'Detailed', icon: '&#x1F4D6;' }
];

const placeholder = computed(() => {
  if (aiMode.value === 'assist') {
    return 'Type your message... AI will suggest completions';
  } else if (aiMode.value === 'generate') {
    return 'Describe what you want to say, then press Generate...';
  }
  return 'Type your message...';
});

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

function toggleAIMode(mode) {
  aiMode.value = aiMode.value === mode ? 'off' : mode;
  if (mode === 'generate' && aiMode.value === 'generate') {
    showGenerateModal.value = true;
  }
}

function selectTone(tone) {
  selectedTone.value = tone;
  showToneMenu.value = false;
}

function onInput() {
  emit('typing', true);

  // Debounce AI suggestions
  if (aiMode.value === 'assist' && message.value.length > 10) {
    clearTimeout(debounceTimer.value);
    debounceTimer.value = setTimeout(() => {
      fetchSuggestions();
    }, 500);
  }
}

function onKeyDown(e) {
  // Tab to accept first suggestion
  if (e.key === 'Tab' && suggestions.value.length > 0) {
    e.preventDefault();
    useSuggestion(suggestions.value[0]);
  }

  // Ctrl+Enter to send
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    sendMessage();
  }

  // Escape to dismiss suggestions
  if (e.key === 'Escape') {
    dismissSuggestions();
  }
}

async function fetchSuggestions() {
  if (!message.value.trim()) return;

  try {
    const response = await fetchWithAuth('/v1/ai/agent/suggest', {
      method: 'POST',
      body: JSON.stringify({
        conversationHistory: props.conversationHistory,
        customerInfo: props.customerInfo,
        kbArticles: props.kbArticles,
        currentInput: message.value,
        suggestionType: 'completion',
        tone: selectedTone.value
      })
    });

    const data = await response.json();
    if (data.success && data.data.suggestion) {
      // Parse suggestions (could be multiple)
      const suggestionText = data.data.suggestion;
      suggestions.value = [{
        text: suggestionText,
        confidence: 0.85
      }];
      showSuggestions.value = true;
    }
  } catch (error) {
    console.error('Failed to fetch suggestions:', error);
  }
}

function useSuggestion(suggestion) {
  message.value = suggestion.text;
  dismissSuggestions();
  textareaRef.value?.focus();
}

function dismissSuggestions() {
  showSuggestions.value = false;
  suggestions.value = [];
}

async function generateResponse() {
  showGenerateModal.value = false;
  isGenerating.value = true;
  generatingText.value = 'Generating response...';

  try {
    const systemPrompt = `You are a helpful customer service agent. Generate a ${responseLength.value} response in a ${selectedTone.value} tone.`;

    const contextInfo = includeKB.value && props.kbArticles.length > 0
      ? `\n\nRelevant knowledge base articles:\n${props.kbArticles.map(a => `- ${a.title}: ${a.content}`).join('\n')}`
      : '';

    const conversationCtx = props.conversationHistory.length > 0
      ? `\n\nConversation history:\n${props.conversationHistory.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}`
      : '';

    const response = await fetchWithAuth('/v1/ai/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          { role: 'user', content: generatePrompt.value + contextInfo + conversationCtx }
        ],
        systemPrompt,
        temperature: 0.7,
        maxTokens: responseLength.value === 'short' ? 100 : responseLength.value === 'medium' ? 250 : 500
      })
    });

    const data = await response.json();
    if (data.success) {
      message.value = data.data.content;
    }
  } catch (error) {
    console.error('Failed to generate response:', error);
  } finally {
    isGenerating.value = false;
    generatePrompt.value = '';
  }
}

async function improveMessage() {
  if (!message.value.trim()) return;

  isGenerating.value = true;
  generatingText.value = 'Improving message...';

  try {
    const response = await fetchWithAuth('/v1/ai/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          { role: 'user', content: `Improve this customer service message to be more ${selectedTone.value}. Keep the core meaning but make it clearer and more engaging. Only return the improved message, nothing else:\n\n${message.value}` }
        ],
        temperature: 0.5,
        maxTokens: 500
      })
    });

    const data = await response.json();
    if (data.success) {
      message.value = data.data.content;
    }
  } catch (error) {
    console.error('Failed to improve message:', error);
  } finally {
    isGenerating.value = false;
  }
}

async function translateMessage() {
  if (!message.value.trim()) return;

  showTranslateModal.value = true;
  translatedText.value = '';

  // Auto-translate when modal opens
  await doTranslate();
}

async function doTranslate() {
  try {
    const response = await fetchWithAuth('/v1/translation/translate', {
      method: 'POST',
      body: JSON.stringify({
        text: message.value,
        targetLanguage: targetLanguage.value
      })
    });

    const data = await response.json();
    if (data.success) {
      translatedText.value = data.data.translatedText;
    }
  } catch (error) {
    console.error('Failed to translate:', error);
  }
}

// Watch target language changes
watch(targetLanguage, () => {
  if (showTranslateModal.value && message.value) {
    doTranslate();
  }
});

function applyTranslation() {
  if (translatedText.value) {
    message.value = translatedText.value;
    showTranslateModal.value = false;
    translatedText.value = '';
  }
}

function clearMessage() {
  message.value = '';
  dismissSuggestions();
  textareaRef.value?.focus();
}

function sendMessage() {
  if (!message.value.trim() || isGenerating.value) return;

  emit('send', {
    content: message.value,
    channel: props.channel,
    metadata: {
      aiAssisted: aiMode.value !== 'off',
      tone: selectedTone.value
    }
  });

  message.value = '';
  dismissSuggestions();
}

function getSentimentEmoji(sentiment) {
  const emojis = {
    positive: '&#x1F60A;',
    neutral: '&#x1F610;',
    negative: '&#x1F61F;',
    frustrated: '&#x1F620;'
  };
  return emojis[sentiment] || '&#x1F610;';
}

// Cleanup
onUnmounted(() => {
  if (debounceTimer.value) {
    clearTimeout(debounceTimer.value);
  }
});
</script>

<style scoped>
.ai-message-composer {
  position: relative;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: visible;
}

.suggestions-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: white;
  border-radius: 8px 8px 0 0;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
  margin-bottom: 4px;
  z-index: 10;
}

.suggestions-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px 8px 0 0;
}

.ai-icon {
  font-size: 16px;
}

.close-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: white;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.suggestions-list {
  padding: 8px;
}

.suggestion-item {
  width: 100%;
  padding: 12px 16px;
  background: #f8f9fa;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s;
}

.suggestion-item:hover {
  background: #e3f2fd;
  border-color: #4361ee;
}

.suggestion-text {
  flex: 1;
  font-size: 14px;
  color: #333;
  line-height: 1.4;
}

.suggestion-confidence {
  font-size: 12px;
  color: #4361ee;
  font-weight: 500;
  margin-left: 12px;
}

.composer-container {
  padding: 12px;
}

.composer-toolbar {
  display: flex;
  gap: 4px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eee;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #f0f0f0;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.toolbar-btn:hover {
  background: #e0e0e0;
}

.toolbar-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar-btn .icon {
  font-size: 14px;
}

.toolbar-spacer {
  flex: 1;
}

.tone-btn {
  text-transform: capitalize;
}

.tone-menu {
  position: absolute;
  right: 12px;
  top: 60px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 8px;
  z-index: 100;
}

.tone-option {
  display: block;
  width: 100%;
  padding: 8px 16px;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
}

.tone-option:hover {
  background: #f0f0f0;
}

.tone-option.active {
  background: #e3f2fd;
  color: #4361ee;
}

.textarea-wrapper {
  position: relative;
}

.textarea-wrapper textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  resize: vertical;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.5;
  min-height: 80px;
}

.textarea-wrapper textarea:focus {
  outline: none;
  border-color: #4361ee;
  box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.1);
}

.textarea-wrapper textarea:disabled {
  background: #f8f9fa;
}

.generating-indicator {
  position: absolute;
  bottom: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #666;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #e0e0e0;
  border-top-color: #4361ee;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.composer-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eee;
}

.context-info {
  display: flex;
  gap: 8px;
}

.context-badge {
  padding: 4px 10px;
  background: #f0f0f0;
  border-radius: 12px;
  font-size: 12px;
  color: #666;
}

.sentiment-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  text-transform: capitalize;
}

.sentiment-badge.positive { background: #e8f5e9; color: #2e7d32; }
.sentiment-badge.neutral { background: #f5f5f5; color: #616161; }
.sentiment-badge.negative { background: #fff3e0; color: #ef6c00; }
.sentiment-badge.frustrated { background: #ffebee; color: #c62828; }

.action-buttons {
  display: flex;
  gap: 8px;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 10px 16px;
  background: #f0f0f0;
  color: #333;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.btn-secondary:hover:not(:disabled) {
  background: #e0e0e0;
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.form-group.checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: normal;
}

.length-options {
  display: flex;
  gap: 8px;
}

.length-btn {
  flex: 1;
  padding: 10px;
  background: #f0f0f0;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  text-transform: capitalize;
}

.length-btn.active {
  background: #e3f2fd;
  border-color: #4361ee;
  color: #4361ee;
}

.translation-preview {
  margin-top: 16px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
}

.translation-preview label {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}

.preview-text {
  font-size: 14px;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #eee;
}
</style>
