/**
 * Helper module - Updated for TypeScript/Prisma.
 *
 * Retains V5 API functions needed by KafkaHandlerService for:
 *   - Challenge lookup (getChallengeDetails)
 *   - Submission fetching (getSubmissions, getFinalSubmissions)
 *
 * REMOVED:
 *   - All Informix database connections (replaced by Prisma)
 *   - initiateRatingCalculation() - now handled locally by MarathonRatingsService
 *   - initiateLoadRatings()       - now handled locally by MarathonRatingsService
 *   - initiateLoadCoders()        - now handled locally by MarathonRatingsService
 */

import * as config from 'config';
import * as _ from 'lodash';
import request from 'superagent';
import prefix from 'superagent-prefix';
import { createLogger } from './logger';

const logger = createLogger('Helper');

// ---------- M2M Auth ----------

let cachedToken: string | null = null;
let tokenExpiry = 0;

/**
 * Get M2M (machine-to-machine) token for V5 API calls.
 * Implements simple in-memory caching.
 */
export async function getM2Mtoken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  const auth0Url = config.has('AUTH0_URL') ? (config.get('AUTH0_URL') as string) : '';
  const clientId = config.has('AUTH0_CLIENT_ID') ? (config.get('AUTH0_CLIENT_ID') as string) : '';

  if (auth0Url && clientId) {
    try {
      const clientSecret = config.get('AUTH0_CLIENT_SECRET') as string;
      const audience = config.get('AUTH0_AUDIENCE') as string;
      const cacheTime = config.has('TOKEN_CACHE_TIME')
        ? (config.get('TOKEN_CACHE_TIME') as number)
        : 86400000;

      const response = await fetch(auth0Url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          audience,
        }),
      });
      const data: any = await response.json();
      cachedToken = data.access_token;
      tokenExpiry = now + cacheTime;
      return cachedToken as string;
    } catch (error) {
      logger.error(`Failed to get M2M token: ${error}`);
      throw error;
    }
  }
  return '';
}

// ---------- V5 API ----------

function getV5Api(token: string) {
  const apiUrl = config.has('V5_API_URL')
    ? (config.get('V5_API_URL') as string)
    : 'https://api.topcoder-dev.com/v5';
  return request.agent().use(prefix(apiUrl)).set('Authorization', `Bearer ${token}`);
}

/**
 * Fetch challenge details from V5 API.
 * Used by KafkaHandlerService to determine subTrack (marathon_match).
 */
export async function getChallengeDetails(queryParams: Record<string, any>): Promise<any | null> {
  const token = await getM2Mtoken();
  logger.info(`Fetching v5 challenge detail using query params: ${JSON.stringify(queryParams)}`);
  const response = await getV5Api(token).get('/challenges').query(queryParams);
  const content = _.get(response.body, '[0]');
  return content || null;
}

/**
 * Fetch all submissions for a given challenge from V5 API.
 */
export async function getSubmissions(challengeId: string): Promise<any[]> {
  const token = await getM2Mtoken();
  logger.info(`Fetching v5 submissions for challenge: ${challengeId}`);
  let allSubmissions: any[] = [];
  const queryParams: any = { challengeId, perPage: 500, page: 1 };

  let response: any;
  do {
    response = await getV5Api(token).get('/submissions').query(queryParams);
    queryParams.page++;
    allSubmissions = _.concat(allSubmissions, response.body);
  } while (response.headers['x-total-pages'] !== response.headers['x-page']);

  return allSubmissions;
}

/**
 * Get the latest (final) submission of each member.
 * Only includes submissions that have a reviewSummation.
 */
export async function getFinalSubmissions(submissions: any[]): Promise<any[]> {
  const uniqMembers = _.uniq(_.map(submissions, 'memberId'));
  const latestSubmissions: any[] = [];

  uniqMembers.forEach((memberId) => {
    const memberSubmissions = _.filter(submissions, { memberId });
    const sortedSubs = _.sortBy(memberSubmissions, [(i: any) => new Date(i.created)]);
    const last = _.last(sortedSubs);
    if (last && Object.prototype.hasOwnProperty.call(last, 'reviewSummation')) {
      latestSubmissions.push(last);
    }
  });

  return latestSubmissions;
}

// ---------- Kafka ----------

/**
 * Get Kafka consumer options from config.
 * Used by app.ts to initialise the no-kafka GroupConsumer.
 */
export function getKafkaOptions(): Record<string, any> {
  const options: Record<string, any> = {
    connectionString: config.get('KAFKA_URL') as string,
    groupId: config.get('KAFKA_GROUP_ID') as string,
  };

  if (config.has('KAFKA_CLIENT_CERT') && config.get('KAFKA_CLIENT_CERT')) {
    options.ssl = {
      cert: config.get('KAFKA_CLIENT_CERT'),
      key: config.get('KAFKA_CLIENT_CERT_KEY'),
    };
  }

  return options;
}

/**
 * Utility to wrap async handlers with error catching.
 */
export function wrapAsync(fn: (...args: any[]) => Promise<any>) {
  return (...args: any[]) => {
    fn(...args).catch((err: Error) => {
      logger.error(`Async error: ${err.message}`);
    });
  };
}
