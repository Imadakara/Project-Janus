-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "MessageLayer" AS ENUM ('DETERMINISTIC', 'LIGHT_LLM', 'FULL_LLM');

-- CreateEnum
CREATE TYPE "ResponsePoolType" AS ENUM ('NORMAL', 'REPEATED', 'ANNOYED');

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "escalationReason" TEXT,
ADD COLUMN     "handledByLayer" "MessageLayer",
ADD COLUMN     "intentConfidence" DOUBLE PRECISION,
ADD COLUMN     "matchedIntent" TEXT;

-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN     "activeContext" TEXT,
ADD COLUMN     "desyncScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "disposition" JSONB NOT NULL DEFAULT '{"trust":0,"tension":0}',
ADD COLUMN     "intentRepeatCount" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "lastConfidenceTier" TEXT,
ADD COLUMN     "shortTermMemory" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "TerminalFile" ADD COLUMN     "embedding" vector(384);

-- CreateTable
CREATE TABLE "Intent" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Intent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentExample" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "embedding" vector(384),

    CONSTRAINT "IntentExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponsePool" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "type" "ResponsePoolType" NOT NULL DEFAULT 'NORMAL',
    "requiredRole" "Role",

    CONSTRAINT "ResponsePool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponseFragment" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "template" TEXT NOT NULL,

    CONSTRAINT "ResponseFragment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Intent_code_key" ON "Intent"("code");

-- CreateIndex
CREATE INDEX "IntentExample_intentId_idx" ON "IntentExample"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "IntentExample_intentId_phrase_key" ON "IntentExample"("intentId", "phrase");

-- CreateIndex
CREATE UNIQUE INDEX "ResponsePool_intentId_type_requiredRole_key" ON "ResponsePool"("intentId", "type", "requiredRole");

-- CreateIndex
CREATE INDEX "ResponseFragment_poolId_idx" ON "ResponseFragment"("poolId");

-- AddForeignKey
ALTER TABLE "IntentExample" ADD CONSTRAINT "IntentExample_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "Intent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponsePool" ADD CONSTRAINT "ResponsePool_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "Intent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseFragment" ADD CONSTRAINT "ResponseFragment_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "ResponsePool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
