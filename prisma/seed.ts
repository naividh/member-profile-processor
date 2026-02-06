/**
 * Seed data for testing the marathon match rating calculation.
 *
 * Run with: npx prisma db seed
 * (requires "prisma": { "seed": "ts-node prisma/seed.ts" } in package.json)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create a test round
  await prisma.round.upsert({
    where: { round_id: 10001 },
    update: {},
    create: { round_id: 10001, rated_ind: 0 },
  });

  // Create test coders with results for the round
  const coders = [
    { coder_id: 1001, system_point_total: 95.50, attended: 'Y' },
    { coder_id: 1002, system_point_total: 88.25, attended: 'Y' },
    { coder_id: 1003, system_point_total: 72.00, attended: 'Y' },
    { coder_id: 1004, system_point_total: 60.75, attended: 'Y' },
    { coder_id: 1005, system_point_total: 45.00, attended: 'Y' },
  ];

  for (const c of coders) {
    await prisma.long_comp_result.upsert({
      where: { round_id_coder_id: { round_id: 10001, coder_id: c.coder_id } },
      update: {},
      create: {
        round_id: 10001,
        coder_id: c.coder_id,
        attended: c.attended,
        system_point_total: c.system_point_total,
        rated_ind: 0,
        num_ratings: 0,
      },
    });
  }

  // Create existing algo_rating for coder 1001 (experienced coder)
  await prisma.algo_rating.upsert({
    where: { coder_id_algo_rating_type_id: { coder_id: 1001, algo_rating_type_id: 3 } },
    update: {},
    create: {
      coder_id: 1001,
      algo_rating_type_id: 3,
      rating: 1500,
      vol: 400,
      num_ratings: 5,
      round_id: 9999,
      highest_rating: 1550,
      lowest_rating: 1400,
      first_rated_round_id: 9000,
      last_rated_round_id: 9999,
    },
  });

  // Create existing algo_rating for coder 1002 (experienced coder)
  await prisma.algo_rating.upsert({
    where: { coder_id_algo_rating_type_id: { coder_id: 1002, algo_rating_type_id: 3 } },
    update: {},
    create: {
      coder_id: 1002,
      algo_rating_type_id: 3,
      rating: 1350,
      vol: 450,
      num_ratings: 3,
      round_id: 9998,
      highest_rating: 1400,
      lowest_rating: 1300,
      first_rated_round_id: 9000,
      last_rated_round_id: 9998,
    },
  });

  // Coders 1003-1005 are new (no algo_rating entry = first-timers)

  console.log('Seed data created successfully.');
  console.log('Test round: 10001 with 5 coders (2 experienced, 3 first-timers)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
