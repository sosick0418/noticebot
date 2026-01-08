/**
 * Position Manager
 *
 * Real-time position tracking with periodic polling.
 * Emits events when position changes for dashboard updates.
 */

import EventEmitter from 'eventemitter3';
import { logger } from '../logger.js';
import type { BinanceOrderClient } from '../execution/BinanceOrderClient.js';
import type {
  PositionManagerConfig,
  PositionManagerEvents,
  ExtendedPosition,
  AccountSummary,
  PositionChange,
} from './types.js';

export class PositionManager extends EventEmitter<PositionManagerEvents> {
  /** Default maintenance margin rate for BTC (0.4%) */
  private static readonly DEFAULT_MAINTENANCE_MARGIN_RATE = 0.004;

  /** Minimum change threshold in USDT to trigger update events */
  private static readonly CHANGE_THRESHOLD_USDT = 0.01;

  private readonly config: PositionManagerConfig;
  private readonly client: BinanceOrderClient;
  private pollTimer: NodeJS.Timeout | null = null;
  private currentPosition: ExtendedPosition | null = null;
  private currentAccount: AccountSummary | null = null;
  private isRunning = false;

  constructor(config: PositionManagerConfig, client: BinanceOrderClient) {
    super();
    this.config = config;
    this.client = client;

    logger.info('Position Manager initialized', {
      symbol: config.symbol,
      pollIntervalMs: config.pollIntervalMs,
      enabled: config.enabled,
    });
  }

  /**
   * Start position tracking
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('Position Manager is disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('Position Manager already running');
      return;
    }

    this.isRunning = true;
    this.startPolling();
    logger.info('Position Manager started');
  }

  /**
   * Stop position tracking
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.stopPolling();
    logger.info('Position Manager stopped');
  }

  /**
   * Start periodic polling
   */
  private startPolling(): void {
    // Initial fetch
    this.fetchAndUpdate();

    // Set up interval
    this.pollTimer = setInterval(() => {
      this.fetchAndUpdate();
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Fetch position and account data, emit updates
   */
  private async fetchAndUpdate(): Promise<void> {
    try {
      const [position, balance, markPrice] = await Promise.all([
        this.client.getPosition(this.config.symbol),
        this.client.getBalance('USDT'),
        this.client.getMarkPrice(this.config.symbol),
      ]);

      // Build extended position
      const hasPosition = position.side !== 'NONE' && position.size > 0;
      const extendedPosition = hasPosition
        ? this.buildExtendedPosition(position, markPrice)
        : null;

      // Detect position change
      const change = this.detectPositionChange(extendedPosition);
      if (change.changeType !== 'none') {
        this.currentPosition = extendedPosition;
        this.emit('positionChanged', change);
      }

      // Build and emit account summary
      const accountSummary = this.buildAccountSummary(balance, extendedPosition);
      if (this.hasAccountChanged(accountSummary)) {
        this.currentAccount = accountSummary;
        this.emit('accountUpdated', accountSummary);
      }
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      logger.error('Position Manager fetch error', { error: normalizedError.message });
      this.emit('error', normalizedError);
    }
  }

  /**
   * Build extended position with calculated fields
   */
  private buildExtendedPosition(
    position: { symbol: string; side: 'LONG' | 'SHORT' | 'NONE'; size: number; entryPrice: number; unrealizedPnl: number; leverage: number },
    markPrice: number
  ): ExtendedPosition {
    const isLong = position.side === 'LONG';
    const notionalValue = position.size * markPrice;
    const margin = notionalValue / position.leverage;

    // Calculate ROE: (unrealizedPnl / margin) * 100
    const roe = margin > 0 ? (position.unrealizedPnl / margin) * 100 : 0;

    // Estimate liquidation price (simplified calculation)
    // For longs: entry * (1 - 1/leverage + maintenance margin rate)
    // For shorts: entry * (1 + 1/leverage - maintenance margin rate)
    const liquidationPrice = isLong
      ? position.entryPrice * (1 - 1 / position.leverage + PositionManager.DEFAULT_MAINTENANCE_MARGIN_RATE)
      : position.entryPrice * (1 + 1 / position.leverage - PositionManager.DEFAULT_MAINTENANCE_MARGIN_RATE);

    return {
      ...position,
      markPrice,
      roe,
      liquidationPrice,
      margin,
      lastUpdate: Date.now(),
    };
  }

  /**
   * Build account summary
   */
  private buildAccountSummary(
    balance: { asset: string; available: number; total: number },
    position: ExtendedPosition | null
  ): AccountSummary {
    const totalMargin = position?.margin || 0;
    const totalUnrealizedPnl = position?.unrealizedPnl || 0;

    return {
      totalBalance: balance.total,
      availableBalance: balance.available,
      totalUnrealizedPnl,
      totalMargin,
      marginRatio: balance.total > 0 ? totalMargin / balance.total : 0,
      lastUpdate: Date.now(),
    };
  }

  /**
   * Detect position change type
   */
  private detectPositionChange(newPosition: ExtendedPosition | null): PositionChange {
    const previous = this.currentPosition;

    // No position before, no position now
    if (!previous && !newPosition) {
      return { previous: null, current: null, changeType: 'none' };
    }

    // Position opened
    if (!previous && newPosition) {
      return { previous: null, current: newPosition, changeType: 'opened' };
    }

    // Position closed
    if (previous && !newPosition) {
      return { previous, current: null, changeType: 'closed' };
    }

    // Position exists in both - check if updated
    if (previous && newPosition) {
      const hasChanged =
        previous.size !== newPosition.size ||
        previous.side !== newPosition.side ||
        Math.abs(previous.unrealizedPnl - newPosition.unrealizedPnl) > PositionManager.CHANGE_THRESHOLD_USDT;

      return {
        previous,
        current: newPosition,
        changeType: hasChanged ? 'updated' : 'none',
      };
    }

    return { previous: null, current: null, changeType: 'none' };
  }

  /**
   * Check if account has meaningful changes
   */
  private hasAccountChanged(newAccount: AccountSummary): boolean {
    if (!this.currentAccount) return true;

    const balanceChanged = Math.abs(this.currentAccount.totalBalance - newAccount.totalBalance) > PositionManager.CHANGE_THRESHOLD_USDT;
    const pnlChanged = Math.abs(this.currentAccount.totalUnrealizedPnl - newAccount.totalUnrealizedPnl) > PositionManager.CHANGE_THRESHOLD_USDT;

    return balanceChanged || pnlChanged;
  }

  /**
   * Get current position
   */
  getPosition(): ExtendedPosition | null {
    return this.currentPosition;
  }

  /**
   * Get current account summary
   */
  getAccount(): AccountSummary | null {
    return this.currentAccount;
  }

  /**
   * Get manager status
   */
  getStatus(): { running: boolean; enabled: boolean } {
    return {
      running: this.isRunning,
      enabled: this.config.enabled,
    };
  }

  /**
   * Force immediate update
   */
  async forceUpdate(): Promise<void> {
    await this.fetchAndUpdate();
  }
}
