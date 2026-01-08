/**
 * Common types for Binance Bollinger Notice Bot
 */

// ===========================================
// Market Data Types
// ===========================================

/**
 * Confirmed candle data from Market Data Consumer
 */
export interface CandleData {
  closePrice: number;
  closeTime: number;
  openTime: number;
  high: number;
  low: number;
  open: number;
  volume: number;
}

/**
 * Event emitted when a candle is confirmed (x = true)
 */
export interface CandleClosedEvent {
  closePrice: number;
  closeTime: number;
}

// ===========================================
// Strategy Types
// ===========================================

/**
 * Signal type for trading direction
 */
export type SignalType = 'LONG' | 'SHORT';

/**
 * Bollinger Bands calculation result
 */
export interface BollingerBandsResult {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
}

/**
 * Trading signal emitted by Strategy Engine
 */
export interface TradingSignal {
  type: SignalType;
  symbol: string;
  closePrice: number;
  bandValue: number; // upper for SHORT, lower for LONG
  middleBand: number;
  bandwidth: number;
  timestamp: number;
}

// ===========================================
// Notification Types
// ===========================================

/**
 * Notification state for debounce tracking
 */
export interface NotificationState {
  lastNotifiedTimestamp: number;
  lastNotifiedType: SignalType | null;
}

/**
 * Error notification payload
 */
export interface ErrorNotification {
  errorType: string;
  message: string;
  timestamp: number;
}

// ===========================================
// WebSocket Types (Binance)
// ===========================================

/**
 * Binance Kline WebSocket message structure
 */
export interface BinanceKlineMessage {
  e: string; // Event type
  E: number; // Event time
  s: string; // Symbol
  k: {
    t: number; // Kline start time
    T: number; // Kline close time
    s: string; // Symbol
    i: string; // Interval
    f: number; // First trade ID
    L: number; // Last trade ID
    o: string; // Open price
    c: string; // Close price
    h: string; // High price
    l: string; // Low price
    v: string; // Base asset volume
    n: number; // Number of trades
    x: boolean; // Is this kline closed?
    q: string; // Quote asset volume
    V: string; // Taker buy base asset volume
    Q: string; // Taker buy quote asset volume
    B: string; // Ignore
  };
}

// ===========================================
// Event Emitter Types
// ===========================================

export type MarketDataEvents = {
  candleClosed: [event: CandleClosedEvent];
  error: [error: Error];
  connected: [];
  disconnected: [];
  reconnecting: [];
};

export type StrategyEvents = {
  signalDetected: [signal: TradingSignal];
  error: [error: Error];
};

export type NotificationEvents = {
  sent: [signal: TradingSignal];
  skipped: [reason: string, signal: TradingSignal];
  error: [error: Error];
};

// ===========================================
// Execution Engine Types
// ===========================================

// Re-export from execution module
export type { ExecutionEvents, ExecutionResult } from './execution/types.js';
