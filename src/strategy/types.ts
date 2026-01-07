/**
 * Types for Strategy Engine
 */

/**
 * Configuration for Strategy Engine
 */
export interface StrategyEngineConfig {
  symbol: string;
  bollingerPeriod: number;
  bollingerStdDev: number;
  bandwidthThreshold: number;
}

/**
 * Internal Bollinger Bands state
 */
export interface BollingerState {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
}

/**
 * Signal evaluation result
 */
export interface SignalEvaluation {
  shouldSignal: boolean;
  type: 'LONG' | 'SHORT' | null;
  reason: string;
  bandValue: number | null;
}
