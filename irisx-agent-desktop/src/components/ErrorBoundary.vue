<script setup>
import { ref, onErrorCaptured } from 'vue';
import { captureException } from '../plugins/sentry';

const error = ref(null);
const errorMessage = ref('');

onErrorCaptured((err, instance, info) => {
  console.error('Vue error boundary caught:', err);

  error.value = err;
  errorMessage.value = err.message || 'An unexpected error occurred';

  // Report to Sentry with Vue context
  captureException(err, {
    tags: {
      error_boundary: 'vue',
      component: instance?.$options?.name || 'Unknown',
      app: 'agent-desktop',
    },
    extra: {
      componentName: instance?.$options?.name,
      propsData: instance?.$props,
      lifecycle: info,
      errorInfo: info,
    },
    level: 'error',
  });

  // Prevent error from propagating
  return false;
});

function reload() {
  error.value = null;
  errorMessage.value = '';
  window.location.reload();
}

function goHome() {
  error.value = null;
  errorMessage.value = '';
  window.location.href = '/agent';
}
</script>

<template>
  <div v-if="error" class="error-boundary">
    <div class="error-content">
      <div class="error-icon">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="icon"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>

      <h2 class="error-title">Something went wrong</h2>

      <p class="error-description">
        We've been notified of this issue and are working to fix it.
      </p>

      <div v-if="import.meta.env.DEV" class="error-details">
        <p class="error-message">{{ errorMessage }}</p>
      </div>

      <div class="error-actions">
        <button @click="reload" class="btn btn-primary">
          Reload Page
        </button>
        <button @click="goHome" class="btn btn-secondary">
          Go to Dashboard
        </button>
      </div>
    </div>
  </div>

  <!-- Render children if no error -->
  <slot v-else />
</template>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 2rem;
  background: linear-gradient(to bottom, #fef2f2, #ffffff);
}

.error-content {
  text-align: center;
  max-width: 500px;
}

.error-icon {
  display: flex;
  justify-content: center;
  margin-bottom: 1.5rem;
}

.icon {
  width: 4rem;
  height: 4rem;
  color: #dc2626;
}

.error-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.75rem;
}

.error-description {
  color: #6b7280;
  font-size: 1rem;
  margin-bottom: 1.5rem;
  line-height: 1.5;
}

.error-details {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 1.5rem;
  text-align: left;
}

.error-message {
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 0.875rem;
  color: #991b1b;
  word-break: break-word;
}

.error-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;
}

.btn {
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #4f46e5;
  color: white;
}

.btn-primary:hover {
  background: #4338ca;
  transform: translateY(-1px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
}

.btn-secondary:hover {
  background: #e5e7eb;
  transform: translateY(-1px);
}
</style>
