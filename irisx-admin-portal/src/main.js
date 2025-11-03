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
authStore.initialize().finally(() => {
  // Mount app after auth check completes
  app.mount('#app')
})
