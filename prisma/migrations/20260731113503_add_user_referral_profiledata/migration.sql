-- AlterTable: store referral name + all onboarding answers per user
ALTER TABLE "User" ADD COLUMN     "referredBy" TEXT,
ADD COLUMN     "profileData" JSONB;
