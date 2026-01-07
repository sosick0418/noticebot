/**
 * Types for Notification Service
 */

/**
 * Configuration for Notification Service
 */
export interface NotificationServiceConfig {
  botToken: string;
  chatId: string;
  retryAttempts: number;
  retryDelayMs: number;
}

/**
 * Debounce state for tracking sent notifications
 */
export interface DebounceState {
  lastTimestamp: number;
  lastType: 'LONG' | 'SHORT' | null;
}

/**
 * Message queue item for rate limiting
 */
export interface QueuedMessage {
  text: string;
  priority: 'normal' | 'high';
  timestamp: number;
}
