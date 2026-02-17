/**
 * Keyboard Shortcuts Composable
 * Global keyboard shortcuts for Agent Desktop
 */

import { onMounted, onUnmounted, ref } from 'vue'

// Default shortcuts configuration
const defaultShortcuts = {
  // Call Controls
  'answer_call': { key: 'a', ctrl: true, description: 'Answer incoming call' },
  'end_call': { key: 'e', ctrl: true, description: 'End current call' },
  'mute_toggle': { key: 'm', ctrl: true, description: 'Toggle mute' },
  'hold_toggle': { key: 'h', ctrl: true, description: 'Toggle hold' },
  'transfer': { key: 't', ctrl: true, description: 'Transfer call' },

  // Agent Status
  'status_available': { key: '1', alt: true, description: 'Set status to Available' },
  'status_busy': { key: '2', alt: true, description: 'Set status to Busy' },
  'status_break': { key: '3', alt: true, description: 'Set status to Break' },
  'status_away': { key: '4', alt: true, description: 'Set status to Away' },

  // Navigation
  'tab_voice': { key: 'v', alt: true, description: 'Switch to Voice tab' },
  'tab_inbox': { key: 'i', alt: true, description: 'Switch to Inbox tab' },
  'open_dialpad': { key: 'd', ctrl: true, description: 'Open dialpad' },
  'focus_search': { key: '/', ctrl: false, description: 'Focus search' },

  // Quick Actions
  'quick_note': { key: 'n', ctrl: true, description: 'Add quick note' },
  'copy_number': { key: 'c', ctrl: true, shift: true, description: 'Copy caller number' },
  'open_contact': { key: 'o', ctrl: true, description: 'Open contact details' },
  'show_shortcuts': { key: '?', ctrl: false, shift: true, description: 'Show keyboard shortcuts' },

  // Wrap-up
  'select_disposition': { key: 'w', ctrl: true, description: 'Open disposition selector' },
  'submit_wrapup': { key: 'Enter', ctrl: true, description: 'Submit wrap-up' },
}

export function useKeyboardShortcuts(options = {}) {
  const {
    onAction,
    enabled = ref(true),
    customShortcuts = {},
  } = options

  const shortcuts = { ...defaultShortcuts, ...customShortcuts }
  const showShortcutsModal = ref(false)
  const activeShortcuts = ref(shortcuts)

  function handleKeyDown(e) {
    // Skip if disabled or typing in input
    if (!enabled.value) return
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      // Only allow specific shortcuts in inputs
      if (!e.ctrlKey && !e.altKey) return
    }

    // Find matching shortcut
    for (const [action, config] of Object.entries(shortcuts)) {
      const keyMatch = e.key.toLowerCase() === config.key.toLowerCase()
      const ctrlMatch = !!config.ctrl === (e.ctrlKey || e.metaKey)
      const altMatch = !!config.alt === e.altKey
      const shiftMatch = !!config.shift === e.shiftKey

      if (keyMatch && ctrlMatch && altMatch && shiftMatch) {
        e.preventDefault()

        if (action === 'show_shortcuts') {
          showShortcutsModal.value = true
          return
        }

        if (onAction) {
          onAction(action, e)
        }
        return
      }
    }
  }

  function formatShortcut(config) {
    const parts = []
    if (config.ctrl) parts.push('Ctrl')
    if (config.alt) parts.push('Alt')
    if (config.shift) parts.push('Shift')
    parts.push(config.key.toUpperCase())
    return parts.join(' + ')
  }

  function getShortcutsList() {
    return Object.entries(shortcuts).map(([action, config]) => ({
      action,
      ...config,
      formatted: formatShortcut(config),
    }))
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })

  return {
    shortcuts: activeShortcuts,
    showShortcutsModal,
    formatShortcut,
    getShortcutsList,
  }
}

// Shortcut categories for help modal
export const shortcutCategories = {
  'Call Controls': ['answer_call', 'end_call', 'mute_toggle', 'hold_toggle', 'transfer'],
  'Agent Status': ['status_available', 'status_busy', 'status_break', 'status_away'],
  'Navigation': ['tab_voice', 'tab_inbox', 'open_dialpad', 'focus_search'],
  'Quick Actions': ['quick_note', 'copy_number', 'open_contact', 'show_shortcuts'],
  'Wrap-up': ['select_disposition', 'submit_wrapup'],
}

export default useKeyboardShortcuts
