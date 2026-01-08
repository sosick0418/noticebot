/**
 * Execution Engine Module
 *
 * Handles automated order execution based on trading signals.
 */

// Types
export type {
  ExecutionEngineConfig,
  BinanceClientConfig,
  OrderSide,
  FuturesOrderType,
  OrderRequest,
  TpSlOrderRequest,
  OrderResult,
  ExecutionResult,
  AccountBalance,
  Position,
  PositionSizeResult,
  ValidationResult,
  SymbolInfo,
  ExecutionEvents,
} from './types.js';

// Classes
export { BinanceOrderClient } from './BinanceOrderClient.js';
export { PositionSizer } from './PositionSizer.js';
export { OrderValidator } from './OrderValidator.js';
// export { ExecutionEngine } from './ExecutionEngine.js';
