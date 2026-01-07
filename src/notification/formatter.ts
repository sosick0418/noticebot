/**
 * Message Formatter
 *
 * Formats trading signals and error notifications for Telegram.
 * Based on: ADR-004-Notification Content Policy
 */

import type { TradingSignal, ErrorNotification } from '../types.js';

/**
 * Format a trading signal into a Telegram message
 * Uses Markdown formatting for better readability
 */
export function formatSignalMessage(signal: TradingSignal): string {
  const emoji = signal.type === 'LONG' ? '🟢' : '🔴';
  const direction = signal.type === 'LONG' ? '롱(LONG)' : '숏(SHORT)';
  const bandLabel = signal.type === 'LONG' ? '하단 밴드' : '상단 밴드';

  const time = new Date(signal.timestamp).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return `${emoji} *${direction} 진입 신호*

• 코인: \`${signal.symbol}\`
• 현재가: \`$${formatPrice(signal.closePrice)}\`
• ${bandLabel}: \`$${formatPrice(signal.bandValue)}\`
• 중심선: \`$${formatPrice(signal.middleBand)}\`
• 밴드폭: \`${formatPercent(signal.bandwidth)}\`
• 시간: \`${time}\`

_볼린저 밴드 Mean Reversion 전략_`;
}

/**
 * Format an error notification into a Telegram message
 */
export function formatErrorMessage(error: ErrorNotification): string {
  const time = new Date(error.timestamp).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return `❗ *BOT ERROR DETECTED*

• 유형: \`${error.errorType}\`
• 메시지: \`${escapeMarkdown(error.message)}\`
• 시간: \`${time}\`

_즉시 확인이 필요합니다._`;
}

/**
 * Format a startup notification
 */
export function formatStartupMessage(symbol: string, interval: string, testnet: boolean): string {
  const env = testnet ? '테스트넷' : '메인넷';
  const time = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
  });

  return `🚀 *Bollinger Notice Bot 시작*

• 환경: \`${env}\`
• 심볼: \`${symbol}\`
• 타임프레임: \`${interval}\`
• 시작 시간: \`${time}\`

_볼린저 밴드 신호 모니터링을 시작합니다._`;
}

/**
 * Format a shutdown notification
 */
export function formatShutdownMessage(reason: string): string {
  const time = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
  });

  return `🛑 *Bollinger Notice Bot 종료*

• 사유: \`${reason}\`
• 종료 시간: \`${time}\``;
}

/**
 * Format price with appropriate decimal places
 */
function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } else if (price >= 1) {
    return price.toFixed(4);
  } else {
    return price.toFixed(8);
  }
}

/**
 * Format bandwidth as percentage
 */
function formatPercent(value: number): string {
  return (value * 100).toFixed(2) + '%';
}

/**
 * Escape special Markdown characters
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
