/**
 * Helper module - Updated for TypeScript/Prisma.
 *
 * REMOVED:
 * - All Informix database connections
 * - initiateRatingCalculation() - now handled by MarathonRatingsService
 * - initiateLoadRatings() - now handled by MarathonRatingsService
 * - initiateLoadCoders() - now handled by MarathonRatingsService
 */

import * as config from 'config';
import { createLogger } from './logger';

const logger = createLogger('Helper');

/**
 * Get Kafka consumer options from config.
 * Used by app.ts to initialise the no-kafka GroupConsumer.
 */
export function getKafkaOptions(): Record<string, any> {
  const options: Record<string, any> = {
    connectionString: config.get('KAFKA_URL') as string,
    groupId: config.get('KAFKA_GROUP_ID') as string,
  };

  // SSL options (if provided)
  if (config.has('KAFKA_CLIENT_CERT') && config.get('KAFKA_CLIENT_CERT')) {
    options.ssl = {
      cert: config.get('KAFKA_CLIENT_CERT'),
      key: config.get('KAFKA_CLIENT_CERT_KEY'),
    };
  }

  return options;
}

/**
 * Get M2M (machine-to-machine) token for API calls.
 * Kept for any remaining member-api calls (non-rating related).
 */
export async function getM2Mtoken(): Promise<string> {
  const auth0Url = config.has('AUTH0_URL') ? (config.get('AUTH0_URL') as string) : '';
  const clientId = config.has('AUTH0_CLIENT_ID') ? (config.get('AUTH0_CLIENT_ID') as string) : '';
  if (auth0Url && clientId) {
    try {
      const clientSecret = config.get('AUTH0_CLIENT_SECRET') as string;
      const audience = config.get('AUTH0_AUDIENCE') as string;
      const response = await fetch(auth0Url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          audience,
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
