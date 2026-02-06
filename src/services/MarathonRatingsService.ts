/**
 * MarathonRatingsService - Main service that replaces the external rating calculation API calls.
 *
 * This service loads marathon match data from PostgreSQL via Prisma,
 * runs the Qubits rating algorithm locally, and persists results back to the database.
 *
 * Replaces: HTTP POST to /ratings/mm/calculate, /ratings/coders/load, /ratings/mm/load
 */

import { createLogger } from '../common/logger';
import { prisma } from '../common/prismaClient';
import { CoderRating, processMarathonRatings } from '../libs/algorithm/AlgorithmQubits';

const logger = createLogger('MarathonRatingsService');

/**
 * Load coder data for a given round from the database.
 * Replaces MarathonDataLoader from Java service.
 */
async function loadCoderData(roundId: number): Promise<CoderRating[]> {
  logger.info(`Loading coder data for round ${roundId}`);

  const results = await prisma.long_comp_result.findMany({
    where: {
      round_id: roundId,
      attended: { in: ['Y', 'y'] },
      new_rating: null,
      new_vol: null,
    },
    select: {
      coder_id: true,
      system_point_total: true,
    },
  });

  logger.info(`Found ${results.length} coders for round ${roundId}`);

  const coders: CoderRating[] = [];

  for (const r of results) {
    const algoRating = await prisma.algo_rating.findFirst({
      where: { coder_id: r.coder_id, algo_rating_type_id: 3 },
    });

    coders.push({
      coderId: r.coder_id,
      rating: algoRating?.rating ?? 0,
      volatility: algoRating?.vol ?? 0,
      numRatings: algoRating?.num_ratings ?? 0,
      score: Number(r.system_point_total) || 0,
    });
  }

  return coders;
}

/**
 * Persist calculated ratings back to the database.
 * Matches MarathonDataPersistor from Java service.
 */
async function persistRatings(roundId: number, coders: CoderRating[]): Promise<void> {
  logger.info(`Persisting ratings for ${coders.length} coders in round ${roundId}`);

  for (const coder of coders) {
    const newRating = coder.newRating ?? coder.rating;
    const newVol = coder.newVolatility ?? coder.volatility;

    // Update long_comp_result (matches Java: set old_rating from algo_rating, then new)
    const existingAlgo = await prisma.algo_rating.findFirst({
      where: { coder_id: coder.coderId, algo_rating_type_id: 3 },
    });

    await prisma.long_comp_result.updateMany({
      where: { round_id: roundId, coder_id: coder.coderId },
      data: {
        rated_ind: 1,
        old_rating: existingAlgo?.rating ?? null,
        old_vol: existingAlgo?.vol ?? null,
        new_rating: newRating,
        new_vol: newVol,
      },
    });

    // Upsert algo_rating (matches Java: update or insert)
    if (existingAlgo) {
      await prisma.algo_rating.updateMany({
        where: { coder_id: coder.coderId, algo_rating_type_id: 3 },
        data: {
          rating: newRating,
          vol: newVol,
          round_id: roundId,
          num_ratings: { increment: 1 },
          last_rated_round_id: roundId,
        },
      });
    } else {
      await prisma.algo_rating.create({
        data: {
          coder_id: coder.coderId,
          algo_rating_type_id: 3,
          rating: newRating,
          vol: newVol,
          num_ratings: 1,
          round_id: roundId,
          highest_rating: newRating,
          lowest_rating: newRating,
          first_rated_round_id: roundId,
          last_rated_round_id: roundId,
        },
      });
    }
  }

  // Mark the round as rated
  await prisma.round.updateMany({
    where: { round_id: roundId },
    data: { rated_ind: 1 },
  });

  logger.info(`Successfully persisted ratings for round ${roundId}`);
}

/**
 * Calculate marathon match ratings for a given round.
 * This is the main entry point that replaces the external API call to /ratings/mm/calculate.
 */
export async function calculateMarathonRatings(roundId: number): Promise<void> {
  logger.info(`Starting marathon rating calculation for round ${roundId}`);

  try {
    const coders = await loadCoderData(roundId);

    if (coders.length === 0) {
      logger.info(`No unrated coders found for round ${roundId}. Skipping.`);
      return;
    }

    const ratedCoders = processMarathonRatings(coders);
    await persistRatings(roundId, ratedCoders);

    logger.info(`Marathon rating calculation completed for round ${roundId}`);
  } catch (error) {
    logger.error(`Error calculating marathon ratings for round ${roundId}: ${error}`);
    throw error;
  }
}

/**
 * Load marathon ratings data (replaces /ratings/mm/load API call).
 */
export async function loadMarathonRatings(roundId: number): Promise<void> {
  logger.info(`Loading marathon ratings for round ${roundId} (handled by calculateMarathonRatings)`);
}

/**
 * Load coder ratings (replaces /ratings/coders/load API call).
 */
export async function loadCoderRatings(): Promise<void> {
  logger.info('Loading coder ratings (handled by calculateMarathonRatings)');
}
