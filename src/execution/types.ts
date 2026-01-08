/**
 * Types for Execution Engine
 *
 * Based on: ADR-006-Execution-Engine
 */

import type { TradingSignal, SignalType } from '../types.js';

// ===========================================
// Configuration Types
// ===========================================

/**
 * Execution Engine configuration
 */
export interface ExecutionEngineConfig {
  /** Enable/disable execution (kill switch) */
  enabled: boolean;

  /** Use Binance Testnet */
  testnet: boolean;

  /** Trading symbol */
  symbol: string;

  /** Leverage setting (1-125) */
  leverage: number;

  /** Position size as percentage of available balance (0.01 - 1.0) */
  positionSizePercent: number;

  /** Take Profit percentage from entry (e.g., 0.02 = 2%) */
  takeProfitPercent: number;

  /** Stop Loss percentage from entry (e.g., 0.01 = 1%) */
  stopLossPercent: number;

  /** Maximum position size in quote asset (USDT) */
  maxPositionSizeUsdt: number;

  /** Minimum position size in quote asset (USDT) */
  minPositionSizeUsdt: number;

  /** Order retry attempts */
  retryAttempts: number;

  /** Delay between retries (ms) */
  retryDelayMs: number;
}

/**
 * Binance API client configuration
 */
export interface BinanceClientConfig {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
}

// ===========================================
// Order Types
// ===========================================

/**
 * Order side
 */
export type OrderSide = 'BUY' | 'SELL';

/**
 * Order type for Binance Futures
 */
export type FuturesOrderType =
  | 'LIMIT'
  | 'MARKET'
  | 'STOP'
  | 'STOP_MARKET'
  | 'TAKE_PROFIT'
  | 'TAKE_PROFIT_MARKET'
  | 'TRAILING_STOP_MARKET';

/**
 * Market order request
 */
export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: 'MARKET';
  quantity: number;
  signal: TradingSignal;
}

/**
 * Take Profit / Stop Loss order request
 */
export interface TpSlOrderRequest {
  symbol: string;
  side: OrderSide;
  type: 'TAKE_PROFIT_MARKET' | 'STOP_MARKET';
  stopPrice: number;
  closePosition: boolean;
}

/**
 * Order execution result
 */
export interface OrderResult {
  success: boolean;
  orderId?: number;
  executedQty?: number;
  avgPrice?: number;
  error?: string;
  timestamp: number;
}

/**
 * Complete execution result including entry and TP/SL orders
 */
export interface ExecutionResult {
  signal: TradingSignal;
  entryOrder: OrderResult;
  takeProfitOrder?: OrderResult;
  stopLossOrder?: OrderResult;
  timestamp: number;
}

// ===========================================
// Position & Balance Types
// ===========================================

/**
 * Account balance for an asset
 */
export interface AccountBalance {
  asset: string;
  available: number;
  total: number;
}

/**
 * Position information
 */
export interface Position {
  symbol: string;
  side: 'LONG' | 'SHORT' | 'NONE';
  size: number;
  entryPrice: number;
  unrealizedPnl: number;
  leverage: number;
}

/**
 * Position size calculation result
 */
export interface PositionSizeResult {
  quantity: number;
  notionalValue: number;
  riskAmount: number;
  valid: boolean;
  reason?: string;
}

// ===========================================
// Validation Types
// ===========================================

/**
 * Order validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Symbol trading rules
 */
export interface SymbolInfo {
  symbol: string;
  pricePrecision: number;
  quantityPrecision: number;
  minQty: number;
  maxQty: number;
  stepSize: number;
  minNotional: number;
}

// ===========================================
// Event Types
// ===========================================

/**
 * Execution Engine events
 */
export type ExecutionEvents = {
  orderExecuted: [result: ExecutionResult];
  orderFailed: [signal: TradingSignal, error: string];
  leverageSet: [symbol: string, leverage: number];
  error: [error: Error];
};

// ===========================================
// Re-export common types for convenience
// ===========================================

export type { TradingSignal, SignalType };
