import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'
import { useAuthStore } from './stores/auth'

// Global error handler to prevent blank page
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error)
  event.preventDefault()
  return false
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection caught:', event.reason)
  event.preventDefault()
  return false
})

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Add global error handler to Vue app
app.config.errorHandler = (err, instance, info) => {
  console.error('Vue error:', err)
  console.error('Error info:', info)
  // Don't throw - just log
  return false
}

// Initialize auth before mounting (with error protection)
try {
  const authStore = useAuthStore()
  authStore.initialize()
    .catch(err => {
      console.error('Auth initialization failed (non-fatal):', err)
    })
    .finally(() => {
      app.mount('#app')
    })
} catch (err) {
  console.error('Critical error during app initialization:', err)
  // Mount anyway to prevent blank page
  app.mount('#app')
}
