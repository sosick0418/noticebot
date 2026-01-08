/**
 * Dashboard Types
 *
 * Type definitions for Web Dashboard module.
 */

/**
 * Dashboard server configuration
 */
export interface DashboardConfig {
  enabled: boolean;
  port: number;
  host: string;
}

/**
 * Candlestick data for chart
 */
export interface CandleChartData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Bollinger Bands overlay data
 */
export interface BollingerBandsData {
  time: number;
  upper: number;
  middle: number;
  lower: number;
}

/**
 * Current position information
 */
export interface PositionInfo {
  symbol: string;
  side: 'LONG' | 'SHORT' | 'NONE';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  leverage: number;
}

/**
 * Account balance information
 */
export interface AccountInfo {
  balance: number;
  available: number;
  totalPnl: number;
}

/**
 * Trading signal for dashboard display
 */
export interface SignalInfo {
  type: 'LONG' | 'SHORT';
  symbol: string;
  price: number;
  timestamp: number;
  executed: boolean;
}

/**
 * System status for dashboard
 */
export interface SystemStatus {
  isRunning: boolean;
  isConnected: boolean;
  executionEnabled: boolean;
  executionReady: boolean;
  uptime: number;
  lastUpdate: number;
}

/**
 * Dashboard state (in-memory)
 */
export interface DashboardState {
  candles: CandleChartData[];
  bollingerBands: BollingerBandsData[];
  position: PositionInfo | null;
  account: AccountInfo | null;
  signals: SignalInfo[];
  status: SystemStatus;
}

/**
 * WebSocket message types
 */
export type WsMessageType =
  | 'candle'
  | 'position'
  | 'signal'
  | 'status'
  | 'account'
  | 'bollingerBands';

/**
 * WebSocket message payload
 */
export interface WsMessage<T = unknown> {
  type: WsMessageType;
  data: T;
  timestamp: number;
}
