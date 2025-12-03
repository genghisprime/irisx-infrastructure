import axios from 'axios'
import { useAdminAuthStore } from '../stores/adminAuth'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

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
    listByTenant: (tenantId, params) => apiClient.get(`/admin/tenants/${tenantId}/users`, { params }),
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
    getRevenue: (params) => apiClient.get('/admin/billing/revenue', { params }),
    getRevenueReport: (params) => apiClient.get('/admin/billing/revenue', { params }),
    exportRevenueReport: (params) => apiClient.get('/admin/billing/revenue/export', { params, responseType: 'blob' }),
    getConfig: (tenantId) => apiClient.get(`/v1/tenants/${tenantId}/billing-config`),
    updateConfig: (tenantId, data) => apiClient.patch(`/v1/tenants/${tenantId}/billing-config`, data)
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
    getSLABreaches: (params) => apiClient.get('/admin/conversations/sla-breaches', { params }),
    getStats: (params) => apiClient.get('/admin/conversations/stats', { params })
  },
  phoneNumbers: {
    list: (params) => apiClient.get('/admin/phone-numbers', { params }),
    provision: (tenantId, data) => apiClient.post(`/admin/tenants/${tenantId}/phone-numbers`, data),
    update: (id, data) => apiClient.patch(`/admin/phone-numbers/${id}`, data),
    deactivate: (id) => apiClient.delete(`/admin/phone-numbers/${id}`),
    assign: (id, data) => apiClient.post(`/admin/phone-numbers/${id}/assign`, data),
    unassign: (id) => apiClient.post(`/admin/phone-numbers/${id}/unassign`),
    test: (id) => apiClient.post(`/admin/phone-numbers/${id}/test`),
    release: (id) => apiClient.delete(`/admin/phone-numbers/${id}`),
    getStats: () => apiClient.get('/admin/phone-numbers/stats')
  },
  settings: {
    getFeatures: (tenantId) => apiClient.get(`/admin/tenants/${tenantId}/features`),
    updateFeatures: (tenantId, data) => apiClient.patch(`/admin/tenants/${tenantId}/features`, data),
    getFeatureFlags: () => apiClient.get('/admin/feature-flags'),
    getSystemSettings: () => apiClient.get('/admin/settings'),
    updateSystemSettings: (data) => apiClient.patch('/admin/settings', data),
    get: () => apiClient.get('/admin/settings'),
    update: (data) => apiClient.patch('/admin/settings', data),
    getUsageLimits: () => apiClient.get('/admin/settings/usage-limits')
  },
  featureFlags: {
    list: () => apiClient.get('/admin/feature-flags'),
    get: (key) => apiClient.get(`/admin/feature-flags/${key}`),
    create: (data) => apiClient.post('/admin/feature-flags', data),
    update: (key, data) => apiClient.patch(`/admin/feature-flags/${key}`, data),
    delete: (key) => apiClient.delete(`/admin/feature-flags/${key}`),
    getTenants: (key, params) => apiClient.get(`/admin/feature-flags/${key}/tenants`, { params }),
    setOverride: (key, tenantId, enabled) => apiClient.post(`/admin/feature-flags/${key}/tenants/${tenantId}/override`, { enabled }),
    removeOverride: (key, tenantId) => apiClient.delete(`/admin/feature-flags/${key}/tenants/${tenantId}/override`),
    check: (key, tenantId) => apiClient.get(`/admin/feature-flags/${key}/check/${tenantId}`)
  },
  contacts: {
    list: (params) => apiClient.get('/admin/contacts', { params }),
    get: (id) => apiClient.get(`/admin/contacts/${id}`),
    bulkAction: (data) => apiClient.post('/admin/contacts/bulk-action', data),
    getDNC: (params) => apiClient.get('/admin/contacts/dnc', { params }),
    getStats: () => apiClient.get('/admin/contacts/stats'),
    getLists: (params) => apiClient.get('/admin/contacts/lists', { params }),
    export: (params) => apiClient.get('/admin/contacts/export', { params, responseType: 'blob' })
  },
  cdrs: {
    list: (params) => apiClient.get('/admin/cdrs', { params }),
    get: (id) => apiClient.get(`/admin/cdrs/${id}`),
    getStats: (params) => apiClient.get('/admin/cdrs/stats', { params }),
    getTimeline: (id) => apiClient.get(`/admin/cdrs/timeline/${id}`),
    getQualityAlerts: (params) => apiClient.get('/admin/cdrs/quality-alerts', { params }),
    export: (params) => apiClient.get('/admin/cdrs/export', { params, responseType: 'blob' })
  },
  ivr: {
    getStats: () => apiClient.get('/admin/ivr/stats'),
    listMenus: (params) => apiClient.get('/admin/ivr/menus', { params }),
    getMenuDetails: (id) => apiClient.get(`/admin/ivr/menus/${id}`),
    getMenuFlow: (id) => apiClient.get(`/admin/ivr/menus/${id}/flow`),
    listSessions: (params) => apiClient.get('/admin/ivr/sessions', { params }),
    getAnalytics: (params) => apiClient.get('/admin/ivr/analytics', { params })
  },
  search: {
    tenants: (params) => apiClient.get('/admin/search/tenants', { params }),
    users: (params) => apiClient.get('/admin/search/users', { params }),
    global: (params) => apiClient.get('/admin/search/global', { params })
  },
  agents: {
    list: (params) => apiClient.get('/admin/agents', { params }),
    bulkImport: (data) => apiClient.post('/admin/agents/bulk-import', data)
  },
  apiKeys: {
    list: (tenantId) => apiClient.get(`/v1/tenants/${tenantId}/api-keys`),
    create: (tenantId, data) => apiClient.post(`/v1/tenants/${tenantId}/api-keys`, data),
    revoke: (tenantId, keyId) => apiClient.delete(`/v1/tenants/${tenantId}/api-keys/${keyId}`)
  },
  analytics: {
    getUsage: (params) => apiClient.get('/admin/analytics/usage', { params })
  },
  queues: {
    list: (params) => apiClient.get('/admin/queues', { params }),
    get: (id) => apiClient.get(`/admin/queues/${id}`),
    create: (data) => apiClient.post('/admin/queues', data),
    update: (id, data) => apiClient.patch(`/admin/queues/${id}`, data),
    delete: (id) => apiClient.delete(`/admin/queues/${id}`)
  },
  campaigns: {
    list: (params) => apiClient.get('/admin/campaigns', { params }),
    get: (id) => apiClient.get(`/admin/campaigns/${id}`),
    pause: (id) => apiClient.post(`/admin/campaigns/${id}/pause`),
    resume: (id) => apiClient.post(`/admin/campaigns/${id}/resume`),
    stop: (id) => apiClient.post(`/admin/campaigns/${id}/stop`)
  },
  sipTrunks: {
    list: (params) => apiClient.get('/admin/sip-trunks', { params }),
    get: (id) => apiClient.get(`/admin/sip-trunks/${id}`),
    create: (data) => apiClient.post('/admin/sip-trunks', data),
    update: (id, data) => apiClient.patch(`/admin/sip-trunks/${id}`, data),
    test: (id) => apiClient.post(`/admin/sip-trunks/${id}/test`)
  },
  emailService: {
    getHealth: () => apiClient.get('/admin/email-service/health'),
    getProviders: () => apiClient.get('/admin/email-service/providers'),
    getProvider: (id) => apiClient.get(`/admin/email-service/providers/${id}`),
    createProvider: (data) => apiClient.post('/admin/email-service/providers', data),
    updateProvider: (id, data) => apiClient.put(`/admin/email-service/providers/${id}`, data),
    updateCredentials: (id, credentials) => apiClient.put(`/admin/email-service/providers/${id}/credentials`, { credentials }),
    activateProvider: (id) => apiClient.post(`/admin/email-service/providers/${id}/activate`),
    deactivateProvider: (id) => apiClient.post(`/admin/email-service/providers/${id}/deactivate`),
    getStats: (params) => apiClient.get('/admin/email-service/stats', { params }),
    getRecentDeliveries: (params) => apiClient.get('/admin/email-service/recent-deliveries', { params }),
    testEmail: (data) => apiClient.post('/admin/email-service/test', data)
  },
  webhooks: {
    list: (params) => apiClient.get('/admin/webhooks', { params }),
    test: (id) => apiClient.post(`/admin/webhooks/${id}/test`),
    getLogs: (id, params) => apiClient.get(`/admin/webhooks/${id}/logs`, { params }),
    retry: (id, logId) => apiClient.post(`/admin/webhooks/${id}/logs/${logId}/retry`)
  },
  database: {
    getStats: () => apiClient.get('/admin/database/stats'),
    getConnections: () => apiClient.get('/admin/database/connections'),
    getQueries: (params) => apiClient.get('/admin/database/queries', { params }),
    getBackups: () => apiClient.get('/admin/database/backups')
  },
  cache: {
    getStats: () => apiClient.get('/admin/cache/stats'),
    getPatterns: () => apiClient.get('/admin/cache/patterns'),
    getSessions: (params) => apiClient.get('/admin/cache/sessions', { params }),
    getEvictionStats: () => apiClient.get('/admin/cache/eviction-stats'),
    clear: (pattern) => apiClient.post('/admin/cache/clear', { pattern })
  },
  auditLog: {
    list: (params) => apiClient.get('/admin/audit-log', { params }),
    getStats: () => apiClient.get('/admin/audit-log/stats'),
    getAdmins: () => apiClient.get('/admin/audit-log/admins')
  }
}

export default apiClient
