/**
 * Position Sizer
 *
 * Calculates appropriate position size based on account balance
 * and risk management parameters.
 *
 * Based on: ADR-006-Execution-Engine
 */

import type {
  ExecutionEngineConfig,
  AccountBalance,
  SymbolInfo,
  PositionSizeResult,
  SignalType,
} from './types.js';

export class PositionSizer {
  private readonly config: ExecutionEngineConfig;

  constructor(config: ExecutionEngineConfig) {
    this.config = config;
  }

  /**
   * Calculate position size for a trade
   *
   * Formula:
   * 1. riskAmount = availableBalance * positionSizePercent
   * 2. notionalValue = min(riskAmount * leverage, maxPositionSizeUsdt)
   * 3. quantity = notionalValue / currentPrice
   * 4. quantity = adjustToPrecision(quantity, symbolInfo)
   */
  calculatePositionSize(
    balance: AccountBalance,
    currentPrice: number,
    symbolInfo: SymbolInfo
  ): PositionSizeResult {
    // Step 1: Calculate risk amount based on available balance
    const riskAmount = balance.available * this.config.positionSizePercent;

    // Step 2: Apply leverage and enforce maximum cap
    const leveragedAmount = riskAmount * this.config.leverage;
    const notionalValue = Math.min(
      leveragedAmount,
      this.config.maxPositionSizeUsdt
    );

    // Step 3: Check against minimum position size
    if (notionalValue < this.config.minPositionSizeUsdt) {
      return this.createInvalidResult(
        `Notional value ${notionalValue.toFixed(2)} USDT is below minimum ${this.config.minPositionSizeUsdt} USDT`
      );
    }

    // Step 4: Calculate quantity
    const rawQuantity = notionalValue / currentPrice;

    // Step 5: Adjust to symbol precision
    const quantity = this.adjustToPrecision(rawQuantity, symbolInfo);

    // Step 6: Validate against symbol limits
    if (quantity < symbolInfo.minQty) {
      return this.createInvalidResult(
        `Quantity ${quantity} is below symbol minimum ${symbolInfo.minQty}`
      );
    }

    if (quantity > symbolInfo.maxQty) {
      return this.createInvalidResult(
        `Quantity ${quantity} exceeds symbol maximum ${symbolInfo.maxQty}`
      );
    }

    // Step 7: Check notional value against symbol minimum
    const actualNotional = quantity * currentPrice;
    if (actualNotional < symbolInfo.minNotional) {
      return this.createInvalidResult(
        `Notional ${actualNotional.toFixed(2)} USDT is below symbol minimum ${symbolInfo.minNotional} USDT`
      );
    }

    return {
      quantity,
      notionalValue: actualNotional,
      riskAmount,
      valid: true,
    };
  }

  /**
   * Calculate take profit price
   */
  calculateTakeProfit(entryPrice: number, side: SignalType): number {
    const isLong = side === 'LONG';
    const multiplier = isLong
      ? 1 + this.config.takeProfitPercent
      : 1 - this.config.takeProfitPercent;

    return entryPrice * multiplier;
  }

  /**
   * Calculate stop loss price
   */
  calculateStopLoss(entryPrice: number, side: SignalType): number {
    const isLong = side === 'LONG';
    const multiplier = isLong
      ? 1 - this.config.stopLossPercent
      : 1 + this.config.stopLossPercent;

    return entryPrice * multiplier;
  }

  /**
   * Adjust price to match symbol precision
   */
  adjustPricePrecision(price: number, symbolInfo: SymbolInfo): number {
    return parseFloat(price.toFixed(symbolInfo.pricePrecision));
  }

  /**
   * Adjust quantity to match symbol precision and step size
   */
  private adjustToPrecision(quantity: number, symbolInfo: SymbolInfo): number {
    const { stepSize, quantityPrecision } = symbolInfo;

    // Round down to nearest step size
    const steps = Math.floor(quantity / stepSize);
    const adjusted = steps * stepSize;

    // Apply precision
    return parseFloat(adjusted.toFixed(quantityPrecision));
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<ExecutionEngineConfig> {
    return this.config;
  }

  /**
   * Create an invalid position size result
   */
  private createInvalidResult(reason: string): PositionSizeResult {
    return {
      quantity: 0,
      notionalValue: 0,
      riskAmount: 0,
      valid: false,
      reason,
    };
  }
}
