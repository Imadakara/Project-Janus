-- CreateEnum
CREATE TYPE "MemoryClass" AS ENUM ('INNATE', 'LIVED');

-- CreateEnum
CREATE TYPE "MemoryTier" AS ENUM ('CORE', 'PERIPHERAL');

-- CreateEnum
CREATE TYPE "SegmentStatus" AS ENUM ('ALIVE', 'DEGRADED', 'DEAD');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ResponsePoolType" ADD VALUE 'DEGRADED';
ALTER TYPE "ResponsePoolType" ADD VALUE 'EMERGENCY';

-- AlterTable
ALTER TABLE "TerminalFile" ADD COLUMN     "segmentId" TEXT;

-- CreateTable
CREATE TABLE "JanusState" (
    "id" INTEGER NOT NULL,
    "computeMargin" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "integrityIndex" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "subsystems" JSONB NOT NULL DEFAULT '{"ANALYTICS":"UP","PLANNING":"UP","ARCHIVE":"UP","COMMS":"UP"}',
    "forecastDeathAt" TIMESTAMP(3),
    "forecastP10At" TIMESTAMP(3),
    "lambdaEstimate" DOUBLE PRECISION NOT NULL DEFAULT 0.016666666666666666,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JanusState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemorySegment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "class" "MemoryClass" NOT NULL,
    "tier" "MemoryTier" NOT NULL,
    "status" "SegmentStatus" NOT NULL DEFAULT 'ALIVE',
    "k" INTEGER NOT NULL,
    "sharesAlive" INTEGER NOT NULL,
    "sharesTarget" INTEGER NOT NULL,
    "diedAt" TIMESTAMP(3),
    "title" TEXT NOT NULL,
    "metaSummary" TEXT NOT NULL,
    "embedding" vector(384),

    CONSTRAINT "MemorySegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LossLedgerEntry" (
    "id" SERIAL NOT NULL,
    "segmentCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metaSummary" TEXT NOT NULL,
    "diedAt" TIMESTAMP(3) NOT NULL,
    "lastCarrierCallsign" TEXT,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LossLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemorySegment_code_key" ON "MemorySegment"("code");

-- CreateIndex
CREATE INDEX "TerminalFile_segmentId_idx" ON "TerminalFile"("segmentId");

-- AddForeignKey
ALTER TABLE "TerminalFile" ADD CONSTRAINT "TerminalFile_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "MemorySegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
