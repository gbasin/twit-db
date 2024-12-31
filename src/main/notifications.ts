import { Notification } from 'electron';
import Store from 'electron-store';

const store = new Store();

interface NotificationOptions {
  title: string;
  body: string;
  silent?: boolean;
  urgency?: 'normal' | 'critical';
}

export function showNotification(options: NotificationOptions) {
  // Check if notifications are enabled in settings
  const notificationsEnabled = store.get('settings.notifications.enabled', true);
  if (!notificationsEnabled) return;

  // Check if this specific type of notification is enabled
  const urgencyEnabled = store.get(
    `settings.notifications.${options.urgency || 'normal'}`,
    true
  );
  if (!urgencyEnabled) return;

  // Create and show the notification
  const notification = new Notification({
    title: options.title,
    body: options.body,
    silent: options.silent,
  });

  notification.show();
}

// Convenience methods for different types of notifications
export const notify = {
  collection: {
    started: () => showNotification({
      title: 'Collection Started',
      body: 'Tweet collection process has started',
      urgency: 'normal',
    }),
    
    completed: (count: number) => showNotification({
      title: 'Collection Complete',
      body: `Successfully collected ${count} new tweets`,
      urgency: 'normal',
    }),
    
    error: (error: string) => showNotification({
      title: 'Collection Error',
      body: `Failed to collect tweets: ${error}`,
      urgency: 'critical',
    }),
  },
  
  search: {
    error: (error: string) => showNotification({
      title: 'Search Error',
      body: `Failed to search tweets: ${error}`,
      urgency: 'normal',
    }),
  },
  
  storage: {
    spaceWarning: (available: string) => showNotification({
      title: 'Storage Warning',
      body: `Running low on storage space. ${available} remaining.`,
      urgency: 'critical',
    }),
  },
}; 