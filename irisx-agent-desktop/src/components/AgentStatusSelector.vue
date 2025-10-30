<template>
  <div class="relative inline-block text-left">
    <div>
      <button
        type="button"
        @click="isOpen = !isOpen"
        class="inline-flex items-center justify-between w-48 rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        <span class="flex items-center">
          <span
            class="h-3 w-3 rounded-full mr-2"
            :class="statusColors[currentStatus]"
          ></span>
          {{ statusLabels[currentStatus] }}
        </span>
        <svg class="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>

    <!-- Dropdown menu -->
    <transition
      enter-active-class="transition ease-out duration-100"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-75"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10"
      >
        <div class="py-1">
          <button
            v-for="status in statuses"
            :key="status"
            @click="selectStatus(status)"
            class="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            :class="{ 'bg-gray-50': currentStatus === status }"
          >
            <span
              class="h-3 w-3 rounded-full mr-3"
              :class="statusColors[status]"
            ></span>
            {{ statusLabels[status] }}
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// Props
const props = defineProps({
  modelValue: {
    type: String,
    default: 'offline'
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'status-changed'])

// State
const isOpen = ref(false)
const currentStatus = ref(props.modelValue)

// Available statuses
const statuses = ['available', 'busy', 'away', 'offline']

// Status labels
const statusLabels = {
  available: 'Available',
  busy: 'Busy',
  away: 'Away',
  offline: 'Offline'
}

// Status color classes (Tailwind)
const statusColors = {
  available: 'bg-green-500',
  busy: 'bg-red-500',
  away: 'bg-yellow-500',
  offline: 'bg-gray-400'
}

// Methods
function selectStatus(status) {
  currentStatus.value = status
  isOpen.value = false
  emit('update:modelValue', status)
  emit('status-changed', status)

  // In Phase 3, we would sync this to Firebase Realtime DB
  console.log('Agent status changed to:', status)
}

// Close dropdown when clicking outside
if (typeof window !== 'undefined') {
  window.addEventListener('click', (e) => {
    if (!e.target.closest('.relative')) {
      isOpen.value = false
    }
  })
}
</script>
