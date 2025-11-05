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
  const isAuthenticated = computed(() => !!token.value)  // Only check token, user will be fetched
  const isLoading = ref(false)
  const error = ref(null)

  // Actions
  async function login(email, password) {
    isLoading.value = true
    error.value = null

    try {
      const response = await apiClient.post('/v1/auth/login', {
        email,
        password
      })

      // API returns: { success: true, data: { user: {...}, tokens: { access_token, refresh_token } } }
      const { data } = response.data
      const authToken = data.tokens.access_token
      const userData = data.user

      // Store token and user data
      token.value = authToken
      user.value = userData
      localStorage.setItem('token', authToken)
      localStorage.setItem('refresh_token', data.tokens.refresh_token)

      return { success: true }
    } catch (err) {
      console.error('Login error:', err)
      error.value = err.response?.data?.error || err.response?.data?.message || 'Login failed'
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
    localStorage.removeItem('refresh_token')
  }

  async function fetchUser() {
    if (!token.value) return

    isLoading.value = true
    error.value = null

    try {
      const response = await apiClient.get('/v1/auth/me')
      // API returns: { success: true, data: { ...userData } }
      user.value = response.data.data || response.data.user
      return { success: true }
    } catch (err) {
      console.error('Fetch user error:', err)
      error.value = err.response?.data?.error || err.response?.data?.message || 'Failed to fetch user'
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
      const refreshTokenValue = localStorage.getItem('refresh_token')
      const response = await apiClient.post('/v1/auth/refresh', {
        refresh_token: refreshTokenValue
      })

      // API returns: { success: true, data: { access_token, refresh_token } }
      const { data } = response.data
      const newToken = data.access_token || data.token

      token.value = newToken
      localStorage.setItem('token', newToken)
      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token)
      }

      return { success: true }
    } catch (err) {
      console.error('Token refresh error:', err)
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
