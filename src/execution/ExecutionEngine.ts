/**
 * Execution Engine
 *
 * Orchestrates the order execution flow:
 * Signal → Validation → Position Sizing → Order Execution → TP/SL Setup
 *
 * Based on: ADR-006-Execution-Engine
 */

import EventEmitter from 'eventemitter3';
import { logger } from '../logger.js';
import type { TradingSignal } from '../types.js';
import type {
  ExecutionEngineConfig,
  ExecutionEvents,
  ExecutionResult,
} from './types.js';
import { BinanceOrderClient } from './BinanceOrderClient.js';
import { PositionSizer } from './PositionSizer.js';
import { OrderValidator } from './OrderValidator.js';

export class ExecutionEngine extends EventEmitter<ExecutionEvents> {
  private readonly config: ExecutionEngineConfig;
  private readonly client: BinanceOrderClient;
  private readonly sizer: PositionSizer;
  private readonly validator: OrderValidator;
  private isReady: boolean = false;

  constructor(config: ExecutionEngineConfig, client: BinanceOrderClient) {
    super();
    this.config = config;
    this.client = client;
    this.sizer = new PositionSizer(config);
    this.validator = new OrderValidator();

    logger.info('Execution Engine initialized', {
      enabled: config.enabled,
      testnet: config.testnet,
      leverage: config.leverage,
      positionSizePercent: config.positionSizePercent,
      takeProfitPercent: config.takeProfitPercent,
      stopLossPercent: config.stopLossPercent,
    });
  }

  /**
   * Initialize engine: verify connection and set leverage
   */
  async initialize(): Promise<boolean> {
    if (!this.config.enabled) {
      logger.warn('Execution Engine is disabled');
      return false;
    }

    try {
      // Verify API connection
      const connected = await this.client.verifyConnection();
      if (!connected) {
        throw new Error('Failed to connect to Binance API');
      }

      // Set leverage
      const leverageSet = await this.client.setLeverage(
        this.config.symbol,
        this.config.leverage
      );
      if (leverageSet) {
        this.emit('leverageSet', this.config.symbol, this.config.leverage);
      }

      this.isReady = true;
      logger.info('Execution Engine ready');
      return true;
    } catch (error) {
      logger.error('Execution Engine initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.emit(
        'error',
        error instanceof Error ? error : new Error(String(error))
      );
      return false;
    }
  }

  /**
   * Process trading signal and execute orders
   * This is the main entry point from Strategy Engine
   */
  async processSignal(signal: TradingSignal): Promise<void> {
    // Guard: Engine not ready or disabled
    if (!this.isReady || !this.config.enabled) {
      logger.debug('Execution Engine not ready, skipping signal');
      return;
    }

    const executionId = `${signal.symbol}-${signal.timestamp}-${signal.type}`;
    logger.info('Processing signal for execution', { executionId, signal });

    try {
      // Step 1: Get current state (parallel requests)
      const [balance, position, symbolInfo, markPrice] = await Promise.all([
        this.client.getBalance('USDT'),
        this.client.getPosition(signal.symbol),
        this.client.getSymbolInfo(signal.symbol),
        this.client.getMarkPrice(signal.symbol),
      ]);

      // Step 2: Calculate position size
      const positionSize = this.sizer.calculatePositionSize(
        balance,
        markPrice,
        symbolInfo
      );

      // Step 3: Validate
      const validation = this.validator.validate(
        signal,
        position,
        positionSize,
        symbolInfo
      );

      if (!validation.valid) {
        logger.warn('Order validation failed', {
          executionId,
          errors: validation.errors,
        });
        this.emit('orderFailed', signal, validation.errors.join(', '));
        return;
      }

      if (validation.warnings.length > 0) {
        logger.warn('Order validation warnings', {
          executionId,
          warnings: validation.warnings,
        });
      }

      // Step 4: Execute entry order
      const isLong = signal.type === 'LONG';
      const entrySide = isLong ? 'BUY' : 'SELL';
      const entryOrder = await this.executeWithRetry(async () => {
        return this.client.submitMarketOrder({
          symbol: signal.symbol,
          side: entrySide,
          type: 'MARKET',
          quantity: positionSize.quantity,
          signal,
        });
      });

      if (!entryOrder.success) {
        logger.error('Entry order failed', {
          executionId,
          error: entryOrder.error,
        });
        this.emit('orderFailed', signal, entryOrder.error || 'Entry order failed');
        return;
      }

      // Step 5: Calculate and place TP/SL orders
      const entryPrice = entryOrder.avgPrice!;
      const tpPrice = this.sizer.calculateTakeProfit(entryPrice, signal.type);
      const slPrice = this.sizer.calculateStopLoss(entryPrice, signal.type);
      const exitSide = signal.type === 'LONG' ? 'SELL' : 'BUY';

      const [tpOrder, slOrder] = await Promise.all([
        this.client.submitTakeProfitOrder({
          symbol: signal.symbol,
          side: exitSide,
          type: 'TAKE_PROFIT_MARKET',
          stopPrice: this.sizer.adjustPricePrecision(tpPrice, symbolInfo),
          closePosition: true,
        }),
        this.client.submitStopLossOrder({
          symbol: signal.symbol,
          side: exitSide,
          type: 'STOP_MARKET',
          stopPrice: this.sizer.adjustPricePrecision(slPrice, symbolInfo),
          closePosition: true,
        }),
      ]);

      // Step 6: Record execution and emit result
      this.validator.recordExecution(signal);

      const result: ExecutionResult = {
        signal,
        entryOrder,
        takeProfitOrder: tpOrder,
        stopLossOrder: slOrder,
        timestamp: Date.now(),
      };

      logger.info('Order execution completed', {
        executionId,
        entryOrderId: entryOrder.orderId,
        entryPrice,
        tpPrice: this.sizer.adjustPricePrecision(tpPrice, symbolInfo),
        slPrice: this.sizer.adjustPricePrecision(slPrice, symbolInfo),
        quantity: positionSize.quantity,
      });

      this.emit('orderExecuted', result);
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      logger.error('Execution Engine error', {
        executionId,
        error: normalizedError.message,
      });
      this.emit('orderFailed', signal, normalizedError.message);
      this.emit('error', normalizedError);
    }
  }

  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    attempts: number = this.config.retryAttempts
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 1; i <= attempts; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`Operation failed, attempt ${i}/${attempts}`, {
          error: lastError.message,
        });

        if (i < attempts) {
          await this.sleep(this.config.retryDelayMs * i);
        }
      }
    }

    throw lastError;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get execution status
   */
  getStatus(): { ready: boolean; enabled: boolean } {
    return {
      ready: this.isReady,
      enabled: this.config.enabled,
    };
  }

  /**
   * Reset engine state
   */
  reset(): void {
    this.validator.reset();
    logger.info('Execution Engine state reset');
  }
}
