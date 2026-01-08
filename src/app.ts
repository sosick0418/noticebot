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
import { DashboardServer } from './dashboard/index.js';
import { PositionManager } from './position/index.js';
import { RiskManager } from './risk/index.js';
import type { KlineInterval } from './consumers/types.js';

export class App {
  private marketDataConsumer: MarketDataConsumer;
  private strategyEngine: StrategyEngine;
  private notificationService: NotificationService;
  private executionEngine: ExecutionEngine;
  private positionManager: PositionManager;
  private riskManager: RiskManager;
  private dashboard: DashboardServer;
  private binanceClient: BinanceOrderClient;
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

    // Initialize Binance Client (shared)
    this.binanceClient = new BinanceOrderClient({
      apiKey: config.binance.apiKey,
      apiSecret: config.binance.apiSecret,
      testnet: config.binance.testnet,
    });

    // Initialize Execution Engine
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
      this.binanceClient
    );

    // Initialize Position Manager
    this.positionManager = new PositionManager(
      {
        enabled: config.position.enabled,
        symbol: config.trading.symbol,
        pollIntervalMs: config.position.pollIntervalMs,
        testnet: config.binance.testnet,
      },
      this.binanceClient
    );

    // Initialize Risk Manager
    this.riskManager = new RiskManager(
      {
        enabled: config.risk.enabled,
        symbol: config.trading.symbol,
        dailyLossLimitUsdt: config.risk.dailyLossLimitUsdt,
        maxDrawdownPercent: config.risk.maxDrawdownPercent,
        autoCloseOnBreach: config.risk.autoCloseOnBreach,
        checkIntervalMs: config.risk.checkIntervalMs,
      },
      this.binanceClient
    );

    // Initialize Dashboard Server
    this.dashboard = new DashboardServer({
      enabled: config.dashboard.enabled,
      port: config.dashboard.port,
      host: config.dashboard.host,
    });

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
    this.setupDashboardEvents();
    this.setupPositionEvents();
    this.setupRiskEvents();
  }

  private setupDataFlowEvents(): void {
    // Market Data Consumer → Strategy Engine
    this.marketDataConsumer.on('candleClosed', (event) => {
      this.strategyEngine.processCandle(event);
    });

    // Strategy Engine → Notification Service + Execution Engine (parallel)
    // Risk check gates execution but not notification
    this.strategyEngine.on('signalDetected', async (signal) => {
      // Always send notification
      const notificationPromise = this.notificationService.processSignal(signal);

      // Only execute if risk allows
      let executionPromise: Promise<void> = Promise.resolve();
      if (this.riskManager.isTradingAllowed()) {
        executionPromise = this.executionEngine.processSignal(signal);
      } else {
        logger.warn('Signal execution blocked by risk manager', {
          type: signal.type,
          symbol: signal.symbol,
        });
      }

      await Promise.all([notificationPromise, executionPromise]);
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

  private setupDashboardEvents(): void {
    // Forward candle data to dashboard
    this.marketDataConsumer.on('candleClosed', (event) => {
      this.dashboard.updateCandle({
        time: event.closeTime,
        open: event.closePrice, // We only have close price from this event
        high: event.closePrice,
        low: event.closePrice,
        close: event.closePrice,
      });
    });

    // Forward Bollinger Bands data to dashboard
    this.strategyEngine.on('signalDetected', (signal) => {
      this.dashboard.updateBollingerBands({
        time: signal.timestamp,
        upper: signal.type === 'SHORT' ? signal.bandValue : signal.middleBand + (signal.middleBand - signal.bandValue),
        middle: signal.middleBand,
        lower: signal.type === 'LONG' ? signal.bandValue : signal.middleBand - (signal.middleBand - signal.bandValue),
      });

      this.dashboard.addSignal({
        type: signal.type,
        symbol: signal.symbol,
        price: signal.closePrice,
        timestamp: signal.timestamp,
        executed: config.execution.enabled,
      });
    });

    // Forward connection status to dashboard
    this.marketDataConsumer.on('connected', () => {
      this.dashboard.updateStatus({ isConnected: true });
    });

    this.marketDataConsumer.on('disconnected', () => {
      this.dashboard.updateStatus({ isConnected: false });
    });

    // Forward execution events to dashboard
    this.executionEngine.on('orderExecuted', (result) => {
      if (result.entryOrder.avgPrice) {
        this.dashboard.updatePosition({
          symbol: result.signal.symbol,
          side: result.signal.type,
          size: result.entryOrder.executedQty || 0,
          entryPrice: result.entryOrder.avgPrice,
          markPrice: result.entryOrder.avgPrice,
          unrealizedPnl: 0,
          unrealizedPnlPercent: 0,
          leverage: config.execution.leverage,
        });
      }
    });
  }

  private setupPositionEvents(): void {
    // Position changes → Dashboard
    this.positionManager.on('positionChanged', (change) => {
      if (change.current) {
        this.dashboard.updatePosition({
          symbol: change.current.symbol,
          side: change.current.side,
          size: change.current.size,
          entryPrice: change.current.entryPrice,
          markPrice: change.current.markPrice,
          unrealizedPnl: change.current.unrealizedPnl,
          unrealizedPnlPercent: change.current.roe,
          leverage: change.current.leverage,
        });
      } else {
        this.dashboard.updatePosition(null);
      }

      logger.info('Position changed', {
        type: change.changeType,
        side: change.current?.side,
        size: change.current?.size,
      });
    });

    // Account updates → Dashboard
    this.positionManager.on('accountUpdated', (account) => {
      this.dashboard.updateAccount({
        balance: account.totalBalance,
        available: account.availableBalance,
        totalPnl: account.totalUnrealizedPnl,
      });
    });

    // Error handling
    this.positionManager.on('error', (error) => {
      logger.error('Position Manager error', { error: error.message });
    });
  }

  private setupRiskEvents(): void {
    // Risk breach → Notification + Dashboard
    this.riskManager.on('riskBreach', async (breach) => {
      logger.warn('Risk breach detected', {
        type: breach.type,
        currentValue: breach.currentValue,
        threshold: breach.threshold,
        autoCloseTriggered: breach.autoCloseTriggered,
      });

      // Send Telegram notification for risk breach
      const breachMessage =
        breach.type === 'daily_loss'
          ? `Daily loss limit breached: -$${breach.currentValue.toFixed(2)} (limit: $${breach.threshold})`
          : `Max drawdown breached: ${breach.currentValue.toFixed(2)}% (limit: ${breach.threshold}%)`;

      await this.notificationService.sendErrorNotification('RiskManager', breachMessage);
    });

    // Trading blocked/resumed → Dashboard
    this.riskManager.on('tradingBlocked', (reason) => {
      logger.warn('Trading blocked by risk manager', { reason });
      this.dashboard.updateStatus({ tradingBlocked: true, tradingBlockedReason: reason });
    });

    this.riskManager.on('tradingResumed', () => {
      logger.info('Trading resumed by risk manager');
      this.dashboard.updateStatus({ tradingBlocked: false, tradingBlockedReason: undefined });
    });

    // Risk status updates → Dashboard
    this.riskManager.on('statusChanged', (status) => {
      this.dashboard.updateRisk({
        dailyPnl: status.dailyPnl,
        dailyLossRemaining: status.dailyLossRemaining,
        currentDrawdown: status.currentDrawdown,
        isTradingAllowed: status.isTradingAllowed,
      });
    });

    // Error handling
    this.riskManager.on('error', (error) => {
      logger.error('Risk Manager error', { error: error.message });
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
      dashboardEnabled: config.dashboard.enabled,
    });

    // Start Dashboard Server
    await this.dashboard.start();
    this.dashboard.updateStatus({
      isRunning: false,
      executionEnabled: config.execution.enabled,
      executionReady: false,
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
      this.dashboard.updateStatus({ executionReady });
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

    // Start position manager
    this.positionManager.start();

    // Start risk manager
    await this.riskManager.start();

    this.isRunning = true;
    this.dashboard.updateStatus({ isRunning: true });

    logger.info('Bot started successfully');
  }

  /**
   * Stop the application gracefully
   */
  public async stop(reason: string = 'Manual shutdown'): Promise<void> {
    if (!this.isRunning) return;

    logger.info('Stopping Binance Bollinger Notice Bot', { reason });

    this.isRunning = false;
    this.dashboard.updateStatus({ isRunning: false });

    // Stop market data consumer
    this.marketDataConsumer.stop();

    // Stop position manager
    this.positionManager.stop();

    // Stop risk manager
    this.riskManager.stop();

    // Send shutdown notification
    await this.notificationService.sendShutdownNotification(reason);

    // Stop dashboard server
    await this.dashboard.stop();

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
    dashboardClients: number;
  } {
    return {
      isRunning: this.isRunning,
      isConnected: this.marketDataConsumer.getConnectionStatus(),
      bufferLength: this.strategyEngine.getBufferLength(),
      execution: this.executionEngine.getStatus(),
      dashboardClients: this.dashboard.getConnectionCount(),
    };
  }
}
