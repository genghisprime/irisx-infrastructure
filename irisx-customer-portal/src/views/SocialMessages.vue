<template>
  <div class="social-messages">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Social Media</h1>
        <p class="page-description">
          Manage conversations across Discord, Slack, Microsoft Teams, and Telegram
        </p>
      </div>
      <div class="header-stats">
        <div v-for="platform in platforms" :key="platform.id" class="platform-badge" :class="`platform-${platform.id}`">
          <component :is="platform.icon" class="platform-icon" />
          <span>{{ getPlatformCount(platform.id) }}</span>
        </div>
      </div>
    </div>

    <!-- Platform Filter Tabs -->
    <div class="platform-tabs">
      <button
        @click="selectedPlatform = 'all'"
        class="platform-tab"
        :class="{ active: selectedPlatform === 'all' }"
      >
        <svg class="h-6 w-6 icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        All Platforms ({{ allMessagesCount }})
      </button>
      <button
        v-for="platform in platforms"
        :key="platform.id"
        @click="selectedPlatform = platform.id"
        class="platform-tab"
        :class="{ active: selectedPlatform === platform.id }"
      >
        <component :is="platform.icon" class="icon" />
        {{ platform.name }} ({{ getPlatformCount(platform.id) }})
      </button>
    </div>

    <!-- Main Content -->
    <div class="messages-container">
      <!-- Channels Sidebar -->
      <div class="channels-sidebar">
        <div class="sidebar-header">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search channels..."
            class="search-input"
          />
        </div>

        <div class="channels-list">
          <div v-if="loadingChannels" class="loading-state-sm">
            <div class="spinner-sm"></div>
            <p>Loading...</p>
          </div>

          <div v-else-if="filteredChannels.length === 0" class="empty-state-sm">
            <p>No channels found</p>
          </div>

          <div
            v-for="channel in filteredChannels"
            :key="`${channel.platform}-${channel.platform_channel_id}`"
            class="channel-item"
            :class="{ active: isChannelSelected(channel) }"
            @click="selectChannel(channel)"
          >
            <component :is="getPlatformIcon(channel.platform)" class="channel-platform-icon" />
            <div class="channel-info">
              <div class="channel-name"># {{ channel.channel_name }}</div>
              <div class="channel-meta">
                <span class="message-count">{{ channel.message_count }} messages</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Chat Area -->
      <div class="chat-area">
        <div v-if="!selectedChannel" class="no-channel-selected">
          <svg class="h-6 w-6 empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <h3>Select a channel</h3>
          <p>Choose a channel from the sidebar to view messages</p>
        </div>

        <div v-else class="chat-container">
          <!-- Chat Header -->
          <div class="chat-header">
            <div class="channel-header-info">
              <component :is="getPlatformIcon(selectedChannel.platform)" class="platform-icon-lg" />
              <div>
                <div class="channel-name-header"># {{ selectedChannel.channel_name }}</div>
                <div class="channel-platform">{{ getPlatformName(selectedChannel.platform) }}</div>
              </div>
            </div>
            <button @click="refreshMessages" class="btn-icon" title="Refresh">
              <svg class="h-6 w-6 icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          <!-- Messages Area -->
          <div ref="messagesContainer" class="messages-area">
            <div v-if="loadingMessages" class="loading-messages">
              <div class="spinner"></div>
            </div>

            <div v-else-if="messages.length === 0" class="empty-messages">
              <p>No messages yet</p>
            </div>

            <div v-else class="messages-list">
              <div
                v-for="message in messages"
                :key="message.id"
                class="message"
                :class="{ outbound: message.direction === 'outbound', inbound: message.direction === 'inbound' }"
              >
                <div v-if="message.direction === 'inbound'" class="message-avatar">
                  <img v-if="message.from_avatar_url" :src="message.from_avatar_url" alt="" />
                  <div v-else class="avatar-placeholder-sm">
                    {{ getInitials(message.from_username) }}
                  </div>
                </div>

                <div class="message-content">
                  <div v-if="message.direction === 'inbound'" class="message-author">
                    {{ message.display_name || message.from_username }}
                  </div>

                  <div class="message-bubble">
                    <!-- Text Content -->
                    <div v-if="message.text_content" class="message-text">
                      {{ message.text_content }}
                    </div>

                    <!-- Attachments -->
                    <div v-if="message.attachments && message.attachments.length > 0" class="message-attachments">
                      <div v-for="(attachment, idx) in parseAttachments(message.attachments)" :key="idx" class="attachment">
                        <svg class="h-6 w-6 attachment-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        <span>{{ attachment.filename || 'Attachment' }}</span>
                      </div>
                    </div>

                    <!-- Embeds (Discord/Slack) -->
                    <div v-if="message.embeds && message.embeds.length > 0" class="message-embeds">
                      <div v-for="(embed, idx) in parseEmbeds(message.embeds)" :key="idx" class="embed">
                        <div v-if="embed.title" class="embed-title">{{ embed.title }}</div>
                        <div v-if="embed.description" class="embed-description">{{ embed.description }}</div>
                      </div>
                    </div>

                    <div class="message-footer">
                      <span class="message-time">{{ formatTime(message.created_at) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Message Input -->
          <div class="message-input-area">
            <textarea
              v-model="newMessage"
              @keydown.enter.exact.prevent="sendMessage"
              placeholder="Type a message..."
              class="message-input"
              rows="1"
            ></textarea>
            <button @click="sendMessage" class="btn-send" :disabled="!newMessage.trim() || sending">
              <svg class="h-6 w-6 icon" v-if="!sending"  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <div v-else class="spinner-sm"></div>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, h } from 'vue';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();

// Platform Icons (Simple SVG components)
const DiscordIcon = {
  render: () => h('svg', { fill: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { d: 'M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028z' })
  ])
};

const SlackIcon = {
  render: () => h('svg', { fill: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { d: 'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z' })
  ])
};

const TeamsIcon = {
  render: () => h('svg', { fill: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { d: 'M20.625 8.127h-2.43v12.57h2.43c.833 0 1.51-.677 1.51-1.512V9.64c0-.835-.677-1.512-1.51-1.512zM14.402 0C12.53 0 11.01 1.52 11.01 3.394v.477H7.806c-1.322 0-2.393 1.073-2.393 2.394v1.86h9.59V3.394C15.003 1.52 13.483 0 14.402 0zm-6.596 10.122H1.51C.677 10.122 0 10.8 0 11.634v7.54c0 .836.677 1.513 1.51 1.513h6.296c.834 0 1.512-.677 1.512-1.512v-7.54c0-.835-.678-1.513-1.512-1.513zm10.717 0h-7.93v9.053c0 .835.678 1.512 1.513 1.512h6.417c.835 0 1.513-.677 1.513-1.512v-7.54c0-.835-.678-1.513-1.513-1.513z' })
  ])
};

const TelegramIcon = {
  render: () => h('svg', { fill: 'currentColor', viewBox: '0 0 24 24' }, [
    h('path', { d: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z' })
  ])
};

// State
const platforms = [
  { id: 'discord', name: 'Discord', icon: DiscordIcon },
  { id: 'slack', name: 'Slack', icon: SlackIcon },
  { id: 'teams', name: 'Teams', icon: TeamsIcon },
  { id: 'telegram', name: 'Telegram', icon: TelegramIcon },
];

const selectedPlatform = ref('all');
const channels = ref([]);
const selectedChannel = ref(null);
const messages = ref([]);
const newMessage = ref('');
const searchQuery = ref('');
const loadingChannels = ref(true);
const loadingMessages = ref(false);
const sending = ref(false);
const messagesContainer = ref(null);
const stats = ref([]);

// Computed
const filteredChannels = computed(() => {
  let filtered = channels.value;

  if (selectedPlatform.value !== 'all') {
    filtered = filtered.filter(c => c.platform === selectedPlatform.value);
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(c => c.channel_name.toLowerCase().includes(query));
  }

  return filtered;
});

const allMessagesCount = computed(() => {
  return stats.value.reduce((sum, s) => sum + s.total_messages, 0);
});

// Methods
function getPlatformCount(platform) {
  const stat = stats.value.find(s => s.platform === platform);
  return stat ? stat.total_messages : 0;
}

function getPlatformIcon(platform) {
  const p = platforms.find(pl => pl.id === platform);
  return p ? p.icon : null;
}

function getPlatformName(platform) {
  const p = platforms.find(pl => pl.id === platform);
  return p ? p.name : platform;
}

function isChannelSelected(channel) {
  return selectedChannel.value &&
    selectedChannel.value.platform === channel.platform &&
    selectedChannel.value.platform_channel_id === channel.platform_channel_id;
}

async function loadChannels() {
  loadingChannels.value = true;
  try {
    // Get all accounts
    const accountsRes = await fetch(`${import.meta.env.VITE_API_URL}/v1/social/accounts`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` },
    });
    const accountsData = await accountsRes.json();

    // Get channels for each account
    const allChannels = [];
    for (const account of accountsData.accounts || []) {
      const channelsRes = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/social/accounts/${account.id}/channels`,
        { headers: { 'Authorization': `Bearer ${authStore.token}` } }
      );
      const channelsData = await channelsRes.json();
      allChannels.push(...(channelsData.channels || []).map(c => ({ ...c, platform: account.platform })));
    }

    channels.value = allChannels;

    // Load stats
    const statsRes = await fetch(`${import.meta.env.VITE_API_URL}/v1/social/stats`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` },
    });
    const statsData = await statsRes.json();
    stats.value = statsData.stats || [];

    // Auto-select first channel
    if (channels.value.length > 0 && !selectedChannel.value) {
      selectChannel(channels.value[0]);
    }
  } catch (error) {
    console.error('Error loading channels:', error);
  } finally {
    loadingChannels.value = false;
  }
}

async function selectChannel(channel) {
  selectedChannel.value = channel;
  await loadMessages();
}

async function loadMessages() {
  if (!selectedChannel.value) return;

  loadingMessages.value = true;
  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/v1/social/channels/${selectedChannel.value.platform}/${selectedChannel.value.platform_channel_id}/messages`,
      { headers: { 'Authorization': `Bearer ${authStore.token}` } }
    );
    const data = await response.json();
    messages.value = data.messages || [];

    await nextTick();
    scrollToBottom();
  } catch (error) {
    console.error('Error loading messages:', error);
  } finally {
    loadingMessages.value = false;
  }
}

async function sendMessage() {
  if (!newMessage.value.trim() || !selectedChannel.value || sending.value) return;

  sending.value = true;
  try {
    await fetch(`${import.meta.env.VITE_API_URL}/v1/social/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platform: selectedChannel.value.platform,
        channel_id: selectedChannel.value.platform_channel_id,
        text: newMessage.value,
      }),
    });

    newMessage.value = '';
    await loadMessages();
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

function getInitials(name) {
  return name?.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2) || '??';
}

function parseAttachments(attachments) {
  if (typeof attachments === 'string') {
    try {
      return JSON.parse(attachments);
    } catch (e) {
      return [];
    }
  }
  return attachments || [];
}

function parseEmbeds(embeds) {
  if (typeof embeds === 'string') {
    try {
      return JSON.parse(embeds);
    } catch (e) {
      return [];
    }
  }
  return embeds || [];
}

function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Lifecycle
let refreshInterval;
onMounted(async () => {
  await loadChannels();

  refreshInterval = setInterval(() => {
    if (selectedChannel.value) {
      loadMessages();
    }
  }, 10000); // Refresh every 10 seconds
});

onBeforeUnmount(() => {
  if (refreshInterval) clearInterval(refreshInterval);
});
</script>

<style scoped>
/* Reuse styles from WhatsApp component with adaptations */
.social-messages {
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
  margin-bottom: 1rem;
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

.header-stats {
  display: flex;
  gap: 0.75rem;
}

.platform-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: white;
}

.platform-discord { background: #5865f2; }
.platform-slack { background: #4a154b; }
.platform-teams { background: #6264a7; }
.platform-telegram { background: #0088cc; }

.platform-icon {
  width: 1rem;
  height: 1rem;
}

.platform-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
}

.platform-tab {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: 1px solid #e2e8f0;
  background: white;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  white-space: nowrap;
  transition: all 0.2s;
}

.platform-tab:hover {
  background: #f7fafc;
}

.platform-tab.active {
  background: #4f46e5;
  color: white;
  border-color: #4f46e5;
}

.messages-container {
  flex: 1;
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 0;
  background: white;
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.channels-sidebar {
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.search-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.channels-list {
  flex: 1;
  overflow-y: auto;
}

.channel-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid #f3f4f6;
  transition: background 0.2s;
}

.channel-item:hover {
  background: #f9fafb;
}

.channel-item.active {
  background: #eef2ff;
  border-left: 3px solid #4f46e5;
}

.channel-platform-icon {
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
}

.channel-info {
  flex: 1;
  min-width: 0;
}

.channel-name {
  font-weight: 600;
  color: #1f2937;
  font-size: 0.875rem;
}

.channel-meta {
  font-size: 0.75rem;
  color: #9ca3af;
}

.chat-area {
  display: flex;
  flex-direction: column;
}

.no-channel-selected {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.empty-icon {
  width: 5rem;
  height: 5rem;
  color: #cbd5e0;
  margin-bottom: 1rem;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-header {
  background: #f9fafb;
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.channel-header-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.platform-icon-lg {
  width: 2rem;
  height: 2rem;
}

.channel-name-header {
  font-weight: 600;
  color: #1f2937;
  font-size: 1rem;
}

.channel-platform {
  font-size: 0.875rem;
  color: #6b7280;
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  background: white;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.message {
  display: flex;
  gap: 0.75rem;
}

.message.outbound {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.message-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder-sm {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: 600;
  font-size: 0.75rem;
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-author {
  font-weight: 600;
  font-size: 0.875rem;
  color: #1f2937;
  margin-bottom: 0.25rem;
}

.message-bubble {
  background: #f3f4f6;
  padding: 0.75rem;
  border-radius: 0.5rem;
  max-width: 70%;
}

.message.outbound .message-bubble {
  background: #dbeafe;
  margin-left: auto;
}

.message-text {
  color: #1f2937;
  line-height: 1.5;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.message-attachments,
.message-embeds {
  margin-top: 0.5rem;
}

.attachment,
.embed {
  background: white;
  padding: 0.5rem;
  border-radius: 0.375rem;
  border: 1px solid #e5e7eb;
  margin-top: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.attachment-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: #6b7280;
}

.embed-title {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.embed-description {
  font-size: 0.875rem;
  color: #6b7280;
}

.message-footer {
  margin-top: 0.25rem;
  display: flex;
  justify-content: flex-end;
}

.message-time {
  font-size: 0.75rem;
  color: #9ca3af;
}

.message-input-area {
  padding: 1rem;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
  display: flex;
  gap: 0.75rem;
}

.message-input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  resize: none;
  font-family: inherit;
  max-height: 120px;
}

.btn-send {
  background: #4f46e5;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 0.375rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.btn-send:hover:not(:disabled) {
  background: #4338ca;
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon {
  background: transparent;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  color: #6b7280;
  border-radius: 0.375rem;
}

.btn-icon:hover {
  background: #f3f4f6;
}

.icon {
  width: 1.25rem;
  height: 1.25rem;
}

.spinner,
.spinner-sm {
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top-color: #4f46e5;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.spinner {
  width: 2rem;
  height: 2rem;
}

.spinner-sm {
  width: 1rem;
  height: 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-state-sm,
.empty-state-sm {
  text-align: center;
  padding: 2rem 1rem;
  color: #9ca3af;
  font-size: 0.875rem;
}

.loading-messages,
.empty-messages {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  color: #9ca3af;
}
</style>
