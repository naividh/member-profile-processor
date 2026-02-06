/**
 * Application configuration.
 * All environment variables and defaults are centralized here.
 * Informix dependencies have been removed; PostgreSQL is now via Prisma.
 */

module.exports = {
    // Kafka configuration
    KAFKA_URL: process.env.KAFKA_URL || 'localhost:9092',
    KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID || 'member-profile-processor',

    // Kafka topics
    AGORITHM_RATING_TOPIC: process.env.AGORITHM_RATING_TOPIC || 'algorithm.rating.calculate',
    MARATHON_RATING_TOPIC: process.env.MARATHON_RATING_TOPIC || 'marathon.rating.calculate',

    // Kafka topics used by app.ts subscriber
    KAFKA_AUTOPILOT_NOTIFICATIONS_TOPIC: process.env.KAFKA_AUTOPILOT_NOTIFICATIONS_TOPIC || 'marathon.rating.calculate',
    KAFKA_RATING_SERVICE_TOPIC: process.env.KAFKA_RATING_SERVICE_TOPIC || 'algorithm.rating.calculate',

    // Database (PostgreSQL via Prisma)
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ratings_db?schema=public',

    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',

    // Auth (if needed for other API calls)
    AUTH0_URL: process.env.AUTH0_URL || '',
    AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE || '',
    AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID || '',
    AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET || '',
    TOKEN_CACHE_TIME: parseInt(process.env.TOKEN_CACHE_TIME || '86400000', 10),

    // Member API (for profile updates, not rating calculations)
    MEMBER_API_URL: process.env.MEMBER_API_URL || '',
};
