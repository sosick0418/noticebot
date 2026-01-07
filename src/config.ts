import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

export const config = {
  // Binance Configuration
  binance: {
    apiKey: getEnvVar('BINANCE_API_KEY'),
    apiSecret: getEnvVar('BINANCE_API_SECRET'),
    testnet: getEnvBoolean('BINANCE_TESTNET', true),
  },

  // Telegram Configuration
  telegram: {
    botToken: getEnvVar('TELEGRAM_BOT_TOKEN'),
    chatId: getEnvVar('TELEGRAM_CHAT_ID'),
  },

  // Trading Configuration
  trading: {
    symbol: getEnvVar('SYMBOL', 'BTCUSDT'),
    interval: getEnvVar('INTERVAL', '15m'),
  },

  // Bollinger Bands Configuration
  bollingerBands: {
    period: getEnvNumber('BB_PERIOD', 20),
    stdDev: getEnvNumber('BB_STD_DEV', 2),
  },

  // Volatility Filter Configuration
  volatilityFilter: {
    bandwidthThreshold: getEnvNumber('BANDWIDTH_THRESHOLD', 0.04),
  },

  // Logging Configuration
  logging: {
    level: getEnvVar('LOG_LEVEL', 'info'),
  },

  // Watchdog Configuration
  watchdog: {
    timeoutSeconds: getEnvNumber('WATCHDOG_TIMEOUT', 60),
  },
} as const;

export type Config = typeof config;
