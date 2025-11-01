/**
 * Vue Router Configuration
 * Handles navigation and route guards for authentication
 */

import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

// Auth Pages
import Login from '../views/auth/Login.vue'
import Signup from '../views/auth/Signup.vue'

// Dashboard Pages
import DashboardLayout from '../views/dashboard/DashboardLayout.vue'
import DashboardHome from '../views/dashboard/DashboardHome.vue'
import APIKeys from '../views/dashboard/APIKeys.vue'
import CallLogs from '../views/dashboard/CallLogs.vue'
import Messages from '../views/dashboard/Messages.vue'
import EmailCampaigns from '../views/dashboard/EmailCampaigns.vue'
import EmailTemplates from '../views/EmailTemplates.vue'
import EmailCampaignBuilder from '../views/EmailCampaignBuilder.vue'
import EmailAnalytics from '../views/EmailAnalytics.vue'
import EmailAutomation from '../views/EmailAutomation.vue'
import EmailDeliverability from '../views/EmailDeliverability.vue'
import WhatsAppMessages from '../views/WhatsAppMessages.vue'
import SocialMessages from '../views/SocialMessages.vue'
import Webhooks from '../views/dashboard/Webhooks.vue'
import Conversations from '../views/dashboard/Conversations.vue'
import AgentManagement from '../views/AgentManagement.vue'

const routes = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { requiresGuest: true }
  },
  {
    path: '/signup',
    name: 'Signup',
    component: Signup,
    meta: { requiresGuest: true }
  },
  {
    path: '/dashboard',
    component: DashboardLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: DashboardHome
      },
      {
        path: 'conversations',
        name: 'Conversations',
        component: Conversations
      },
      {
        path: 'call-logs',
        name: 'CallLogs',
        component: CallLogs
      },
      {
        path: 'messages',
        name: 'Messages',
        component: Messages
      },
      {
        path: 'emails',
        name: 'EmailCampaigns',
        component: EmailCampaigns
      },
      {
        path: 'email-templates',
        name: 'EmailTemplates',
        component: EmailTemplates
      },
      {
        path: 'email-campaign-builder',
        name: 'EmailCampaignBuilder',
        component: EmailCampaignBuilder
      },
      {
        path: 'email-analytics',
        name: 'EmailAnalytics',
        component: EmailAnalytics
      },
      {
        path: 'email-automation',
        name: 'EmailAutomation',
        component: EmailAutomation
      },
      {
        path: 'email-deliverability',
        name: 'EmailDeliverability',
        component: EmailDeliverability
      },
      {
        path: 'whatsapp',
        name: 'WhatsAppMessages',
        component: WhatsAppMessages
      },
      {
        path: 'social',
        name: 'SocialMessages',
        component: SocialMessages
      },
      {
        path: 'webhooks',
        name: 'Webhooks',
        component: Webhooks
      },
      {
        path: 'api-keys',
        name: 'APIKeys',
        component: APIKeys
      },
      {
        path: 'agents',
        name: 'AgentManagement',
        component: AgentManagement
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
  const authStore = useAuthStore()

  // Initialize auth store if not already
  if (authStore.token && !authStore.user) {
    await authStore.initialize()
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

  next()
})

export default router
