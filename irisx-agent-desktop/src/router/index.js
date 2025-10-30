/**
 * Vue Router Configuration
 * Manages navigation and route guards for Agent Desktop
 */

import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import Login from '../views/auth/Login.vue'
import AgentDashboard from '../views/agent/AgentDashboard.vue'

const routes = [
  {
    path: '/',
    redirect: '/agent'
  },
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { requiresGuest: true }
  },
  {
    path: '/agent',
    name: 'AgentDashboard',
    component: AgentDashboard,
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation guard - check authentication before each route
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()

  // Route requires authentication
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
    return
  }

  // Route is for guests only (login page)
  if (to.meta.requiresGuest && authStore.isAuthenticated) {
    next('/agent')
    return
  }

  next()
})

export default router
