/**
 * Authentication Store (Pinia)
 * Manages user authentication state, login, logout, token refresh
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiClient } from '../utils/api'

export const useAuthStore = defineStore('auth', () => {
  // State
  const user = ref(null)
  const token = ref(localStorage.getItem('token') || null)
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const isLoading = ref(false)
  const error = ref(null)

  // Actions
  async function login(email, password) {
    isLoading.value = true
    error.value = null

    try {
      // DEMO MODE: Allow demo@irisx.com / demo123 to login without backend
      if (email === 'demo@irisx.com' && password === 'demo123') {
        console.log('🎮 DEMO LOGIN: Using mock credentials')

        // Mock token and user data
        const authToken = 'demo-token-' + Date.now()
        const userData = {
          id: 'demo-user-1',
          email: 'demo@irisx.com',
          first_name: 'Demo',
          last_name: 'Agent',
          role: 'agent',
          company_name: 'Demo Company'
        }

        // Store token and user data
        token.value = authToken
        user.value = userData
        localStorage.setItem('token', authToken)

        return { success: true }
      }

      // Real API login
      const response = await apiClient.post('/v1/auth/login', {
        email,
        password
      })

      const { token: authToken, user: userData } = response.data

      // Store token and user data
      token.value = authToken
      user.value = userData
      localStorage.setItem('token', authToken)

      return { success: true }
    } catch (err) {
      error.value = err.response?.data?.message || 'Login failed. Try demo@irisx.com / demo123 for DEMO mode'
      return { success: false, error: error.value }
    } finally {
      isLoading.value = false
    }
  }

  async function signup(data) {
    isLoading.value = true
    error.value = null

    try {
      const response = await apiClient.post('/v1/auth/register', data)

      const { token: authToken, user: userData } = response.data

      // Store token and user data
      token.value = authToken
      user.value = userData
      localStorage.setItem('token', authToken)

      return { success: true }
    } catch (err) {
      error.value = err.response?.data?.message || 'Signup failed'
      return { success: false, error: error.value }
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    // Clear token and user data
    token.value = null
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('sip_config') // Clear SIP config on logout
  }

  async function fetchUser() {
    if (!token.value) return

    isLoading.value = true
    error.value = null

    try {
      // Add timeout to prevent blocking page load
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout

      const response = await apiClient.get('/v1/auth/me', {
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      // Handle new API response format with data wrapper
      const userData = response.data.data || response.data

      user.value = userData.user || userData

      // AUTO-CONFIGURE SIP CREDENTIALS
      // If user has extensions and sipConfig, save to localStorage for WebRTC service
      if (userData.extensions && userData.extensions.length > 0 && userData.sipConfig) {
        const primaryExtension = userData.extensions[0]

        const sipConfig = {
          server: userData.sipConfig.websocketUrl,
          realm: userData.sipConfig.realm,
          extension: primaryExtension.extension,
          password: primaryExtension.sip_password
        }

        localStorage.setItem('sip_config', JSON.stringify(sipConfig))
        console.log('✅ SIP credentials auto-configured for extension:', primaryExtension.extension)
      }

      return { success: true }
    } catch (err) {
      // Ignore timeout errors during initialization
      if (err.name === 'AbortError' || err.code === 'ECONNABORTED') {
        console.warn('⚠️ API server timeout - using demo mode')
        // Create a demo user to allow login page to work
        user.value = {
          id: 'demo-user',
          email: 'demo@irisx.com',
          first_name: 'Demo',
          last_name: 'User',
          role: 'agent'
        }
        return { success: false, error: 'API timeout' }
      }

      error.value = err.response?.data?.message || 'Failed to fetch user'
      // If token is invalid, logout
      if (err.response?.status === 401) {
        await logout()
      }
      return { success: false, error: error.value }
    } finally {
      isLoading.value = false
    }
  }

  async function refreshToken() {
    if (!token.value) return

    try {
      const response = await apiClient.post('/v1/auth/refresh')
      const { token: newToken } = response.data

      token.value = newToken
      localStorage.setItem('token', newToken)

      return { success: true }
    } catch (err) {
      // If refresh fails, logout
      await logout()
      return { success: false }
    }
  }

  // Initialize: fetch user if token exists
  async function initialize() {
    if (token.value) {
      await fetchUser()
    }
  }

  return {
    // State
    user,
    token,
    isAuthenticated,
    isLoading,
    error,

    // Actions
    login,
    signup,
    logout,
    fetchUser,
    refreshToken,
    initialize
  }
})
