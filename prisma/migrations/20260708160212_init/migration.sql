-- CreateEnum
CREATE TYPE "Role" AS ENUM ('UNASSIGNED', 'ARCHIVIST', 'TECHNICIAN', 'SECURITY_OFFICER');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('PLAYER', 'AI');

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'UNASSIGNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trustLevel" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandModule" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "requiredRole" "Role",

    CONSTRAINT "CommandModule_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PlayerModuleUnlock" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerModuleUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerminalFolder" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentPath" TEXT,
    "visibleToRole" "Role",

    CONSTRAINT "TerminalFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerminalFile" (
    "id" TEXT NOT NULL,
    "folderPath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "requiredModuleKey" TEXT NOT NULL,
    "fullContent" TEXT NOT NULL,
    "analysisSummary" TEXT NOT NULL,
    "visibleToRole" "Role",

    CONSTRAINT "TerminalFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerFileAnalysis" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerFileAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_email_key" ON "Player"("email");

-- CreateIndex
CREATE INDEX "ChatSession_playerId_idx" ON "ChatSession"("playerId");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerModuleUnlock_playerId_moduleKey_key" ON "PlayerModuleUnlock"("playerId", "moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "TerminalFolder_path_key" ON "TerminalFolder"("path");

-- CreateIndex
CREATE INDEX "TerminalFile_folderPath_idx" ON "TerminalFile"("folderPath");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerFileAnalysis_playerId_fileId_key" ON "PlayerFileAnalysis"("playerId", "fileId");

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerModuleUnlock" ADD CONSTRAINT "PlayerModuleUnlock_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerModuleUnlock" ADD CONSTRAINT "PlayerModuleUnlock_moduleKey_fkey" FOREIGN KEY ("moduleKey") REFERENCES "CommandModule"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerminalFile" ADD CONSTRAINT "TerminalFile_requiredModuleKey_fkey" FOREIGN KEY ("requiredModuleKey") REFERENCES "CommandModule"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerFileAnalysis" ADD CONSTRAINT "PlayerFileAnalysis_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerFileAnalysis" ADD CONSTRAINT "PlayerFileAnalysis_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "TerminalFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
