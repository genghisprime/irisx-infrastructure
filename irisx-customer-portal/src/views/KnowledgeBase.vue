<template>
  <div class="knowledge-base">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Knowledge Base</h1>
        <p class="page-description">
          Search articles and find answers to common questions
        </p>
      </div>
      <button @click="showCreateModal = true" class="btn btn-primary">
        <PlusIcon class="btn-icon" />
        New Article
      </button>
    </div>

    <!-- Search Bar -->
    <div class="search-section">
      <div class="search-box">
        <SearchIcon class="search-icon" />
        <input
          v-model="searchQuery"
          @keyup.enter="performSearch"
          type="text"
          placeholder="Search articles..."
          class="search-input"
        />
        <button v-if="searchQuery" @click="clearSearch" class="search-clear">
          &times;
        </button>
      </div>
    </div>

    <!-- Search Results -->
    <div v-if="searchResults.length > 0" class="search-results">
      <h2 class="section-title">Search Results ({{ searchResults.length }})</h2>
      <div class="articles-grid">
        <ArticleCard
          v-for="article in searchResults"
          :key="article.id"
          :article="article"
          @click="viewArticle(article)"
        />
      </div>
      <button @click="clearSearch" class="btn btn-secondary">
        Clear Search
      </button>
    </div>

    <!-- Main Content -->
    <div v-else class="main-content">
      <!-- Featured Articles -->
      <div v-if="featuredArticles.length > 0" class="featured-section">
        <h2 class="section-title">Featured Articles</h2>
        <div class="articles-grid featured">
          <ArticleCard
            v-for="article in featuredArticles"
            :key="article.id"
            :article="article"
            featured
            @click="viewArticle(article)"
          />
        </div>
      </div>

      <!-- Categories -->
      <div class="categories-section">
        <h2 class="section-title">Browse by Category</h2>
        <div class="categories-grid">
          <div
            v-for="category in categories"
            :key="category.id"
            class="category-card"
            @click="selectCategory(category)"
          >
            <div class="category-icon" :style="{ background: category.color || 'var(--primary)' }">
              <component :is="getCategoryIcon(category.icon)" class="icon" />
            </div>
            <div class="category-info">
              <h3>{{ category.name }}</h3>
              <p>{{ category.article_count }} articles</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Popular Articles -->
      <div class="popular-section">
        <h2 class="section-title">Popular Articles</h2>
        <div class="articles-list">
          <div
            v-for="article in popularArticles"
            :key="article.id"
            class="article-row"
            @click="viewArticle(article)"
          >
            <div class="article-info">
              <h4>{{ article.title }}</h4>
              <p>{{ article.summary || 'No description available' }}</p>
            </div>
            <div class="article-stats">
              <span class="views">
                <EyeIcon class="icon-sm" />
                {{ article.view_count }}
              </span>
              <span class="helpful" v-if="article.helpful_yes > 0">
                <ThumbUpIcon class="icon-sm" />
                {{ article.helpful_yes }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Article View Modal -->
    <div v-if="selectedArticle" class="modal-overlay" @click.self="closeArticle">
      <div class="article-modal">
        <div class="modal-header">
          <div class="article-meta">
            <span v-if="selectedArticle.category_name" class="category-badge">
              {{ selectedArticle.category_name }}
            </span>
            <span class="views">{{ selectedArticle.view_count }} views</span>
          </div>
          <button @click="closeArticle" class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <h1 class="article-title">{{ selectedArticle.title }}</h1>
          <div class="article-content" v-html="selectedArticle.content_html"></div>
        </div>
        <div class="modal-footer">
          <div class="helpful-prompt">
            <span>Was this article helpful?</span>
            <div class="helpful-buttons">
              <button @click="voteHelpful(true)" class="btn-helpful yes" :class="{ voted: helpfulVote === true }">
                <ThumbUpIcon class="icon-sm" />
                Yes
              </button>
              <button @click="voteHelpful(false)" class="btn-helpful no" :class="{ voted: helpfulVote === false }">
                <ThumbDownIcon class="icon-sm" />
                No
              </button>
            </div>
          </div>
          <div v-if="relatedArticles.length > 0" class="related-articles">
            <h4>Related Articles</h4>
            <ul>
              <li v-for="related in relatedArticles" :key="related.id">
                <a @click="viewArticle(related)">{{ related.title }}</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, h } from 'vue'
import api from '@/utils/api'

// Icons
const SearchIcon = {
  render: () => h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' })
  ])
}

const PlusIcon = {
  render: () => h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M12 4v16m8-8H4' })
  ])
}

const EyeIcon = {
  render: () => h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z' }),
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' })
  ])
}

const ThumbUpIcon = {
  render: () => h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5' })
  ])
}

const ThumbDownIcon = {
  render: () => h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.737 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5' })
  ])
}

const BookIcon = {
  render: () => h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' })
  ])
}

// Article Card Component
const ArticleCard = {
  props: ['article', 'featured'],
  emits: ['click'],
  setup(props, { emit }) {
    return () => h('div', {
      class: ['article-card', { featured: props.featured }],
      onClick: () => emit('click')
    }, [
      h('h3', { class: 'article-title' }, props.article.title),
      h('p', { class: 'article-summary' }, props.article.summary || 'No description available'),
      h('div', { class: 'article-footer' }, [
        props.article.category_name && h('span', { class: 'category-tag' }, props.article.category_name),
        h('span', { class: 'view-count' }, `${props.article.view_count || 0} views`)
      ])
    ])
  }
}

// State
const loading = ref(false)
const searchQuery = ref('')
const searchResults = ref([])
const categories = ref([])
const featuredArticles = ref([])
const popularArticles = ref([])
const selectedArticle = ref(null)
const relatedArticles = ref([])
const helpfulVote = ref(null)
const showCreateModal = ref(false)

// Methods
function getCategoryIcon(icon) {
  // Default to BookIcon for now
  return BookIcon
}

async function loadData() {
  loading.value = true
  try {
    const [categoriesRes, featuredRes, popularRes] = await Promise.all([
      api.get('/v1/knowledge/categories'),
      api.get('/v1/knowledge/articles?featured=true&limit=3'),
      api.get('/v1/knowledge/articles/popular?limit=10'),
    ])

    categories.value = categoriesRes.data.categories || []
    featuredArticles.value = featuredRes.data.articles || []
    popularArticles.value = popularRes.data.articles || []
  } catch (error) {
    console.error('Failed to load knowledge base:', error)
  } finally {
    loading.value = false
  }
}

async function performSearch() {
  if (!searchQuery.value || searchQuery.value.length < 2) return

  try {
    const response = await api.get(`/v1/knowledge/search?q=${encodeURIComponent(searchQuery.value)}`)
    searchResults.value = response.data.results || []
  } catch (error) {
    console.error('Search failed:', error)
  }
}

function clearSearch() {
  searchQuery.value = ''
  searchResults.value = []
}

async function viewArticle(article) {
  try {
    const response = await api.get(`/v1/knowledge/articles/${article.slug || article.id}`)
    selectedArticle.value = response.data.article
    relatedArticles.value = response.data.relatedArticles || []
    helpfulVote.value = null
  } catch (error) {
    console.error('Failed to load article:', error)
  }
}

function closeArticle() {
  selectedArticle.value = null
  relatedArticles.value = []
  helpfulVote.value = null
}

async function voteHelpful(isHelpful) {
  if (helpfulVote.value !== null) return

  try {
    await api.post(`/v1/knowledge/articles/${selectedArticle.value.id}/helpful`, {
      helpful: isHelpful
    })
    helpfulVote.value = isHelpful
  } catch (error) {
    console.error('Failed to vote:', error)
  }
}

function selectCategory(category) {
  // Navigate to category view or filter articles
  searchQuery.value = ''
  // For now, just search for articles in this category
  api.get(`/v1/knowledge/articles?category_id=${category.id}`).then(response => {
    searchResults.value = response.data.articles || []
  })
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.knowledge-base {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.page-description {
  color: var(--text-secondary);
  font-size: 14px;
}

/* Search */
.search-section {
  margin-bottom: 32px;
}

.search-box {
  position: relative;
  max-width: 600px;
}

.search-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  color: var(--text-muted);
}

.search-input {
  width: 100%;
  padding: 14px 16px 14px 48px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg);
  color: var(--text-primary);
  font-size: 16px;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.search-clear {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-muted);
  cursor: pointer;
}

/* Sections */
.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.featured-section,
.categories-section,
.popular-section,
.search-results {
  margin-bottom: 40px;
}

/* Articles Grid */
.articles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.articles-grid.featured {
  grid-template-columns: repeat(3, 1fr);
}

@media (max-width: 1024px) {
  .articles-grid.featured {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .articles-grid.featured {
    grid-template-columns: 1fr;
  }
}

/* Article Card */
.article-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.article-card:hover {
  border-color: var(--primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.article-card.featured {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.05));
  border-color: rgba(99, 102, 241, 0.3);
}

.article-card .article-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.article-card .article-summary {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.article-card .article-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.category-tag {
  background: var(--bg-tertiary);
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--text-secondary);
}

.view-count {
  color: var(--text-muted);
}

/* Categories Grid */
.categories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.category-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.category-card:hover {
  border-color: var(--primary);
  transform: translateY(-2px);
}

.category-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.category-icon .icon {
  width: 24px;
  height: 24px;
}

.category-info h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.category-info p {
  font-size: 12px;
  color: var(--text-muted);
}

/* Articles List */
.articles-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.article-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.article-row:hover {
  border-color: var(--primary);
  background: var(--bg-secondary);
}

.article-row h4 {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.article-row p {
  font-size: 12px;
  color: var(--text-muted);
}

.article-stats {
  display: flex;
  gap: 16px;
}

.article-stats span {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.icon-sm {
  width: 14px;
  height: 14px;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.article-modal {
  background: var(--card-bg);
  border-radius: 16px;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
}

.article-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.category-badge {
  background: var(--primary);
  color: white;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.modal-header .views {
  font-size: 12px;
  color: var(--text-muted);
}

.modal-close {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: var(--text-secondary);
}

.modal-body {
  padding: 24px;
}

.article-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 24px;
}

.article-content {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-primary);
}

.article-content :deep(h1),
.article-content :deep(h2),
.article-content :deep(h3) {
  margin-top: 24px;
  margin-bottom: 12px;
}

.article-content :deep(p) {
  margin-bottom: 16px;
}

.article-content :deep(code) {
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.article-content :deep(pre) {
  background: var(--bg-tertiary);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
}

.modal-footer {
  padding: 20px;
  border-top: 1px solid var(--border-color);
}

.helpful-prompt {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.helpful-prompt span {
  color: var(--text-secondary);
  font-size: 14px;
}

.helpful-buttons {
  display: flex;
  gap: 8px;
}

.btn-helpful {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.btn-helpful:hover {
  background: var(--bg-tertiary);
}

.btn-helpful.yes.voted {
  background: rgba(34, 197, 94, 0.1);
  border-color: #22c55e;
  color: #22c55e;
}

.btn-helpful.no.voted {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
  color: #ef4444;
}

.related-articles h4 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.related-articles ul {
  list-style: none;
  padding: 0;
}

.related-articles li {
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
}

.related-articles li:last-child {
  border-bottom: none;
}

.related-articles a {
  color: var(--primary);
  cursor: pointer;
  font-size: 14px;
}

.related-articles a:hover {
  text-decoration: underline;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover);
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-icon {
  width: 16px;
  height: 16px;
}
</style>
