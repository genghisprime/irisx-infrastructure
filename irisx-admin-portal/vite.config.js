import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    host: true, // Allow external access
    open: true, // Auto-open browser
    cors: true  // Enable CORS
  },
  build: {
    sourcemap: false, // Disable sourcemaps for production builds
    rollupOptions: {
      output: {
        manualChunks: undefined // Disable code splitting for simpler deployments
      }
    }
  }
})
