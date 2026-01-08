/**
 * Position Manager Types
 *
 * Type definitions for real-time position tracking and management.
 */

import type { Position } from '../execution/types.js';

/**
 * Position Manager configuration
 */
export interface PositionManagerConfig {
  /** Whether position tracking is enabled */
  enabled: boolean;

  /** Symbol to track */
  symbol: string;

  /** Polling interval in milliseconds */
  pollIntervalMs: number;

  /** Use testnet API */
  testnet: boolean;
}

/**
 * Extended position with additional calculated fields
 */
export interface ExtendedPosition extends Position {
  /** Current mark price */
  markPrice: number;

  /** ROE (Return on Equity) percentage */
  roe: number;

  /** Liquidation price */
  liquidationPrice: number;

  /** Position margin */
  margin: number;

  /** Last update timestamp */
  lastUpdate: number;
}

/**
 * Position change event data
 */
export interface PositionChange {
  previous: ExtendedPosition | null;
  current: ExtendedPosition | null;
  changeType: 'opened' | 'closed' | 'updated' | 'none';
}

/**
 * Account summary for dashboard
 */
export interface AccountSummary {
  /** Total wallet balance */
  totalBalance: number;

  /** Available balance for trading */
  availableBalance: number;

  /** Total unrealized PNL */
  totalUnrealizedPnl: number;

  /** Total margin used */
  totalMargin: number;

  /** Margin ratio (used/total) */
  marginRatio: number;

  /** Last update timestamp */
  lastUpdate: number;
}

/**
 * Position Manager events
 */
export type PositionManagerEvents = {
  positionChanged: [change: PositionChange];
  accountUpdated: [account: AccountSummary];
  error: [error: Error];
};
