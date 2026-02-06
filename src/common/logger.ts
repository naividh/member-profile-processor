import winston from 'winston';

/**
 * Create a named logger instance.
 * Compatible with the app.ts import: { createLogger, logFullError }
 */
export function createLogger(name: string): winston.Logger {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} [${name}] [${level.toUpperCase()}]: ${message}`;
      })
    ),
    transports: [new winston.transports.Console()],
  });
}

/**
 * Log full error details (stack trace, etc.).
 */
export function logFullError(err: Error): void {
  const logger = createLogger('ErrorHandler');
  if (err.stack) {
    logger.error(err.stack);
  } else {
    logger.error(err.message || String(err));
  }
}

// Default export for modules that use: import logger from './logger'
const logger = createLogger('App');
export default logger;
