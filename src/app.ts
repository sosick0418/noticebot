/**
 * Application
 *
 * Main application that orchestrates all modules:
 * Market Data Consumer → Strategy Engine → Notification Service
 *
 * Based on: 20_System_Design/System_Architecture
 */

import { logger } from './logger.js';
import { config } from './config.js';
import { MarketDataConsumer } from './consumers/index.js';
import { StrategyEngine } from './strategy/index.js';
import { NotificationService } from './notification/index.js';
import type { KlineInterval } from './consumers/types.js';

export class App {
  private marketDataConsumer: MarketDataConsumer;
  private strategyEngine: StrategyEngine;
  private notificationService: NotificationService;
  private isRunning = false;

  constructor() {
    // Initialize Market Data Consumer
    this.marketDataConsumer = new MarketDataConsumer({
      symbol: config.trading.symbol,
      interval: config.trading.interval as KlineInterval,
      testnet: config.binance.testnet,
      watchdogTimeoutMs: config.watchdog.timeoutSeconds * 1000,
    });

    // Initialize Strategy Engine
    this.strategyEngine = new StrategyEngine({
      symbol: config.trading.symbol,
      bollingerPeriod: config.bollingerBands.period,
      bollingerStdDev: config.bollingerBands.stdDev,
      bandwidthThreshold: config.volatilityFilter.bandwidthThreshold,
    });

    // Initialize Notification Service
    this.notificationService = new NotificationService({
      botToken: config.telegram.botToken,
      chatId: config.telegram.chatId,
      retryAttempts: 3,
      retryDelayMs: 1000,
    });

    this.setupEventPipeline();
  }

  /**
   * Setup the event-driven pipeline connecting all modules
   * Flow: Market Data → Strategy Engine → Notification Service
   */
  private setupEventPipeline(): void {
    // Market Data Consumer → Strategy Engine
    this.marketDataConsumer.on('candleClosed', (event) => {
      this.strategyEngine.processCandle(event);
    });

    // Strategy Engine → Notification Service
    this.strategyEngine.on('signalDetected', async (signal) => {
      await this.notificationService.processSignal(signal);
    });

    // Error handling
    this.marketDataConsumer.on('error', (error) => {
      logger.error('Market Data Consumer error', { error: error.message });
      this.handleFatalError('MarketDataConsumer', error.message);
    });

    this.strategyEngine.on('error', (error) => {
      logger.error('Strategy Engine error', { error: error.message });
    });

    this.notificationService.on('error', (error) => {
      logger.error('Notification Service error', { error: error.message });
    });

    // Connection status logging
    this.marketDataConsumer.on('connected', () => {
      logger.info('WebSocket connected to Binance');
    });

    this.marketDataConsumer.on('disconnected', () => {
      logger.warn('WebSocket disconnected from Binance');
    });

    this.marketDataConsumer.on('reconnecting', () => {
      logger.info('WebSocket reconnecting to Binance...');
    });

    // Notification events
    this.notificationService.on('sent', (signal) => {
      logger.info('Notification sent successfully', {
        type: signal.type,
        symbol: signal.symbol,
      });
    });

    this.notificationService.on('skipped', (reason, signal) => {
      logger.debug('Notification skipped', {
        reason,
        type: signal.type,
        symbol: signal.symbol,
      });
    });
  }

  /**
   * Start the application
   */
  public async start(): Promise<void> {
    logger.info('Starting Binance Bollinger Notice Bot', {
      symbol: config.trading.symbol,
      interval: config.trading.interval,
      testnet: config.binance.testnet,
    });

    // Verify Telegram connection
    const telegramOk = await this.notificationService.verifyConnection();
    if (!telegramOk) {
      throw new Error('Failed to verify Telegram connection');
    }

    // Send startup notification
    await this.notificationService.sendStartupNotification(
      config.trading.symbol,
      config.trading.interval,
      config.binance.testnet
    );

    // Start market data consumer
    this.marketDataConsumer.start();

    this.isRunning = true;

    logger.info('Bot started successfully');
  }

  /**
   * Stop the application gracefully
   */
  public async stop(reason: string = 'Manual shutdown'): Promise<void> {
    if (!this.isRunning) return;

    logger.info('Stopping Binance Bollinger Notice Bot', { reason });

    this.isRunning = false;

    // Stop market data consumer
    this.marketDataConsumer.stop();

    // Send shutdown notification
    await this.notificationService.sendShutdownNotification(reason);

    logger.info('Bot stopped successfully');
  }

  /**
   * Handle fatal errors
   */
  private async handleFatalError(source: string, message: string): Promise<void> {
    try {
      await this.notificationService.sendErrorNotification(source, message);
    } catch (error) {
      logger.error('Failed to send error notification', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if the application is running
   */
  public getStatus(): {
    isRunning: boolean;
    isConnected: boolean;
    bufferLength: number;
  } {
    return {
      isRunning: this.isRunning,
      isConnected: this.marketDataConsumer.getConnectionStatus(),
      bufferLength: this.strategyEngine.getBufferLength(),
    };
  }
}
