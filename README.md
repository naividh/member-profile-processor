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

## Architecture

The processor subscribes to Kafka topics for marathon/algorithm rating events. When a message arrives:

1. `KafkaHandlerService` routes the message based on topic
2. `MarathonRatingsService.calculateMarathonRatings(roundId)` runs locally:
   - Loads coder data from PostgreSQL via Prisma (`long_comp_result`, `algo_rating`)
   - Runs the Qubits rating algorithm (`AlgorithmQubits.ts`)
   - Persists new ratings back to PostgreSQL
3. No external API calls are made

## Project Structure

```
src/
  app.ts                          # Kafka consumer entry point
  common/
    logger.ts                     # Winston logger
    helper.ts                     # Utility functions (Informix removed)
    prismaClient.ts               # Prisma client singleton
  libs/
    algorithm/
      AlgorithmQubits.ts          # Qubits rating algorithm (ported from Java)
  services/
    MarathonRatingsService.ts     # Rating calculation service (replaces external API)
    KafkaHandlerService.ts        # Kafka message handler
config/
  default.ts                      # Application configuration
prisma/
  schema.prisma                   # Database schema
docker/
  docker-compose.yml              # Docker services (Postgres, Kafka, Zookeeper)
  Dockerfile                      # Application container
```

## Setup

1. Install dependencies: `npm install`
2. Set up PostgreSQL and update `DATABASE_URL` in `.env`
3. Run Prisma migrations: `npx prisma migrate dev`
4. Generate Prisma client: `npx prisma generate`
5. Build: `npm run build`
6. Start: `npm start`

### Docker

```bash
cd docker
docker-compose up -d
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| DATABASE_URL | PostgreSQL connection string | postgresql://postgres:postgres@localhost:5432/ratings_db |
| KAFKA_URL | Kafka broker URL | localhost:9092 |
| KAFKA_GROUP_ID | Consumer group ID | member-profile-processor |
| MARATHON_RATING_TOPIC | Kafka topic for marathon ratings | marathon.rating.calculate |
| AGORITHM_RATING_TOPIC | Kafka topic for algorithm ratings | algorithm.rating.calculate |
| LOG_LEVEL | Logging level | info |
