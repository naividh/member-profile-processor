/**
 * Configuration - Updated for TypeScript/Prisma migration.
 *
 * Added: V5_API_URL for challenge/submission lookups.
 * Added: TOKEN_CACHE_TIME for M2M token caching.
 * Removed: All Informix-related config (INFORMIX_HOST, etc.)
 */

module.exports = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'debug',

  // Kafka
  KAFKA_URL: process.env.KAFKA_URL || 'localhost:9092',
  KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID || 'member-profile-processor',
  KAFKA_CLIENT_CERT: process.env.KAFKA_CLIENT_CERT || '',
  KAFKA_CLIENT_CERT_KEY: process.env.KAFKA_CLIENT_CERT_KEY || '',

  // Kafka topics
  KAFKA_AUTOPILOT_NOTIFICATIONS_TOPIC:
    process.env.KAFKA_AUTOPILOT_NOTIFICATIONS_TOPIC || 'notifications.autopilot',
  KAFKA_RATING_SERVICE_TOPIC:
    process.env.KAFKA_RATING_SERVICE_TOPIC || 'rating.calculation.service',

  // Auth0 M2M credentials (for V5 API calls)
  AUTH0_URL: process.env.AUTH0_URL || '',
  AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID || '',
  AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET || '',
  AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE || 'https://api.topcoder.com',
  TOKEN_CACHE_TIME: parseInt(process.env.TOKEN_CACHE_TIME || '86400000', 10),

  // V5 API
  V5_API_URL: process.env.V5_API_URL || 'https://api.topcoder-dev.com/v5',

  // PostgreSQL (via Prisma - see DATABASE_URL in .env)
  // No explicit DB config needed here; Prisma reads DATABASE_URL from .env

  // Health check
  HEALTHCHECK_PORT: process.env.HEALTHCHECK_PORT || 3000,
};
