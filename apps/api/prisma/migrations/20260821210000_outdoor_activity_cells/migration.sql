-- CreateTable
CREATE TABLE "outdoor_activity_cells" (
    "id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sport" "OutdoorSport" NOT NULL,
    "cell" TEXT NOT NULL,
    "resolution" INTEGER NOT NULL,
    "distance_meters" DOUBLE PRECISION NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outdoor_activity_cells_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outdoor_activity_cells_activity_id_cell_key" ON "outdoor_activity_cells"("activity_id", "cell");

-- CreateIndex
CREATE INDEX "outdoor_activity_cells_cell_resolution_finished_at_idx" ON "outdoor_activity_cells"("cell", "resolution", "finished_at");

-- CreateIndex
CREATE INDEX "outdoor_activity_cells_user_id_finished_at_idx" ON "outdoor_activity_cells"("user_id", "finished_at");

-- CreateIndex
CREATE INDEX "outdoor_activity_cells_sport_cell_finished_at_idx" ON "outdoor_activity_cells"("sport", "cell", "finished_at");

-- AddForeignKey
ALTER TABLE "outdoor_activity_cells" ADD CONSTRAINT "outdoor_activity_cells_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "outdoor_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outdoor_activity_cells" ADD CONSTRAINT "outdoor_activity_cells_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
