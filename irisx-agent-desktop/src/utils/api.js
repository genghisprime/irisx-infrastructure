/**
 * API Client Utility
 * Axios-based API client with authentication and error handling
 */

import axios from 'axios'

// API base URL - configurable via environment variable
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://3.83.53.69:3000'

// Create axios instance
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000 // 30 seconds
})

// Request interceptor - add auth token to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor - handle errors
apiClient.interceptors.response.use(
  (response) => {
    return response
  },
  async (error) => {
    const originalRequest = error.config

    // If 401 Unauthorized and not already retried
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      // Try to refresh token
      try {
        const response = await axios.post(`${API_BASE_URL}/v1/auth/refresh`, {}, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        })

        const { token } = response.data
        localStorage.setItem('token', token)

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${token}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        // Refresh failed, logout user
        localStorage.removeItem('token')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default apiClient
