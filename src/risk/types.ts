/**
 * Risk Manager Types
 *
 * Type definitions for risk management and monitoring.
 */

/**
 * Risk Manager configuration
 */
export interface RiskManagerConfig {
  /** Whether risk management is enabled */
  enabled: boolean;

  /** Daily loss limit in USDT (absolute value) */
  dailyLossLimitUsdt: number;

  /** Maximum drawdown percentage (0.1 = 10%) */
  maxDrawdownPercent: number;

  /** Auto-close positions when risk limit exceeded */
  autoCloseOnBreach: boolean;

  /** Risk check interval in milliseconds */
  checkIntervalMs: number;

  /** Symbol to monitor */
  symbol: string;
}

/**
 * Risk status snapshot
 */
export interface RiskStatus {
  /** Daily realized PnL in USDT */
  dailyPnl: number;

  /** Daily loss limit remaining */
  dailyLossRemaining: number;

  /** Peak balance for drawdown calculation */
  peakBalance: number;

  /** Current balance */
  currentBalance: number;

  /** Current drawdown percentage */
  currentDrawdown: number;

  /** Whether daily loss limit is breached */
  isDailyLimitBreached: boolean;

  /** Whether max drawdown is breached */
  isDrawdownBreached: boolean;

  /** Whether trading is allowed */
  isTradingAllowed: boolean;

  /** Last check timestamp */
  lastCheck: number;
}

/**
 * Risk breach event data
 */
export interface RiskBreach {
  /** Type of risk breach */
  type: 'daily_loss' | 'max_drawdown';

  /** Current value that triggered breach */
  currentValue: number;

  /** Threshold that was breached */
  threshold: number;

  /** Whether auto-close was triggered */
  autoCloseTriggered: boolean;

  /** Timestamp */
  timestamp: number;
}

/**
 * Daily stats for tracking
 */
export interface DailyStats {
  /** Start of day balance */
  startBalance: number;

  /** Start of day timestamp (UTC midnight) */
  dayStart: number;

  /** Total realized PnL for today */
  realizedPnl: number;

  /** Number of trades today */
  tradeCount: number;
}

/**
 * Risk Manager events
 */
export type RiskManagerEvents = {
  /** Emitted when a risk limit is breached */
  riskBreach: [breach: RiskBreach];

  /** Emitted when risk status changes */
  statusChanged: [status: RiskStatus];

  /** Emitted when trading is blocked */
  tradingBlocked: [reason: string];

  /** Emitted when trading is resumed */
  tradingResumed: [];

  /** Emitted on error */
  error: [error: Error];
};
