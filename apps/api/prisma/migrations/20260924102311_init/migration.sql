-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MetaConnectionType" AS ENUM ('INSTAGRAM', 'ADS');

-- CreateEnum
CREATE TYPE "IgMediaType" AS ENUM ('IMAGE', 'VIDEO', 'CAROUSEL', 'REEL', 'STORY');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('IMAGE', 'VIDEO', 'REEL', 'STORY');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'MISSED');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('LEAD', 'FOLLOWER', 'REACH', 'AD_CLICK');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('INSTAGRAM', 'FB_ADS', 'TELEGRAM', 'MANUAL', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "AiInsightKind" AS ENUM ('ANALYSIS', 'CONTENT_SUGGESTION');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tashkent',
    "leadWebhookToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MANAGER',

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaConnection" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" "MetaConnectionType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgDailyInsight" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "profileViews" INTEGER NOT NULL DEFAULT 0,
    "followers" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IgDailyInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgMedia" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "type" "IgMediaType" NOT NULL,
    "caption" TEXT,
    "permalink" TEXT,
    "thumbnailUrl" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IgMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgConversation" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "participantName" TEXT NOT NULL,
    "participantAvatar" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "lastInboundAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IgConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "externalId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "text" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "sentByUserId" TEXT,

    CONSTRAINT "IgMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL,
    "objective" TEXT NOT NULL,
    "dailyBudget" INTEGER,
    "startTime" TIMESTAMP(3),
    "stopTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaignDailyInsight" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "spend" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdCampaignDailyInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPost" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" "PostType" NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'SCHEDULED',
    "autoPublish" BOOLEAN NOT NULL DEFAULT true,
    "mediaAssetId" TEXT,
    "createdById" TEXT NOT NULL,
    "igMediaId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "GoalType" NOT NULL,
    "target" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "date" DATE NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "kind" "AiInsightKind" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiChatThread" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "School_leadWebhookToken_key" ON "School"("leadWebhookToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_externalId_key" ON "User"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_schoolId_key" ON "Membership"("userId", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MetaConnection_externalId_idx" ON "MetaConnection"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaConnection_schoolId_type_key" ON "MetaConnection"("schoolId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "IgDailyInsight_schoolId_date_key" ON "IgDailyInsight"("schoolId", "date");

-- CreateIndex
CREATE INDEX "IgMedia_schoolId_postedAt_idx" ON "IgMedia"("schoolId", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IgMedia_schoolId_externalId_key" ON "IgMedia"("schoolId", "externalId");

-- CreateIndex
CREATE INDEX "IgConversation_schoolId_lastMessageAt_idx" ON "IgConversation"("schoolId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "IgConversation_schoolId_externalId_key" ON "IgConversation"("schoolId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "IgMessage_externalId_key" ON "IgMessage"("externalId");

-- CreateIndex
CREATE INDEX "IgMessage_conversationId_sentAt_idx" ON "IgMessage"("conversationId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaign_schoolId_externalId_key" ON "AdCampaign"("schoolId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaignDailyInsight_campaignId_date_key" ON "AdCampaignDailyInsight"("campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_key_key" ON "MediaAsset"("key");

-- CreateIndex
CREATE INDEX "ContentPost_schoolId_scheduledAt_idx" ON "ContentPost"("schoolId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Goal_schoolId_endDate_idx" ON "Goal"("schoolId", "endDate");

-- CreateIndex
CREATE INDEX "Lead_schoolId_date_idx" ON "Lead"("schoolId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_schoolId_source_externalId_key" ON "Lead"("schoolId", "source", "externalId");

-- CreateIndex
CREATE INDEX "AiInsight_schoolId_kind_createdAt_idx" ON "AiInsight"("schoolId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AiChatThread_schoolId_userId_idx" ON "AiChatThread"("schoolId", "userId");

-- CreateIndex
CREATE INDEX "AiChatMessage_threadId_createdAt_idx" ON "AiChatMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaConnection" ADD CONSTRAINT "MetaConnection_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IgDailyInsight" ADD CONSTRAINT "IgDailyInsight_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IgMedia" ADD CONSTRAINT "IgMedia_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IgConversation" ADD CONSTRAINT "IgConversation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IgMessage" ADD CONSTRAINT "IgMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "IgConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignDailyInsight" ADD CONSTRAINT "AdCampaignDailyInsight_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatThread" ADD CONSTRAINT "AiChatThread_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AiChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
