/**
 * Order Validator
 *
 * Pre-execution validation to prevent invalid orders
 * and protect against duplicate executions.
 *
 * Based on: ADR-006-Execution-Engine
 */

import type {
  TradingSignal,
  Position,
  SymbolInfo,
  PositionSizeResult,
  ValidationResult,
} from './types.js';

export class OrderValidator {
  private lastExecutedTimestamp: number = 0;
  private lastExecutedType: string | null = null;

  /**
   * Validate order before execution
   */
  validate(
    signal: TradingSignal,
    currentPosition: Position,
    positionSize: PositionSizeResult,
    symbolInfo: SymbolInfo
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Duplicate signal check (same candle, same direction)
    if (this.isDuplicateSignal(signal)) {
      errors.push('Duplicate signal detected for same candle');
    }

    // 2. Position size validity
    if (!positionSize.valid) {
      errors.push(`Invalid position size: ${positionSize.reason}`);
    }

    // 3. Existing position check
    if (currentPosition.side !== 'NONE') {
      const isConflicting = this.isConflictingPosition(signal, currentPosition);
      if (isConflicting) {
        warnings.push(
          `Existing ${currentPosition.side} position detected (size: ${currentPosition.size})`
        );
      }
    }

    // 4. Notional value check
    if (
      positionSize.valid &&
      positionSize.notionalValue < symbolInfo.minNotional
    ) {
      errors.push(
        `Notional ${positionSize.notionalValue.toFixed(2)} below minimum ${symbolInfo.minNotional}`
      );
    }

    // 5. Quantity check
    if (positionSize.valid && positionSize.quantity < symbolInfo.minQty) {
      errors.push(
        `Quantity ${positionSize.quantity} below minimum ${symbolInfo.minQty}`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Update state after successful execution
   */
  recordExecution(signal: TradingSignal): void {
    this.lastExecutedTimestamp = signal.timestamp;
    this.lastExecutedType = signal.type;
  }

  /**
   * Reset validation state
   */
  reset(): void {
    this.lastExecutedTimestamp = 0;
    this.lastExecutedType = null;
  }

  /**
   * Get current validation state
   */
  getState(): { lastTimestamp: number; lastType: string | null } {
    return {
      lastTimestamp: this.lastExecutedTimestamp,
      lastType: this.lastExecutedType,
    };
  }

  /**
   * Check if signal is duplicate (same candle, same direction)
   */
  private isDuplicateSignal(signal: TradingSignal): boolean {
    const sameTimestamp = signal.timestamp === this.lastExecutedTimestamp;
    const sameType = signal.type === this.lastExecutedType;
    return sameTimestamp && sameType;
  }

  /**
   * Check if signal conflicts with existing position
   * (e.g., LONG signal with existing SHORT position)
   */
  private isConflictingPosition(
    signal: TradingSignal,
    position: Position
  ): boolean {
    const isLongSignalWithShortPosition =
      signal.type === 'LONG' && position.side === 'SHORT';
    const isShortSignalWithLongPosition =
      signal.type === 'SHORT' && position.side === 'LONG';

    return isLongSignalWithShortPosition || isShortSignalWithLongPosition;
  }
}
