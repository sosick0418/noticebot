/**
 * Telegram Client
 *
 * Handles communication with Telegram Bot API.
 * Includes retry logic and rate limit handling.
 *
 * Based on: ADR-004-Rate Limit Policy, ADR-005-Security
 */

import TelegramBot from 'node-telegram-bot-api';
import { logger, maskSecret } from '../logger.js';

export interface TelegramClientConfig {
  botToken: string;
  chatId: string;
  retryAttempts: number;
  retryDelayMs: number;
}

export class TelegramClient {
  private bot: TelegramBot;
  private chatId: string;
  private retryAttempts: number;
  private retryDelayMs: number;

  constructor(config: TelegramClientConfig) {
    this.bot = new TelegramBot(config.botToken);
    this.chatId = config.chatId;
    this.retryAttempts = config.retryAttempts;
    this.retryDelayMs = config.retryDelayMs;

    logger.info('Telegram client initialized', {
      chatId: maskSecret(config.chatId),
    });
  }

  /**
   * Send a message with retry logic
   * Returns true if message was sent successfully
   */
  public async sendMessage(
    text: string,
    parseMode: 'Markdown' | 'HTML' = 'Markdown'
  ): Promise<boolean> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        await this.bot.sendMessage(this.chatId, text, {
          parse_mode: parseMode,
          disable_web_page_preview: true,
        });

        logger.debug('Telegram message sent successfully', { attempt });
        return true;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if it's a rate limit error
        if (this.isRateLimitError(error)) {
          const waitTime = this.extractRetryAfter(error) || this.retryDelayMs * attempt;
          logger.warn('Telegram rate limit hit, waiting...', {
            attempt,
            waitTime,
          });
          await this.sleep(waitTime);
        } else if (attempt < this.retryAttempts) {
          logger.warn('Telegram send failed, retrying...', {
            attempt,
            error: lastError.message,
          });
          await this.sleep(this.retryDelayMs * attempt);
        }
      }
    }

    logger.error('Failed to send Telegram message after all retries', {
      error: lastError?.message,
    });
    return false;
  }

  /**
   * Verify the bot token and chat ID are valid
   */
  public async verifyConnection(): Promise<boolean> {
    try {
      const me = await this.bot.getMe();
      logger.info('Telegram bot verified', {
        username: me.username,
      });
      return true;
    } catch (error) {
      logger.error('Failed to verify Telegram bot', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Check if error is a rate limit (429) error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as { response?: { statusCode?: number } }).response;
      return response?.statusCode === 429;
    }
    return false;
  }

  /**
   * Extract retry_after value from rate limit error
   */
  private extractRetryAfter(error: unknown): number | null {
    try {
      if (error && typeof error === 'object' && 'response' in error) {
        const response = (error as { response?: { body?: { parameters?: { retry_after?: number } } } }).response;
        const retryAfter = response?.body?.parameters?.retry_after;
        if (retryAfter) {
          return retryAfter * 1000; // Convert to milliseconds
        }
      }
    } catch {
      // Ignore parsing errors
    }
    return null;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
