/**
 * AlgorithmQubits - Ported from Java Rating Calculation Service
 * Implements the Qubits rating algorithm for marathon match ratings.
 */

export interface CoderRating {
  coderId: number;
  rating: number;
  volatility: number;
  numRatings: number;
  score: number;
  rank: number;
  newRating?: number;
  newVolatility?: number;
}

/**
 * Error function (erf) approximation.
 * Used in probability calculations.
 */
function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

/**
 * Inverse of the standard normal CDF (normsinv / probit function).
 * Given a probability p, returns the z-score.
 */
function normsinv(p: number): number {
  // Rational approximation for lower region
  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
    4.374664141464968e+00, 2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number, r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1));
  }
}

/**
 * Calculate the probability that coder i beats coder j.
 */
function winProbability(ri: number, rj: number, vi: number, vj: number): number {
  return 0.5 * (erf((ri - rj) / Math.sqrt(2.0 * (vi * vi + vj * vj))) + 1.0);
}

/**
 * Run the Qubits rating algorithm on a group of coders.
 * This is the core algorithm that computes new ratings and volatilities.
 */
export function runQubitsAlgorithm(coders: CoderRating[]): CoderRating[] {
  const numCoders = coders.length;
  if (numCoders === 0) return coders;

  // Sort by score descending to assign ranks
  const sorted = [...coders].sort((a, b) => b.score - a.score);
  
  // Assign ranks (1-based, handle ties)
  for (let i = 0; i < sorted.length; i++) {
    sorted[i].rank = i + 1;
  }

  // Handle ties: assign average rank for tied scores
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].score === sorted[i].score) {
      j++;
    }
    const avgRank = (i + 1 + j) / 2.0;
    for (let k = i; k < j; k++) {
      sorted[k].rank = avgRank;
    }
    i = j;
  }

  // Calculate expected ranks and performance
  for (const coder of sorted) {
    let expectedRank = 0.5; // Start at 0.5 for self

    for (const other of sorted) {
      if (other.coderId === coder.coderId) continue;
      expectedRank += winProbability(other.rating, coder.rating, other.volatility, coder.volatility);
    }

    // Expected performance
    const expectedPerf = -normsinv(expectedRank / numCoders);
    
    // Actual performance
    const actualPerf = -normsinv(coder.rank / numCoders);
    
    // Performance difference (capped)
    const perfDiff = actualPerf - expectedPerf;
    const perfAs = coder.volatility * coder.volatility;
    
    // Weight (how much to adjust)
    const weight = 1.0 / (1.0 - (0.42 / (coder.numRatings + 1) + 0.18)) - 1.0;
    
    // Cap
    let cap: number;
    if (coder.numRatings === 0) {
      cap = 150;
    } else if (coder.numRatings === 1) {
      cap = 1500;
    } else {
      cap = Math.max(150, 1500 - 500 * (coder.numRatings - 2));
      if (cap < 150) cap = 150;
    }

    // New volatility
    const newVolatility = Math.sqrt(
      (perfAs * perfAs) / (perfAs + weight * weight) + 
      (weight * weight * perfDiff * perfDiff) / ((perfAs + weight * weight) * (perfAs + weight * weight))
    );

    // New rating
    let newRating = coder.rating + (perfDiff * perfAs) / (perfAs + weight * weight);

    // Cap the rating change
    if (Math.abs(newRating - coder.rating) > cap) {
      newRating = coder.rating + (newRating > coder.rating ? cap : -cap);
    }

    coder.newRating = Math.round(newRating);
    coder.newVolatility = Math.round(newVolatility);
  }

  return sorted;
}

/**
 * Process marathon match ratings for a round.
 * Splits coders into provisional (first-timers) and non-provisional groups.
 */
export function processMarathonRatings(coders: CoderRating[]): CoderRating[] {
  // Separate into provisional (numRatings === 0) and established coders
  const provisional = coders.filter(c => c.numRatings === 0);
  const established = coders.filter(c => c.numRatings > 0);

  // If there are provisional coders, assign initial ratings
  for (const coder of provisional) {
    if (coder.rating === 0) {
      coder.rating = 1200;
    }
    if (coder.volatility === 0) {
      coder.volatility = 535;
    }
  }

  // Run algorithm on all coders together
  const allCoders = [...provisional, ...established];
  
  if (allCoders.length > 0) {
    return runQubitsAlgorithm(allCoders);
  }

  return allCoders;
}
