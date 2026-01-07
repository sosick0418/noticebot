/**
 * Types for Market Data Consumer
 */

import type { KlineInterval } from 'binance';

export { KlineInterval };

/**
 * Configuration for Market Data Consumer
 */
export interface MarketDataConsumerConfig {
  symbol: string;
  interval: KlineInterval;
  testnet: boolean;
  watchdogTimeoutMs: number;
}

/**
 * Raw kline data from Binance WebSocket
 */
export interface RawKlineData {
  eventType: string;
  eventTime: number;
  symbol: string;
  kline: {
    startTime: number;
    endTime: number;
    symbol: string;
    interval: string;
    firstTradeId: number;
    lastTradeId: number;
    open: string;
    close: string;
    high: string;
    low: string;
    volume: string;
    trades: number;
    final: boolean; // x = true when candle is closed
    quoteVolume: string;
    volumeActive: string;
    quoteVolumeActive: string;
  };
}

/**
 * Parsed candle data
 */
export interface ParsedCandle {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}
