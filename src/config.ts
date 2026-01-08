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

  // Execution Engine Configuration
  execution: {
    /** Kill switch - easily disable execution */
    enabled: getEnvBoolean('EXECUTION_ENABLED', false),

    /** Leverage setting (1-125) */
    leverage: getEnvNumber('EXECUTION_LEVERAGE', 10),

    /** Position size as % of available balance (0.1 = 10%) */
    positionSizePercent: getEnvNumber('EXECUTION_POSITION_SIZE_PERCENT', 0.1),

    /** Take profit % from entry (0.02 = 2%) */
    takeProfitPercent: getEnvNumber('EXECUTION_TP_PERCENT', 0.02),

    /** Stop loss % from entry (0.01 = 1%) */
    stopLossPercent: getEnvNumber('EXECUTION_SL_PERCENT', 0.01),

    /** Maximum position size in USDT */
    maxPositionSizeUsdt: getEnvNumber('EXECUTION_MAX_SIZE_USDT', 1000),

    /** Minimum position size in USDT */
    minPositionSizeUsdt: getEnvNumber('EXECUTION_MIN_SIZE_USDT', 10),

    /** Retry attempts for failed orders */
    retryAttempts: getEnvNumber('EXECUTION_RETRY_ATTEMPTS', 3),

    /** Delay between retries (ms) */
    retryDelayMs: getEnvNumber('EXECUTION_RETRY_DELAY_MS', 1000),
  },

  // Dashboard Configuration
  dashboard: {
    /** Enable web dashboard */
    enabled: getEnvBoolean('DASHBOARD_ENABLED', true),

    /** Dashboard server port */
    port: getEnvNumber('DASHBOARD_PORT', 3000),

    /** Dashboard server host */
    host: getEnvVar('DASHBOARD_HOST', '0.0.0.0'),
  },

  // Position Manager Configuration
  position: {
    /** Enable position tracking */
    enabled: getEnvBoolean('POSITION_TRACKING_ENABLED', true),

    /** Position polling interval in milliseconds */
    pollIntervalMs: getEnvNumber('POSITION_POLL_INTERVAL_MS', 5000),
  },

  // Risk Manager Configuration
  risk: {
    /** Enable risk management */
    enabled: getEnvBoolean('RISK_ENABLED', true),

    /** Daily loss limit in USDT */
    dailyLossLimitUsdt: getEnvNumber('RISK_DAILY_LOSS_LIMIT_USDT', 100),

    /** Maximum drawdown percentage (0.1 = 10%) */
    maxDrawdownPercent: getEnvNumber('RISK_MAX_DRAWDOWN_PERCENT', 0.1),

    /** Auto-close positions when risk limit exceeded */
    autoCloseOnBreach: getEnvBoolean('RISK_AUTO_CLOSE', true),

    /** Risk check interval in milliseconds */
    checkIntervalMs: getEnvNumber('RISK_CHECK_INTERVAL_MS', 10000),
  },
} as const;

export type Config = typeof config;
