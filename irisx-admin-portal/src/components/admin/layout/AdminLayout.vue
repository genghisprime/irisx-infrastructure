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
            to="/dashboard/providers"
            class="flex items-center px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <svg class="w-5 h-5 mr-3" style="width: 20px; height: 20px; min-width: 20px; max-width: 20px; margin-right: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Providers
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
    'ProviderCredentials': 'Provider Credentials',
    'FeatureFlags': 'Feature Flags',
    'SystemSettings': 'System Settings'
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
