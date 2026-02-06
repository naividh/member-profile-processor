/**
 * KafkaHandlerService - Updated Kafka message handler.
 * 
 * Replaces the old helper.js logic that called external API endpoints
 * (initiateRatingCalculation, initiateLoadRatings, initiateLoadCoders)
 * with direct local function calls to MarathonRatingsService.
 */

import config from '../../config/default';
import logger from '../common/logger';
import {
  calculateMarathonRatings,
  loadMarathonRatings,
  loadCoderRatings,
} from './MarathonRatingsService';

interface KafkaPayload {
  topic?: string;
  originator?: string;
  timestamp?: string;
  'mime-type'?: string;
  payload?: {
    roundId?: number;
    phaseId?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Handle incoming Kafka messages.
 * Routes messages to the appropriate handler based on the topic.
 */
export async function handleMessage(topic: string, message: KafkaPayload): Promise<void> {
  logger.info(`Handling message from topic: ${topic}`);

  try {
    const payload = message.payload || message;

    switch (topic) {
      case config.MARATHON_RATING_TOPIC:
        await handleMarathonRating(payload);
        break;

      case config.AGORITHM_RATING_TOPIC:
        await handleAlgorithmRating(payload);
        break;

      default:
        logger.warn(`Unknown topic: ${topic}`);
    }
  } catch (error) {
    logger.error(`Error handling message from topic ${topic}: ${error}`);
    throw error;
  }
}

/**
 * Handle marathon rating messages.
 * 
 * OLD FLOW:
 *   1. helper.initiateRatingCalculation(roundId) -> HTTP POST to /ratings/mm/calculate
 *   2. Java service fires Kafka event
 *   3. helper.initiateLoadRatings() -> HTTP POST to /ratings/mm/load
 *   4. helper.initiateLoadCoders() -> HTTP POST to /ratings/coders/load
 * 
 * NEW FLOW:
 *   1. calculateMarathonRatings(roundId) - runs algorithm locally with Prisma/Postgres
 *   2. loadMarathonRatings(roundId) - post-processing (if needed)
 *   3. loadCoderRatings() - update coder profiles (if needed)
 */
async function handleMarathonRating(payload: any): Promise<void> {
  const roundId = payload.roundId || payload.round_id;

  if (!roundId) {
    logger.error('Marathon rating message missing roundId');
    return;
  }

  logger.info(`Processing marathon rating for round: ${roundId}`);

  // Step 1: Calculate ratings locally (replaces API call to /ratings/mm/calculate)
  await calculateMarathonRatings(roundId);

  // Step 2: Load/update marathon ratings (replaces API call to /ratings/mm/load)
  await loadMarathonRatings(roundId);

  // Step 3: Load/update coder ratings (replaces API call to /ratings/coders/load)
  await loadCoderRatings();

  logger.info(`Marathon rating processing complete for round: ${roundId}`);
}

/**
 * Handle algorithm rating messages.
 * For now, delegates to marathon rating handler as the logic is the same.
 */
async function handleAlgorithmRating(payload: any): Promise<void> {
  const roundId = payload.roundId || payload.round_id;

  if (!roundId) {
    logger.error('Algorithm rating message missing roundId');
    return;
  }

  logger.info(`Processing algorithm rating for round: ${roundId}`);

  // Same flow as marathon rating
  await calculateMarathonRatings(roundId);
  await loadMarathonRatings(roundId);
  await loadCoderRatings();

  logger.info(`Algorithm rating processing complete for round: ${roundId}`);
}
