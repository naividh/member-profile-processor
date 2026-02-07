/**
 * KafkaHandlerService - Kafka message handler.
 *
 * Preserves the original routing logic:
 *   - KAFKA_AUTOPILOT_NOTIFICATIONS_TOPIC: review phase end -> marathon_match check -> calculate
 *   - KAFKA_RATING_SERVICE_TOPIC: event-driven sequencing (calculate -> loadCoders -> loadRatings)
 *
 * Rating calculation is now performed locally instead of calling the external API.
 */

import * as config from 'config';
import * as _ from 'lodash';
import { createLogger } from '../common/logger';
import { getChallengeDetails } from '../common/helper';
import {
  calculate,
  loadRatings,
  loadCoders,
} from './MarathonRatingsService';

const logger = createLogger('KafkaHandler');

/**
 * Handle an incoming Kafka message.
 *
 * Mirrors the original KafkaHandlerService.js switch/case logic exactly.
 */
export async function handle(message: any): Promise<void> {
  const topic: string = message.topic || '';

  switch (topic) {
    // ---------------------------------------------------------------
    // Autopilot notifications — review phase end triggers MM rating
    // ---------------------------------------------------------------
    case config.get('KAFKA_AUTOPILOT_NOTIFICATIONS_TOPIC') as string: {
      const payload = message.payload || {};

      if (
        payload.phaseTypeName &&
        payload.phaseTypeName.toLowerCase() === 'review' &&
        payload.state &&
        payload.state.toLowerCase() === 'end'
      ) {
        // Look up challenge details from V5 API
        const challengeDetails = await getChallengeDetails({
          legacyId: payload.projectId,
        });

        if (
          challengeDetails &&
          _.get(challengeDetails, 'legacy.subTrack', '').toLowerCase() === 'marathon_match'
        ) {
          await calculate(challengeDetails.id, challengeDetails.legacyId);
        }
      }
      break;
    }

    // ---------------------------------------------------------------
    // Rating-service events — sequencing: calculate -> loadCoders -> loadRatings
    // ---------------------------------------------------------------
    case config.get('KAFKA_RATING_SERVICE_TOPIC') as string: {
      if (message.originator === 'rating.calculation.service') {
        const payload = message.payload || {};

        if (
          payload.event === 'RATINGS_CALCULATION' &&
          payload.status === 'SUCCESS'
        ) {
          await loadCoders(payload.roundId);
        } else if (
          payload.event === 'LOAD_CODERS' &&
          payload.status === 'SUCCESS'
        ) {
          await loadRatings(payload.roundId);
        }
      }
      break;
    }

    default:
      logger.warn(`Unhandled topic: ${topic}`);
      break;
  }
}
