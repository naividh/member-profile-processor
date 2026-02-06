/**
 * Helper module - Updated for TypeScript/Prisma.
 * 
 * REMOVED:
 * - All Informix database connections (ifxnjs, informixDB.js)
 * - initiateRatingCalculation() - was HTTP POST to /ratings/mm/calculate
 * - initiateLoadRatings() - was HTTP POST to /ratings/mm/load
 * - initiateLoadCoders() - was HTTP POST to /ratings/coders/load
 * 
 * These functions are now handled directly by MarathonRatingsService.ts
 * using Prisma ORM with PostgreSQL.
 */

import logger from './logger';
import config from '../../config/default';

/**
 * Get M2M (machine-to-machine) token for API calls.
 * Kept for any remaining member-api calls (non-rating related).
 */
export async function getM2Mtoken(): Promise<string> {
  // If Auth0 config is provided, fetch token
  if (config.AUTH0_URL && config.AUTH0_CLIENT_ID) {
    try {
      const response = await fetch(config.AUTH0_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: config.AUTH0_CLIENT_ID,
          client_secret: config.AUTH0_CLIENT_SECRET,
          audience: config.AUTH0_AUDIENCE,
        }),
      });
      const data = await response.json();
      return data.access_token;
    } catch (error) {
      logger.error(`Failed to get M2M token: ${error}`);
      throw error;
    }
  }
  return '';
}

/**
 * Utility to wrap async handlers with error catching.
 */
export function wrapAsync(fn: (...args: any[]) => Promise<any>) {
  return (...args: any[]) => {
    fn(...args).catch((err: Error) => {
      logger.error(`Async error: ${err.message}`);
    });
  };
}
