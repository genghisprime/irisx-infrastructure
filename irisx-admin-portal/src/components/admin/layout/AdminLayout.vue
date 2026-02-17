<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Sidebar -->
    <aside class="fixed inset-y-0 left-0 w-64 bg-gray-900 text-white z-30 flex flex-col">
      <div class="flex items-center justify-center h-16 bg-gray-950 border-b border-gray-800 flex-shrink-0">
        <h1 class="text-xl font-bold">Tazzi Admin</h1>
      </div>

      <nav class="flex-1 overflow-y-auto mt-6 px-3 pb-6">
        <!-- Dashboard -->
        <div class="mb-6">
          <p class="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Dashboard
          </p>
          <RouterLink
            to="/dashboard"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Overview
          </RouterLink>
          <RouterLink
            to="/dashboard/system-health"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/system-health' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            System Health
          </RouterLink>
          <RouterLink
            to="/dashboard/audit-log"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/audit-log' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Audit Log
          </RouterLink>
          <RouterLink
            to="/dashboard/usage-analytics"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/usage-analytics' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Usage & Analytics
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/analytics/overview"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/analytics/overview' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
            Analytics Dashboard
          </RouterLink>
        </div>

        <!-- Tenants -->
        <div class="mb-6">
          <p class="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Tenants
          </p>
          <RouterLink
            to="/dashboard/tenants"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path.includes('/tenants') }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            All Tenants
          </RouterLink>
        </div>

        <!-- Billing -->
        <div class="mb-6">
          <p class="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Billing
          </p>
          <RouterLink
            to="/dashboard/billing/invoices"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
            </svg>
            Invoices
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/billing/revenue"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Revenue
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/billing/rates"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/billing/rates' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Rate Tables
          </RouterLink>
        </div>

        <!-- Communications -->
        <div class="mb-6">
          <p class="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Communications
          </p>
          <RouterLink
            to="/dashboard/conversations"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Conversations
          </RouterLink>
          <RouterLink
            to="/dashboard/recordings"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Recordings
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/phone-numbers"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Phone Numbers
          </RouterLink>
        </div>

        <!-- Agents & Providers -->
        <div class="mb-6">
          <p class="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Management
          </p>
          <RouterLink
            to="/dashboard/agents"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Agents
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/supervisor"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/supervisor' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Supervisor
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/queues"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Queues
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/campaigns"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
            Campaigns
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/contacts"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/contacts' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Contacts
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/cdrs"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/cdrs' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            CDR Viewer
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/ivr"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/ivr' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            IVR Management
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/social-media"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/social-media' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
            Social Media
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/whatsapp"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/whatsapp' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            WhatsApp
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/sms-templates"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/sms-templates' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            SMS Templates
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/email-templates"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/email-templates' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Email Templates
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/providers"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Providers
          </RouterLink>
        </div>

        <!-- Advanced Features -->
        <div class="mb-6">
          <p class="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Advanced Features
          </p>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/business-messaging"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/business-messaging' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Business Messaging
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/video"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/video' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Video Calling
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/ai"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/ai' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI Management
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/voice"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/voice' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            Voice Assistants
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/amd"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/amd' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            AMD Settings
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/translation"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/translation' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
            Translation
          </RouterLink>
        </div>

        <!-- Compliance & Security -->
        <div class="mb-6">
          <p class="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Compliance & Security
          </p>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/stir-shaken"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/stir-shaken' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            STIR/SHAKEN
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/traditional-social"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/traditional-social' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Social Platforms
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/reports"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/reports' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Platform Reports
          </RouterLink>
        </div>

        <!-- Infrastructure -->
        <div class="mb-6">
          <p class="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Infrastructure
          </p>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/sip-trunks"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            SIP Trunks
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/email-service"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Email Service
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/webhooks"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Webhooks
          </RouterLink>
          <RouterLink
            v-if="authStore.isSuperAdmin"
            to="/dashboard/database"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
            Database
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/cache"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
            Cache
          </RouterLink>
        </div>

        <!-- Settings -->
        <div class="mb-6">
          <p class="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Settings
          </p>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/alerts"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/alerts' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            Alert Management
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/data-import"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/data-import' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Data Import
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/api-keys"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            :class="{ 'bg-gray-800': $route.path === '/dashboard/api-keys' }"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            API Keys
          </RouterLink>
          <RouterLink
            v-if="authStore.isAdmin"
            to="/dashboard/settings/features"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            Feature Flags
          </RouterLink>
          <RouterLink
            v-if="authStore.isSuperAdmin"
            to="/dashboard/settings/system"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            System Settings
          </RouterLink>
        </div>
      </nav>
    </aside>

    <!-- Main Content Area -->
    <div class="ml-64">
      <!-- Top Header -->
      <header class="bg-white shadow-sm h-16 flex items-center justify-between px-6">
        <div class="flex items-center">
          <h2 class="text-xl font-semibold text-gray-800">
            {{ pageTitle }}
          </h2>
        </div>

        <div class="flex items-center space-x-4">
          <!-- User Info -->
          <div class="flex items-center space-x-3">
            <div class="text-right">
              <p class="text-sm font-medium text-gray-700">{{ authStore.admin?.name || 'Admin' }}</p>
              <p class="text-xs text-gray-500">{{ roleLabel }}</p>
            </div>
            <button
              @click="handleLogout"
              class="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <!-- Page Content -->
      <main class="p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAdminAuthStore } from '../../../stores/adminAuth'

const router = useRouter()
const route = useRoute()
const authStore = useAdminAuthStore()

const pageTitle = computed(() => {
  const titles = {
    'Dashboard': 'Dashboard Overview',
    'SystemHealth': 'System Health',
    'AuditLog': 'Audit Log',
    'UsageAnalytics': 'Usage & Analytics',
    'AnalyticsOverview': 'Analytics Dashboard',
    'TenantList': 'All Tenants',
    'TenantDetails': 'Tenant Details',
    'TenantCreate': 'Create Tenant',
    'TenantUsers': 'Tenant Users',
    'InvoiceList': 'Invoices',
    'RevenueReports': 'Revenue Reports',
    'ConversationOversight': 'Conversations',
    'RecordingManagement': 'Call Recordings',
    'PhoneNumberProvisioning': 'Phone Numbers',
    'AgentList': 'Agents',
    'SupervisorDashboard': 'Supervisor Dashboard',
    'ContactManagement': 'Contacts',
    'CDRViewer': 'Call Detail Records',
    'IVRManagement': 'IVR Management',
    'SocialMediaHub': 'Social Media Hub',
    'WhatsAppManagement': 'WhatsApp Business',
    'SMSTemplates': 'SMS Template Management',
    'EmailTemplates': 'Email Template Management',
    'BillingRates': 'Billing Rate Tables',
    'ProviderCredentials': 'Provider Credentials',
    'FeatureFlags': 'Feature Flags',
    'SystemSettings': 'System Settings',
    'ApiKeyManagement': 'API Keys Management',
    'BusinessMessagingHub': 'Business Messaging (Apple/Google/RCS)',
    'VideoManagement': 'Video Calling Management',
    'AIManagement': 'AI Engine Management',
    'VoiceManagement': 'Voice Assistants',
    'AMDConfiguration': 'AMD Settings',
    'TranslationManagement': 'Translation Services',
    'StirShakenManagement': 'STIR/SHAKEN Compliance',
    'TraditionalSocialConfig': 'Social Platform Configuration',
    'PlatformReports': 'Platform Reports'
  }
  return titles[route.name] || 'Tazzi Admin Portal'
})

const roleLabel = computed(() => {
  const labels = {
    'superadmin': 'Super Admin',
    'admin': 'Administrator',
    'support': 'Support',
    'readonly': 'Read Only'
  }
  return labels[authStore.userRole] || 'Admin'
})

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}
</script>
