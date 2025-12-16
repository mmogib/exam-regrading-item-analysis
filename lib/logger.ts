/**
 * Logger utility for development debugging
 * Only logs in development mode, silent in production
 */

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Debug logging - only outputs in development mode
 */
export const debug = (...args: any[]) => {
  if (isDevelopment) {
    console.log('[DEBUG]', ...args);
  }
};

/**
 * Error logging - always outputs (including production)
 */
export const error = (...args: any[]) => {
  console.error('[ERROR]', ...args);
};

/**
 * Warning logging - always outputs (including production)
 */
export const warn = (...args: any[]) => {
  console.warn('[WARN]', ...args);
};

/**
 * Info logging - only outputs in development mode
 */
export const info = (...args: any[]) => {
  if (isDevelopment) {
    console.info('[INFO]', ...args);
  }
};
