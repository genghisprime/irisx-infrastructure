<template>
  <div class="whatsapp-messages">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">WhatsApp Messages</h1>
        <p class="page-description">
          Send and receive WhatsApp messages with your customers
        </p>
      </div>
      <div class="header-actions">
        <div class="status-badge" :class="accountStatus">
          <div class="status-dot"></div>
          <span>{{ accountStatusText }}</span>
        </div>
      </div>
    </div>

    <!-- Main Content: Sidebar + Chat -->
    <div class="messages-container">
      <!-- Conversations Sidebar -->
      <div class="conversations-sidebar">
        <div class="sidebar-header">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search conversations..."
            class="search-input"
          />
        </div>

        <div class="conversations-list">
          <div v-if="loadingContacts" class="loading-state">
            <div class="spinner"></div>
            <p>Loading conversations...</p>
          </div>

          <div v-else-if="filteredContacts.length === 0" class="empty-state-sidebar">
            <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p>No conversations yet</p>
          </div>

          <div
            v-for="contact in filteredContacts"
            :key="contact.id"
            class="conversation-item"
            :class="{ active: selectedContact?.id === contact.id }"
            @click="selectContact(contact)"
          >
            <div class="contact-avatar">
              <img v-if="contact.profile_pic_url" :src="contact.profile_pic_url" alt="" />
              <div v-else class="avatar-placeholder">
                {{ getInitials(contact.whatsapp_name || contact.phone_number) }}
              </div>
            </div>

            <div class="conversation-info">
              <div class="contact-header">
                <span class="contact-name">
                  {{ contact.whatsapp_name || formatPhoneNumber(contact.phone_number) }}
                </span>
                <span class="last-message-time">
                  {{ formatTime(contact.last_message_at) }}
                </span>
              </div>
              <div class="last-message-preview">
                <span v-if="contact.last_message_from === 'business'" class="message-prefix">You: </span>
                <span class="message-text">{{ contact.last_message_preview || 'No messages yet' }}</span>
              </div>
            </div>

            <div v-if="contact.unread_count > 0" class="unread-badge">
              {{ contact.unread_count }}
            </div>
          </div>
        </div>
      </div>

      <!-- Chat Area -->
      <div class="chat-area">
        <div v-if="!selectedContact" class="no-chat-selected">
          <svg class="whatsapp-logo" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
          </svg>
          <h3>Select a conversation</h3>
          <p>Choose a contact from the sidebar to start messaging</p>
        </div>

        <div v-else class="chat-container">
          <!-- Chat Header -->
          <div class="chat-header">
            <div class="contact-info">
              <div class="contact-avatar-sm">
                <img v-if="selectedContact.profile_pic_url" :src="selectedContact.profile_pic_url" alt="" />
                <div v-else class="avatar-placeholder">
                  {{ getInitials(selectedContact.whatsapp_name || selectedContact.phone_number) }}
                </div>
              </div>
              <div>
                <div class="contact-name-header">
                  {{ selectedContact.whatsapp_name || formatPhoneNumber(selectedContact.phone_number) }}
                </div>
                <div class="contact-phone">{{ formatPhoneNumber(selectedContact.phone_number) }}</div>
              </div>
            </div>
            <div class="chat-actions">
              <button @click="refreshMessages" class="btn-icon" title="Refresh">
                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Messages Area -->
          <div ref="messagesContainer" class="messages-area">
            <div v-if="loadingMessages" class="loading-messages">
              <div class="spinner"></div>
            </div>

            <div v-else-if="messages.length === 0" class="empty-messages">
              <p>No messages yet. Start the conversation!</p>
            </div>

            <div v-else class="messages-list">
              <div
                v-for="message in messages"
                :key="message.id"
                class="message"
                :class="{ outbound: message.direction === 'outbound', inbound: message.direction === 'inbound' }"
              >
                <div class="message-bubble">
                  <!-- Text Message -->
                  <div v-if="message.message_type === 'text'" class="message-text">
                    {{ message.text_body }}
                  </div>

                  <!-- Image Message -->
                  <div v-else-if="message.message_type === 'image'" class="message-media">
                    <img :src="message.media_url || message.media_s3_key" alt="Image" class="media-image" />
                    <div v-if="message.caption" class="media-caption">{{ message.caption }}</div>
                  </div>

                  <!-- Document Message -->
                  <div v-else-if="message.message_type === 'document'" class="message-document">
                    <svg class="document-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <div class="document-info">
                      <div class="document-name">{{ message.media_filename || 'Document' }}</div>
                      <div class="document-size">{{ formatFileSize(message.media_size_bytes) }}</div>
                    </div>
                  </div>

                  <!-- Location Message -->
                  <div v-else-if="message.message_type === 'location'" class="message-location">
                    <svg class="location-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <div class="location-info">
                      <div class="location-name">{{ message.location_name || 'Location' }}</div>
                      <div class="location-coords">{{ message.location_latitude }}, {{ message.location_longitude }}</div>
                    </div>
                  </div>

                  <!-- Template Message -->
                  <div v-else-if="message.message_type === 'template'" class="message-template">
                    <div class="template-badge">Template Message</div>
                    <div class="template-name">{{ message.template_name }}</div>
                  </div>

                  <!-- Reaction -->
                  <div v-else-if="message.message_type === 'reaction'" class="message-reaction">
                    <span class="reaction-emoji">{{ message.reaction_emoji }}</span>
                    <span class="reaction-text">Reacted to a message</span>
                  </div>

                  <!-- Message Footer -->
                  <div class="message-footer">
                    <span class="message-time">{{ formatMessageTime(message.created_at) }}</span>
                    <span v-if="message.direction === 'outbound'" class="message-status">
                      <svg v-if="message.status === 'read'" class="status-icon read" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                        <path d="M10.854 5.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L3.5 12.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                      </svg>
                      <svg v-else-if="message.status === 'delivered'" class="status-icon delivered" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                        <path d="M10.854 5.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L3.5 12.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                      </svg>
                      <svg v-else-if="message.status === 'sent'" class="status-icon sent" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                      </svg>
                      <svg v-else class="status-icon pending" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
                        <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Message Input -->
          <div class="message-input-area">
            <div class="message-input-container">
              <button @click="showEmojiPicker = !showEmojiPicker" class="btn-icon">
                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>

              <button @click="showAttachMenu = !showAttachMenu" class="btn-icon">
                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>

              <textarea
                v-model="newMessage"
                @keydown.enter.exact.prevent="sendMessage"
                placeholder="Type a message..."
                class="message-input"
                rows="1"
              ></textarea>

              <button @click="sendMessage" class="btn-send" :disabled="!newMessage.trim() || sending">
                <svg v-if="!sending" class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                <div v-else class="spinner-sm"></div>
              </button>
            </div>

            <!-- Attach Menu -->
            <div v-if="showAttachMenu" class="attach-menu">
              <button @click="attachImage" class="attach-option">
                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Image</span>
              </button>
              <button @click="attachDocument" class="attach-option">
                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <span>Document</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();

// State
const contacts = ref([]);
const selectedContact = ref(null);
const messages = ref([]);
const newMessage = ref('');
const searchQuery = ref('');
const loadingContacts = ref(true);
const loadingMessages = ref(false);
const sending = ref(false);
const showEmojiPicker = ref(false);
const showAttachMenu = ref(false);
const messagesContainer = ref(null);
const accountStatus = ref('active');

// Computed
const accountStatusText = computed(() => {
  return accountStatus.value === 'active' ? 'Connected' : 'Disconnected';
});

const filteredContacts = computed(() => {
  if (!searchQuery.value) return contacts.value;

  const query = searchQuery.value.toLowerCase();
  return contacts.value.filter(contact =>
    (contact.whatsapp_name && contact.whatsapp_name.toLowerCase().includes(query)) ||
    contact.phone_number.includes(query)
  );
});

// Methods
async function loadContacts() {
  loadingContacts.value = true;
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/whatsapp/contacts`, {
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
      },
    });
    const data = await response.json();
    contacts.value = data.contacts || [];

    // Auto-select first contact if none selected
    if (contacts.value.length > 0 && !selectedContact.value) {
      selectContact(contacts.value[0]);
    }
  } catch (error) {
    console.error('Error loading contacts:', error);
  } finally {
    loadingContacts.value = false;
  }
}

async function selectContact(contact) {
  selectedContact.value = contact;
  await loadMessages();
}

async function loadMessages() {
  if (!selectedContact.value) return;

  loadingMessages.value = true;
  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/v1/whatsapp/conversations/${selectedContact.value.phone_number}`,
      {
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
        },
      }
    );
    const data = await response.json();
    messages.value = data.messages || [];

    // Scroll to bottom
    await nextTick();
    scrollToBottom();
  } catch (error) {
    console.error('Error loading messages:', error);
  } finally {
    loadingMessages.value = false;
  }
}

async function sendMessage() {
  if (!newMessage.value.trim() || !selectedContact.value || sending.value) return;

  sending.value = true;
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/whatsapp/send/text`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: selectedContact.value.phone_number,
        text: newMessage.value,
      }),
    });

    const data = await response.json();
    if (data.success) {
      newMessage.value = '';
      await loadMessages(); // Refresh messages
    }
  } catch (error) {
    console.error('Error sending message:', error);
  } finally {
    sending.value = false;
  }
}

async function refreshMessages() {
  await loadMessages();
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}

function attachImage() {
  showAttachMenu.value = false;
  // TODO: Implement image attachment
  alert('Image attachment coming soon!');
}

function attachDocument() {
  showAttachMenu.value = false;
  // TODO: Implement document attachment
  alert('Document attachment coming soon!');
}

function getInitials(name) {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

function formatPhoneNumber(phone) {
  // Simple formatting for US numbers
  if (phone && phone.length === 12 && phone.startsWith('+1')) {
    return `+1 (${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}`;
  }
  return phone;
}

function formatTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

function formatMessageTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Auto-refresh messages every 5 seconds
let refreshInterval;
onMounted(async () => {
  await loadContacts();

  refreshInterval = setInterval(() => {
    if (selectedContact.value) {
      loadMessages();
    }
  }, 5000);
});

// Cleanup
onBeforeUnmount(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});

// Watch for contact selection
watch(selectedContact, () => {
  showAttachMenu.value = false;
  showEmojiPicker.value = false;
});
</script>

<style scoped>
.whatsapp-messages {
  height: calc(100vh - 4rem);
  display: flex;
  flex-direction: column;
  padding: 2rem;
  background: #f0f2f5;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
}

.page-title {
  font-size: 2rem;
  font-weight: 700;
  color: #1a202c;
  margin: 0;
}

.page-description {
  color: #718096;
  margin-top: 0.5rem;
}

.header-actions {
  display: flex;
  gap: 1rem;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
}

.status-badge.active {
  background: #d1fae5;
  color: #059669;
}

.status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
}

.messages-container {
  flex: 1;
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 0;
  background: white;
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Sidebar */
.conversations-sidebar {
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  background: white;
}

.sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.search-input {
  width: 100%;
  padding: 0.5rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.875rem;
}

.conversations-list {
  flex: 1;
  overflow-y: auto;
}

.conversation-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  cursor: pointer;
  border-bottom: 1px solid #f3f4f6;
  transition: background 0.2s;
}

.conversation-item:hover {
  background: #f9fafb;
}

.conversation-item.active {
  background: #e0f2fe;
}

.contact-avatar,
.contact-avatar-sm {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.contact-avatar-sm {
  width: 2.5rem;
  height: 2.5rem;
}

.contact-avatar img,
.contact-avatar-sm img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: 600;
  font-size: 1rem;
}

.conversation-info {
  flex: 1;
  min-width: 0;
}

.contact-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}

.contact-name {
  font-weight: 600;
  color: #1f2937;
  font-size: 0.9375rem;
}

.last-message-time {
  font-size: 0.75rem;
  color: #9ca3af;
}

.last-message-preview {
  font-size: 0.875rem;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message-prefix {
  color: #9ca3af;
}

.unread-badge {
  background: #25d366;
  color: white;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  min-width: 1.25rem;
  text-align: center;
}

/* Chat Area */
.chat-area {
  display: flex;
  flex-direction: column;
  background: #e5ddd5;
}

.no-chat-selected {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 4rem 2rem;
  background: white;
}

.whatsapp-logo {
  width: 8rem;
  height: 8rem;
  color: #25d366;
  margin-bottom: 2rem;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-header {
  background: #f0f2f5;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #d1d5db;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.contact-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.contact-name-header {
  font-weight: 600;
  color: #1f2937;
}

.contact-phone {
  font-size: 0.875rem;
  color: #6b7280;
}

.chat-actions {
  display: flex;
  gap: 0.5rem;
}

/* Messages */
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23e5ddd5" width="100" height="100"/></svg>');
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.message {
  display: flex;
  max-width: 65%;
}

.message.outbound {
  align-self: flex-end;
  margin-left: auto;
}

.message.inbound {
  align-self: flex-start;
}

.message-bubble {
  background: white;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  max-width: 100%;
  word-wrap: break-word;
}

.message.outbound .message-bubble {
  background: #d9fdd3;
}

.message-text {
  color: #1f2937;
  line-height: 1.5;
}

.message-media img {
  max-width: 100%;
  border-radius: 0.375rem;
  margin-bottom: 0.5rem;
}

.media-caption {
  color: #1f2937;
  margin-top: 0.5rem;
}

.message-document {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  background: #f3f4f6;
  border-radius: 0.375rem;
}

.document-icon {
  width: 2.5rem;
  height: 2.5rem;
  color: #6b7280;
}

.document-name {
  font-weight: 500;
  color: #1f2937;
}

.document-size {
  font-size: 0.875rem;
  color: #6b7280;
}

.message-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.message-time {
  font-size: 0.75rem;
  color: #6b7280;
}

.status-icon {
  width: 1rem;
  height: 1rem;
}

.status-icon.read {
  color: #0ea5e9;
}

.status-icon.delivered {
  color: #9ca3af;
}

.status-icon.sent {
  color: #9ca3af;
}

.status-icon.pending {
  color: #d1d5db;
}

/* Message Input */
.message-input-area {
  background: #f0f2f5;
  padding: 0.75rem 1rem;
  border-top: 1px solid #d1d5db;
  position: relative;
}

.message-input-container {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  background: white;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
}

.message-input {
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  font-size: 0.9375rem;
  font-family: inherit;
  max-height: 120px;
}

.btn-send {
  background: #25d366;
  color: white;
  border: none;
  padding: 0.5rem;
  border-radius: 50%;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-send:hover:not(:disabled) {
  background: #20ba5a;
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.attach-menu {
  position: absolute;
  bottom: 100%;
  left: 1rem;
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.attach-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 0.375rem;
  color: #1f2937;
  text-align: left;
  transition: background 0.2s;
}

.attach-option:hover {
  background: #f3f4f6;
}

.btn-icon {
  background: transparent;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  color: #6b7280;
  border-radius: 0.375rem;
  transition: background 0.2s;
}

.btn-icon:hover {
  background: #f3f4f6;
}

.icon {
  width: 1.5rem;
  height: 1.5rem;
}

.spinner,
.spinner-sm {
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top-color: #25d366;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.spinner {
  width: 2rem;
  height: 2rem;
}

.spinner-sm {
  width: 1.25rem;
  height: 1.25rem;
  border-width: 2px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-state,
.empty-state-sidebar {
  text-align: center;
  padding: 2rem 1rem;
  color: #9ca3af;
}

.empty-icon {
  width: 3rem;
  height: 3rem;
  margin: 0 auto 1rem;
}
</style>
