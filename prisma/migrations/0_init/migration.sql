-- CreateTable
CREATE TABLE "round" (
      "round_id" INTEGER NOT NULL,
      "rated_ind" INTEGER NOT NULL DEFAULT 0,
          "contest_id" INTEGER,
      CONSTRAINT "round_pkey" PRIMARY KEY ("round_id")
  );

-- CreateTable
CREATE TABLE "long_comp_result" (
      "id" SERIAL NOT NULL,
      "round_id" INTEGER NOT NULL,
      "coder_id" INTEGER NOT NULL,
      "attended" VARCHAR(1),
      "system_point_total" DECIMAL(14,2),
      "old_rating" INTEGER,
      "old_vol" INTEGER,
      "new_rating" INTEGER,
      "new_vol" INTEGER,
      "rated_ind" INTEGER NOT NULL DEFAULT 0,
      "num_ratings" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "long_comp_result_pkey" PRIMARY KEY ("id")
  );

-- CreateTable
CREATE TABLE "algo_rating" (
      "id" SERIAL NOT NULL,
      "coder_id" INTEGER NOT NULL,
      "algo_rating_type_id" INTEGER NOT NULL,
      "rating" INTEGER DEFAULT 0,
      "vol" INTEGER DEFAULT 0,
      "num_ratings" INTEGER NOT NULL DEFAULT 0,
      "round_id" INTEGER,
      "highest_rating" INTEGER,
      "lowest_rating" INTEGER,
      "first_rated_round_id" INTEGER,
      "last_rated_round_id" INTEGER,
      CONSTRAINT "algo_rating_pkey" PRIMARY KEY ("id")
  );

-- CreateIndex
CREATE INDEX "long_comp_result_round_id_idx" ON "long_comp_result"("round_id");
CREATE INDEX "long_comp_result_coder_id_idx" ON "long_comp_result"("coder_id");
CREATE UNIQUE INDEX "long_comp_result_round_id_coder_id_key" ON "long_comp_result"("round_id", "coder_id");
CREATE INDEX "algo_rating_coder_id_idx" ON "algo_rating"("coder_id");
CREATE UNIQUE INDEX "algo_rating_coder_id_algo_rating_type_id_key" ON "algo_rating"("coder_id", "algo_rating_type_id");
