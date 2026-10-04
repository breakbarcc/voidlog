-- CreateTable
CREATE TABLE "player_phase_damage" (
    "id" TEXT NOT NULL,
    "playerResultId" TEXT NOT NULL,
    "phaseResultId" TEXT NOT NULL,
    "bossDamage" INTEGER NOT NULL,
    "totalDamage" INTEGER NOT NULL,

    CONSTRAINT "player_phase_damage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_phase_damage_phaseResultId_idx" ON "player_phase_damage"("phaseResultId");

-- CreateIndex
CREATE UNIQUE INDEX "player_phase_damage_playerResultId_phaseResultId_key" ON "player_phase_damage"("playerResultId", "phaseResultId");

-- AddForeignKey
ALTER TABLE "player_phase_damage" ADD CONSTRAINT "player_phase_damage_playerResultId_fkey" FOREIGN KEY ("playerResultId") REFERENCES "player_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_phase_damage" ADD CONSTRAINT "player_phase_damage_phaseResultId_fkey" FOREIGN KEY ("phaseResultId") REFERENCES "phase_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;
