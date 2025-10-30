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
        path: 'api-keys',
      },
      {
        path: 'call-logs',
        name: 'CallLogs',
        component: CallLogs        name: 'APIKeys',
        component: APIKeys
      },
      // Future dashboard routes:
      // { path: 'webhooks', name: 'Webhooks', component: () => import('../views/dashboard/Webhooks.vue') },
      // { path: 'call-logs', name: 'CallLogs', component: () => import('../views/dashboard/CallLogs.vue') },
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
