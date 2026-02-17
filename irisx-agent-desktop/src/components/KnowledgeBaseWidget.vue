<template>
  <div class="bg-white rounded-lg shadow h-full flex flex-col">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
      <div class="flex items-center space-x-2">
        <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <h3 class="text-sm font-semibold text-gray-900">Knowledge Base</h3>
      </div>
      <button
        @click="expanded = !expanded"
        class="text-gray-400 hover:text-gray-600"
        :title="expanded ? 'Collapse' : 'Expand'"
      >
        <svg v-if="expanded" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <div v-if="expanded" class="flex-1 flex flex-col overflow-hidden">
      <!-- Search Bar -->
      <div class="p-3 border-b border-gray-100">
        <div class="relative">
          <input
            v-model="searchQuery"
            @input="handleSearch"
            @keyup.enter="performSearch"
            type="text"
            placeholder="Search articles..."
            class="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
          />
          <svg class="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <button
            v-if="searchQuery"
            @click="clearSearch"
            class="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Context Suggestions (based on current call/conversation) -->
        <div v-if="contextSuggestions.length > 0 && !searchQuery" class="mt-2">
          <p class="text-xs text-gray-500 mb-1">Suggested for this call:</p>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="suggestion in contextSuggestions.slice(0, 3)"
              :key="suggestion"
              @click="searchQuery = suggestion; performSearch()"
              class="px-2 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
            >
              {{ suggestion }}
            </button>
          </div>
        </div>
      </div>

      <!-- Category Filter -->
      <div v-if="!selectedArticle && categories.length > 0" class="px-3 py-2 border-b border-gray-100 flex items-center space-x-2 overflow-x-auto">
        <button
          @click="selectedCategory = ''"
          :class="[
            'px-2 py-1 text-xs rounded whitespace-nowrap',
            !selectedCategory
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          ]"
        >
          All
        </button>
        <button
          v-for="category in categories"
          :key="category.id"
          @click="selectedCategory = category.id; loadArticles()"
          :class="[
            'px-2 py-1 text-xs rounded whitespace-nowrap',
            selectedCategory === category.id
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          ]"
        >
          {{ category.name }}
        </button>
      </div>

      <!-- Content Area -->
      <div class="flex-1 overflow-y-auto">
        <!-- Loading State -->
        <div v-if="loading" class="flex items-center justify-center py-8">
          <svg class="w-6 h-6 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>

        <!-- Article Detail View -->
        <div v-else-if="selectedArticle" class="p-4">
          <button
            @click="selectedArticle = null"
            class="flex items-center text-sm text-indigo-600 hover:text-indigo-800 mb-3"
          >
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to results
          </button>

          <h4 class="text-lg font-semibold text-gray-900 mb-2">{{ selectedArticle.title }}</h4>

          <div class="flex items-center space-x-2 mb-3">
            <span
              v-if="selectedArticle.category_name"
              class="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
            >
              {{ selectedArticle.category_name }}
            </span>
            <span class="text-xs text-gray-500">
              Updated {{ formatDate(selectedArticle.updated_at) }}
            </span>
          </div>

          <!-- Article Content -->
          <div
            class="prose prose-sm max-w-none text-gray-700"
            v-html="selectedArticle.content"
          ></div>

          <!-- Action Buttons -->
          <div class="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <button
                @click="copyArticleLink"
                class="flex items-center px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Link
              </button>
              <button
                @click="sendToCustomer"
                class="flex items-center px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
              >
                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Send to Customer
              </button>
            </div>
            <div class="flex items-center space-x-1">
              <span class="text-xs text-gray-500">Helpful?</span>
              <button
                @click="rateArticle(true)"
                :class="[
                  'p-1 rounded',
                  articleRating === true ? 'text-green-600 bg-green-100' : 'text-gray-400 hover:text-green-600'
                ]"
              >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                </svg>
              </button>
              <button
                @click="rateArticle(false)"
                :class="[
                  'p-1 rounded',
                  articleRating === false ? 'text-red-600 bg-red-100' : 'text-gray-400 hover:text-red-600'
                ]"
              >
                <svg class="w-4 h-4 transform rotate-180" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Search Results / Article List -->
        <div v-else-if="articles.length > 0" class="divide-y divide-gray-100">
          <div
            v-for="article in articles"
            :key="article.id"
            @click="viewArticle(article)"
            class="p-3 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <h4 class="text-sm font-medium text-gray-900 mb-1">{{ article.title }}</h4>
            <p class="text-xs text-gray-600 line-clamp-2">{{ article.excerpt || stripHtml(article.content) }}</p>
            <div class="mt-1 flex items-center space-x-2">
              <span
                v-if="article.category_name"
                class="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 rounded"
              >
                {{ article.category_name }}
              </span>
              <span class="text-xs text-gray-400">{{ formatDate(article.updated_at) }}</span>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="flex flex-col items-center justify-center py-8 px-4 text-center">
          <svg class="w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p class="text-sm text-gray-600">
            {{ searchQuery ? 'No articles found' : 'Search the knowledge base' }}
          </p>
          <p class="text-xs text-gray-500 mt-1">
            {{ searchQuery ? 'Try different keywords' : 'Find answers to common questions' }}
          </p>
        </div>
      </div>

      <!-- Recently Viewed -->
      <div v-if="!selectedArticle && recentlyViewed.length > 0 && !searchQuery" class="border-t border-gray-200 p-3">
        <p class="text-xs font-medium text-gray-500 mb-2">Recently Viewed</p>
        <div class="space-y-1">
          <button
            v-for="article in recentlyViewed.slice(0, 3)"
            :key="article.id"
            @click="viewArticle(article)"
            class="w-full text-left px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 rounded truncate"
          >
            {{ article.title }}
          </button>
        </div>
      </div>
    </div>

    <!-- Collapsed State -->
    <div v-else class="p-3">
      <button
        @click="expanded = true"
        class="w-full flex items-center justify-center text-sm text-indigo-600 hover:text-indigo-800"
      >
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Search Knowledge Base
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps({
  token: {
    type: String,
    required: true
  },
  callContext: {
    type: Object,
    default: null
  },
  conversationContext: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['article-selected', 'send-to-customer'])

// State
const expanded = ref(true)
const loading = ref(false)
const searchQuery = ref('')
const selectedCategory = ref('')
const categories = ref([])
const articles = ref([])
const selectedArticle = ref(null)
const articleRating = ref(null)
const recentlyViewed = ref([])

// Debounce timer
let searchTimeout = null

// Computed context suggestions based on call/conversation
const contextSuggestions = computed(() => {
  const suggestions = []

  if (props.callContext) {
    // Add suggestions based on call queue
    if (props.callContext.queueName) {
      suggestions.push(props.callContext.queueName)
    }
    // Add suggestions based on IVR path
    if (props.callContext.ivrPath) {
      suggestions.push(...props.callContext.ivrPath)
    }
  }

  if (props.conversationContext) {
    // Add suggestions based on conversation channel
    if (props.conversationContext.channel) {
      suggestions.push(`${props.conversationContext.channel} support`)
    }
    // Could add keyword extraction from conversation here
  }

  // Default suggestions if no context
  if (suggestions.length === 0) {
    suggestions.push('billing', 'account', 'technical support')
  }

  return suggestions
})

// Methods
async function loadCategories() {
  try {
    const response = await fetch('/api/v1/knowledge/categories', {
      headers: {
        'Authorization': `Bearer ${props.token}`
      }
    })
    const result = await response.json()
    if (result.success) {
      categories.value = result.data || []
    }
  } catch (error) {
    console.error('Error loading KB categories:', error)
  }
}

async function loadArticles() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (selectedCategory.value) {
      params.append('category', selectedCategory.value)
    }
    params.append('status', 'published')
    params.append('limit', '20')

    const response = await fetch(`/api/v1/knowledge/articles?${params}`, {
      headers: {
        'Authorization': `Bearer ${props.token}`
      }
    })
    const result = await response.json()
    if (result.success) {
      articles.value = result.data || []
    }
  } catch (error) {
    console.error('Error loading KB articles:', error)
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  // Debounce search
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  searchTimeout = setTimeout(() => {
    if (searchQuery.value.length >= 2) {
      performSearch()
    } else if (searchQuery.value.length === 0) {
      loadArticles()
    }
  }, 300)
}

async function performSearch() {
  if (!searchQuery.value.trim()) {
    loadArticles()
    return
  }

  loading.value = true
  try {
    const params = new URLSearchParams()
    params.append('q', searchQuery.value)
    params.append('status', 'published')
    params.append('limit', '20')

    const response = await fetch(`/api/v1/knowledge/articles/search?${params}`, {
      headers: {
        'Authorization': `Bearer ${props.token}`
      }
    })
    const result = await response.json()
    if (result.success) {
      articles.value = result.data || []
    }
  } catch (error) {
    console.error('Error searching KB:', error)
  } finally {
    loading.value = false
  }
}

function clearSearch() {
  searchQuery.value = ''
  loadArticles()
}

async function viewArticle(article) {
  loading.value = true
  selectedArticle.value = article
  articleRating.value = null

  // Add to recently viewed
  const existing = recentlyViewed.value.findIndex(a => a.id === article.id)
  if (existing > -1) {
    recentlyViewed.value.splice(existing, 1)
  }
  recentlyViewed.value.unshift({ id: article.id, title: article.title })
  if (recentlyViewed.value.length > 10) {
    recentlyViewed.value.pop()
  }

  // Save to localStorage
  try {
    localStorage.setItem('kb_recently_viewed', JSON.stringify(recentlyViewed.value))
  } catch (e) {}

  // Track view
  try {
    await fetch(`/api/v1/knowledge/articles/${article.id}/view`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${props.token}`
      }
    })
  } catch (e) {}

  loading.value = false
  emit('article-selected', article)
}

function copyArticleLink() {
  if (!selectedArticle.value) return

  const baseUrl = window.location.origin
  const link = `${baseUrl}/kb/articles/${selectedArticle.value.id}`

  navigator.clipboard.writeText(link).then(() => {
    // Could show a toast notification
    console.log('Link copied!')
  })
}

function sendToCustomer() {
  if (!selectedArticle.value) return

  const baseUrl = window.location.origin
  const link = `${baseUrl}/kb/articles/${selectedArticle.value.id}`

  emit('send-to-customer', {
    type: 'article',
    articleId: selectedArticle.value.id,
    title: selectedArticle.value.title,
    link: link,
    content: selectedArticle.value.content
  })
}

async function rateArticle(helpful) {
  if (!selectedArticle.value) return

  articleRating.value = helpful

  try {
    await fetch(`/api/v1/knowledge/articles/${selectedArticle.value.id}/helpful`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${props.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ helpful })
    })
  } catch (error) {
    console.error('Error rating article:', error)
  }
}

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').substring(0, 150)
}

function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  const now = new Date()
  const diff = now - d

  if (diff < 86400000) { // Less than 1 day
    return 'Today'
  } else if (diff < 172800000) { // Less than 2 days
    return 'Yesterday'
  } else if (diff < 604800000) { // Less than 1 week
    return `${Math.floor(diff / 86400000)} days ago`
  } else {
    return d.toLocaleDateString()
  }
}

// Keyboard shortcut for quick search
function handleKeydown(e) {
  // Ctrl/Cmd + K to focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    expanded.value = true
    const input = document.querySelector('input[placeholder="Search articles..."]')
    if (input) {
      input.focus()
    }
  }
}

// Load recently viewed from localStorage
function loadRecentlyViewed() {
  try {
    const stored = localStorage.getItem('kb_recently_viewed')
    if (stored) {
      recentlyViewed.value = JSON.parse(stored)
    }
  } catch (e) {}
}

// Watch for context changes to update suggestions
watch(() => props.callContext, () => {
  // Could auto-search based on new call context
}, { deep: true })

onMounted(() => {
  loadCategories()
  loadArticles()
  loadRecentlyViewed()
  document.addEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.prose {
  font-size: 0.875rem;
  line-height: 1.6;
}

.prose h1, .prose h2, .prose h3, .prose h4 {
  font-weight: 600;
  margin-top: 1em;
  margin-bottom: 0.5em;
}

.prose h1 { font-size: 1.25rem; }
.prose h2 { font-size: 1.125rem; }
.prose h3 { font-size: 1rem; }

.prose p {
  margin-bottom: 0.75em;
}

.prose ul, .prose ol {
  padding-left: 1.5em;
  margin-bottom: 0.75em;
}

.prose li {
  margin-bottom: 0.25em;
}

.prose a {
  color: #4f46e5;
  text-decoration: underline;
}

.prose code {
  background-color: #f3f4f6;
  padding: 0.125em 0.25em;
  border-radius: 0.25rem;
  font-size: 0.875em;
}

.prose pre {
  background-color: #1f2937;
  color: #f3f4f6;
  padding: 0.75em;
  border-radius: 0.375rem;
  overflow-x: auto;
  margin-bottom: 0.75em;
}

.prose pre code {
  background: none;
  padding: 0;
}
</style>
