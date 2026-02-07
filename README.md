# Member Profile Processor - Enhanced with Rating Calculation

This is the enhanced member-profile-processor that integrates the marathon match rating calculation directly into the Kafka consumer, replacing the external Java-based ratings-calculation-service.

## What Changed

### Removed
- All Informix database dependencies (ifxnjs, informixDB.js)
- External API calls to the rating calculation service:
  - `POST /ratings/mm/calculate` (was `helper.initiateRatingCalculation`)
  - `POST /ratings/mm/load` (was `helper.initiateLoadRatings`)
  - `POST /ratings/coders/load` (was `helper.initiateLoadCoders`)

### Added
- TypeScript throughout the project
- Prisma ORM for PostgreSQL database access
- Local rating calculation using the Qubits algorithm (ported from Java)
- Docker Compose setup with PostgreSQL and Kafka
- Prisma migrations for database schema
- Seed data for testing

## Architecture

The processor subscribes to two Kafka topics and preserves the original event routing:

**Autopilot Notifications** (`KAFKA_AUTOPILOT_NOTIFICATIONS_TOPIC`):
- Triggered when a review phase ends (`phaseTypeName=review`, `state=end`)
- Looks up challenge via V5 API to check if it's a `marathon_match` subTrack
- If so, calls `calculate(challengeId, legacyId)` which:
  - Resolves `roundId` from `legacyId` (contest_id) via PostgreSQL
    - Pre-processes attendance flags using V5 submission data
      - Runs the Qubits rating algorithm locally (replaces `POST /ratings/mm/calculate`)
      
      **Rating Service Events** (`KAFKA_RATING_SERVICE_TOPIC`):
      - Sequences: `RATINGS_CALCULATION` success → `loadCoders()` → `LOAD_CODERS` success → `loadRatings()`
      - `loadCoders` and `loadRatings` are out of scope for this challenge (stubs only)
      3. No external API calls are made

## Project Structure

```
src/
  app.ts                          # Kafka consumer entry point
  common/
    logger.ts                     # Winston logger
    helper.ts                     # Utility functions (Kafka options, M2M token)
    prismaClient.ts               # Prisma client singleton
  libs/
    algorithm/
      AlgorithmQubits.ts          # Qubits rating algorithm (ported from Java)
  services/
    MarathonRatingsService.ts     # Rating calculation (replaces external API)
    KafkaHandlerService.ts        # Kafka message handler
config/
  default.js                      # Application configuration
prisma/
  schema.prisma                   # Database schema
  seed.ts                         # Test seed data
  migrations/                     # Prisma migration files
docker/
  docker-compose.yml              # Docker services (Postgres, Kafka, Zookeeper)
  Dockerfile                      # Application container
```

## Prerequisites

- Node.js >= 18.x
- PostgreSQL 16.3
- Kafka (with Zookeeper)
- Docker and Docker Compose (for containerized setup)

## Setup

### Option 1: Docker Compose (Recommended)

This starts PostgreSQL, Kafka, Zookeeper, and the processor together:

```bash
git clone https://github.com/naividh/member-profile-processor.git
cd member-profile-processor

cd docker
docker-compose up -d

# Wait for services to be healthy (~15 seconds)
docker-compose ps

cd ..
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ratings_db?schema=public"
npm install
npx prisma migrate deploy
npx prisma db seed
```

### Option 2: Local Development

```bash
git clone https://github.com/naividh/member-profile-processor.git
cd member-profile-processor
npm install

cp .env.example .env
# Edit .env with your PostgreSQL and Kafka connection details

npx prisma generate
npx prisma migrate deploy
npx prisma db seed

npm run build
npm start
```

For development with auto-reload: `npm run dev`

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/ratings_db?schema=public` |
| `KAFKA_URL` | Kafka broker URL | `localhost:9092` |
| `KAFKA_GROUP_ID` | Consumer group ID | `member-profile-processor` |
| `MARATHON_RATING_TOPIC` | Kafka topic for marathon ratings | `marathon.rating.calculate` |
| `AGORITHM_RATING_TOPIC` | Kafka topic for algorithm ratings | `algorithm.rating.calculate` |
| `KAFKA_AUTOPILOT_NOTIFICATIONS_TOPIC` | Kafka subscription topic 1 | `marathon.rating.calculate` |
| `KAFKA_RATING_SERVICE_TOPIC` | Kafka subscription topic 2 | `algorithm.rating.calculate` |
| `LOG_LEVEL` | Logging level | `info` |
| `AUTH0_URL` | Auth0 URL (optional) | (empty) |
| `AUTH0_AUDIENCE` | Auth0 audience (optional) | (empty) |
| `AUTH0_CLIENT_ID` | Auth0 client ID (optional) | (empty) |
| `AUTH0_CLIENT_SECRET` | Auth0 client secret (optional) | (empty) |

## Verification and Testing

### 1. Seed Data

The seed script (`prisma/seed.ts`) creates test data:

- **Round 10001** with `rated_ind = 0`
- **5 coders** with competition results in `long_comp_result`:
  - Coder 1001: score 95.50, experienced (existing algo_rating with 1500 rating, 400 vol, 5 prior ratings)
  - Coder 1002: score 88.25, experienced (existing algo_rating with 1350 rating, 450 vol, 3 prior ratings)
  - Coder 1003: score 72.00, first-timer (no algo_rating entry)
  - Coder 1004: score 60.75, first-timer
  - Coder 1005: score 45.00, first-timer

Run the seed: `npx prisma db seed`

### 2. Verify with Kafka Message

Send a test Kafka message to trigger rating calculation:

```bash
docker exec -it docker-kafka-1 kafka-console-producer \
  --broker-list localhost:9092 \
  --topic marathon.rating.calculate
```

Then type and press Enter:
```json
{"topic":"marathon.rating.calculate","payload":{"roundId":10001}}
```

### 3. Verify Results in Database

After the message is processed, check the results:

```sql
-- Connect: docker exec -it docker-postgres-1 psql -U postgres -d ratings_db

-- Check ratings were calculated
SELECT coder_id, system_point_total, old_rating, old_vol, new_rating, new_vol, rated_ind
FROM long_comp_result WHERE round_id = 10001 ORDER BY system_point_total DESC;

-- Check algo_rating table was updated
SELECT coder_id, rating, vol, num_ratings, round_id, last_rated_round_id
FROM algo_rating WHERE algo_rating_type_id = 3 ORDER BY coder_id;

-- Check the round was marked as rated
SELECT * FROM round WHERE round_id = 10001;
```

**Expected results:**

- All 5 coders should have `new_rating` and `new_vol` values populated
- Experienced coders (1001, 1002) should have `old_rating`/`old_vol` reflecting their previous ratings
- First-timers (1003, 1004, 1005) start with default rating 1200 and volatility 515
- The `algo_rating` table should have entries for all 5 coders with `algo_rating_type_id = 3`
- The round `rated_ind` should be `1`

### 4. Lint Check

```bash
npm run lint
```

### 5. Run Tests

```bash
npm test
```

## How the Rating Algorithm Works

The Qubits algorithm (`AlgorithmQubits.ts`) is faithfully ported from `com.topcoder.ratings.libs.algorithm.AlgorithmQubits` (Java). Steps:

1. Initialize defaults for first-time coders (rating=1200, volatility=515)
2. Compute competition factor from all participants' ratings and volatilities
3. Compute expected ranks using win probability between all pairs
4. Compute actual ranks from scores (with tie handling)
5. Update ratings using weighted adjustment with caps
6. Update volatilities based on prediction accuracy

The `processMarathonRatings` function mirrors `MarathonRatingProcess.runProcess()`:
- First runs the algorithm on ALL coders (provisional run)
- Keeps only first-timers' results from the provisional run
- **Persists first-timers immediately** (before non-provisional run)
- Then runs the algorithm on experienced coders only (non-provisional run)
- Persists experienced coders' results

