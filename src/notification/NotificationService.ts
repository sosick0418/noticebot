/**
 * Notification Service
 *
 * Output layer that handles trading signal notifications
 * with debounce control and rate limiting.
 *
 * Based on:
 * - ADR-004-Notification Debounce & Rate Limit Policy
 * - ADR-005-Security & API Key Management Policy
 */

import EventEmitter from 'eventemitter3';
import { logger } from '../logger.js';
import type {
  TradingSignal,
  ErrorNotification,
  SignalType,
} from '../types.js';
import type { NotificationServiceConfig, DebounceState } from './types.js';
import { TelegramClient } from './TelegramClient.js';
import {
  formatSignalMessage,
  formatErrorMessage,
  formatStartupMessage,
  formatShutdownMessage,
} from './formatter.js';

interface NotificationEventTypes {
  sent: [TradingSignal];
  skipped: [string, TradingSignal];
  error: [Error];
}

export class NotificationService extends EventEmitter<NotificationEventTypes> {
  private client: TelegramClient;
  private debounceState: DebounceState = {
    lastTimestamp: 0,
    lastType: null,
  };

  constructor(config: NotificationServiceConfig) {
    super();

    this.client = new TelegramClient({
      botToken: config.botToken,
      chatId: config.chatId,
      retryAttempts: config.retryAttempts,
      retryDelayMs: config.retryDelayMs,
    });

    logger.info('Notification Service initialized');
  }

  /**
   * Verify Telegram connection on startup
   */
  public async verifyConnection(): Promise<boolean> {
    return this.client.verifyConnection();
  }

  /**
   * Process a trading signal and send notification if not debounced
   * This is the main entry point from Strategy Engine
   */
  public async processSignal(signal: TradingSignal): Promise<void> {
    // Check debounce condition
    // ADR-004: Candle-based Debounce
    if (this.shouldDebounce(signal)) {
      logger.debug('Signal debounced', {
        timestamp: signal.timestamp,
        type: signal.type,
        reason: 'Same candle, same type',
      });
      this.emit('skipped', 'debounced', signal);
      return;
    }

    // Update debounce state
    this.updateDebounceState(signal.timestamp, signal.type);

    // Format and send message
    const message = formatSignalMessage(signal);
    const success = await this.client.sendMessage(message);

    if (success) {
      logger.info('Signal notification sent', {
        type: signal.type,
        symbol: signal.symbol,
      });
      this.emit('sent', signal);
    } else {
      logger.error('Failed to send signal notification', {
        type: signal.type,
        symbol: signal.symbol,
      });
      this.emit('error', new Error('Failed to send notification'));
    }
  }

  /**
   * Send startup notification
   */
  public async sendStartupNotification(
    symbol: string,
    interval: string,
    testnet: boolean
  ): Promise<boolean> {
    const message = formatStartupMessage(symbol, interval, testnet);
    return this.client.sendMessage(message);
  }

  /**
   * Send shutdown notification
   */
  public async sendShutdownNotification(reason: string): Promise<boolean> {
    const message = formatShutdownMessage(reason);
    return this.client.sendMessage(message);
  }

  /**
   * Send error notification
   * ADR-004: Fatal Error Notification - separate from signal notifications
   */
  public async sendErrorNotification(
    errorType: string,
    errorMessage: string
  ): Promise<boolean> {
    const notification: ErrorNotification = {
      errorType,
      message: errorMessage,
      timestamp: Date.now(),
    };

    const message = formatErrorMessage(notification);

    logger.warn('Sending error notification', { errorType, errorMessage });

    return this.client.sendMessage(message);
  }

  /**
   * Check if signal should be debounced
   * ADR-004: Candle-based Debounce Policy
   *
   * Rule: Same candle (timestamp) + Same type = Debounce
   */
  private shouldDebounce(signal: TradingSignal): boolean {
    return (
      signal.timestamp === this.debounceState.lastTimestamp &&
      signal.type === this.debounceState.lastType
    );
  }

  /**
   * Update debounce state after sending notification
   */
  private updateDebounceState(timestamp: number, type: SignalType): void {
    this.debounceState = {
      lastTimestamp: timestamp,
      lastType: type,
    };
  }

  /**
   * Reset debounce state
   * Used for testing or restart scenarios
   */
  public resetDebounceState(): void {
    this.debounceState = {
      lastTimestamp: 0,
      lastType: null,
    };
    logger.info('Notification Service debounce state reset');
  }
}
