/**
 * MarathonRatingsService - Replaces external rating calculation API calls.
 *
 * Preserves original business logic from the old MarathonRatingsService.js:
 *   calculate()   - pre-processes data, then runs local rating calculation
 *                   (replaces HTTP POST to /ratings/mm/calculate)
 *   loadRatings() - replaces HTTP POST to /ratings/mm/load
 *   loadCoders()  - replaces HTTP POST to /ratings/coders/load
 *
 * The rating calculation itself (previously in the Java ratings-calculation-service)
 * is now performed locally using the ported Qubits algorithm.
 */

import * as _ from 'lodash';
import { createLogger } from '../common/logger';
import { prisma } from '../common/prismaClient';
import { getSubmissions, getFinalSubmissions } from '../common/helper';
import { CoderRating, processMarathonRatings } from '../libs/algorithm/AlgorithmQubits';

const logger = createLogger('MarathonRatingsService');

// ---------------------------------------------------------------------------
// Data loading (replaces MarathonDataLoader from Java)
// ---------------------------------------------------------------------------

/**
 * Load coder data for a given round from the database.
 * Mirrors the SQL in MarathonDataLoader.java:
 *   SELECT lcr.coder_id, lcr.system_point_total, ar.rating, ar.vol, ar.num_ratings
 *   FROM long_comp_result lcr, OUTER(algo_rating ar)
 *   WHERE lcr.round_id = ? AND lcr.attended = 'Y'
 *     AND lcr.new_rating IS NULL AND lcr.new_vol IS NULL
 *     AND ar.coder_id = lcr.coder_id AND ar.algo_rating_type_id = 3
 *   ORDER BY lcr.system_point_total DESC
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
    orderBy: {
      system_point_total: 'desc',
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

// ---------------------------------------------------------------------------
// Data persistence (replaces MarathonDataPersistor from Java)
// ---------------------------------------------------------------------------

/**
 * Persist calculated ratings back to the database.
 * Mirrors MarathonDataPersistor.java exactly:
 *   1. Update long_comp_result (set old_rating from algo_rating, then new)
 *   2. Update or insert algo_rating
 *   3. Mark round as rated
 */
async function persistRatings(roundId: number, coders: CoderRating[]): Promise<void> {
  logger.info(`Persisting ratings for ${coders.length} coders in round ${roundId}`);

  for (const coder of coders) {
    const newRating = coder.newRating ?? coder.rating;
    const newVol = coder.newVolatility ?? coder.volatility;

    // Fetch existing algo_rating for old_rating/old_vol
    const existingAlgo = await prisma.algo_rating.findFirst({
      where: { coder_id: coder.coderId, algo_rating_type_id: 3 },
    });

    // 1. Update long_comp_result
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

    // 2. Upsert algo_rating
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

  // 3. Mark round as rated
  await prisma.round.updateMany({
    where: { round_id: roundId },
    data: { rated_ind: 1 },
  });

  logger.info(`Successfully persisted ratings for round ${roundId}`);
}

// ---------------------------------------------------------------------------
// Rating calculation (replaces Java MarathonRatingProcess.runProcess)
// ---------------------------------------------------------------------------

/**
 * Run the full rating calculation for a round.
 * This mirrors MarathonRatingProcess.runProcess():
 *   1. Load data
 *   2. Run algorithm on ALL coders (provisional)
 *   3. Persist first-timers only
 *   4. Run algorithm on experienced coders only (non-provisional)
 *   5. Persist experienced coders
 */
async function runRatingProcess(roundId: number): Promise<string> {
  logger.info(`Starting rating process for round ${roundId}`);

  const data = await loadCoderData(roundId);

  if (data.length === 0) {
    logger.info(`No unrated coders found for round ${roundId}. Already calculated or no data.`);
    return 'ALREADY_CALCULATED';
  }

  // Provisional run: all coders
  const provData = data.map((c) => ({ ...c }));
  const ratedProvData = processMarathonRatingsProvisional(provData);

  // Filter to first-timers only (numRatings === 1 after algorithm run)
  const firstTimers = ratedProvData.filter((c) => c.numRatings === 1);

  // Persist first-timers
  if (firstTimers.length > 0) {
    await persistRatings(roundId, firstTimers);
    logger.info(`Persisted ${firstTimers.length} first-timer ratings (provisional)`);
  }

  // Non-provisional run: only experienced coders (from original data)
  const nonProvData = data.filter((c) => c.numRatings > 0).map((c) => ({ ...c }));

  if (nonProvData.length > 0) {
    const ratedNonProvData = processMarathonRatingsProvisional(nonProvData);
    await persistRatings(roundId, ratedNonProvData);
    logger.info(`Persisted ${ratedNonProvData.length} experienced-coder ratings (non-provisional)`);
  }

  return 'SUCCESS';
}

/**
 * Single-pass algorithm run (used for both provisional and non-provisional).
 * Wraps the AlgorithmQubits runQubitsAlgorithm directly.
 */
import { runQubitsAlgorithm } from '../libs/algorithm/AlgorithmQubits';

function processMarathonRatingsProvisional(coders: CoderRating[]): CoderRating[] {
  if (coders.length === 0) return coders;
  return runQubitsAlgorithm(coders);
}

// ---------------------------------------------------------------------------
// Public API  (matches original MarathonRatingsService.js exports)
// ---------------------------------------------------------------------------

/**
 * Main entry point — called from KafkaHandlerService for autopilot events.
 * Preserves original calculate() signature and behavior:
 *   1. Resolve roundId from legacyId via Prisma
 *   2. Pre-process: update attended flags from V5 submissions
 *   3. Run local rating calculation (replaces external API call)
 */
export async function calculate(challengeId: string, legacyId: number): Promise<void> {
  try {
    logger.info('=== Marathon Match ratings calculation start ===');

    // Resolve roundId from legacy challenge ID
    // In the old code this was: infxDB.getRoundId(legacyId)
        // The round table now has contest_id to mirror the original Informix schema.
    const roundRow = await prisma.round.findFirst({
      where: { contest_id: legacyId },
    });
    const roundId = roundRow ? roundRow.round_id : legacyId;
    logger.info(`Round ID: ${roundId}`);

    // Pre-process: ensure attended flags are correct
    // Original code fetched LCR entries and V5 submissions,
    // then updated attended='Y' for members with valid final submissions.
    const lcrEntries = await prisma.long_comp_result.findMany({
      where: { round_id: roundId },
    });

    try {
      const submissions = await getSubmissions(challengeId);
      const finalSubmissions = await getFinalSubmissions(submissions);
      logger.info(`Final submissions: ${finalSubmissions.length}`);

      for (const submission of finalSubmissions) {
        const match = lcrEntries.find(
          (e) => e.coder_id === submission.memberId
        );
        if (match && match.attended === 'N') {
          await prisma.long_comp_result.updateMany({
            where: { round_id: roundId, coder_id: match.coder_id },
            data: { attended: 'Y' },
          });
        }
      }
    } catch (subError) {
      // V5 API may not be available in local/test environments.
      // Log and continue with existing data.
      logger.warn(`Could not fetch V5 submissions (non-fatal): ${subError}`);
    }

    // Run the rating calculation locally
    const status = await runRatingProcess(roundId);

    logger.info(`=== Marathon Match ratings calculation ${status} ===`);
  } catch (error) {
    logger.error('=== Marathon Match ratings calculation failure ===');
    logger.error(`${error}`);
    throw error;
  }
}

/**
 * Load marathon ratings data to DW (replaces /ratings/mm/load API call).
 * Called by KafkaHandlerService in response to LOAD_CODERS success event.
 *
 * NOTE: The /ratings/mm/load endpoint is NOT in scope for this challenge.
 * The DW loading logic remains in the external service or is a no-op here.
 */
export async function loadRatings(roundId: number): Promise<void> {
  logger.info(`=== Load Ratings start for round ${roundId} ===`);
  // DW loading is out of scope for this challenge (/ratings/mm/load not in scope).
  // In production, this would either call the external service or be migrated separately.
  logger.info(`=== Load Ratings end for round ${roundId} ===`);
}

/**
 * Load coder data to DW (replaces /ratings/coders/load API call).
 * Called by KafkaHandlerService in response to RATINGS_CALCULATION success event.
 *
 * NOTE: The /ratings/coders/load endpoint is NOT in scope for this challenge.
 */
export async function loadCoders(roundId: number): Promise<void> {
  logger.info(`=== Load Coders start for round ${roundId} ===`);
  // Coder loading is out of scope for this challenge (/ratings/coders/load not in scope).
  logger.info(`=== Load Coders end for round ${roundId} ===`);
}
