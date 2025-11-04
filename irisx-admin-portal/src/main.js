/**
 * Tazzi Admin Portal - Main Entry Point
 * Vue 3.5 + Vue Router 4 + Pinia
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import { useAdminAuthStore } from './stores/adminAuth'
import './style.css'
import App from './App.vue'

const app = createApp(App)

// Install Pinia (state management)
const pinia = createPinia()
app.use(pinia)

// Install Vue Router
app.use(router)

// Initialize auth store (check if user is logged in)
const authStore = useAdminAuthStore()

// The store automatically restores from localStorage on creation
// Just fetch current admin data to verify token is still valid
if (authStore.token) {
  authStore.fetchCurrentAdmin().finally(() => {
    app.mount('#app')
  })
} else {
  // No token, just mount the app (will redirect to login)
  app.mount('#app')
}
