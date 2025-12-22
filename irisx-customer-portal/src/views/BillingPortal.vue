<template>
  <div class="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900">Billing & Subscription</h1>
        <p class="mt-2 text-sm text-gray-600">
          Manage your subscription, payment methods, and billing details
        </p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center items-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
        <div class="flex items-start">
          <svg class="w-6 h-6 text-red-400 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
          </svg>
          <div>
            <h3 class="text-sm font-medium text-red-800">Error loading billing information</h3>
            <p class="mt-1 text-sm text-red-700">{{ error }}</p>
            <button @click="fetchBillingData" class="mt-3 text-sm font-medium text-red-600 hover:text-red-500">
              Try again
            </button>
          </div>
        </div>
      </div>

      <div v-else class="space-y-6">
        <!-- Current Subscription Card -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div class="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-purple-700">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-xl font-semibold text-white">Current Subscription</h2>
                <p class="mt-1 text-purple-100">{{ subscription?.planName || 'No active subscription' }}</p>
              </div>
              <span :class="getSubscriptionStatusClass(subscription?.status)" class="px-3 py-1 rounded-full text-sm font-medium">
                {{ subscription?.status || 'inactive' }}
              </span>
            </div>
          </div>
          <div class="px-6 py-5">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <dt class="text-sm font-medium text-gray-500">Monthly Cost</dt>
                <dd class="mt-1 text-2xl font-bold text-gray-900">${{ subscription?.monthlyAmount?.toFixed(2) || '0.00' }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">Billing Cycle</dt>
                <dd class="mt-1 text-lg text-gray-900 capitalize">{{ subscription?.billingCycle || 'monthly' }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">Next Billing Date</dt>
                <dd class="mt-1 text-lg text-gray-900">{{ formatDate(subscription?.nextBillingDate) }}</dd>
              </div>
              <div>
                <dt class="text-sm font-medium text-gray-500">Account Balance</dt>
                <dd class="mt-1 text-lg text-gray-900" :class="balance < 0 ? 'text-red-600' : 'text-green-600'">
                  ${{ Math.abs(balance).toFixed(2) }} {{ balance < 0 ? 'owed' : 'credit' }}
                </dd>
              </div>
            </div>
            <div class="mt-6 flex flex-wrap gap-3">
              <button @click="showChangePlanModal = true" class="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium">
                Change Plan
              </button>
              <button v-if="subscription?.status === 'active'" @click="showCancelModal = true" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium">
                Cancel Subscription
              </button>
              <router-link to="/dashboard/usage" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium">
                View Usage
              </router-link>
            </div>
          </div>
        </div>

        <!-- Usage Summary -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">This Month's Usage</h3>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div class="bg-blue-50 rounded-lg p-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-blue-600 font-medium">Voice Minutes</p>
                  <p class="text-2xl font-bold text-blue-900">{{ usage.voiceMinutes.toLocaleString() }}</p>
                </div>
                <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
                  </svg>
                </div>
              </div>
              <p class="mt-2 text-xs text-blue-600">${{ usage.voiceCost.toFixed(2) }} spent</p>
            </div>
            <div class="bg-green-50 rounded-lg p-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-green-600 font-medium">SMS Messages</p>
                  <p class="text-2xl font-bold text-green-900">{{ usage.smsCount.toLocaleString() }}</p>
                </div>
                <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                  </svg>
                </div>
              </div>
              <p class="mt-2 text-xs text-green-600">${{ usage.smsCost.toFixed(2) }} spent</p>
            </div>
            <div class="bg-purple-50 rounded-lg p-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-purple-600 font-medium">Emails Sent</p>
                  <p class="text-2xl font-bold text-purple-900">{{ usage.emailCount.toLocaleString() }}</p>
                </div>
                <div class="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                  </svg>
                </div>
              </div>
              <p class="mt-2 text-xs text-purple-600">${{ usage.emailCost.toFixed(2) }} spent</p>
            </div>
            <div class="bg-orange-50 rounded-lg p-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-orange-600 font-medium">Total This Month</p>
                  <p class="text-2xl font-bold text-orange-900">${{ usage.totalCost.toFixed(2) }}</p>
                </div>
                <div class="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                  <svg class="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
              </div>
              <p class="mt-2 text-xs text-orange-600">{{ daysRemaining }} days remaining</p>
            </div>
          </div>
        </div>

        <!-- Payment Methods -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div class="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900">Payment Methods</h3>
            <button @click="showAddPaymentModal = true" class="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium">
              Add Payment Method
            </button>
          </div>
          <div class="divide-y divide-gray-200">
            <div v-if="paymentMethods.length === 0" class="px-6 py-8 text-center text-gray-500">
              <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
              </svg>
              <p class="mt-2">No payment methods on file</p>
              <button @click="showAddPaymentModal = true" class="mt-4 text-purple-600 hover:text-purple-700 font-medium">
                Add your first payment method
              </button>
            </div>
            <div v-for="method in paymentMethods" :key="method.id" class="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
              <div class="flex items-center">
                <div class="w-12 h-8 bg-gray-100 rounded flex items-center justify-center mr-4">
                  <img v-if="method.brand" :src="getCardBrandIcon(method.brand)" :alt="method.brand" class="h-5" />
                  <svg v-else class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
                  </svg>
                </div>
                <div>
                  <p class="text-sm font-medium text-gray-900">
                    {{ method.brand ? method.brand.charAt(0).toUpperCase() + method.brand.slice(1) : 'Card' }} ending in {{ method.last4 }}
                    <span v-if="method.isDefault" class="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">Default</span>
                  </p>
                  <p class="text-sm text-gray-500">Expires {{ method.expMonth }}/{{ method.expYear }}</p>
                </div>
              </div>
              <div class="flex items-center space-x-2">
                <button v-if="!method.isDefault" @click="setDefaultPaymentMethod(method.id)" class="text-sm text-purple-600 hover:text-purple-700">
                  Set as default
                </button>
                <button @click="deletePaymentMethod(method.id)" class="text-sm text-red-600 hover:text-red-700">
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Billing Information -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div class="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900">Billing Information</h3>
            <button @click="showEditBillingModal = true" class="text-sm text-purple-600 hover:text-purple-700 font-medium">
              Edit
            </button>
          </div>
          <div class="px-6 py-5">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 class="text-sm font-medium text-gray-500 mb-2">Billing Contact</h4>
                <p class="text-sm text-gray-900">{{ billingInfo.name || 'Not set' }}</p>
                <p class="text-sm text-gray-600">{{ billingInfo.email || 'Not set' }}</p>
                <p class="text-sm text-gray-600">{{ billingInfo.phone || 'Not set' }}</p>
              </div>
              <div>
                <h4 class="text-sm font-medium text-gray-500 mb-2">Billing Address</h4>
                <p class="text-sm text-gray-900">{{ billingInfo.address?.line1 || 'Not set' }}</p>
                <p v-if="billingInfo.address?.line2" class="text-sm text-gray-600">{{ billingInfo.address.line2 }}</p>
                <p class="text-sm text-gray-600">
                  {{ billingInfo.address?.city }}{{ billingInfo.address?.city && billingInfo.address?.state ? ', ' : '' }}{{ billingInfo.address?.state }} {{ billingInfo.address?.postalCode }}
                </p>
                <p class="text-sm text-gray-600">{{ billingInfo.address?.country }}</p>
              </div>
            </div>
            <div class="mt-6 pt-6 border-t border-gray-200">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="text-sm font-medium text-gray-900">Tax ID / VAT Number</h4>
                  <p class="text-sm text-gray-600">{{ billingInfo.taxId || 'Not provided' }}</p>
                </div>
                <div>
                  <h4 class="text-sm font-medium text-gray-900">Company Name</h4>
                  <p class="text-sm text-gray-600">{{ billingInfo.companyName || 'Not provided' }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Recent Invoices -->
        <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div class="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900">Recent Invoices</h3>
            <router-link to="/dashboard/billing-history" class="text-sm text-purple-600 hover:text-purple-700 font-medium">
              View all
            </router-link>
          </div>
          <div class="divide-y divide-gray-200">
            <div v-if="recentInvoices.length === 0" class="px-6 py-8 text-center text-gray-500">
              <p>No invoices yet</p>
            </div>
            <div v-for="invoice in recentInvoices" :key="invoice.id" class="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
              <div class="flex items-center">
                <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mr-4">
                  <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                </div>
                <div>
                  <p class="text-sm font-medium text-gray-900">{{ invoice.invoiceNumber }}</p>
                  <p class="text-sm text-gray-500">{{ formatDate(invoice.createdAt) }}</p>
                </div>
              </div>
              <div class="flex items-center space-x-4">
                <span :class="getInvoiceStatusClass(invoice.status)" class="px-2 py-1 rounded-full text-xs font-medium">
                  {{ invoice.status }}
                </span>
                <span class="text-sm font-medium text-gray-900">${{ invoice.totalAmount.toFixed(2) }}</span>
                <button @click="downloadInvoice(invoice)" class="text-purple-600 hover:text-purple-700">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Change Plan Modal -->
      <div v-if="showChangePlanModal" class="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" @click="showChangePlanModal = false"></div>
          <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
            <div class="bg-white px-6 pt-6 pb-4">
              <div class="flex items-center justify-between mb-6">
                <h3 class="text-2xl font-bold text-gray-900">Choose a Plan</h3>
                <button @click="showChangePlanModal = false" class="text-gray-400 hover:text-gray-500">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div v-for="plan in availablePlans" :key="plan.id" :class="[
                  'border rounded-lg p-6 cursor-pointer transition',
                  selectedPlan === plan.id ? 'border-purple-500 ring-2 ring-purple-500' : 'border-gray-200 hover:border-purple-300',
                  subscription?.planId === plan.id ? 'bg-purple-50' : ''
                ]" @click="selectedPlan = plan.id">
                  <div class="flex items-center justify-between mb-4">
                    <h4 class="text-lg font-semibold text-gray-900">{{ plan.name }}</h4>
                    <span v-if="subscription?.planId === plan.id" class="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">Current</span>
                  </div>
                  <p class="text-3xl font-bold text-gray-900">${{ plan.price }}<span class="text-sm text-gray-500 font-normal">/mo</span></p>
                  <ul class="mt-4 space-y-2">
                    <li v-for="feature in plan.features" :key="feature" class="flex items-center text-sm text-gray-600">
                      <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                      </svg>
                      {{ feature }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <div class="bg-gray-50 px-6 py-4 flex justify-end space-x-3">
              <button @click="showChangePlanModal = false" class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button @click="changePlan" :disabled="!selectedPlan || selectedPlan === subscription?.planId || changingPlan" class="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {{ changingPlan ? 'Updating...' : 'Update Plan' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Payment Method Modal -->
      <div v-if="showAddPaymentModal" class="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" @click="showAddPaymentModal = false"></div>
          <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full">
            <div class="bg-white px-6 pt-6 pb-4">
              <div class="flex items-center justify-between mb-6">
                <h3 class="text-xl font-bold text-gray-900">Add Payment Method</h3>
                <button @click="showAddPaymentModal = false" class="text-gray-400 hover:text-gray-500">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Card Number</label>
                  <input v-model="newCard.number" type="text" placeholder="4242 4242 4242 4242" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                    <input v-model="newCard.expiry" type="text" placeholder="MM/YY" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">CVC</label>
                    <input v-model="newCard.cvc" type="text" placeholder="123" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Name on Card</label>
                  <input v-model="newCard.name" type="text" placeholder="John Doe" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
                </div>
                <div class="flex items-center">
                  <input v-model="newCard.setDefault" type="checkbox" id="setDefault" class="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded" />
                  <label for="setDefault" class="ml-2 text-sm text-gray-700">Set as default payment method</label>
                </div>
              </div>
            </div>
            <div class="bg-gray-50 px-6 py-4 flex justify-end space-x-3">
              <button @click="showAddPaymentModal = false" class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button @click="addPaymentMethod" :disabled="addingPayment" class="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                {{ addingPayment ? 'Adding...' : 'Add Card' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Edit Billing Info Modal -->
      <div v-if="showEditBillingModal" class="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" @click="showEditBillingModal = false"></div>
          <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
            <div class="bg-white px-6 pt-6 pb-4">
              <div class="flex items-center justify-between mb-6">
                <h3 class="text-xl font-bold text-gray-900">Edit Billing Information</h3>
                <button @click="showEditBillingModal = false" class="text-gray-400 hover:text-gray-500">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
              <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input v-model="editBilling.name" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Company (Optional)</label>
                    <input v-model="editBilling.companyName" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input v-model="editBilling.email" type="email" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input v-model="editBilling.phone" type="tel" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
                  <input v-model="editBilling.address.line1" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                  <input v-model="editBilling.address.line2" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
                </div>
                <div class="grid grid-cols-3 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input v-model="editBilling.address.city" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">State</label>
                    <input v-model="editBilling.address.state" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                    <input v-model="editBilling.address.postalCode" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Country</label>
                    <input v-model="editBilling.address.country" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Tax ID / VAT</label>
                    <input v-model="editBilling.taxId" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
                  </div>
                </div>
              </div>
            </div>
            <div class="bg-gray-50 px-6 py-4 flex justify-end space-x-3">
              <button @click="showEditBillingModal = false" class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button @click="saveBillingInfo" :disabled="savingBilling" class="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                {{ savingBilling ? 'Saving...' : 'Save Changes' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Cancel Subscription Modal -->
      <div v-if="showCancelModal" class="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" @click="showCancelModal = false"></div>
          <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
            <div class="bg-white px-6 pt-6 pb-4">
              <div class="sm:flex sm:items-start">
                <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                  <svg class="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                  </svg>
                </div>
                <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                  <h3 class="text-lg font-medium text-gray-900">Cancel Subscription</h3>
                  <div class="mt-2">
                    <p class="text-sm text-gray-500">
                      Are you sure you want to cancel your subscription? Your service will continue until {{ formatDate(subscription?.currentPeriodEnd) }}, after which you'll lose access to premium features.
                    </p>
                  </div>
                  <div class="mt-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Reason for cancellation (optional)</label>
                    <textarea v-model="cancelReason" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"></textarea>
                  </div>
                </div>
              </div>
            </div>
            <div class="bg-gray-50 px-6 py-4 flex justify-end space-x-3">
              <button @click="showCancelModal = false" class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                Keep Subscription
              </button>
              <button @click="cancelSubscription" :disabled="cancellingSubscription" class="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {{ cancellingSubscription ? 'Cancelling...' : 'Cancel Subscription' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// State
const loading = ref(true);
const error = ref(null);
const subscription = ref(null);
const balance = ref(0);
const paymentMethods = ref([]);
const billingInfo = ref({
  name: '',
  email: '',
  phone: '',
  companyName: '',
  taxId: '',
  address: {}
});
const recentInvoices = ref([]);
const usage = reactive({
  voiceMinutes: 0,
  voiceCost: 0,
  smsCount: 0,
  smsCost: 0,
  emailCount: 0,
  emailCost: 0,
  totalCost: 0
});

// Available plans
const availablePlans = ref([
  {
    id: 'starter',
    name: 'Starter',
    price: 49,
    features: ['1,000 voice minutes', '500 SMS', '10,000 emails', '2 agents', 'Basic analytics']
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 149,
    features: ['5,000 voice minutes', '2,500 SMS', '50,000 emails', '10 agents', 'Advanced analytics', 'Custom IVR']
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 499,
    features: ['Unlimited minutes', 'Unlimited SMS', 'Unlimited emails', 'Unlimited agents', 'Priority support', 'Custom integrations']
  }
]);

// Modals
const showChangePlanModal = ref(false);
const showAddPaymentModal = ref(false);
const showEditBillingModal = ref(false);
const showCancelModal = ref(false);

// Form states
const selectedPlan = ref(null);
const changingPlan = ref(false);
const addingPayment = ref(false);
const savingBilling = ref(false);
const cancellingSubscription = ref(false);
const cancelReason = ref('');

const newCard = reactive({
  number: '',
  expiry: '',
  cvc: '',
  name: '',
  setDefault: false
});

const editBilling = reactive({
  name: '',
  email: '',
  phone: '',
  companyName: '',
  taxId: '',
  address: {
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: ''
  }
});

// Computed
const daysRemaining = computed(() => {
  const endOfMonth = new Date();
  endOfMonth.setMonth(endOfMonth.getMonth() + 1, 0);
  const today = new Date();
  return Math.ceil((endOfMonth - today) / (1000 * 60 * 60 * 24));
});

// Methods
const getSubscriptionStatusClass = (status) => {
  const classes = {
    active: 'bg-green-100 text-green-800',
    trialing: 'bg-blue-100 text-blue-800',
    past_due: 'bg-yellow-100 text-yellow-800',
    canceled: 'bg-red-100 text-red-800',
    inactive: 'bg-gray-100 text-gray-800'
  };
  return classes[status] || 'bg-gray-100 text-gray-800';
};

const getInvoiceStatusClass = (status) => {
  const classes = {
    paid: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    overdue: 'bg-red-100 text-red-800',
    draft: 'bg-gray-100 text-gray-800'
  };
  return classes[status] || 'bg-gray-100 text-gray-800';
};

const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const getCardBrandIcon = (brand) => {
  const icons = {
    visa: 'https://js.stripe.com/v3/fingerprinted/img/visa-729c05c240c4bdb47b03ac81d9945bfe.svg',
    mastercard: 'https://js.stripe.com/v3/fingerprinted/img/mastercard-4d8844094130711885b5e41b28c9848f.svg',
    amex: 'https://js.stripe.com/v3/fingerprinted/img/amex-a49b82f46c5cd6a96a6e418a6ca1717c.svg',
    discover: 'https://js.stripe.com/v3/fingerprinted/img/discover-ac52cd46f89fa40a29a0bfb954e33173.svg'
  };
  return icons[brand?.toLowerCase()] || null;
};

const fetchBillingData = async () => {
  try {
    loading.value = true;
    error.value = null;

    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('Not authenticated');
    }

    const headers = { 'Authorization': `Bearer ${token}` };

    // Fetch all billing data in parallel
    const [subRes, methodsRes, infoRes, invoicesRes, usageRes] = await Promise.all([
      axios.get(`${API_URL}/v1/billing/subscription`, { headers }).catch(() => ({ data: { data: null } })),
      axios.get(`${API_URL}/v1/billing/payment-methods`, { headers }).catch(() => ({ data: { data: [] } })),
      axios.get(`${API_URL}/v1/billing/info`, { headers }).catch(() => ({ data: { data: {} } })),
      axios.get(`${API_URL}/v1/billing/invoices?limit=5`, { headers }).catch(() => ({ data: { data: { invoices: [] } } })),
      axios.get(`${API_URL}/v1/usage/current`, { headers }).catch(() => ({ data: { data: {} } }))
    ]);

    subscription.value = subRes.data.data || {
      status: 'inactive',
      planName: 'No Plan',
      monthlyAmount: 0
    };
    balance.value = subRes.data.data?.balance || 0;
    paymentMethods.value = methodsRes.data.data || [];
    billingInfo.value = infoRes.data.data || { address: {} };
    recentInvoices.value = invoicesRes.data.data?.invoices || [];

    // Update usage
    const usageData = usageRes.data.data || {};
    usage.voiceMinutes = usageData.voiceMinutes || 0;
    usage.voiceCost = usageData.voiceCost || 0;
    usage.smsCount = usageData.smsCount || 0;
    usage.smsCost = usageData.smsCost || 0;
    usage.emailCount = usageData.emailCount || 0;
    usage.emailCost = usageData.emailCost || 0;
    usage.totalCost = (usageData.voiceCost || 0) + (usageData.smsCost || 0) + (usageData.emailCost || 0);

    // Set edit billing values
    Object.assign(editBilling, {
      name: billingInfo.value.name || '',
      email: billingInfo.value.email || '',
      phone: billingInfo.value.phone || '',
      companyName: billingInfo.value.companyName || '',
      taxId: billingInfo.value.taxId || '',
      address: { ...billingInfo.value.address } || {}
    });
  } catch (err) {
    console.error('Error fetching billing data:', err);
    error.value = err.response?.data?.message || err.message || 'Failed to load billing information';
  } finally {
    loading.value = false;
  }
};

const changePlan = async () => {
  try {
    changingPlan.value = true;
    const token = localStorage.getItem('authToken');

    await axios.post(`${API_URL}/v1/billing/subscription/change`, {
      planId: selectedPlan.value
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    showChangePlanModal.value = false;
    await fetchBillingData();
  } catch (err) {
    console.error('Error changing plan:', err);
    alert(err.response?.data?.message || 'Failed to change plan');
  } finally {
    changingPlan.value = false;
  }
};

const addPaymentMethod = async () => {
  try {
    addingPayment.value = true;
    const token = localStorage.getItem('authToken');

    // In production, use Stripe Elements to tokenize the card
    await axios.post(`${API_URL}/v1/billing/payment-methods`, {
      type: 'card',
      card: {
        number: newCard.number.replace(/\s/g, ''),
        expMonth: parseInt(newCard.expiry.split('/')[0]),
        expYear: parseInt('20' + newCard.expiry.split('/')[1]),
        cvc: newCard.cvc
      },
      billingDetails: {
        name: newCard.name
      },
      setDefault: newCard.setDefault
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    showAddPaymentModal.value = false;
    Object.assign(newCard, { number: '', expiry: '', cvc: '', name: '', setDefault: false });
    await fetchBillingData();
  } catch (err) {
    console.error('Error adding payment method:', err);
    alert(err.response?.data?.message || 'Failed to add payment method');
  } finally {
    addingPayment.value = false;
  }
};

const setDefaultPaymentMethod = async (methodId) => {
  try {
    const token = localStorage.getItem('authToken');
    await axios.post(`${API_URL}/v1/billing/payment-methods/${methodId}/default`, {}, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    await fetchBillingData();
  } catch (err) {
    console.error('Error setting default payment method:', err);
    alert(err.response?.data?.message || 'Failed to set default payment method');
  }
};

const deletePaymentMethod = async (methodId) => {
  if (!confirm('Are you sure you want to remove this payment method?')) return;

  try {
    const token = localStorage.getItem('authToken');
    await axios.delete(`${API_URL}/v1/billing/payment-methods/${methodId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    await fetchBillingData();
  } catch (err) {
    console.error('Error deleting payment method:', err);
    alert(err.response?.data?.message || 'Failed to remove payment method');
  }
};

const saveBillingInfo = async () => {
  try {
    savingBilling.value = true;
    const token = localStorage.getItem('authToken');

    await axios.put(`${API_URL}/v1/billing/info`, editBilling, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    showEditBillingModal.value = false;
    await fetchBillingData();
  } catch (err) {
    console.error('Error saving billing info:', err);
    alert(err.response?.data?.message || 'Failed to save billing information');
  } finally {
    savingBilling.value = false;
  }
};

const cancelSubscription = async () => {
  try {
    cancellingSubscription.value = true;
    const token = localStorage.getItem('authToken');

    await axios.post(`${API_URL}/v1/billing/subscription/cancel`, {
      reason: cancelReason.value
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    showCancelModal.value = false;
    cancelReason.value = '';
    await fetchBillingData();
  } catch (err) {
    console.error('Error cancelling subscription:', err);
    alert(err.response?.data?.message || 'Failed to cancel subscription');
  } finally {
    cancellingSubscription.value = false;
  }
};

const downloadInvoice = (invoice) => {
  if (invoice.pdfUrl) {
    window.open(invoice.pdfUrl, '_blank');
  } else {
    alert('PDF generation coming soon. Invoice: ' + invoice.invoiceNumber);
  }
};

// Lifecycle
onMounted(() => {
  fetchBillingData();
});
</script>

<style scoped>
/* Custom styles if needed */
</style>
