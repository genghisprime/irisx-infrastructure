import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://3.83.53.69:3000'

export const useAdminAuthStore = defineStore('adminAuth', () => {
  // State
  const admin = ref(null)
  const token = ref(localStorage.getItem('admin_token') || null)
  const refreshToken = ref(localStorage.getItem('admin_refresh_token') || null)
  const loading = ref(false)
  const error = ref(null)

  // Getters
  const isAuthenticated = computed(() => !!token.value && !!admin.value)
  const userRole = computed(() => admin.value?.role || null)
  const isSuperAdmin = computed(() => admin.value?.role === 'superadmin')
  const isAdmin = computed(() => admin.value?.role === 'admin' || admin.value?.role === 'superadmin')
  const isSupport = computed(() => admin.value?.role === 'support')
  const isReadonly = computed(() => admin.value?.role === 'readonly')

  // Actions
  async function login(email, password) {
    loading.value = true
    error.value = null

    try {
      const response = await axios.post(`${API_BASE_URL}/admin/auth/login`, {
        email,
        password
      })

      const { admin: adminData, token: authToken, refresh_token } = response.data

      // Store auth data
      admin.value = adminData
      token.value = authToken
      refreshToken.value = refresh_token

      // Persist to localStorage
      localStorage.setItem('admin_token', authToken)
      localStorage.setItem('admin_refresh_token', refresh_token)
      localStorage.setItem('admin_user', JSON.stringify(adminData))

      return { success: true, admin: adminData }
    } catch (err) {
      error.value = err.response?.data?.error || 'Login failed'
      console.error('Login error:', err)
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    loading.value = true

    try {
      // Call backend logout endpoint
      if (token.value) {
        await axios.post(
          `${API_BASE_URL}/admin/auth/logout`,
          {},
          {
            headers: { Authorization: `Bearer ${token.value}` }
          }
        )
      }
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      // Clear state regardless of backend response
      clearAuth()
      loading.value = false
    }
  }

  async function refreshAuthToken() {
    if (!refreshToken.value) {
      return false
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/admin/auth/refresh`, {
        refresh_token: refreshToken.value
      })

      const { token: newToken, refresh_token: newRefreshToken } = response.data

      token.value = newToken
      refreshToken.value = newRefreshToken

      localStorage.setItem('admin_token', newToken)
      localStorage.setItem('admin_refresh_token', newRefreshToken)

      return true
    } catch (err) {
      console.error('Token refresh failed:', err)
      clearAuth()
      return false
    }
  }

  async function fetchCurrentAdmin() {
    if (!token.value) {
      return false
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/admin/auth/me`, {
        headers: { Authorization: `Bearer ${token.value}` }
      })

      admin.value = response.data.admin
      localStorage.setItem('admin_user', JSON.stringify(response.data.admin))

      return true
    } catch (err) {
      console.error('Fetch current admin failed:', err)

      // Try to refresh token if 401
      if (err.response?.status === 401) {
        const refreshed = await refreshAuthToken()
        if (refreshed) {
          return fetchCurrentAdmin() // Retry with new token
        }
      }

      clearAuth()
      return false
    }
  }

  function clearAuth() {
    admin.value = null
    token.value = null
    refreshToken.value = null

    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_refresh_token')
    localStorage.removeItem('admin_user')
  }

  function restoreFromLocalStorage() {
    const storedToken = localStorage.getItem('admin_token')
    const storedRefreshToken = localStorage.getItem('admin_refresh_token')
    const storedUser = localStorage.getItem('admin_user')

    if (storedToken && storedRefreshToken && storedUser) {
      token.value = storedToken
      refreshToken.value = storedRefreshToken
      try {
        admin.value = JSON.parse(storedUser)
      } catch (err) {
        console.error('Failed to parse stored admin user:', err)
        clearAuth()
      }
    }
  }

  function hasPermission(requiredRole) {
    if (!admin.value) return false

    const roleHierarchy = {
      'readonly': 1,
      'support': 2,
      'admin': 3,
      'superadmin': 4
    }

    const userRoleLevel = roleHierarchy[admin.value.role] || 0
    const requiredRoleLevel = roleHierarchy[requiredRole] || 0

    return userRoleLevel >= requiredRoleLevel
  }

  // Initialize from localStorage on store creation
  restoreFromLocalStorage()

  return {
    // State
    admin,
    token,
    refreshToken,
    loading,
    error,

    // Getters
    isAuthenticated,
    userRole,
    isSuperAdmin,
    isAdmin,
    isSupport,
    isReadonly,

    // Actions
    login,
    logout,
    refreshAuthToken,
    fetchCurrentAdmin,
    clearAuth,
    restoreFromLocalStorage,
    hasPermission
  }
})
