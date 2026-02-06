/**
 * MarathonRatingsService - Main service that replaces the external rating calculation API calls.
 * 
 * This service loads marathon match data from PostgreSQL via Prisma,
 * runs the Qubits rating algorithm locally, and persists results back to the database.
 * 
 * Replaces: HTTP POST to /ratings/mm/calculate, /ratings/coders/load, /ratings/mm/load
 */

import logger from '../common/logger';
import { prisma } from '../common/prismaClient';
import { CoderRating, processMarathonRatings } from '../libs/algorithm/AlgorithmQubits';

/**
 * Load coder data for a given round from the database.
 * Replaces MarathonDataLoader from Java service.
 */
async function loadCoderData(roundId: number): Promise<CoderRating[]> {
  logger.info(`Loading coder data for round ${roundId}`);

  // Get all coders who participated in the round and haven't been rated yet
  const results = await prisma.long_comp_result.findMany({
    where: {
      round_id: roundId,
      rated_ind: 0,
      attended: { in: ['Y', 'y'] },
    },
    select: {
      coder_id: true,
      system_point_total: true,
      new_rating: true,
      new_vol: true,
      old_rating: true,
      old_vol: true,
      num_ratings: true,
    },
  });

  logger.info(`Found ${results.length} coders for round ${roundId}`);

  // Map database results to CoderRating objects
  const coders: CoderRating[] = results.map((r) => ({
    coderId: r.coder_id,
    rating: r.old_rating ?? 0,
    volatility: r.old_vol ?? 0,
    numRatings: r.num_ratings ?? 0,
    score: Number(r.system_point_total) || 0,
    rank: 0,
  }));

  // Load existing algo_rating data for established coders
  for (const coder of coders) {
    const algoRating = await prisma.algo_rating.findFirst({
      where: {
        coder_id: coder.coderId,
        algo_rating_type_id: 3, // Marathon Match type
      },
    });

    if (algoRating) {
      coder.rating = algoRating.rating ?? coder.rating;
      coder.volatility = algoRating.vol ?? coder.volatility;
      coder.numRatings = algoRating.num_ratings ?? coder.numRatings;
    }
  }

  return coders;
}

/**
 * Persist calculated ratings back to the database.
 * Replaces MarathonDataPersistor from Java service.
 */
async function persistRatings(roundId: number, coders: CoderRating[]): Promise<void> {
  logger.info(`Persisting ratings for ${coders.length} coders in round ${roundId}`);

  for (const coder of coders) {
    // Update long_comp_result with new ratings
    await prisma.long_comp_result.updateMany({
      where: {
        round_id: roundId,
        coder_id: coder.coderId,
      },
      data: {
        new_rating: coder.newRating ?? coder.rating,
        new_vol: coder.newVolatility ?? coder.volatility,
        rated_ind: 1,
        num_ratings: (coder.numRatings || 0) + 1,
      },
    });

    // Upsert algo_rating
    const existingAlgoRating = await prisma.algo_rating.findFirst({
      where: {
        coder_id: coder.coderId,
        algo_rating_type_id: 3,
      },
    });

    if (existingAlgoRating) {
      await prisma.algo_rating.updateMany({
        where: {
          coder_id: coder.coderId,
          algo_rating_type_id: 3,
        },
        data: {
          rating: coder.newRating ?? coder.rating,
          vol: coder.newVolatility ?? coder.volatility,
          num_ratings: (coder.numRatings || 0) + 1,
          last_rated_round_id: roundId,
        },
      });
    } else {
      await prisma.algo_rating.create({
        data: {
          coder_id: coder.coderId,
          algo_rating_type_id: 3,
          rating: coder.newRating ?? coder.rating,
          vol: coder.newVolatility ?? coder.volatility,
          num_ratings: 1,
          last_rated_round_id: roundId,
          highest_rating: coder.newRating ?? coder.rating,
          lowest_rating: coder.newRating ?? coder.rating,
          first_rated_round_id: roundId,
        },
      });
    }

    // Update highest/lowest rating
    if (existingAlgoRating) {
      const newRating = coder.newRating ?? coder.rating;
      const updates: any = {};
      if (newRating > (existingAlgoRating.highest_rating ?? 0)) {
        updates.highest_rating = newRating;
      }
      if (newRating < (existingAlgoRating.lowest_rating ?? 9999)) {
        updates.lowest_rating = newRating;
      }
      if (Object.keys(updates).length > 0) {
        await prisma.algo_rating.updateMany({
          where: {
            coder_id: coder.coderId,
            algo_rating_type_id: 3,
          },
          data: updates,
        });
      }
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
    // Step 1: Load coder data from PostgreSQL
    const coders = await loadCoderData(roundId);

    if (coders.length === 0) {
      logger.info(`No coders found for round ${roundId}. Skipping calculation.`);
      return;
    }

    // Step 2: Run the Qubits rating algorithm
    const ratedCoders = processMarathonRatings(coders);

    // Step 3: Persist results back to PostgreSQL
    await persistRatings(roundId, ratedCoders);

    logger.info(`Marathon rating calculation completed for round ${roundId}`);
  } catch (error) {
    logger.error(`Error calculating marathon ratings for round ${roundId}: ${error}`);
    throw error;
  }
}

/**
 * Load marathon ratings data (replaces /ratings/mm/load API call).
 * After calculation, update derived tables if needed.
 */
export async function loadMarathonRatings(roundId: number): Promise<void> {
  logger.info(`Loading marathon ratings for round ${roundId}`);
  // The ratings are already persisted by calculateMarathonRatings.
  // This function exists for backward compatibility with the event flow.
  // Additional post-processing can be added here if needed.
  logger.info(`Marathon ratings loaded for round ${roundId}`);
}

/**
 * Load coder ratings (replaces /ratings/coders/load API call).
 */
export async function loadCoderRatings(): Promise<void> {
  logger.info('Loading coder ratings (no-op - handled by calculateMarathonRatings)');
  // Coder ratings are already updated during the calculation phase.
  // This function exists for backward compatibility.
}
