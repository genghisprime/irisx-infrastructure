<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Sidebar -->
    <div class="fixed inset-y-0 left-0 w-64 bg-white shadow-lg">
      <!-- Logo -->
      <div class="flex items-center justify-center h-16 px-4 bg-indigo-600">
        <h1 class="text-2xl font-bold text-white">Tazzi</h1>
      </div>

      <!-- Navigation -->
      <nav class="mt-5 px-2 space-y-1 overflow-y-auto h-[calc(100vh-8rem)]">
        <!-- Dashboard -->
        <router-link
          to="/dashboard"
          class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
          :class="isActive('/dashboard') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
        >
          <HomeIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard') ? 'text-indigo-600' : 'text-gray-400'" />
          Dashboard
        </router-link>

        <!-- Communications Section -->
        <div class="pt-4">
          <h3 class="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Communications</h3>
          <div class="mt-2 space-y-1">
            <router-link
              to="/dashboard/conversations"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/conversations') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <ChatBubbleLeftRightIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/conversations') ? 'text-indigo-600' : 'text-gray-400'" />
              Conversations
            </router-link>

            <router-link
              to="/dashboard/call-logs"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/call-logs') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <PhoneIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/call-logs') ? 'text-indigo-600' : 'text-gray-400'" />
              Call Logs
            </router-link>

            <router-link
              to="/dashboard/messages"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/messages') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <ChatBubbleBottomCenterTextIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/messages') ? 'text-indigo-600' : 'text-gray-400'" />
              SMS Messages
            </router-link>

            <router-link
              to="/dashboard/whatsapp"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/whatsapp') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <DevicePhoneMobileIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/whatsapp') ? 'text-indigo-600' : 'text-gray-400'" />
              WhatsApp
            </router-link>

            <router-link
              to="/dashboard/social-media"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/social-media') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <GlobeAltIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/social-media') ? 'text-indigo-600' : 'text-gray-400'" />
              Social Media
            </router-link>
          </div>
        </div>

        <!-- Email Section -->
        <div class="pt-4">
          <h3 class="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</h3>
          <div class="mt-2 space-y-1">
            <router-link
              to="/dashboard/emails"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/emails') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <EnvelopeIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/emails') ? 'text-indigo-600' : 'text-gray-400'" />
              Emails
            </router-link>

            <router-link
              to="/dashboard/email-templates"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/email-templates') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <DocumentTextIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/email-templates') ? 'text-indigo-600' : 'text-gray-400'" />
              Email Templates
            </router-link>

            <router-link
              to="/dashboard/email-builder"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/email-builder') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <PencilSquareIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/email-builder') ? 'text-indigo-600' : 'text-gray-400'" />
              Email Builder
            </router-link>

            <router-link
              to="/dashboard/email-analytics"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/email-analytics') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <ChartBarIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/email-analytics') ? 'text-indigo-600' : 'text-gray-400'" />
              Email Analytics
            </router-link>

            <router-link
              to="/dashboard/email-automation"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/email-automation') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <BoltIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/email-automation') ? 'text-indigo-600' : 'text-gray-400'" />
              Email Automation
            </router-link>

            <router-link
              to="/dashboard/email-deliverability"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/email-deliverability') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <CheckBadgeIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/email-deliverability') ? 'text-indigo-600' : 'text-gray-400'" />
              Deliverability
            </router-link>
          </div>
        </div>

        <!-- Contacts & Campaigns -->
        <div class="pt-4">
          <h3 class="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contacts & Campaigns</h3>
          <div class="mt-2 space-y-1">
            <router-link
              to="/dashboard/contacts"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/contacts') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <UsersIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/contacts') ? 'text-indigo-600' : 'text-gray-400'" />
              Contacts
            </router-link>

            <router-link
              to="/dashboard/lists"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/lists') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <ListBulletIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/lists') ? 'text-indigo-600' : 'text-gray-400'" />
              Lists
            </router-link>

            <router-link
              to="/dashboard/campaigns"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/campaigns') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <MegaphoneIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/campaigns') ? 'text-indigo-600' : 'text-gray-400'" />
              Campaigns
            </router-link>

            <router-link
              to="/dashboard/campaign-dashboard"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/campaign-dashboard') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <PresentationChartLineIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/campaign-dashboard') ? 'text-indigo-600' : 'text-gray-400'" />
              Campaign Dashboard
            </router-link>
          </div>
        </div>

        <!-- Team & Operations -->
        <div class="pt-4">
          <h3 class="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Team & Operations</h3>
          <div class="mt-2 space-y-1">
            <router-link
              to="/dashboard/agents"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/agents') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <UserGroupIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/agents') ? 'text-indigo-600' : 'text-gray-400'" />
              Agents
            </router-link>

            <router-link
              to="/dashboard/agent-management"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/agent-management') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <UserCircleIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/agent-management') ? 'text-indigo-600' : 'text-gray-400'" />
              Agent Management
            </router-link>

            <router-link
              to="/dashboard/agent-performance"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/agent-performance') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <TrophyIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/agent-performance') ? 'text-indigo-600' : 'text-gray-400'" />
              Agent Performance
            </router-link>

            <router-link
              to="/dashboard/queues"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/queues') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <QueueListIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/queues') ? 'text-indigo-600' : 'text-gray-400'" />
              Queues
            </router-link>

            <router-link
              to="/dashboard/queue-management"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/queue-management') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <Cog6ToothIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/queue-management') ? 'text-indigo-600' : 'text-gray-400'" />
              Queue Management
            </router-link>
          </div>
        </div>

        <!-- Analytics -->
        <div class="pt-4">
          <h3 class="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Analytics</h3>
          <div class="mt-2 space-y-1">
            <router-link
              to="/dashboard/analytics"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/analytics') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <ChartPieIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/analytics') ? 'text-indigo-600' : 'text-gray-400'" />
              Analytics
            </router-link>

            <router-link
              to="/dashboard/advanced-analytics"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/advanced-analytics') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <PresentationChartBarIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/advanced-analytics') ? 'text-indigo-600' : 'text-gray-400'" />
              Advanced Analytics
            </router-link>

            <router-link
              to="/dashboard/unified-analytics"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/unified-analytics') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <CircleStackIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/unified-analytics') ? 'text-indigo-600' : 'text-gray-400'" />
              Unified Analytics
            </router-link>
          </div>
        </div>

        <!-- Chat & Support -->
        <div class="pt-4">
          <h3 class="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Chat & Support</h3>
          <div class="mt-2 space-y-1">
            <router-link
              to="/dashboard/chat-inbox"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/chat-inbox') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <InboxIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/chat-inbox') ? 'text-indigo-600' : 'text-gray-400'" />
              Chat Inbox
            </router-link>

            <router-link
              to="/dashboard/chat-settings"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/chat-settings') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <AdjustmentsHorizontalIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/chat-settings') ? 'text-indigo-600' : 'text-gray-400'" />
              Chat Settings
            </router-link>
          </div>
        </div>

        <!-- Settings & API -->
        <div class="pt-4 pb-4">
          <h3 class="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Settings & API</h3>
          <div class="mt-2 space-y-1">
            <router-link
              to="/dashboard/webhooks"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/webhooks') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <ArrowPathIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/webhooks') ? 'text-indigo-600' : 'text-gray-400'" />
              Webhooks
            </router-link>

            <router-link
              to="/dashboard/webhook-config"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/webhook-config') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <WrenchScrewdriverIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/webhook-config') ? 'text-indigo-600' : 'text-gray-400'" />
              Webhook Config
            </router-link>

            <router-link
              to="/dashboard/call-recording"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/call-recording') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <MicrophoneIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/call-recording') ? 'text-indigo-600' : 'text-gray-400'" />
              Call Recording
            </router-link>

            <router-link
              to="/dashboard/usage"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/usage') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <ArrowTrendingUpIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/usage') ? 'text-indigo-600' : 'text-gray-400'" />
              Usage
            </router-link>

            <router-link
              to="/dashboard/billing"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/billing') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <CreditCardIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/billing') ? 'text-indigo-600' : 'text-gray-400'" />
              Billing
            </router-link>

            <router-link
              to="/dashboard/data-import"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/data-import') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <ArrowUpTrayIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/data-import') ? 'text-indigo-600' : 'text-gray-400'" />
              Import Data
            </router-link>

            <router-link
              to="/dashboard/api-keys"
              class="group flex items-center px-2 py-2 text-sm font-medium rounded-md"
              :class="isActive('/dashboard/api-keys') ? 'bg-indigo-100 text-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
            >
              <KeyIcon class="mr-3 h-5 w-5 flex-shrink-0" :class="isActive('/dashboard/api-keys') ? 'text-indigo-600' : 'text-gray-400'" />
              API Keys
            </router-link>
          </div>
        </div>
      </nav>

      <!-- User Menu -->
      <div class="absolute bottom-0 w-64 p-4 bg-gray-50 border-t border-gray-200">
        <div class="flex items-center justify-between">
          <div class="flex items-center min-w-0">
            <UserCircleIcon class="h-8 w-8 text-gray-400 flex-shrink-0" />
            <div class="ml-3 min-w-0">
              <p class="text-sm font-medium text-gray-700 truncate">{{ authStore.user?.email || 'User' }}</p>
            </div>
          </div>
          <button
            @click="handleLogout"
            class="ml-2 inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 flex-shrink-0"
          >
            Logout
          </button>
        </div>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="ml-64">
      <!-- Top Header Bar -->
      <div class="bg-white shadow-sm">
        <div class="px-4 sm:px-6 lg:px-8 py-4">
          <h1 class="text-2xl font-semibold text-gray-900">{{ pageTitle }}</h1>
        </div>
      </div>

      <!-- Page Content -->
      <main class="py-6 px-4 sm:px-6 lg:px-8">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import {
  HomeIcon,
  ChatBubbleLeftRightIcon,
  PhoneIcon,
  ChatBubbleBottomCenterTextIcon,
  DevicePhoneMobileIcon,
  GlobeAltIcon,
  EnvelopeIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  ChartBarIcon,
  BoltIcon,
  CheckBadgeIcon,
  UsersIcon,
  ListBulletIcon,
  MegaphoneIcon,
  PresentationChartLineIcon,
  UserGroupIcon,
  UserCircleIcon,
  TrophyIcon,
  QueueListIcon,
  Cog6ToothIcon,
  ChartPieIcon,
  PresentationChartBarIcon,
  CircleStackIcon,
  InboxIcon,
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  WrenchScrewdriverIcon,
  MicrophoneIcon,
  ArrowTrendingUpIcon,
  CreditCardIcon,
  ArrowUpTrayIcon,
  KeyIcon
} from '@heroicons/vue/24/outline'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

function isActive(path) {
  if (path === '/dashboard') {
    return route.path === '/dashboard'
  }
  return route.path.startsWith(path)
}

const pageTitle = computed(() => {
  const path = route.path
  const titles = {
    '/dashboard': 'Dashboard',
    '/dashboard/conversations': 'Conversations',
    '/dashboard/call-logs': 'Call Logs',
    '/dashboard/messages': 'SMS Messages',
    '/dashboard/whatsapp': 'WhatsApp',
    '/dashboard/social-media': 'Social Media',
    '/dashboard/emails': 'Emails',
    '/dashboard/email-templates': 'Email Templates',
    '/dashboard/email-builder': 'Email Builder',
    '/dashboard/email-analytics': 'Email Analytics',
    '/dashboard/email-automation': 'Email Automation',
    '/dashboard/email-deliverability': 'Email Deliverability',
    '/dashboard/contacts': 'Contacts',
    '/dashboard/lists': 'Lists',
    '/dashboard/campaigns': 'Campaigns',
    '/dashboard/campaign-dashboard': 'Campaign Dashboard',
    '/dashboard/agents': 'Agents',
    '/dashboard/agent-management': 'Agent Management',
    '/dashboard/agent-performance': 'Agent Performance',
    '/dashboard/queues': 'Queues',
    '/dashboard/queue-management': 'Queue Management',
    '/dashboard/analytics': 'Analytics',
    '/dashboard/advanced-analytics': 'Advanced Analytics',
    '/dashboard/unified-analytics': 'Unified Analytics',
    '/dashboard/chat-inbox': 'Chat Inbox',
    '/dashboard/chat-settings': 'Chat Settings',
    '/dashboard/webhooks': 'Webhooks',
    '/dashboard/webhook-config': 'Webhook Configuration',
    '/dashboard/call-recording': 'Call Recording',
    '/dashboard/usage': 'Usage Dashboard',
    '/dashboard/billing': 'Billing History',
    '/dashboard/data-import': 'Import Data',
    '/dashboard/api-keys': 'API Keys'
  }
  return titles[path] || 'Dashboard'
})

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}
</script>
