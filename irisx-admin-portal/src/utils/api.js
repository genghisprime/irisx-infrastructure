import axios from 'axios'
import { useAdminAuthStore } from '../stores/adminAuth'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://3.83.53.69:3000'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    const authStore = useAdminAuthStore()
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      const authStore = useAdminAuthStore()
      const refreshed = await authStore.refreshAuthToken()
      if (refreshed) {
        originalRequest.headers.Authorization = `Bearer ${authStore.token}`
        return apiClient(originalRequest)
      }
      authStore.clearAuth()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const adminAPI = {
  auth: {
    login: (email, password) => apiClient.post('/admin/auth/login', { email, password }),
    logout: () => apiClient.post('/admin/auth/logout'),
    me: () => apiClient.get('/admin/auth/me')
  },
  dashboard: {
    getStats: () => apiClient.get('/admin/dashboard/stats'),
    getActivity: (params) => apiClient.get('/admin/dashboard/activity', { params }),
    getHealth: () => apiClient.get('/admin/dashboard/health')
  },
  tenants: {
    list: (params) => apiClient.get('/admin/tenants', { params }),
    get: (id) => apiClient.get(`/admin/tenants/${id}`),
    create: (data) => apiClient.post('/admin/tenants', data),
    update: (id, data) => apiClient.patch(`/admin/tenants/${id}`, data),
    delete: (id) => apiClient.delete(`/admin/tenants/${id}`),
    suspend: (id) => apiClient.post(`/admin/tenants/${id}/suspend`),
    reactivate: (id) => apiClient.post(`/admin/tenants/${id}/reactivate`)
  },
  users: {
    list: (tenantId, params) => apiClient.get(`/admin/tenants/${tenantId}/users`, { params }),
    create: (tenantId, data) => apiClient.post(`/admin/tenants/${tenantId}/users`, data),
    update: (tenantId, userId, data) => apiClient.patch(`/admin/tenants/${tenantId}/users/${userId}`, data),
    resetPassword: (tenantId, userId) => apiClient.post(`/admin/tenants/${tenantId}/users/${userId}/reset-password`),
    suspend: (tenantId, userId) => apiClient.post(`/admin/tenants/${tenantId}/users/${userId}/suspend`),
    reactivate: (tenantId, userId) => apiClient.post(`/admin/tenants/${tenantId}/users/${userId}/reactivate`),
    delete: (tenantId, userId) => apiClient.delete(`/admin/tenants/${tenantId}/users/${userId}`)
  },
  billing: {
    listInvoices: (params) => apiClient.get('/admin/billing/invoices', { params }),
    createInvoice: (data) => apiClient.post('/admin/billing/invoices', data),
    updateSubscription: (tenantId, data) => apiClient.patch(`/admin/tenants/${tenantId}/subscription`, data),
    extendTrial: (tenantId, data) => apiClient.post(`/admin/tenants/${tenantId}/extend-trial`, data),
    issueRefund: (data) => apiClient.post('/admin/billing/refunds', data),
    getRevenue: (params) => apiClient.get('/admin/billing/revenue', { params })
  },
  providers: {
    list: (params) => apiClient.get('/admin/providers', { params }),
    create: (data) => apiClient.post('/admin/providers', data),
    update: (id, data) => apiClient.patch(`/admin/providers/${id}`, data),
    delete: (id) => apiClient.delete(`/admin/providers/${id}`),
    test: (id) => apiClient.post(`/admin/providers/${id}/test`)
  },
  recordings: {
    list: (params) => apiClient.get('/admin/recordings', { params }),
    getPresignedUrl: (id) => apiClient.get(`/admin/recordings/${id}/presigned-url`),
    delete: (id) => apiClient.delete(`/admin/recordings/${id}`),
    getStats: () => apiClient.get('/admin/recordings/stats')
  },
  conversations: {
    list: (params) => apiClient.get('/admin/conversations', { params }),
    get: (id) => apiClient.get(`/admin/conversations/${id}`),
    assign: (id, data) => apiClient.patch(`/admin/conversations/${id}/assign`, data),
    bulkClose: (data) => apiClient.post('/admin/conversations/bulk-close', data),
    getSLABreaches: (params) => apiClient.get('/admin/conversations/sla-breaches', { params })
  },
  phoneNumbers: {
    list: (params) => apiClient.get('/admin/phone-numbers', { params }),
    provision: (tenantId, data) => apiClient.post(`/admin/tenants/${tenantId}/phone-numbers`, data),
    update: (id, data) => apiClient.patch(`/admin/phone-numbers/${id}`, data),
    deactivate: (id) => apiClient.delete(`/admin/phone-numbers/${id}`),
    getStats: () => apiClient.get('/admin/phone-numbers/stats')
  },
  settings: {
    getFeatures: (tenantId) => apiClient.get(`/admin/tenants/${tenantId}/features`),
    updateFeatures: (tenantId, data) => apiClient.patch(`/admin/tenants/${tenantId}/features`, data),
    getFeatureFlags: () => apiClient.get('/admin/feature-flags'),
    getSystemSettings: () => apiClient.get('/admin/settings'),
    updateSystemSettings: (data) => apiClient.patch('/admin/settings', data),
    getUsageLimits: () => apiClient.get('/admin/settings/usage-limits')
  },
  search: {
    tenants: (params) => apiClient.get('/admin/search/tenants', { params }),
    users: (params) => apiClient.get('/admin/search/users', { params }),
    global: (params) => apiClient.get('/admin/search/global', { params })
  },
  agents: {
    list: (params) => apiClient.get('/admin/agents', { params }),
    bulkImport: (data) => apiClient.post('/admin/agents/bulk-import', data)
  }
}

export default apiClient
