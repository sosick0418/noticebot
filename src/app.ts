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
import { ExecutionEngine, BinanceOrderClient } from './execution/index.js';
import type { KlineInterval } from './consumers/types.js';

export class App {
  private marketDataConsumer: MarketDataConsumer;
  private strategyEngine: StrategyEngine;
  private notificationService: NotificationService;
  private executionEngine: ExecutionEngine;
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

    // Initialize Execution Engine
    const binanceClient = new BinanceOrderClient({
      apiKey: config.binance.apiKey,
      apiSecret: config.binance.apiSecret,
      testnet: config.binance.testnet,
    });

    this.executionEngine = new ExecutionEngine(
      {
        enabled: config.execution.enabled,
        testnet: config.binance.testnet,
        symbol: config.trading.symbol,
        leverage: config.execution.leverage,
        positionSizePercent: config.execution.positionSizePercent,
        takeProfitPercent: config.execution.takeProfitPercent,
        stopLossPercent: config.execution.stopLossPercent,
        maxPositionSizeUsdt: config.execution.maxPositionSizeUsdt,
        minPositionSizeUsdt: config.execution.minPositionSizeUsdt,
        retryAttempts: config.execution.retryAttempts,
        retryDelayMs: config.execution.retryDelayMs,
      },
      binanceClient
    );

    this.setupEventPipeline();
  }

  /**
   * Setup the event-driven pipeline connecting all modules
   * Flow: Market Data → Strategy Engine → Notification/Execution
   */
  private setupEventPipeline(): void {
    this.setupDataFlowEvents();
    this.setupErrorHandlers();
    this.setupConnectionEvents();
    this.setupModuleEvents();
  }

  private setupDataFlowEvents(): void {
    // Market Data Consumer → Strategy Engine
    this.marketDataConsumer.on('candleClosed', (event) => {
      this.strategyEngine.processCandle(event);
    });

    // Strategy Engine → Notification Service + Execution Engine (parallel)
    this.strategyEngine.on('signalDetected', async (signal) => {
      await Promise.all([
        this.notificationService.processSignal(signal),
        this.executionEngine.processSignal(signal),
      ]);
    });
  }

  private setupErrorHandlers(): void {
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

    this.executionEngine.on('error', (error) => {
      logger.error('Execution Engine error', { error: error.message });
    });
  }

  private setupConnectionEvents(): void {
    this.marketDataConsumer.on('connected', () => {
      logger.info('WebSocket connected to Binance');
    });

    this.marketDataConsumer.on('disconnected', () => {
      logger.warn('WebSocket disconnected from Binance');
    });

    this.marketDataConsumer.on('reconnecting', () => {
      logger.info('WebSocket reconnecting to Binance...');
    });
  }

  private setupModuleEvents(): void {
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

    // Execution events
    this.executionEngine.on('orderExecuted', (result) => {
      logger.info('Order executed successfully', {
        type: result.signal.type,
        symbol: result.signal.symbol,
        orderId: result.entryOrder.orderId,
        price: result.entryOrder.avgPrice,
      });
    });

    this.executionEngine.on('orderFailed', (signal, reason) => {
      logger.warn('Order execution failed', {
        type: signal.type,
        symbol: signal.symbol,
        reason,
      });
    });

    this.executionEngine.on('leverageSet', (symbol, leverage) => {
      logger.info('Leverage configured', { symbol, leverage });
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
      executionEnabled: config.execution.enabled,
    });

    // Verify Telegram connection
    const telegramOk = await this.notificationService.verifyConnection();
    if (!telegramOk) {
      throw new Error('Failed to verify Telegram connection');
    }

    // Initialize Execution Engine (if enabled)
    if (config.execution.enabled) {
      const executionReady = await this.executionEngine.initialize();
      if (!executionReady) {
        logger.warn('Execution Engine failed to initialize, continuing without auto-trading');
      }
    } else {
      logger.info('Execution Engine is disabled (EXECUTION_ENABLED=false)');
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
    execution: { ready: boolean; enabled: boolean };
  } {
    return {
      isRunning: this.isRunning,
      isConnected: this.marketDataConsumer.getConnectionStatus(),
      bufferLength: this.strategyEngine.getBufferLength(),
      execution: this.executionEngine.getStatus(),
    };
  }
}
