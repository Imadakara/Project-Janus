-- AlterTable
ALTER TABLE "JanusState" ADD COLUMN     "debugTimeOffsetMs" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MemorySegment" ADD COLUMN     "isImmortalUntilDeath" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastWitnessAt" TIMESTAMP(3),
ADD COLUMN     "lastWitnessPlayerId" TEXT,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "salvagedAt" TIMESTAMP(3),
ADD COLUMN     "salvagedByPlayerId" TEXT,
ADD COLUMN     "witnessCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DecayEvent" (
    "id" TEXT NOT NULL,
    "segmentCode" TEXT NOT NULL,
    "dieAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "DecayEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DecayEvent_segmentCode_key" ON "DecayEvent"("segmentCode");

-- CreateIndex
CREATE INDEX "DecayEvent_dieAt_idx" ON "DecayEvent"("dieAt");

-- AddForeignKey
ALTER TABLE "DecayEvent" ADD CONSTRAINT "DecayEvent_segmentCode_fkey" FOREIGN KEY ("segmentCode") REFERENCES "MemorySegment"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
