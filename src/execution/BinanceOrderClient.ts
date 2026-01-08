/**
 * Binance Order Client
 *
 * Low-level wrapper for Binance Futures API.
 * Handles authentication, retries, and error normalization.
 *
 * Based on: ADR-006-Execution-Engine
 */

import { USDMClient } from 'binance';
import { logger, maskSecret } from '../logger.js';
import type {
  BinanceClientConfig,
  OrderRequest,
  TpSlOrderRequest,
  OrderResult,
  AccountBalance,
  Position,
  SymbolInfo,
} from './types.js';

export class BinanceOrderClient {
  private client: USDMClient;
  private symbolInfoCache: Map<string, SymbolInfo> = new Map();

  /** Whether using testnet */
  public readonly isTestnet: boolean;

  constructor(config: BinanceClientConfig) {
    this.isTestnet = config.testnet;
    this.client = new USDMClient(
      {
        api_key: config.apiKey,
        api_secret: config.apiSecret,
      },
      undefined,
      config.testnet
    );

    logger.info('Binance Order Client initialized', {
      testnet: config.testnet,
      apiKey: maskSecret(config.apiKey),
    });
  }

  /**
   * Verify API connection and permissions
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.client.getAccountInformation();
      logger.info('Binance API connection verified');
      return true;
    } catch (error) {
      logger.error('Binance API connection failed', {
        error: this.normalizeError(error),
      });
      return false;
    }
  }

  /**
   * Set leverage for symbol
   */
  async setLeverage(symbol: string, leverage: number): Promise<boolean> {
    try {
      await this.client.setLeverage({
        symbol,
        leverage,
      });
      logger.info('Leverage set successfully', { symbol, leverage });
      return true;
    } catch (error) {
      // Binance returns error if leverage is already set to same value
      // This is acceptable, not a real error
      const errorMsg = this.normalizeError(error);
      if (errorMsg.includes('No need to change leverage')) {
        logger.debug('Leverage already set', { symbol, leverage });
        return true;
      }
      logger.error('Failed to set leverage', {
        symbol,
        leverage,
        error: errorMsg,
      });
      return false;
    }
  }

  /**
   * Get account balance for asset (default: USDT)
   */
  async getBalance(asset: string = 'USDT'): Promise<AccountBalance> {
    try {
      const balances = await this.client.getBalance();
      const balance = balances.find((b) => b.asset === asset);

      if (!balance) {
        throw new Error(`Balance not found for asset: ${asset}`);
      }

      return {
        asset: balance.asset,
        available: parseFloat(String(balance.availableBalance)),
        total: parseFloat(String(balance.balance)),
      };
    } catch (error) {
      logger.error('Failed to get balance', {
        asset,
        error: this.normalizeError(error),
      });
      throw error;
    }
  }

  /**
   * Get current position for symbol
   */
  async getPosition(symbol: string): Promise<Position> {
    try {
      const positions = await this.client.getPositions({ symbol });
      const position = positions.find((p) => p.symbol === symbol);

      if (!position) {
        return {
          symbol,
          side: 'NONE',
          size: 0,
          entryPrice: 0,
          unrealizedPnl: 0,
          leverage: 1,
        };
      }

      const positionAmt = parseFloat(String(position.positionAmt));
      let side: 'LONG' | 'SHORT' | 'NONE' = 'NONE';
      if (positionAmt > 0) side = 'LONG';
      else if (positionAmt < 0) side = 'SHORT';

      return {
        symbol,
        side,
        size: Math.abs(positionAmt),
        entryPrice: parseFloat(String(position.entryPrice)),
        unrealizedPnl: parseFloat(String(position.unRealizedProfit)),
        leverage: parseInt(String(position.leverage), 10),
      };
    } catch (error) {
      logger.error('Failed to get position', {
        symbol,
        error: this.normalizeError(error),
      });
      throw error;
    }
  }

  /**
   * Submit market order
   */
  async submitMarketOrder(request: OrderRequest): Promise<OrderResult> {
    try {
      logger.info('Submitting market order', {
        symbol: request.symbol,
        side: request.side,
        quantity: request.quantity,
      });

      const result = await this.client.submitNewOrder({
        symbol: request.symbol,
        side: request.side,
        type: 'MARKET',
        quantity: request.quantity,
      });

      const orderResult: OrderResult = {
        success: true,
        orderId: result.orderId,
        executedQty: parseFloat(String(result.executedQty)),
        avgPrice: parseFloat(String(result.avgPrice)),
        timestamp: Date.now(),
      };

      logger.info('Market order executed', {
        orderId: result.orderId,
        executedQty: orderResult.executedQty,
        avgPrice: orderResult.avgPrice,
      });

      return orderResult;
    } catch (error) {
      const errorMsg = this.normalizeError(error);
      logger.error('Market order failed', {
        symbol: request.symbol,
        side: request.side,
        quantity: request.quantity,
        error: errorMsg,
      });

      return {
        success: false,
        error: errorMsg,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Submit take profit order
   */
  async submitTakeProfitOrder(request: TpSlOrderRequest): Promise<OrderResult> {
    try {
      logger.info('Submitting take profit order', {
        symbol: request.symbol,
        side: request.side,
        stopPrice: request.stopPrice,
      });

      const result = await this.client.submitNewOrder({
        symbol: request.symbol,
        side: request.side,
        type: 'TAKE_PROFIT_MARKET',
        stopPrice: request.stopPrice,
        closePosition: request.closePosition ? 'true' : 'false',
      });

      return {
        success: true,
        orderId: result.orderId,
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMsg = this.normalizeError(error);
      logger.error('Take profit order failed', {
        symbol: request.symbol,
        stopPrice: request.stopPrice,
        error: errorMsg,
      });

      return {
        success: false,
        error: errorMsg,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Submit stop loss order
   */
  async submitStopLossOrder(request: TpSlOrderRequest): Promise<OrderResult> {
    try {
      logger.info('Submitting stop loss order', {
        symbol: request.symbol,
        side: request.side,
        stopPrice: request.stopPrice,
      });

      const result = await this.client.submitNewOrder({
        symbol: request.symbol,
        side: request.side,
        type: 'STOP_MARKET',
        stopPrice: request.stopPrice,
        closePosition: request.closePosition ? 'true' : 'false',
      });

      return {
        success: true,
        orderId: result.orderId,
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMsg = this.normalizeError(error);
      logger.error('Stop loss order failed', {
        symbol: request.symbol,
        stopPrice: request.stopPrice,
        error: errorMsg,
      });

      return {
        success: false,
        error: errorMsg,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Cancel all open orders for symbol
   */
  async cancelAllOrders(symbol: string): Promise<boolean> {
    try {
      await this.client.cancelAllOpenOrders({ symbol });
      logger.info('All open orders cancelled', { symbol });
      return true;
    } catch (error) {
      logger.error('Failed to cancel orders', {
        symbol,
        error: this.normalizeError(error),
      });
      return false;
    }
  }

  /**
   * Get symbol trading rules (precision, min/max qty, etc.)
   */
  async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    // Check cache first
    const cached = this.symbolInfoCache.get(symbol);
    if (cached) {
      return cached;
    }

    try {
      const exchangeInfo = await this.client.getExchangeInfo();
      const symbolData = exchangeInfo.symbols.find((s) => s.symbol === symbol);

      if (!symbolData) {
        throw new Error(`Symbol not found: ${symbol}`);
      }

      // Extract filters
      const lotSizeFilter = symbolData.filters.find(
        (f) => f.filterType === 'LOT_SIZE'
      ) as { minQty: string; maxQty: string; stepSize: string } | undefined;

      const minNotionalFilter = symbolData.filters.find(
        (f) => f.filterType === 'MIN_NOTIONAL'
      ) as { notional: string } | undefined;

      const symbolInfo: SymbolInfo = {
        symbol: symbolData.symbol,
        pricePrecision: symbolData.pricePrecision,
        quantityPrecision: symbolData.quantityPrecision,
        minQty: lotSizeFilter ? parseFloat(lotSizeFilter.minQty) : 0,
        maxQty: lotSizeFilter ? parseFloat(lotSizeFilter.maxQty) : Infinity,
        stepSize: lotSizeFilter ? parseFloat(lotSizeFilter.stepSize) : 0.001,
        minNotional: minNotionalFilter
          ? parseFloat(minNotionalFilter.notional)
          : 5,
      };

      // Cache the result
      this.symbolInfoCache.set(symbol, symbolInfo);

      return symbolInfo;
    } catch (error) {
      logger.error('Failed to get symbol info', {
        symbol,
        error: this.normalizeError(error),
      });
      throw error;
    }
  }

  /**
   * Get current mark price for symbol
   */
  async getMarkPrice(symbol: string): Promise<number> {
    try {
      const prices = await this.client.getMarkPrice({ symbol });

      // API returns array for multiple symbols, single object for one symbol
      if (Array.isArray(prices)) {
        const priceData = prices.find((p) => p.symbol === symbol);
        if (!priceData) {
          throw new Error(`Mark price not found for symbol: ${symbol}`);
        }
        return parseFloat(String(priceData.markPrice));
      }

      return parseFloat(String(prices.markPrice));
    } catch (error) {
      logger.error('Failed to get mark price', {
        symbol,
        error: this.normalizeError(error),
      });
      throw error;
    }
  }

  /**
   * Normalize various error types to string message
   */
  private normalizeError(error: unknown): string {
    if (error && typeof error === 'object') {
      // Binance API error
      if ('code' in error && 'msg' in error) {
        const binanceError = error as { code: number; msg: string };
        return `Binance Error ${binanceError.code}: ${binanceError.msg}`;
      }
      // Axios error with response
      if ('response' in error) {
        const axiosError = error as {
          response?: { status?: number; data?: unknown };
        };
        return `HTTP ${axiosError.response?.status}: ${JSON.stringify(axiosError.response?.data)}`;
      }
      // Standard Error object
      if (error instanceof Error) {
        return error.message;
      }
    }
    return String(error);
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error: unknown): boolean {
    const retryableCodes = [
      -1001, // DISCONNECTED
      -1003, // TOO_MANY_REQUESTS
      -1015, // TOO_MANY_ORDERS
    ];

    if (error && typeof error === 'object' && 'code' in error) {
      return retryableCodes.includes((error as { code: number }).code);
    }

    return false;
  }
}
