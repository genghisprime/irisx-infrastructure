/**
 * Vue Router Configuration
 * Handles navigation and route guards for authentication
 */

import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

// Auth Pages
import Login from '../views/auth/Login.vue'
import Signup from '../views/auth/Signup.vue'
import EmailVerified from '../views/auth/EmailVerified.vue'

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
import SocialConnect from '../views/SocialConnect.vue'
import Webhooks from '../views/dashboard/Webhooks.vue'
import Conversations from '../views/dashboard/Conversations.vue'
import AgentManagement from '../views/AgentManagement.vue'
import AgentPerformance from '../views/AgentPerformance.vue'
import QueueManagement from '../views/QueueManagement.vue'
import CampaignManagement from '../views/CampaignManagement.vue'
import AdvancedAnalytics from '../views/AdvancedAnalytics.vue'
import WebhookConfiguration from '../views/WebhookConfiguration.vue'
import EmailTemplateLibrary from '../views/EmailTemplateLibrary.vue'
import CallRecordingPlayer from '../views/CallRecordingPlayer.vue'
import UsageDashboard from '../views/UsageDashboard.vue'
import BillingHistory from '../views/BillingHistory.vue'
import BillingPortal from '../views/BillingPortal.vue'
import DataImport from '../views/DataImport.vue'
import ChatInbox from '../views/ChatInbox.vue'
import ChatSettings from '../views/ChatSettings.vue'
import CampaignList from '../views/CampaignList.vue'
import CampaignDashboard from '../views/CampaignDashboard.vue'
import UnifiedAnalytics from '../views/UnifiedAnalytics.vue'
import Contacts from '../views/Contacts.vue'
import ContactLists from '../views/ContactLists.vue'
import KnowledgeBase from '../views/KnowledgeBase.vue'
import CallbackManagement from '../views/CallbackManagement.vue'
import TenantSettings from '../views/TenantSettings.vue'
import Wallboard from '../views/Wallboard.vue'
import IVRFlows from '../views/IVRFlows.vue'
import IVRFlowBuilder from '../views/IVRFlowBuilder.vue'
import QualityManagement from '../views/QualityManagement.vue'
import CRMIntegrations from '../views/CRMIntegrations.vue'
import WorkforceManagement from '../views/WorkforceManagement.vue'
import ReportBuilder from '../views/ReportBuilder.vue'
import TranslationSettings from '../views/TranslationSettings.vue'
import AISettings from '../views/AISettings.vue'
import VoiceAssistants from '../views/VoiceAssistants.vue'

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
    path: '/verify-email/:token',
    name: 'EmailVerified',
    component: EmailVerified,
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
        path: 'social/connect',
        name: 'SocialConnect',
        component: SocialConnect
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
        path: 'usage',
        name: 'UsageDashboard',
        component: UsageDashboard
      },
      {
        path: 'billing-history',
        name: 'BillingHistory',
        component: BillingHistory
      },
      {
        path: 'billing',
        name: 'BillingPortal',
        component: BillingPortal
      },
      {
        path: 'data-import',
        name: 'DataImport',
        component: DataImport
      },
      {
        path: 'contacts',
        name: 'Contacts',
        component: Contacts
      },
      {
        path: 'lists',
        name: 'ContactLists',
        component: ContactLists
      },
      {
        path: 'agents',
        name: 'AgentManagement',
        component: AgentManagement
      },
      {
        path: 'agent-performance',
        name: 'AgentPerformance',
        component: AgentPerformance
      },
      {
        path: 'queues',
        name: 'QueueManagement',
        component: QueueManagement
      },
      {
        path: 'campaigns',
        name: 'CampaignManagement',
        component: CampaignManagement
      },
      {
        path: 'analytics',
        name: 'AdvancedAnalytics',
        component: AdvancedAnalytics
      },
      {
        path: 'webhook-config',
        name: 'WebhookConfiguration',
        component: WebhookConfiguration
      },
      {
        path: 'email-template-library',
        name: 'EmailTemplateLibrary',
        component: EmailTemplateLibrary
      },
      {
        path: 'recordings',
        name: 'CallRecordingPlayer',
        component: CallRecordingPlayer
      },
      {
        path: 'chat-inbox',
        name: 'ChatInbox',
        component: ChatInbox
      },
      {
        path: 'chat-settings',
        name: 'ChatSettings',
        component: ChatSettings
      },
      {
        path: 'campaigns',
        name: 'CampaignList',
        component: CampaignList
      },
      {
        path: 'campaigns/:id',
        name: 'CampaignDashboard',
        component: CampaignDashboard
      },
      {
        path: 'unified-analytics',
        name: 'UnifiedAnalytics',
        component: UnifiedAnalytics
      },
      {
        path: 'knowledge-base',
        name: 'KnowledgeBase',
        component: KnowledgeBase
      },
      {
        path: 'callbacks',
        name: 'CallbackManagement',
        component: CallbackManagement
      },
      {
        path: 'settings',
        name: 'TenantSettings',
        component: TenantSettings
      },
      {
        path: 'wallboard',
        name: 'Wallboard',
        component: Wallboard
      }
    ]
  },
  // IVR Flow Builder (full-screen editor outside dashboard layout)
  {
    path: '/ivr',
    name: 'IVRFlows',
    component: IVRFlows,
    meta: { requiresAuth: true }
  },
  {
    path: '/ivr/:id',
    name: 'IVRFlowBuilder',
    component: IVRFlowBuilder,
    meta: { requiresAuth: true }
  },
  // Quality Management
  {
    path: '/quality',
    name: 'QualityManagement',
    component: QualityManagement,
    meta: { requiresAuth: true }
  },
  {
    path: '/integrations',
    name: 'CRMIntegrations',
    component: CRMIntegrations,
    meta: { requiresAuth: true }
  },
  // Workforce Management
  {
    path: '/wfm',
    name: 'WorkforceManagement',
    component: WorkforceManagement,
    meta: { requiresAuth: true }
  },
  // Report Builder
  {
    path: '/reports/builder',
    name: 'ReportBuilder',
    component: ReportBuilder,
    meta: { requiresAuth: true }
  },
  // Translation Settings
  {
    path: '/translation',
    name: 'TranslationSettings',
    component: TranslationSettings,
    meta: { requiresAuth: true }
  },
  // AI Settings
  {
    path: '/ai',
    name: 'AISettings',
    component: AISettings,
    meta: { requiresAuth: true }
  },
  // Voice Assistants
  {
    path: '/voice',
    name: 'VoiceAssistants',
    component: VoiceAssistants,
    meta: { requiresAuth: true }
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
