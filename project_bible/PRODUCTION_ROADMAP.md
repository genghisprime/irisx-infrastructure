# IRISX/TAZZI - Production Deployment Roadmap

**Created:** November 4, 2025
**Status:** 75-80% Complete, ~116 hours to MVP Launch
**Target Launch Date:** 3 weeks from start

---

## 🎯 Executive Summary

**Current State:**
- ✅ Backend API: 91% complete (37/40 routes working)
- ✅ Agent Desktop: 100% complete and production-ready
- ✅ Customer Portal: 85% complete (33 Vue components)
- ✅ Documentation Site: 65% complete (17+ doc pages)
- ⚠️ Admin Portal: 15% complete (scaffolding only)
- ✅ Production Infrastructure: Deployed and healthy

**Critical Path to Launch:**
1. Fix 3 broken admin routes (6h)
2. Test & deploy customer portal (20h)
3. Deploy documentation site (10h)
4. Build minimal admin portal (60h)
5. Final testing & QA (20h)

**Total: 116 hours (~3 weeks at 40h/week)**

---

## 📋 Phase 1: Critical Fixes (Week 1 - 26 hours)

### Priority 1.1: Fix Broken Admin Routes (6 hours)

**Files to Fix:**
1. `api/src/routes/admin-auth.js` - authenticateAdmin middleware errors
2. `api/src/routes/system-status.js` - parse-time DATABASE_URL checks
3. `api/src/routes/public-signup.js` - Hono import issues

**Tactical Steps:**

#### Task 1.1.1: Fix admin-auth.js (2h)
```javascript
// CURRENT (BROKEN):
export async function authenticateAdmin(c, next) {
  const authHeader = c.req.header('Authorization');
  // ... validation
}

// Called at parse time (WRONG):
app.get('/health', authenticateAdmin(), async (c) => {

// FIX: Make it a middleware factory
export function authenticateAdmin() {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    // ... validation
    await next();
  }
}

// Now this works:
app.get('/health', authenticateAdmin(), async (c) => {
```

**Steps:**
- [ ] Read current admin-auth.js implementation
- [ ] Refactor authenticateAdmin to middleware factory pattern
- [ ] Update all imports in system-status.js
- [ ] Test locally with `node --check`
- [ ] Deploy to production
- [ ] Test `/admin/auth/login` endpoint

#### Task 1.1.2: Fix system-status.js (2h)
```javascript
// CURRENT (BROKEN):
if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL'); // Executes at parse time!
}

// FIX: Move checks inside route handlers
app.get('/health', authenticateAdmin(), async (c) => {
  if (!process.env.DATABASE_URL) {
    return c.json({ error: 'Database not configured' }, 500);
  }
  // ... rest of logic
});
```

**Steps:**
- [ ] Read current system-status.js
- [ ] Move all parse-time checks to runtime (inside handlers)
- [ ] Update authenticateAdmin() calls to use new factory pattern
- [ ] Test locally
- [ ] Deploy to production
- [ ] Test `/admin/system/health` endpoint

#### Task 1.1.3: Fix public-signup.js (2h)
- [ ] Read current file for Hono import issues
- [ ] Fix import statements
- [ ] Verify all dependencies exist
- [ ] Test locally
- [ ] Deploy to production
- [ ] Test `/public/signup` endpoint

**Completion Criteria:**
- [ ] All 3 files pass `node --check`
- [ ] Files deployed to production
- [ ] All admin routes return 200/401 (not 500/crash)
- [ ] PM2 stays healthy after deployment

---

### Priority 1.2: Test Customer Portal (20 hours)

**Status:** 33 Vue components built, needs integration testing

**Tactical Steps:**

#### Task 1.2.1: Environment Setup (2h)
- [ ] Check `.env` configuration
- [ ] Update API base URL to production
- [ ] Verify all API endpoints customer portal calls
- [ ] Check authentication flow

#### Task 1.2.2: Component Testing (10h)
Test each major component with real API:

**Auth Flow (2h):**
- [ ] Test Login.vue with production API
- [ ] Test Signup.vue registration
- [ ] Test EmailVerified.vue verification flow
- [ ] Verify token storage and refresh

**Dashboard Components (4h):**
- [ ] Test DashboardHome.vue stats loading
- [ ] Test APIKeys.vue CRUD operations
- [ ] Test EmailCampaigns.vue list/create
- [ ] Test Conversations.vue inbox
- [ ] Test Webhooks.vue configuration

**Communication Components (4h):**
- [ ] Test ChatInbox.vue real-time messaging
- [ ] Test SocialMessages.vue integration
- [ ] Test CallRecordingPlayer.vue S3 playback
- [ ] Test WebhookConfiguration.vue setup

**Agent Components (2h):**
- [ ] Test AgentManagement.vue CRUD
- [ ] Test AgentPerformance.vue analytics

**Email Components (2h):**
- [ ] Test EmailTemplates.vue management
- [ ] Test EmailAutomation.vue campaigns
- [ ] Test EmailDeliverability.vue metrics
- [ ] Test EmailTemplateLibrary.vue

**Billing (2h):**
- [ ] Test BillingHistory.vue invoice list
- [ ] Test payment integration
- [ ] Test UsageDashboard.vue metrics

#### Task 1.2.3: Bug Fixes (4h)
- [ ] Fix any API integration issues
- [ ] Fix error handling gaps
- [ ] Fix loading states
- [ ] Fix responsive design issues

#### Task 1.2.4: Deployment (4h)
- [ ] Build production bundle: `npm run build`
- [ ] Set up S3 bucket for static hosting
- [ ] Configure CloudFront CDN
- [ ] Set up custom domain (portal.tazzi.com)
- [ ] Configure SSL certificate
- [ ] Deploy and test

**Completion Criteria:**
- [ ] All 33 components tested with production API
- [ ] No console errors
- [ ] Mobile-responsive
- [ ] Deployed to production URL
- [ ] SSL certificate valid

---

## 📋 Phase 2: Documentation & Admin Portal (Week 2 - 70 hours)

### Priority 2.1: Deploy Tazzi Docs (10 hours)

**Status:** 17+ MDX pages, Mintlify configuration ready

**Tactical Steps:**

#### Task 2.1.1: Complete Missing Docs (4h)
- [ ] Add API reference for remaining endpoints:
  - [ ] Analytics endpoints
  - [ ] Billing endpoints
  - [ ] Agent management endpoints
  - [ ] IVR endpoints
  - [ ] TTS endpoints
- [ ] Add integration guides:
  - [ ] FreeSWITCH setup
  - [ ] WebRTC client integration
  - [ ] Webhook implementation
- [ ] Add code examples for all languages:
  - [ ] JavaScript/Node.js
  - [ ] Python
  - [ ] PHP
  - [ ] cURL

#### Task 2.1.2: Mintlify Configuration (2h)
- [ ] Review mint.json configuration
- [ ] Verify all navigation links
- [ ] Test local build: `npx mintlify dev`
- [ ] Fix any broken links
- [ ] Optimize images
- [ ] Add search configuration

#### Task 2.1.3: Deploy to Mintlify (4h)
- [ ] Sign up for Mintlify account
- [ ] Connect GitHub repository
- [ ] Configure custom domain (docs.tazzi.com)
- [ ] Set up SSL
- [ ] Deploy and verify
- [ ] Test all pages and links
- [ ] Add Google Analytics

**Completion Criteria:**
- [ ] All API endpoints documented
- [ ] Code examples for all major operations
- [ ] Site accessible at docs.tazzi.com
- [ ] No broken links
- [ ] Search working

---

### Priority 2.2: Build Minimal Admin Portal (60 hours)

**Goal:** Create minimal viable admin portal for tenant/billing management

**Components to Build:**

#### Week 2, Day 1-2: Core Infrastructure (16h)

**Task 2.2.1: Auth Store (4h)**
```javascript
// src/stores/adminAuth.js
import { defineStore } from 'pinia'
import api from '@/utils/api'

export const useAdminAuthStore = defineStore('adminAuth', {
  state: () => ({
    admin: null,
    token: localStorage.getItem('admin_token'),
    role: null
  }),

  actions: {
    async login(email, password) {
      const response = await api.post('/admin/auth/login', { email, password })
      this.token = response.data.token
      this.admin = response.data.admin
      this.role = response.data.role
      localStorage.setItem('admin_token', this.token)
    },

    async logout() {
      await api.post('/admin/auth/logout')
      this.token = null
      this.admin = null
      localStorage.removeItem('admin_token')
    },

    async initialize() {
      if (!this.token) return
      try {
        const response = await api.get('/admin/auth/me')
        this.admin = response.data.admin
        this.role = response.data.role
      } catch (error) {
        this.logout()
      }
    }
  }
})
```

**Steps:**
- [ ] Create src/stores/adminAuth.js
- [ ] Implement login/logout/initialize
- [ ] Add JWT token management
- [ ] Add role-based permissions
- [ ] Test with production API

**Task 2.2.2: API Client (4h)**
```javascript
// src/utils/api.js
import axios from 'axios'
import { useAdminAuthStore } from '@/stores/adminAuth'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://3.83.53.69:3000',
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const authStore = useAdminAuthStore()
  if (authStore.token) {
    config.headers.Authorization = `Bearer ${authStore.token}`
  }
  return config
})

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const authStore = useAdminAuthStore()
      authStore.logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
```

**Steps:**
- [ ] Create src/utils/api.js
- [ ] Add request/response interceptors
- [ ] Add error handling
- [ ] Test with auth endpoints

**Task 2.2.3: Router Configuration (4h)**
```javascript
// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import { useAdminAuthStore } from '@/stores/adminAuth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/AdminLogin.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/DashboardOverview.vue')
      },
      {
        path: 'tenants',
        name: 'Tenants',
        component: () => import('@/views/tenants/TenantList.vue')
      },
      {
        path: 'tenants/:id',
        name: 'TenantDetails',
        component: () => import('@/views/tenants/TenantDetails.vue')
      },
      {
        path: 'billing',
        name: 'Billing',
        component: () => import('@/views/billing/InvoiceList.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const authStore = useAdminAuthStore()

  if (to.meta.requiresAuth && !authStore.token) {
    next('/login')
  } else if (to.meta.requiresGuest && authStore.token) {
    next('/')
  } else {
    next()
  }
})

export default router
```

**Steps:**
- [ ] Create router with auth guards
- [ ] Add routes for minimal pages
- [ ] Test navigation and guards

**Task 2.2.4: AdminLayout Component (4h)**
```vue
<!-- src/layouts/AdminLayout.vue -->
<template>
  <div class="admin-layout">
    <aside class="sidebar">
      <div class="logo">IRISX Admin</div>
      <nav>
        <router-link to="/">Dashboard</router-link>
        <router-link to="/tenants">Tenants</router-link>
        <router-link to="/billing">Billing</router-link>
        <router-link to="/system">System</router-link>
      </nav>
    </aside>

    <div class="main-content">
      <header class="header">
        <div class="user-info">
          {{ admin.email }}
          <button @click="logout">Logout</button>
        </div>
      </header>

      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { useAdminAuthStore } from '@/stores/adminAuth'
import { computed } from 'vue'

const authStore = useAdminAuthStore()
const admin = computed(() => authStore.admin)

const logout = () => {
  authStore.logout()
}
</script>
```

**Steps:**
- [ ] Create AdminLayout with sidebar
- [ ] Add navigation menu
- [ ] Add header with user info
- [ ] Style with Tailwind CSS

#### Week 2, Day 3: Authentication (8h)

**Task 2.2.5: AdminLogin Page (8h)**
```vue
<!-- src/views/auth/AdminLogin.vue -->
<template>
  <div class="login-page">
    <div class="login-card">
      <h1>IRISX Admin Portal</h1>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label>Email</label>
          <input
            v-model="email"
            type="email"
            required
            placeholder="admin@irisx.internal"
          />
        </div>

        <div class="form-group">
          <label>Password</label>
          <input
            v-model="password"
            type="password"
            required
          />
        </div>

        <div v-if="error" class="error">{{ error }}</div>

        <button type="submit" :disabled="loading">
          {{ loading ? 'Logging in...' : 'Login' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminAuthStore } from '@/stores/adminAuth'

const router = useRouter()
const authStore = useAdminAuthStore()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const handleLogin = async () => {
  try {
    loading.value = true
    error.value = ''
    await authStore.login(email.value, password.value)
    router.push('/')
  } catch (err) {
    error.value = err.response?.data?.error || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>
```

**Steps:**
- [ ] Create AdminLogin.vue
- [ ] Add form validation
- [ ] Add error handling
- [ ] Add loading states
- [ ] Style with Tailwind
- [ ] Test with production API

#### Week 2, Day 4-5: Dashboard & Tenant Pages (16h)

**Task 2.2.6: Dashboard Overview (8h)**
- [ ] Create DashboardOverview.vue
- [ ] Add stat cards (total tenants, active users, MRR)
- [ ] Add charts (revenue trend, growth)
- [ ] Add recent activity feed
- [ ] Add system health status
- [ ] Fetch data from `/admin/dashboard/stats`
- [ ] Add loading states
- [ ] Add error handling

**Task 2.2.7: Tenant List (8h)**
- [ ] Create TenantList.vue
- [ ] Add data table with pagination
- [ ] Add search functionality
- [ ] Add filters (plan, status)
- [ ] Add sort options
- [ ] Add quick actions (view, suspend, delete)
- [ ] Fetch from `/admin/tenants`
- [ ] Add create tenant button

#### Week 2, Weekend: Tenant Details & Billing (16h)

**Task 2.2.8: Tenant Details (8h)**
- [ ] Create TenantDetails.vue
- [ ] Show tenant overview
- [ ] Show usage statistics
- [ ] Show billing info
- [ ] Show feature flags
- [ ] Add action buttons (suspend, reactivate, delete)
- [ ] Fetch from `/admin/tenants/:id`

**Task 2.2.9: Invoice List (8h)**
- [ ] Create InvoiceList.vue
- [ ] Add invoice table
- [ ] Add filters (tenant, status, date range)
- [ ] Add search by invoice number
- [ ] Add quick view modal
- [ ] Fetch from `/admin/billing/invoices`

**Completion Criteria:**
- [ ] Login working with production API
- [ ] Dashboard showing real stats
- [ ] Can view/search tenants
- [ ] Can view tenant details
- [ ] Can view invoices
- [ ] All pages mobile-responsive
- [ ] No console errors

---

## 📋 Phase 3: Testing & Deployment (Week 3 - 20 hours)

### Priority 3.1: Integration Testing (12 hours)

**Task 3.1.1: API Integration Tests (4h)**
- [ ] Test all customer portal API calls
- [ ] Test all admin portal API calls
- [ ] Test authentication flows
- [ ] Test error handling
- [ ] Test rate limiting
- [ ] Document any issues

**Task 3.1.2: End-to-End User Flows (4h)**
- [ ] Customer signup → email verify → login → dashboard
- [ ] Admin login → view tenant → suspend → reactivate
- [ ] Agent login → make call → disposition → logout
- [ ] Create campaign → send messages → view analytics
- [ ] Create webhook → receive event → view logs

**Task 3.1.3: Cross-Browser Testing (2h)**
- [ ] Test on Chrome
- [ ] Test on Firefox
- [ ] Test on Safari
- [ ] Test on mobile browsers
- [ ] Fix any compatibility issues

**Task 3.1.4: Performance Testing (2h)**
- [ ] Test page load times
- [ ] Test API response times
- [ ] Test with 100 concurrent users (k6)
- [ ] Optimize slow queries
- [ ] Add caching where needed

### Priority 3.2: Production Deployment (8 hours)

**Task 3.2.1: Customer Portal Deployment (2h)**
- [ ] Build: `npm run build`
- [ ] Deploy to S3/CloudFront
- [ ] Configure DNS (portal.tazzi.com)
- [ ] Test production URL
- [ ] Monitor for errors

**Task 3.2.2: Admin Portal Deployment (2h)**
- [ ] Build: `npm run build`
- [ ] Deploy to S3/CloudFront
- [ ] Configure DNS (admin.tazzi.com)
- [ ] Test production URL
- [ ] Restrict access (IP whitelist)

**Task 3.2.3: Docs Deployment (2h)**
- [ ] Deploy to Mintlify
- [ ] Configure DNS (docs.tazzi.com)
- [ ] Test all links
- [ ] Add analytics

**Task 3.2.4: Final Verification (2h)**
- [ ] Verify all services accessible
- [ ] Verify SSL certificates
- [ ] Verify DNS records
- [ ] Run smoke tests
- [ ] Update status page

**Completion Criteria:**
- [ ] All portals deployed and accessible
- [ ] All SSL certificates valid
- [ ] All tests passing
- [ ] No critical bugs
- [ ] Monitoring in place

---

## 📊 Success Metrics

### Technical Metrics
- [ ] API uptime: 99.9%
- [ ] API response time: < 200ms p95
- [ ] Frontend load time: < 2s
- [ ] Zero critical bugs
- [ ] All tests passing

### Feature Completeness
- [ ] 40/40 backend routes working (100%)
- [ ] Customer portal fully functional (100%)
- [ ] Admin portal MVP complete (minimal features)
- [ ] Agent desktop production-ready (100%)
- [ ] Documentation comprehensive (80%+)

### Deployment Status
- [ ] Production API deployed and healthy
- [ ] Customer portal deployed (portal.tazzi.com)
- [ ] Admin portal deployed (admin.tazzi.com)
- [ ] Agent desktop deployed (agent.tazzi.com)
- [ ] Docs deployed (docs.tazzi.com)

---

## 🚨 Risk Mitigation

### High-Risk Items
1. **Admin route fixes may uncover more issues**
   - Mitigation: Thorough testing, rollback plan

2. **Customer portal may have API integration bugs**
   - Mitigation: Component-by-component testing

3. **Performance issues under load**
   - Mitigation: Load testing, caching, CDN

4. **Security vulnerabilities**
   - Mitigation: Security audit, penetration testing

### Rollback Plan
- All deployments have backup files
- PM2 can restart from previous version
- S3/CloudFront can rollback to previous build
- Database migrations are reversible

---

## 📞 Next Steps

**Immediate (Today):**
1. Read and understand all 3 broken admin route files
2. Create fix plan for each file
3. Start implementing fixes

**This Week:**
1. Complete all admin route fixes
2. Start customer portal testing
3. Create deployment pipeline

**Next Week:**
1. Deploy customer portal
2. Build admin portal MVP
3. Deploy documentation

**Week 3:**
1. Final testing
2. Production deployment
3. Launch! 🚀
