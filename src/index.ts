/**
 * Binance Bollinger Notice Bot
 *
 * Entry point for the application.
 * Handles process signals for graceful shutdown.
 */

import { App } from './app.js';
import { logger } from './logger.js';

// Create application instance
const app = new App();

// Graceful shutdown handler
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, initiating graceful shutdown...`);

  try {
    await app.stop(`Received ${signal}`);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Register signal handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  shutdown('uncaughtException').catch(() => process.exit(1));
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

// Start the application
async function main(): Promise<void> {
  try {
    logger.info('='.repeat(50));
    logger.info('Binance Bollinger Notice Bot');
    logger.info('='.repeat(50));

    await app.start();

    // Log status periodically
    setInterval(() => {
      const status = app.getStatus();
      logger.debug('Application status', status);
    }, 60000); // Every minute

  } catch (error) {
    logger.error('Failed to start application', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Run
main();
