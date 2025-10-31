<template>
  <router-view v-slot="{ Component }">
    <component :is="Component" :key="$route.fullPath" />
  </router-view>
</template>

<script setup>
import { onErrorCaptured } from 'vue'

// Catch all Vue errors and prevent blank page
onErrorCaptured((err, instance, info) => {
  console.error('Vue error caught:', err)
  console.error('Error info:', info)
  // Return false to prevent error from propagating
  return false
})

// Global error handler for uncaught errors
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error)
  event.preventDefault()
})

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason)
  event.preventDefault()
})
</script>
