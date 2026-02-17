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
      // Supervisor Dashboard
      {
        path: 'supervisor',
        name: 'SupervisorDashboard',
        component: () => import('../views/admin/supervisor/SupervisorDashboard.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Providers
      {
        path: 'providers',
        name: 'ProviderCredentials',
        component: () => import('../views/admin/providers/ProviderCredentials.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Queues
      {
        path: 'queues',
        name: 'QueueManagement',
        component: () => import('../views/admin/queues/QueueManagement.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Campaigns
      {
        path: 'campaigns',
        name: 'CampaignMonitoring',
        component: () => import('../views/admin/campaigns/CampaignMonitoring.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Contacts
      {
        path: 'contacts',
        name: 'ContactManagement',
        component: () => import('../views/admin/contacts/ContactManagement.vue'),
        meta: { requiresRole: 'admin' }
      },
      // CDR Viewer
      {
        path: 'cdrs',
        name: 'CDRViewer',
        component: () => import('../views/admin/cdrs/CDRViewer.vue'),
        meta: { requiresRole: 'admin' }
      },
      // IVR Management
      {
        path: 'ivr',
        name: 'IVRManagement',
        component: () => import('../views/admin/ivr/IVRManagement.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Social Media Hub (Discord, Slack, Teams, Telegram)
      {
        path: 'social-media',
        name: 'SocialMediaHub',
        component: () => import('../views/admin/social/SocialMediaHub.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Traditional Social Media (Facebook, Twitter, Instagram, LinkedIn)
      {
        path: 'traditional-social',
        name: 'TraditionalSocialConfig',
        component: () => import('../views/admin/social/TraditionalSocialConfig.vue'),
        meta: { requiresRole: 'admin' }
      },
      // AMD (Answering Machine Detection)
      {
        path: 'amd',
        name: 'AMDConfiguration',
        component: () => import('../views/AMDConfiguration.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Billing Rates Management
      {
        path: 'billing/rates',
        name: 'BillingRates',
        component: () => import('../views/admin/billing/RateManagement.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Analytics Dashboard (Cross-Tenant)
      {
        path: 'analytics/overview',
        name: 'AnalyticsOverview',
        component: () => import('../views/admin/analytics/AnalyticsOverview.vue'),
        meta: { requiresRole: 'admin' }
      },
      // WhatsApp Business Management
      {
        path: 'whatsapp',
        name: 'WhatsAppManagement',
        component: () => import('../views/admin/whatsapp/WhatsAppManagement.vue'),
        meta: { requiresRole: 'admin' }
      },
      // SMS Template Management
      {
        path: 'sms-templates',
        name: 'SMSTemplates',
        component: () => import('../views/admin/sms/SMSTemplates.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Email Template Management
      {
        path: 'email-templates',
        name: 'EmailTemplates',
        component: () => import('../views/admin/email/EmailTemplates.vue'),
        meta: { requiresRole: 'admin' }
      },
      // SIP Trunks
      {
        path: 'sip-trunks',
        name: 'SipTrunkConfig',
        component: () => import('../views/admin/sip/SipTrunkConfig.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Email Service
      {
        path: 'email-service',
        name: 'EmailService',
        component: () => import('../views/admin/email/EmailService.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Webhooks
      {
        path: 'webhooks',
        name: 'WebhookManagement',
        component: () => import('../views/admin/webhooks/WebhookManagement.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Database
      {
        path: 'database',
        name: 'DatabaseManagement',
        component: () => import('../views/admin/database/DatabaseManagement.vue'),
        meta: { requiresRole: 'superadmin' }
      },
      // Cache
      {
        path: 'cache',
        name: 'CacheManagement',
        component: () => import('../views/admin/cache/CacheManagement.vue'),
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
      },
      // API Keys Management (Cross-Tenant Security)
      {
        path: 'api-keys',
        name: 'ApiKeyManagement',
        component: () => import('../views/admin/api-keys/ApiKeyManagement.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Platform Reports
      {
        path: 'reports',
        name: 'PlatformReports',
        component: () => import('../views/admin/reports/PlatformReports.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Translation Services
      {
        path: 'translation',
        name: 'TranslationManagement',
        component: () => import('../views/admin/translation/TranslationManagement.vue'),
        meta: { requiresRole: 'admin' }
      },
      // AI Engine Management
      {
        path: 'ai',
        name: 'AIManagement',
        component: () => import('../views/admin/ai/AIManagement.vue'),
        meta: { requiresRole: 'admin' }
      },
      // AI Voice Management
      {
        path: 'voice',
        name: 'VoiceManagement',
        component: () => import('../views/admin/ai/VoiceManagement.vue'),
        meta: { requiresRole: 'admin' }
      },
      // Video Calling Management
      {
        path: 'video',
        name: 'VideoManagement',
        component: () => import('../views/admin/video/VideoManagement.vue'),
        meta: { requiresRole: 'admin' }
      },
      // STIR/SHAKEN Compliance Management
      {
        path: 'stir-shaken',
        name: 'StirShakenManagement',
        component: () => import('../views/admin/compliance/StirShakenManagement.vue'),
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
