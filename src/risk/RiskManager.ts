/**
 * Risk Manager
 *
 * Monitors trading risk metrics and enforces limits:
 * - Daily loss limit (blocks trading when exceeded)
 * - Maximum drawdown (alerts and optional auto-close)
 * - Real-time risk status updates
 */

import EventEmitter from 'eventemitter3';
import { logger } from '../logger.js';
import type { BinanceOrderClient } from '../execution/BinanceOrderClient.js';
import type {
  RiskManagerConfig,
  RiskManagerEvents,
  RiskStatus,
  RiskBreach,
  DailyStats,
} from './types.js';

export class RiskManager extends EventEmitter<RiskManagerEvents> {
  /** Threshold for PnL change to trigger status update (in USDT) */
  private static readonly PNL_CHANGE_THRESHOLD_USDT = 0.01;

  /** Threshold for drawdown change to trigger status update */
  private static readonly DRAWDOWN_CHANGE_THRESHOLD = 0.001;

  private readonly config: RiskManagerConfig;
  private readonly client: BinanceOrderClient;
  private checkTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  /** Daily statistics */
  private dailyStats: DailyStats;

  /** Peak balance for drawdown calculation */
  private peakBalance = 0;

  /** Current risk status */
  private currentStatus: RiskStatus | null = null;

  /** Whether trading is currently allowed */
  private tradingAllowed = true;

  constructor(config: RiskManagerConfig, client: BinanceOrderClient) {
    super();
    this.config = config;
    this.client = client;

    // Initialize daily stats
    this.dailyStats = this.createNewDayStats(0);

    logger.info('Risk Manager initialized', {
      dailyLossLimitUsdt: config.dailyLossLimitUsdt,
      maxDrawdownPercent: config.maxDrawdownPercent,
      autoCloseOnBreach: config.autoCloseOnBreach,
      enabled: config.enabled,
    });
  }

  /**
   * Start risk monitoring
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Risk Manager is disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('Risk Manager already running');
      return;
    }

    // Initialize with current balance
    try {
      const balance = await this.client.getBalance('USDT');
      this.peakBalance = balance.total;
      this.dailyStats = this.createNewDayStats(balance.total);
      logger.info('Risk Manager initial balance', {
        balance: balance.total,
        peakBalance: this.peakBalance,
      });
    } catch (error) {
      const normalizedError = this.normalizeError(error);
      logger.error('Failed to get initial balance', { error: normalizedError.message });
      this.emit('error', normalizedError);
      return;
    }

    this.isRunning = true;
    this.startMonitoring();
    logger.info('Risk Manager started');
  }

  /**
   * Stop risk monitoring
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.stopMonitoring();
    logger.info('Risk Manager stopped');
  }

  /**
   * Check if trading is currently allowed
   */
  isTradingAllowed(): boolean {
    return this.tradingAllowed;
  }

  /**
   * Get current risk status
   */
  getStatus(): RiskStatus | null {
    return this.currentStatus;
  }

  /**
   * Record a completed trade (for daily PnL tracking)
   */
  recordTrade(realizedPnl: number): void {
    this.checkDayRollover();
    this.dailyStats.realizedPnl += realizedPnl;
    this.dailyStats.tradeCount += 1;

    logger.debug('Trade recorded for risk tracking', {
      realizedPnl,
      dailyTotalPnl: this.dailyStats.realizedPnl,
      tradeCount: this.dailyStats.tradeCount,
    });

    // Trigger immediate check after trade
    this.checkRiskLimits();
  }

  /**
   * Force an immediate risk check
   */
  async forceCheck(): Promise<RiskStatus | null> {
    await this.checkRiskLimits();
    return this.currentStatus;
  }

  /**
   * Start periodic monitoring
   */
  private startMonitoring(): void {
    // Initial check
    this.checkRiskLimits();

    // Set up interval
    this.checkTimer = setInterval(() => {
      this.checkRiskLimits();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop monitoring
   */
  private stopMonitoring(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Check all risk limits
   */
  private async checkRiskLimits(): Promise<void> {
    try {
      this.checkDayRollover();

      const balance = await this.client.getBalance('USDT');
      const currentBalance = balance.total;

      // Update peak balance
      if (currentBalance > this.peakBalance) {
        this.peakBalance = currentBalance;
      }

      // Calculate metrics
      const dailyPnl = currentBalance - this.dailyStats.startBalance + this.dailyStats.realizedPnl;
      const dailyLossRemaining = this.config.dailyLossLimitUsdt + dailyPnl; // dailyPnl is negative when losing
      const currentDrawdown = this.peakBalance > 0
        ? (this.peakBalance - currentBalance) / this.peakBalance
        : 0;

      // Check breaches
      const isDailyLimitBreached = dailyPnl < -this.config.dailyLossLimitUsdt;
      const isDrawdownBreached = currentDrawdown > this.config.maxDrawdownPercent;

      // Build status
      const status: RiskStatus = {
        dailyPnl,
        dailyLossRemaining: Math.max(0, dailyLossRemaining),
        peakBalance: this.peakBalance,
        currentBalance,
        currentDrawdown,
        isDailyLimitBreached,
        isDrawdownBreached,
        isTradingAllowed: !isDailyLimitBreached && !isDrawdownBreached,
        lastCheck: Date.now(),
      };

      // Handle breaches
      await this.handleBreaches(status, isDailyLimitBreached, isDrawdownBreached);

      // Update current status
      const statusChanged = this.hasStatusChanged(status);
      this.currentStatus = status;

      if (statusChanged) {
        this.emit('statusChanged', status);
      }
    } catch (error) {
      const normalizedError = this.normalizeError(error);
      logger.error('Risk check failed', { error: normalizedError.message });
      this.emit('error', normalizedError);
    }
  }

  /**
   * Handle risk breaches
   */
  private async handleBreaches(
    status: RiskStatus,
    isDailyLimitBreached: boolean,
    isDrawdownBreached: boolean
  ): Promise<void> {
    // Daily loss breach
    if (isDailyLimitBreached && this.tradingAllowed) {
      const breach: RiskBreach = {
        type: 'daily_loss',
        currentValue: Math.abs(status.dailyPnl),
        threshold: this.config.dailyLossLimitUsdt,
        autoCloseTriggered: this.config.autoCloseOnBreach,
        timestamp: Date.now(),
      };

      logger.warn('Daily loss limit breached', {
        dailyPnl: status.dailyPnl,
        limit: this.config.dailyLossLimitUsdt,
      });

      this.tradingAllowed = false;
      this.emit('riskBreach', breach);
      this.emit('tradingBlocked', 'Daily loss limit exceeded');

      if (this.config.autoCloseOnBreach) {
        await this.closeAllPositions('daily_loss_limit');
      }
    }

    // Drawdown breach
    if (isDrawdownBreached && this.tradingAllowed) {
      const breach: RiskBreach = {
        type: 'max_drawdown',
        currentValue: status.currentDrawdown * 100,
        threshold: this.config.maxDrawdownPercent * 100,
        autoCloseTriggered: this.config.autoCloseOnBreach,
        timestamp: Date.now(),
      };

      logger.warn('Maximum drawdown breached', {
        currentDrawdown: `${(status.currentDrawdown * 100).toFixed(2)}%`,
        maxDrawdown: `${(this.config.maxDrawdownPercent * 100).toFixed(2)}%`,
      });

      this.tradingAllowed = false;
      this.emit('riskBreach', breach);
      this.emit('tradingBlocked', 'Maximum drawdown exceeded');

      if (this.config.autoCloseOnBreach) {
        await this.closeAllPositions('max_drawdown');
      }
    }

    // Check if we can resume trading (only if previously blocked)
    if (!isDailyLimitBreached && !isDrawdownBreached && !this.tradingAllowed) {
      logger.info('Risk levels normalized, trading resumed');
      this.tradingAllowed = true;
      this.emit('tradingResumed');
    }
  }

  /**
   * Close all positions (emergency stop)
   */
  private async closeAllPositions(reason: string): Promise<void> {
    try {
      logger.warn('Closing all positions due to risk breach', { reason });

      // Cancel all pending orders first
      await this.client.cancelAllOrders(this.config.symbol);

      // Get current position
      const position = await this.client.getPosition(this.config.symbol);
      const hasOpenPosition = position.side !== 'NONE' && position.size > 0;

      if (hasOpenPosition) {
        // Close position with market order
        const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY';

        await this.client.submitMarketOrder({
          symbol: this.config.symbol,
          side: closeSide,
          type: 'MARKET',
          quantity: position.size,
          signal: {
            type: position.side === 'LONG' ? 'SHORT' : 'LONG',
            symbol: this.config.symbol,
            closePrice: 0,
            bandValue: 0,
            middleBand: 0,
            bandwidth: 0,
            timestamp: Date.now(),
          },
        });

        logger.info('Position closed due to risk breach', {
          reason,
          side: position.side,
          size: position.size,
        });
      }
    } catch (error) {
      const normalizedError = this.normalizeError(error);
      logger.error('Failed to close positions', { error: normalizedError.message });
      this.emit('error', normalizedError);
    }
  }

  /**
   * Check if day has rolled over and reset stats if needed
   */
  private checkDayRollover(): void {
    const now = Date.now();
    const todayStart = this.getUtcDayStart(now);

    if (todayStart > this.dailyStats.dayStart) {
      logger.info('Day rollover detected, resetting daily stats', {
        previousDayPnl: this.dailyStats.realizedPnl,
        previousTradeCount: this.dailyStats.tradeCount,
      });

      // Reset daily stats with current balance as new start
      this.dailyStats = this.createNewDayStats(this.currentStatus?.currentBalance || 0);

      // Resume trading on new day if it was blocked due to daily limit
      if (!this.tradingAllowed && this.currentStatus && !this.currentStatus.isDrawdownBreached) {
        logger.info('New day started, trading resumed');
        this.tradingAllowed = true;
        this.emit('tradingResumed');
      }
    }
  }

  /**
   * Create new day stats
   */
  private createNewDayStats(startBalance: number): DailyStats {
    return {
      startBalance,
      dayStart: this.getUtcDayStart(Date.now()),
      realizedPnl: 0,
      tradeCount: 0,
    };
  }

  /**
   * Get UTC midnight timestamp for a given time
   */
  private getUtcDayStart(timestamp: number): number {
    const date = new Date(timestamp);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
  }

  /**
   * Normalize various error types to Error object
   */
  private normalizeError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  /**
   * Check if status has meaningfully changed
   */
  private hasStatusChanged(newStatus: RiskStatus): boolean {
    if (!this.currentStatus) return true;

    return (
      this.currentStatus.isDailyLimitBreached !== newStatus.isDailyLimitBreached ||
      this.currentStatus.isDrawdownBreached !== newStatus.isDrawdownBreached ||
      this.currentStatus.isTradingAllowed !== newStatus.isTradingAllowed ||
      Math.abs(this.currentStatus.dailyPnl - newStatus.dailyPnl) > RiskManager.PNL_CHANGE_THRESHOLD_USDT ||
      Math.abs(this.currentStatus.currentDrawdown - newStatus.currentDrawdown) > RiskManager.DRAWDOWN_CHANGE_THRESHOLD
    );
  }

  /**
   * Get daily statistics
   */
  getDailyStats(): DailyStats {
    return { ...this.dailyStats };
  }

  /**
   * Reset peak balance (use with caution)
   */
  resetPeakBalance(newPeak?: number): void {
    if (newPeak !== undefined) {
      this.peakBalance = newPeak;
    } else if (this.currentStatus) {
      this.peakBalance = this.currentStatus.currentBalance;
    }
    logger.info('Peak balance reset', { peakBalance: this.peakBalance });
  }
}
