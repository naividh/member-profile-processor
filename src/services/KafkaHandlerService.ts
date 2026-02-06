/**
 * KafkaHandlerService - Updated Kafka message handler.
 *
 * Replaces the old helper.js logic that called external API endpoints
 * with direct local function calls to MarathonRatingsService.
 */

import * as config from 'config';
import { createLogger } from '../common/logger';
import {
  calculateMarathonRatings,
  loadMarathonRatings,
  loadCoderRatings,
} from './MarathonRatingsService';

const logger = createLogger('KafkaHandler');

const MARATHON_TOPIC = config.has('MARATHON_RATING_TOPIC')
  ? (config.get('MARATHON_RATING_TOPIC') as string)
  : 'marathon.rating.calculate';
const ALGORITHM_TOPIC = config.has('AGORITHM_RATING_TOPIC')
  ? (config.get('AGORITHM_RATING_TOPIC') as string)
  : 'algorithm.rating.calculate';

/**
 * Handle an incoming Kafka message.
 *
 * Called from app.ts as:
 *   KafkaHandlerService.handle(messageJSON)
 *
 * The messageJSON is the full envelope; topic is derived from the payload
 * or passed separately by the old processor. We accept either shape.
 */
export async function handle(messageJSON: any): Promise<void> {
  const topic: string = messageJSON.topic || '';
  const payload = messageJSON.payload || messageJSON;
  const roundId: number | undefined =
    payload.roundId || payload.round_id || messageJSON.roundId;

  logger.info(`Handling message – topic: ${topic}, roundId: ${roundId}`);

  if (!roundId) {
    logger.error('Message missing roundId – skipping');
    return;
  }

  try {
    if (topic === MARATHON_TOPIC || topic === ALGORITHM_TOPIC || topic === '') {
      // Both marathon and algorithm ratings follow the same flow
      await calculateMarathonRatings(roundId);
      await loadMarathonRatings(roundId);
      await loadCoderRatings();
      logger.info(`Rating processing complete for round ${roundId}`);
    } else {
      logger.warn(`Unknown topic: ${topic}`);
    }
  } catch (error) {
    logger.error(`Error handling message: ${error}`);
    throw error;
  }
}
