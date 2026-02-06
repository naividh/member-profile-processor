/**
 * AlgorithmQubits - Ported from Java Rating Calculation Service
 * Implements the Qubits rating algorithm for marathon match ratings.
 *
 * Faithfully ported from:
 *   com.topcoder.ratings.libs.algorithm.AlgorithmQubits (Java)
 */

export interface CoderRating {
  coderId: number;
  rating: number;
  volatility: number;
  numRatings: number;
  score: number;
  expectedRank?: number;
  expectedPerformance?: number;
  actualRank?: number;
  actualPerformance?: number;
  newRating?: number;
  newVolatility?: number;
}

const INITIAL_WEIGHT = 0.60;
const FINAL_WEIGHT = 0.18;
const FIRST_VOLATILITY = 385;
const P_LOW = 0.02425;
const P_HIGH = 1.0 - P_LOW;
const NORMINV_A = [-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00];
const NORMINV_B = [-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01];
const NORMINV_C = [-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00];
const NORMINV_D = [7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00];

function sqr(x: number): number { return x * x; }

function erf(z: number): number {
  const t = 1.0 / (1.0 + 0.5 * Math.abs(z));
  const ans = 1 - t * Math.exp(-z*z - 1.26551223 + t*(1.00002368 + t*(0.37409196 + t*(0.09678418 + t*(-0.18628806 + t*(0.27886807 + t*(-1.13520398 + t*(1.48851587 + t*(-0.82215223 + t*0.17087277)))))))));
  return z >= 0 ? ans : -ans;
}

function erfc(z: number): number { return 1.0 - erf(z); }

function refine(x: number, d: number): number {
  if (d > 0 && d < 1) {
    const e = 0.5 * erfc(-x / Math.sqrt(2.0)) - d;
    const u = e * Math.sqrt(2.0 * Math.PI) * Math.exp((x * x) / 2.0);
    x = x - u / (1.0 + (x * u) / 2.0);
  }
  return x;
}

function normsinv(p: number): number {
  if (p <= 0) return Number.NEGATIVE_INFINITY;
  if (p >= 1) return Number.POSITIVE_INFINITY;
  let z: number;
  if (p < P_LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    z = (((((NORMINV_C[0]*q+NORMINV_C[1])*q+NORMINV_C[2])*q+NORMINV_C[3])*q+NORMINV_C[4])*q+NORMINV_C[5]) / ((((NORMINV_D[0]*q+NORMINV_D[1])*q+NORMINV_D[2])*q+NORMINV_D[3])*q+1);
  } else if (P_HIGH < p) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    z = -(((((NORMINV_C[0]*q+NORMINV_C[1])*q+NORMINV_C[2])*q+NORMINV_C[3])*q+NORMINV_C[4])*q+NORMINV_C[5]) / ((((NORMINV_D[0]*q+NORMINV_D[1])*q+NORMINV_D[2])*q+NORMINV_D[3])*q+1);
  } else {
    const q = p - 0.5;
    const r = q * q;
    z = ((((((NORMINV_A[0]*r+NORMINV_A[1])*r+NORMINV_A[2])*r+NORMINV_A[3])*r+NORMINV_A[4])*r+NORMINV_A[5])*q) / (((((NORMINV_B[0]*r+NORMINV_B[1])*r+NORMINV_B[2])*r+NORMINV_B[3])*r+NORMINV_B[4])*r+1);
  }
  return refine(z, p);
}

function winProbability(r1: number, r2: number, v1: number, v2: number): number {
  return (erf((r1 - r2) / Math.sqrt(2.0 * (v1*v1 + v2*v2))) + 1.0) * 0.5;
}

export function runQubitsAlgorithm(coders: CoderRating[]): CoderRating[] {
  const n = coders.length;
  if (n === 0) return coders;
  for (const c of coders) { if (c.numRatings === 0) { c.volatility = 515; c.rating = 1200; } }
  let rave = 0;
  for (const c of coders) rave += c.rating;
  rave /= n;
  let rtemp = 0, vtemp = 0;
  for (const c of coders) { vtemp += sqr(c.volatility); rtemp += sqr(c.rating - rave); }
  const matchStdDevEquals = Math.sqrt(vtemp / n + rtemp / (n - 1));
  for (const ci of coders) {
    let est = 0.5;
    for (const cj of coders) { est += winProbability(cj.rating, ci.rating, cj.volatility, ci.volatility); }
    ci.expectedRank = est;
    ci.expectedPerformance = -normsinv((est - 0.5) / n);
  }
  for (const c of coders) c.actualRank = 0;
  let i = 0;
  while (i < n) {
    let max = Number.NEGATIVE_INFINITY;
    let count = 0;
    for (const c of coders) { if (c.score >= max && c.actualRank === 0) { if (c.score === max) count++; else count = 1; max = c.score; } }
    for (const c of coders) { if (c.score === max) { c.actualRank = i + 0.5 + count / 2.0; c.actualPerformance = -normsinv((i + count / 2.0) / n); } }
    i += count;
  }
  for (const c of coders) {
    const diff = (c.actualPerformance ?? 0) - (c.expectedPerformance ?? 0);
    const oldRating = c.rating;
    const performedAs = oldRating + diff * matchStdDevEquals;
    let weight = (INITIAL_WEIGHT - FINAL_WEIGHT) / (c.numRatings + 1) + FINAL_WEIGHT;
    weight = 1.0 / (1.0 - weight) - 1.0;
    if (oldRating >= 2000 && oldRating < 2500) weight = (weight * 4.5) / 5.0;
    if (oldRating >= 2500) weight = (weight * 4.0) / 5.0;
    let newRating = (oldRating + weight * performedAs) / (1 + weight);
    const cap = 150 + 1500 / (2 + c.numRatings);
    if (oldRating - newRating > cap) newRating = oldRating - cap;
    if (newRating - oldRating > cap) newRating = oldRating + cap;
    if (newRating < 1) newRating = 1;
    c.newRating = Math.round(newRating);
    if (c.numRatings !== 0) {
      c.newVolatility = Math.round(Math.sqrt(sqr(c.volatility) / (1 + weight) + sqr(newRating - oldRating) / weight));
    } else {
      c.newVolatility = Math.round(FIRST_VOLATILITY);
    }
  }
  for (const c of coders) c.numRatings += 1;
  return coders;
}

export function processMarathonRatings(coders: CoderRating[]): CoderRating[] {
  if (coders.length === 0) return coders;
  const provCoders = coders.map((c) => ({ ...c }));
  runQubitsAlgorithm(provCoders);
  const firstTimers = provCoders.filter((c) => c.numRatings === 1);
  const nonProv = coders.filter((c) => c.numRatings > 0).map((c) => ({ ...c }));
  if (nonProv.length > 0) runQubitsAlgorithm(nonProv);
  return [...firstTimers, ...nonProv];
}
