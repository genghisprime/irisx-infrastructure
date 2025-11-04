/**
 * Firebase Composable
 *
 * Provides Firebase functionality to Vue components:
 * - FCM token registration
 * - Agent presence tracking
 * - Push notification handling
 */

import { ref, onUnmounted } from 'vue';
import { database, messaging, getToken, onMessage } from '../config/firebase';
import { ref as dbRef, set, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
import { useAuthStore } from '../stores/auth';
import axios from 'axios';

export function useFirebase() {
  const authStore = useAuthStore();
  const fcmToken = ref(null);
  const presenceStatus = ref('offline');
  const onlineAgents = ref([]);

  /**
   * Request FCM token and register with backend
   */
  async function requestNotificationPermission() {
    try {
      if (!messaging) {
        console.warn('[Firebase] Messaging not available');
        return null;
      }

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('[Firebase] Notification permission denied');
        return null;
      }

      // Get FCM token
      const token = await getToken(messaging, {
        vapidKey: 'YOUR_VAPID_KEY_HERE' // TODO: Add VAPID key from Firebase Console
      });

      fcmToken.value = token;
      console.log('[Firebase] FCM Token:', token);

      // Register token with backend
      await registerTokenWithBackend(token);

      return token;
    } catch (error) {
      console.error('[Firebase] Error getting FCM token:', error);
      return null;
    }
  }

  /**
   * Register FCM token with backend API
   */
  async function registerTokenWithBackend(token) {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://3.83.53.69:3000';

      await axios.post(
        `${API_URL}/v1/notifications/register-token`,
        { fcmToken: token },
        {
          headers: {
            'Authorization': `Bearer ${authStore.token}`
          }
        }
      );

      console.log('[Firebase] FCM token registered with backend');
    } catch (error) {
      console.error('[Firebase] Error registering FCM token:', error);
    }
  }

  /**
   * Update agent presence status
   */
  async function updatePresence(status) {
    try {
      if (!authStore.agent?.id) {
        console.warn('[Firebase] No agent ID available');
        return;
      }

      const agentId = authStore.agent.id;
      const API_URL = import.meta.env.VITE_API_URL || 'http://3.83.53.69:3000';

      // Update on backend
      await axios.post(
        `${API_URL}/v1/notifications/presence`,
        { status },
        {
          headers: {
            'Authorization': `Bearer ${authStore.token}`
          }
        }
      );

      // Update in Firebase Realtime Database
      const presenceRef = dbRef(database, `agents/${agentId}/presence`);
      await set(presenceRef, {
        status,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Setup disconnect handler
      if (status === 'online') {
        const disconnectRef = onDisconnect(presenceRef);
        await disconnectRef.set({
          status: 'offline',
          lastSeen: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      presenceStatus.value = status;
      console.log(`[Firebase] Presence updated: ${status}`);
    } catch (error) {
      console.error('[Firebase] Error updating presence:', error);
    }
  }

  /**
   * Watch agent's own presence
   */
  function watchPresence() {
    if (!authStore.agent?.id) return null;

    const agentId = authStore.agent.id;
    const presenceRef = dbRef(database, `agents/${agentId}/presence`);

    return onValue(presenceRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        presenceStatus.value = data.status;
      }
    });
  }

  /**
   * Watch all online agents
   */
  function watchOnlineAgents() {
    const agentsRef = dbRef(database, 'agents');

    return onValue(agentsRef, (snapshot) => {
      const agents = [];
      snapshot.forEach((childSnapshot) => {
        const data = childSnapshot.val();
        if (data.presence?.status === 'online') {
          agents.push({
            id: childSnapshot.key,
            ...data.presence
          });
        }
      });
      onlineAgents.value = agents;
    });
  }

  /**
   * Listen for push notifications
   */
  function listenForNotifications(callback) {
    if (!messaging) return null;

    return onMessage(messaging, (payload) => {
      console.log('[Firebase] Notification received:', payload);

      // Show browser notification
      if (Notification.permission === 'granted') {
        new Notification(payload.notification.title, {
          body: payload.notification.body,
          icon: '/logo.png',
          data: payload.data
        });
      }

      // Call callback if provided
      if (callback) {
        callback(payload);
      }
    });
  }

  /**
   * Initialize Firebase for agent
   */
  async function initialize() {
    try {
      if (!authStore.agent?.id) {
        console.warn('[Firebase] No agent logged in');
        return;
      }

      console.log('[Firebase] Initializing for agent:', authStore.agent.id);

      // Request notification permission and get FCM token
      await requestNotificationPermission();

      // Set agent as online
      await updatePresence('online');

      // Start watching presence
      const presenceUnsubscribe = watchPresence();
      const onlineAgentsUnsubscribe = watchOnlineAgents();

      // Listen for notifications
      const notificationUnsubscribe = listenForNotifications((payload) => {
        console.log('[Firebase] Received notification:', payload);
      });

      // Cleanup on unmount
      onUnmounted(() => {
        updatePresence('offline');
        if (presenceUnsubscribe) presenceUnsubscribe();
        if (onlineAgentsUnsubscribe) onlineAgentsUnsubscribe();
        if (notificationUnsubscribe) notificationUnsubscribe();
      });

      console.log('[Firebase] Initialization complete');
    } catch (error) {
      console.error('[Firebase] Initialization error:', error);
    }
  }

  return {
    fcmToken,
    presenceStatus,
    onlineAgents,
    initialize,
    updatePresence,
    requestNotificationPermission,
    listenForNotifications
  };
}
