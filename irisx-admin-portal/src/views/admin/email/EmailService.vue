<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-3xl font-bold text-gray-900 mb-6">Email Service Management</h1>

    <!-- System Health Overview -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <h2 class="text-xl font-semibold text-gray-900 mb-4">System Health</h2>
      <div v-if="loading.health" class="text-center py-4">
        <div class="text-gray-600">Loading health data...</div>
      </div>
      <div v-else-if="health" class="grid grid-cols-4 gap-4">
        <div class="text-center p-4 rounded-lg" :class="getStatusColorClass(health.status)">
          <div class="text-2xl font-bold uppercase">{{ health.status }}</div>
          <div class="text-sm mt-1">System Status</div>
        </div>
        <div class="text-center p-4 bg-blue-50 rounded-lg">
          <div class="text-2xl font-bold text-blue-600">{{ health.providers.active }}/{{ health.providers.total }}</div>
          <div class="text-sm text-gray-600 mt-1">Active Providers</div>
        </div>
        <div class="text-center p-4 bg-green-50 rounded-lg">
          <div class="text-2xl font-bold text-green-600">{{ health.providers.configured }}</div>
          <div class="text-sm text-gray-600 mt-1">Configured</div>
        </div>
        <div class="text-center p-4 bg-purple-50 rounded-lg">
          <div class="text-2xl font-bold text-purple-600">{{ health.health_scores.average }}</div>
          <div class="text-sm text-gray-600 mt-1">Avg Health Score</div>
        </div>
      </div>
    </div>

    <!-- Email Providers -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-semibold text-gray-900">Email Providers</h2>
        <div class="flex gap-2">
          <button @click="openAddModal" class="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700">
            Add Provider
          </button>
          <button @click="refreshProviders" class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            Refresh
          </button>
        </div>
      </div>

      <div v-if="loading.providers" class="text-center py-8">
        <div class="text-gray-600">Loading providers...</div>
      </div>

      <div v-else-if="providers.length === 0" class="text-center py-8">
        <div class="text-gray-500">No email providers configured</div>
      </div>

      <div v-else class="space-y-4">
        <div v-for="provider in providers" :key="provider.id"
             class="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <div class="flex items-center gap-3">
                <h3 class="text-lg font-medium text-gray-900">{{ provider.display_name }}</h3>
                <span v-if="provider.is_active"
                      class="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                  Active
                </span>
                <span v-else
                      class="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                  Inactive
                </span>
                <span v-if="!provider.has_credentials"
                      class="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
                  No Credentials
                </span>
              </div>
              <div class="mt-2 grid grid-cols-4 gap-4 text-sm">
                <div>
                  <span class="text-gray-600">Priority:</span>
                  <span class="ml-2 font-medium">{{ provider.priority }}</span>
                </div>
                <div>
                  <span class="text-gray-600">Health Score:</span>
                  <span class="ml-2 font-medium" :class="getHealthScoreClass(provider.health_score)">
                    {{ provider.health_score }}/100
                  </span>
                </div>
                <div>
                  <span class="text-gray-600">Cost:</span>
                  <span class="ml-2 font-medium">${{ provider.cost_per_1000 }}/1000</span>
                </div>
                <div>
                  <span class="text-gray-600">Provider:</span>
                  <span class="ml-2 font-medium">{{ provider.provider_name }}</span>
                </div>
              </div>
            </div>
            <div class="flex gap-2">
              <button v-if="!provider.is_active && provider.has_credentials"
                      @click="activateProvider(provider.id)"
                      class="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700">
                Activate
              </button>
              <button v-if="provider.is_active"
                      @click="deactivateProvider(provider.id)"
                      class="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700">
                Deactivate
              </button>
              <button @click="openEditModal(provider.id)"
                      class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                Edit
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Provider Modal -->
    <div v-if="editModal.show" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-gray-900">Edit Email Provider</h2>
            <button @click="closeEditModal" class="text-gray-400 hover:text-gray-600">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div v-if="editModal.loading" class="text-center py-8">
            <div class="text-gray-600">Loading provider details...</div>
          </div>

          <div v-else-if="editModal.provider" class="space-y-6">
            <!-- Provider Info (Read-only) -->
            <div class="bg-gray-50 p-4 rounded-lg">
              <h3 class="text-lg font-semibold text-gray-900 mb-3">Provider Information</h3>
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="text-gray-600">Display Name:</span>
                  <span class="ml-2 font-medium">{{ editModal.provider.display_name }}</span>
                </div>
                <div>
                  <span class="text-gray-600">Type:</span>
                  <span class="ml-2 font-medium">{{ editModal.provider.provider_name }}</span>
                </div>
                <div>
                  <span class="text-gray-600">Status:</span>
                  <span class="ml-2 font-medium" :class="editModal.provider.is_active ? 'text-green-600' : 'text-gray-600'">
                    {{ editModal.provider.is_active ? 'Active' : 'Inactive' }}
                  </span>
                </div>
                <div>
                  <span class="text-gray-600">Health Score:</span>
                  <span class="ml-2 font-medium" :class="getHealthScoreClass(editModal.provider.health_score)">
                    {{ editModal.provider.health_score }}/100
                  </span>
                </div>
              </div>
            </div>

            <!-- Configuration -->
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-3">Configuration</h3>
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <input v-model.number="editModal.form.priority" type="number" min="1"
                         class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                  <p class="mt-1 text-xs text-gray-500">Lower number = higher priority (1 is highest)</p>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Cost per 1000 Emails ($)</label>
                  <input v-model.number="editModal.form.cost_per_1000" type="number" step="0.01" min="0"
                         class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Max Retry Attempts</label>
                    <input v-model.number="editModal.form.max_retry_attempts" type="number" min="0"
                           class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Retry Delay (seconds)</label>
                    <input v-model.number="editModal.form.retry_delay_seconds" type="number" min="0"
                           class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">From Email</label>
                  <input v-model="editModal.form.from_email" type="email"
                         class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">From Name</label>
                  <input v-model="editModal.form.from_name" type="text"
                         class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                </div>
              </div>
            </div>

            <!-- Credentials -->
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-3">API Credentials</h3>
              <div class="space-y-4">
                <div v-if="editModal.provider.provider_name === 'elastic-email'">
                  <label class="block text-sm font-medium text-gray-700 mb-1">Elastic Email API Key</label>
                  <input v-model="editModal.credentials.api_key" type="password"
                         placeholder="Enter new API key to update (leave blank to keep current)"
                         class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                  <p class="mt-1 text-xs text-gray-500">Get your API key from Elastic Email dashboard</p>
                </div>

                <div v-else-if="editModal.provider.provider_name === 'sendgrid'">
                  <label class="block text-sm font-medium text-gray-700 mb-1">SendGrid API Key</label>
                  <input v-model="editModal.credentials.api_key" type="password"
                         placeholder="Enter new API key to update (leave blank to keep current)"
                         class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                  <p class="mt-1 text-xs text-gray-500">Get your API key from SendGrid settings</p>
                </div>

                <div v-else-if="editModal.provider.provider_name === 'custom-smtp'">
                  <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                        <input v-model="editModal.credentials.smtp_host" type="text"
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
                        <input v-model.number="editModal.credentials.smtp_port" type="number"
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                      </div>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Username</label>
                      <input v-model="editModal.credentials.smtp_user" type="text"
                             class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Password</label>
                      <input v-model="editModal.credentials.smtp_password" type="password"
                             placeholder="Enter new password to update (leave blank to keep current)"
                             class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                    </div>
                    <div>
                      <label class="flex items-center">
                        <input v-model="editModal.credentials.smtp_secure" type="checkbox" class="mr-2">
                        <span class="text-sm font-medium text-gray-700">Use TLS/SSL</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div v-else-if="editModal.provider.provider_name === 'amazon-ses'">
                  <div class="space-y-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">AWS Access Key ID</label>
                      <input v-model="editModal.credentials.access_key_id" type="password"
                             placeholder="Enter new access key to update (leave blank to keep current)"
                             class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                      <p class="mt-1 text-xs text-gray-500">Your AWS IAM user access key ID</p>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">AWS Secret Access Key</label>
                      <input v-model="editModal.credentials.secret_access_key" type="password"
                             placeholder="Enter new secret key to update (leave blank to keep current)"
                             class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                      <p class="mt-1 text-xs text-gray-500">Your AWS IAM user secret access key</p>
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">AWS Region</label>
                      <select v-model="editModal.credentials.region"
                              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                        <option value="us-east-1">US East (N. Virginia) - us-east-1</option>
                        <option value="us-west-2">US West (Oregon) - us-west-2</option>
                        <option value="eu-west-1">Europe (Ireland) - eu-west-1</option>
                        <option value="eu-central-1">Europe (Frankfurt) - eu-central-1</option>
                        <option value="ap-southeast-1">Asia Pacific (Singapore) - ap-southeast-1</option>
                        <option value="ap-northeast-1">Asia Pacific (Tokyo) - ap-northeast-1</option>
                      </select>
                      <p class="mt-1 text-xs text-gray-500">AWS region where your SES is configured</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="flex justify-end gap-3 pt-6 border-t">
              <button @click="closeEditModal"
                      class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                Cancel
              </button>
              <button @click="saveProvider"
                      :disabled="editModal.saving"
                      class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {{ editModal.saving ? 'Saving...' : 'Save Changes' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Provider Modal -->
    <div v-if="addModal.show" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-gray-900">Add Email Provider</h2>
            <button @click="closeAddModal" class="text-gray-400 hover:text-gray-600">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="space-y-6">
            <!-- Provider Type Selection -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Provider Type</label>
              <select v-model="addModal.form.provider_name" @change="onProviderTypeChange"
                      class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                <option value="">Select a provider type...</option>
                <option value="elastic-email">Elastic Email</option>
                <option value="custom-smtp">Custom SMTP (Self-Hosted Mail Server)</option>
                <option value="amazon-ses">Amazon SES</option>
              </select>
            </div>

            <div v-if="addModal.form.provider_name" class="space-y-6">
              <!-- Configuration -->
              <div>
                <h3 class="text-lg font-semibold text-gray-900 mb-3">Configuration</h3>
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                    <input v-model="addModal.form.display_name" type="text"
                           class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                           placeholder="e.g., Elastic Email Primary">
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <input v-model.number="addModal.form.priority" type="number" min="1"
                           class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                    <p class="mt-1 text-xs text-gray-500">Lower number = higher priority (1 is highest)</p>
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Cost per 1000 Emails ($)</label>
                    <input v-model.number="addModal.form.cost_per_1000" type="number" step="0.01" min="0"
                           class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                  </div>

                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Max Retry Attempts</label>
                      <input v-model.number="addModal.form.max_retry_attempts" type="number" min="0"
                             class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Retry Delay (seconds)</label>
                      <input v-model.number="addModal.form.retry_delay_seconds" type="number" min="0"
                             class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                    </div>
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">From Email</label>
                    <input v-model="addModal.form.from_email" type="email" required
                           class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                           placeholder="noreply@yourdomain.com">
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">From Name</label>
                    <input v-model="addModal.form.from_name" type="text"
                           class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                           placeholder="IRISX">
                  </div>
                </div>
              </div>

              <!-- Credentials -->
              <div>
                <h3 class="text-lg font-semibold text-gray-900 mb-3">API Credentials</h3>
                <div class="space-y-4">
                  <div v-if="addModal.form.provider_name === 'elastic-email'">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Elastic Email API Key</label>
                    <input v-model="addModal.credentials.api_key" type="password" required
                           placeholder="Enter your Elastic Email API key"
                           class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                    <p class="mt-1 text-xs text-gray-500">Get your API key from Elastic Email dashboard</p>
                  </div>

                  <div v-else-if="addModal.form.provider_name === 'sendgrid'">
                    <label class="block text-sm font-medium text-gray-700 mb-1">SendGrid API Key</label>
                    <input v-model="addModal.credentials.api_key" type="password" required
                           placeholder="Enter your SendGrid API key"
                           class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                    <p class="mt-1 text-xs text-gray-500">Get your API key from SendGrid settings</p>
                  </div>

                  <div v-else-if="addModal.form.provider_name === 'custom-smtp'">
                    <div class="space-y-4">
                      <div class="grid grid-cols-2 gap-4">
                        <div>
                          <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                          <input v-model="addModal.credentials.smtp_host" type="text" required
                                 class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                 placeholder="smtp.example.com">
                        </div>
                        <div>
                          <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
                          <input v-model.number="addModal.credentials.smtp_port" type="number" required
                                 class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                 placeholder="587">
                        </div>
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Username</label>
                        <input v-model="addModal.credentials.smtp_user" type="text" required
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">SMTP Password</label>
                        <input v-model="addModal.credentials.smtp_password" type="password" required
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                      </div>
                      <div>
                        <label class="flex items-center">
                          <input v-model="addModal.credentials.smtp_secure" type="checkbox" class="mr-2">
                          <span class="text-sm font-medium text-gray-700">Use TLS/SSL</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div v-else-if="addModal.form.provider_name === 'amazon-ses'">
                    <div class="space-y-4">
                      <div class="bg-blue-50 border border-blue-200 rounded-md p-3 mb-3">
                        <p class="text-sm text-blue-800">
                          <strong>Setup Required:</strong> Before using Amazon SES, ensure you have:
                          <ul class="list-disc ml-5 mt-1">
                            <li>Verified your sender email address or domain in SES</li>
                            <li>Moved out of SES sandbox for production use</li>
                            <li>Created IAM user with <code class="bg-blue-100 px-1 rounded">ses:SendEmail</code> permissions</li>
                          </ul>
                        </p>
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">AWS Access Key ID</label>
                        <input v-model="addModal.credentials.access_key_id" type="password" required
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                               placeholder="AKIAIOSFODNN7EXAMPLE">
                        <p class="mt-1 text-xs text-gray-500">Your AWS IAM user access key ID</p>
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">AWS Secret Access Key</label>
                        <input v-model="addModal.credentials.secret_access_key" type="password" required
                               class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                               placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY">
                        <p class="mt-1 text-xs text-gray-500">Your AWS IAM user secret access key</p>
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">AWS Region</label>
                        <select v-model="addModal.credentials.region"
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500">
                          <option value="us-east-1">US East (N. Virginia) - us-east-1</option>
                          <option value="us-west-2">US West (Oregon) - us-west-2</option>
                          <option value="eu-west-1">Europe (Ireland) - eu-west-1</option>
                          <option value="eu-central-1">Europe (Frankfurt) - eu-central-1</option>
                          <option value="ap-southeast-1">Asia Pacific (Singapore) - ap-southeast-1</option>
                          <option value="ap-northeast-1">Asia Pacific (Tokyo) - ap-northeast-1</option>
                        </select>
                        <p class="mt-1 text-xs text-gray-500">AWS region where your SES is configured</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="flex justify-end gap-3 pt-6 border-t">
              <button @click="closeAddModal"
                      class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                Cancel
              </button>
              <button @click="createProvider"
                      :disabled="addModal.saving || !addModal.form.provider_name"
                      class="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {{ addModal.saving ? 'Creating...' : 'Create Provider' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delivery Statistics -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-semibold text-gray-900">Delivery Statistics</h2>
        <select v-model="statsTimeframe" @change="refreshStats"
                class="px-3 py-1 border border-gray-300 rounded text-sm">
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
        </select>
      </div>

      <div v-if="loading.stats" class="text-center py-8">
        <div class="text-gray-600">Loading statistics...</div>
      </div>

      <div v-else-if="stats">
        <!-- Overall Stats -->
        <div class="grid grid-cols-4 gap-4 mb-6">
          <div class="text-center p-4 bg-blue-50 rounded-lg">
            <div class="text-2xl font-bold text-blue-600">{{ stats.overall.total_emails }}</div>
            <div class="text-sm text-gray-600 mt-1">Total Emails</div>
          </div>
          <div class="text-center p-4 bg-green-50 rounded-lg">
            <div class="text-2xl font-bold text-green-600">{{ stats.overall.lcr_routes }}</div>
            <div class="text-sm text-gray-600 mt-1">LCR Routes</div>
          </div>
          <div class="text-center p-4 bg-yellow-50 rounded-lg">
            <div class="text-2xl font-bold text-yellow-600">{{ stats.overall.failover_routes }}</div>
            <div class="text-sm text-gray-600 mt-1">Failover Routes</div>
          </div>
          <div class="text-center p-4 bg-purple-50 rounded-lg">
            <div class="text-2xl font-bold text-purple-600">{{ stats.overall.avg_delivery_time_ms }}ms</div>
            <div class="text-sm text-gray-600 mt-1">Avg Delivery Time</div>
          </div>
        </div>

        <!-- Per-Provider Stats -->
        <div v-if="stats.by_provider && stats.by_provider.length > 0">
          <h3 class="text-lg font-medium text-gray-900 mb-3">Performance by Provider</h3>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Emails Sent</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">LCR Selections</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Failover Uses</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Avg Time</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Health</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="provider in stats.by_provider" :key="provider.id">
                  <td class="px-4 py-2 text-sm font-medium text-gray-900">{{ provider.display_name }}</td>
                  <td class="px-4 py-2 text-sm text-gray-600">{{ provider.emails_sent }}</td>
                  <td class="px-4 py-2 text-sm text-gray-600">{{ provider.lcr_selections }}</td>
                  <td class="px-4 py-2 text-sm text-gray-600">{{ provider.failover_selections }}</td>
                  <td class="px-4 py-2 text-sm text-gray-600">{{ provider.avg_delivery_time_ms }}ms</td>
                  <td class="px-4 py-2 text-sm">
                    <span :class="getHealthScoreClass(provider.current_health_score)">
                      {{ provider.current_health_score }}/100
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Deliveries -->
    <div class="bg-white rounded-lg shadow p-6">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-semibold text-gray-900">Recent Deliveries</h2>
        <button @click="refreshDeliveries" class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
          Refresh
        </button>
      </div>

      <div v-if="loading.deliveries" class="text-center py-8">
        <div class="text-gray-600">Loading deliveries...</div>
      </div>

      <div v-else-if="recentDeliveries.length === 0" class="text-center py-8">
        <div class="text-gray-500">No recent deliveries</div>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Routing Reason</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Delivery Time</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="delivery in recentDeliveries" :key="delivery.id">
              <td class="px-4 py-2 text-sm text-gray-900">{{ delivery.provider_name }}</td>
              <td class="px-4 py-2 text-sm">
                <span class="px-2 py-1 text-xs font-medium rounded"
                      :class="getRoutingReasonClass(delivery.routing_reason)">
                  {{ delivery.routing_reason }}
                </span>
              </td>
              <td class="px-4 py-2 text-sm text-gray-600">{{ delivery.delivery_time_ms }}ms</td>
              <td class="px-4 py-2 text-sm text-gray-600">{{ formatTimestamp(delivery.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { adminAPI } from '../../../utils/api'

// Loading states
const loading = ref({
  health: false,
  providers: false,
  stats: false,
  deliveries: false
})

// Data
const health = ref(null)
const providers = ref([])
const stats = ref(null)
const recentDeliveries = ref([])
const statsTimeframe = ref('24h')

// Edit modal state
const editModal = ref({
  show: false,
  loading: false,
  saving: false,
  provider: null,
  form: {
    priority: 1,
    cost_per_1000: 0,
    max_retry_attempts: 3,
    retry_delay_seconds: 5,
    from_email: '',
    from_name: ''
  },
  credentials: {
    api_key: '',
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    smtp_secure: false,
    access_key_id: '',
    secret_access_key: '',
    region: 'us-east-1'
  }
})

// Add modal state
const addModal = ref({
  show: false,
  saving: false,
  form: {
    provider_name: '',
    display_name: '',
    priority: 1,
    cost_per_1000: 0,
    max_retry_attempts: 3,
    retry_delay_seconds: 5,
    from_email: '',
    from_name: ''
  },
  credentials: {
    api_key: '',
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    smtp_secure: false,
    access_key_id: '',
    secret_access_key: '',
    region: 'us-east-1'
  }
})

// Fetch system health
async function fetchHealth() {
  loading.value.health = true
  try {
    const response = await adminAPI.emailService.getHealth()
    health.value = response.data
  } catch (err) {
    console.error('Failed to fetch health:', err)
    alert('Failed to load system health')
  } finally {
    loading.value.health = false
  }
}

// Fetch providers
async function fetchProviders() {
  loading.value.providers = true
  try {
    const response = await adminAPI.emailService.getProviders()
    providers.value = response.data.providers || []
  } catch (err) {
    console.error('Failed to fetch providers:', err)
    alert('Failed to load email providers')
  } finally {
    loading.value.providers = false
  }
}

// Fetch statistics
async function fetchStats() {
  loading.value.stats = true
  try {
    const response = await adminAPI.emailService.getStats({
      timeframe: statsTimeframe.value
    })
    stats.value = response.data
  } catch (err) {
    console.error('Failed to fetch stats:', err)
    alert('Failed to load statistics')
  } finally {
    loading.value.stats = false
  }
}

// Fetch recent deliveries
async function fetchDeliveries() {
  loading.value.deliveries = true
  try {
    const response = await adminAPI.emailService.getRecentDeliveries({
      limit: 20
    })
    recentDeliveries.value = response.data.deliveries || []
  } catch (err) {
    console.error('Failed to fetch deliveries:', err)
    alert('Failed to load recent deliveries')
  } finally {
    loading.value.deliveries = false
  }
}

// Activate provider
async function activateProvider(id) {
  try {
    await adminAPI.emailService.activateProvider(id)
    alert('Provider activated successfully')
    await Promise.all([fetchProviders(), fetchHealth()])
  } catch (err) {
    console.error('Failed to activate provider:', err)
    alert(err.response?.data?.error || 'Failed to activate provider')
  }
}

// Deactivate provider
async function deactivateProvider(id) {
  if (!confirm('Are you sure you want to deactivate this provider?')) {
    return
  }
  try {
    await adminAPI.emailService.deactivateProvider(id)
    alert('Provider deactivated successfully')
    await Promise.all([fetchProviders(), fetchHealth()])
  } catch (err) {
    console.error('Failed to deactivate provider:', err)
    alert(err.response?.data?.error || 'Failed to deactivate provider')
  }
}

// Open edit modal
async function openEditModal(id) {
  editModal.value.show = true
  editModal.value.loading = true

  try {
    const response = await adminAPI.emailService.getProvider(id)
    const provider = response.data.provider

    editModal.value.provider = provider

    // Populate form with current values
    editModal.value.form = {
      priority: provider.priority || 1,
      cost_per_1000: provider.cost_per_1000 || 0,
      max_retry_attempts: provider.max_retry_attempts || 3,
      retry_delay_seconds: provider.retry_delay_seconds || 5,
      from_email: provider.from_email || '',
      from_name: provider.from_name || ''
    }

    // Reset credentials (don't show existing ones for security)
    editModal.value.credentials = {
      api_key: '',
      smtp_host: provider.smtp_host || '',
      smtp_port: provider.smtp_port || 587,
      smtp_user: provider.smtp_user || '',
      smtp_password: '',
      smtp_secure: provider.smtp_secure || false
    }
  } catch (err) {
    console.error('Failed to load provider:', err)
    alert('Failed to load provider details')
    closeEditModal()
  } finally {
    editModal.value.loading = false
  }
}

// Close edit modal
function closeEditModal() {
  editModal.value.show = false
  editModal.value.provider = null
}

// Save provider changes
async function saveProvider() {
  if (!editModal.value.provider) return

  editModal.value.saving = true

  try {
    const providerId = editModal.value.provider.id

    // Update provider configuration
    await adminAPI.emailService.updateProvider(providerId, editModal.value.form)

    // Update credentials if provided
    const hasCredentials =
      editModal.value.credentials.api_key ||
      editModal.value.credentials.smtp_password

    if (hasCredentials) {
      await adminAPI.emailService.updateCredentials(providerId, editModal.value.credentials)
    }

    alert('Provider updated successfully')
    closeEditModal()

    // Refresh data
    await Promise.all([fetchProviders(), fetchHealth()])
  } catch (err) {
    console.error('Failed to update provider:', err)
    alert(err.response?.data?.error || 'Failed to update provider')
  } finally {
    editModal.value.saving = false
  }
}

// Open add modal
function openAddModal() {
  // Reset form
  addModal.value.form = {
    provider_name: '',
    display_name: '',
    priority: 1,
    cost_per_1000: 0,
    max_retry_attempts: 3,
    retry_delay_seconds: 5,
    from_email: '',
    from_name: ''
  }

  // Reset credentials
  addModal.value.credentials = {
    api_key: '',
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    smtp_secure: false
  }

  addModal.value.show = true
}

// Close add modal
function closeAddModal() {
  addModal.value.show = false
}

// Handle provider type change
function onProviderTypeChange() {
  // Auto-populate display name based on provider type
  const displayNames = {
    'elastic-email': 'Elastic Email',
    'sendgrid': 'SendGrid',
    'custom-smtp': 'Custom SMTP (Mail Server)',
    'amazon-ses': 'Amazon SES'
  }

  if (addModal.value.form.provider_name && !addModal.value.form.display_name) {
    addModal.value.form.display_name = displayNames[addModal.value.form.provider_name] || ''
  }
}

// Create provider
async function createProvider() {
  if (!addModal.value.form.provider_name) {
    alert('Please select a provider type')
    return
  }

  if (!addModal.value.form.from_email) {
    alert('Please enter a from email address')
    return
  }

  // Validate credentials based on provider type
  if (addModal.value.form.provider_name === 'elastic-email' || addModal.value.form.provider_name === 'sendgrid') {
    if (!addModal.value.credentials.api_key) {
      alert('Please enter an API key')
      return
    }
  } else if (addModal.value.form.provider_name === 'custom-smtp') {
    if (!addModal.value.credentials.smtp_host || !addModal.value.credentials.smtp_user || !addModal.value.credentials.smtp_password) {
      alert('Please fill in all SMTP credentials')
      return
    }
  } else if (addModal.value.form.provider_name === 'amazon-ses') {
    if (!addModal.value.credentials.access_key_id || !addModal.value.credentials.secret_access_key) {
      alert('Please enter AWS access key and secret access key')
      return
    }
  }

  addModal.value.saving = true

  try {
    // Call backend API to create provider
    await adminAPI.emailService.createProvider({
      ...addModal.value.form,
      credentials: addModal.value.credentials
    })

    alert('Provider created successfully')
    closeAddModal()

    // Refresh data
    await Promise.all([fetchProviders(), fetchHealth()])
  } catch (err) {
    console.error('Failed to create provider:', err)
    alert(err.response?.data?.error || 'Failed to create provider')
  } finally {
    addModal.value.saving = false
  }
}

// Refresh functions
const refreshProviders = () => fetchProviders()
const refreshStats = () => fetchStats()
const refreshDeliveries = () => fetchDeliveries()

// Helper functions
function getStatusColorClass(status) {
  const classes = {
    'healthy': 'bg-green-50 text-green-600',
    'warning': 'bg-yellow-50 text-yellow-600',
    'degraded': 'bg-orange-50 text-orange-600',
    'critical': 'bg-red-50 text-red-600'
  }
  return classes[status] || 'bg-gray-50 text-gray-600'
}

function getHealthScoreClass(score) {
  if (score >= 80) return 'text-green-600 font-medium'
  if (score >= 60) return 'text-yellow-600 font-medium'
  if (score >= 40) return 'text-orange-600 font-medium'
  return 'text-red-600 font-medium'
}

function getRoutingReasonClass(reason) {
  if (reason === 'lcr_selected') return 'bg-blue-100 text-blue-800'
  if (reason.includes('failover')) return 'bg-yellow-100 text-yellow-800'
  return 'bg-gray-100 text-gray-800'
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString()
}

// Load all data on mount
onMounted(() => {
  fetchHealth()
  fetchProviders()
  fetchStats()
  fetchDeliveries()
})
</script>
