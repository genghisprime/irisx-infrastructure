import { createRouter, createWebHistory } from 'vue-router'
import { useAdminAuthStore } from '../stores/adminAuth'

const routes = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/admin/auth/AdminLogin.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/dashboard',
    component: () => import('../components/admin/layout/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('../views/admin/dashboard/DashboardOverview.vue')
      },
      {
        path: 'system-health',
        name: 'SystemHealth',
        component: () => import('../views/admin/dashboard/SystemHealth.vue')
      },
      {
        path: 'audit-log',
        name: 'AuditLog',
        component: () => import('../views/admin/dashboard/AuditLog.vue')
      },
      {
        path: 'usage-analytics',
        name: 'UsageAnalytics',
        component: () => import('../views/admin/analytics/UsageAnalytics.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Tenants
      {
        path: 'tenants',
        name: 'TenantList',
        component: () => import('../views/admin/tenants/TenantList.vue')
      },
      {
        path: 'tenants/create',
        name: 'TenantCreate',
        component: () => import('../views/admin/tenants/TenantCreate.vue'),
        meta: { requiresRole: 'admin' }
      },
      {
        path: 'tenants/:id',
        name: 'TenantDetails',
        component: () => import('../views/admin/tenants/TenantDetails.vue')
      },
      {
        path: 'tenants/:id/users',
        name: 'TenantUsers',
        component: () => import('../views/admin/tenants/TenantUsers.vue')
      },
      {
        path: 'tenants/:id/api-keys',
        name: 'TenantApiKeys',
        component: () => import('../views/admin/tenants/TenantApiKeys.vue'),
        meta: { requiresRole: 'admin' }
      },
      {
        path: 'tenants/:id/billing',
        name: 'TenantBillingConfig',
        component: () => import('../views/admin/tenants/TenantBillingConfig.vue'),
        meta: { requiresRole: 'admin' }
      },
      {
        path: 'tenants/:id/features',
        name: 'TenantFeatures',
        component: () => import('../views/admin/tenants/TenantFeatures.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Billing
      {
        path: 'billing/invoices',
        name: 'InvoiceList',
        component: () => import('../views/admin/billing/InvoiceList.vue')
      },
      {
        path: 'billing/revenue',
        name: 'RevenueReports',
        component: () => import('../views/admin/billing/RevenueReports.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Communications
      {
        path: 'conversations',
        name: 'ConversationOversight',
        component: () => import('../views/admin/communications/ConversationOversight.vue')
      },
      {
        path: 'recordings',
        name: 'RecordingManagement',
        component: () => import('../views/admin/communications/RecordingManagement.vue')
      },
      {
        path: 'phone-numbers',
        name: 'PhoneNumberProvisioning',
        component: () => import('../views/admin/communications/PhoneNumberProvisioning.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Agents
      {
        path: 'agents',
        name: 'AgentList',
        component: () => import('../views/admin/agents/AgentList.vue')
      },
      // Providers
      {
        path: 'providers',
        name: 'ProviderCredentials',
        component: () => import('../views/admin/providers/ProviderCredentials.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Settings
      {
        path: 'settings/features',
        name: 'FeatureFlags',
        component: () => import('../views/admin/settings/FeatureFlags.vue'),
        meta: { requiresRole: 'admin' }
      },
      {
        path: 'settings/system',
        name: 'SystemSettings',
        component: () => import('../views/admin/settings/SystemSettings.vue'),
        meta: { requiresRole: 'superadmin' }
      },
      // Alerts
      {
        path: 'alerts',
        name: 'AlertManagement',
        component: () => import('../views/admin/AlertManagement.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Data Import
      {
        path: 'data-import',
        name: 'DataImport',
        component: () => import('../views/admin/DataImport.vue'),
        meta: { requiresRole: 'admin' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation Guards
router.beforeEach(async (to, from, next) => {
  const authStore = useAdminAuthStore()

  // Restore auth from localStorage if needed
  if (!authStore.admin && localStorage.getItem('admin_token')) {
    authStore.restoreFromLocalStorage()
    if (authStore.token) {
      await authStore.fetchCurrentAdmin()
    }
  }

  // Check if route requires authentication
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  // Check if route requires guest (not authenticated)
  if (to.meta.requiresGuest && authStore.isAuthenticated) {
    next({ name: 'Dashboard' })
    return
  }

  // Check role-based access
  if (to.meta.requiresRole && !authStore.hasPermission(to.meta.requiresRole)) {
    console.warn('Access denied - insufficient permissions')
    next({ name: 'Dashboard' })
    return
  }

  next()
})

export default router
