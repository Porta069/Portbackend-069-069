-- CreateEnum
CREATE TYPE "CompanySource" AS ENUM ('SELF', 'ADMIN', 'AI');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "JobApplicationStatus" AS ENUM ('SENT', 'SEEN', 'INTERVIEW', 'REJECTED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "JobOfferStatus" AS ENUM ('NEW', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ContactRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'DECLINED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "companyId" TEXT;

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slogan" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "gruendungsjahr" TEXT NOT NULL DEFAULT '',
    "mitarbeiter" TEXT NOT NULL DEFAULT '',
    "strasse" TEXT NOT NULL DEFAULT '',
    "plz" TEXT NOT NULL DEFAULT '',
    "ort" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "website" TEXT NOT NULL DEFAULT '',
    "kontaktName" TEXT NOT NULL DEFAULT '',
    "kontaktPosition" TEXT NOT NULL DEFAULT '',
    "kontaktTelefon" TEXT NOT NULL DEFAULT '',
    "kontaktEmail" TEXT NOT NULL DEFAULT '',
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "montage" TEXT NOT NULL DEFAULT '',
    "urlaubstage" INTEGER,
    "logo" TEXT,
    "source" "CompanySource" NOT NULL DEFAULT 'SELF',
    "managedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchQuestion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "hint" TEXT NOT NULL DEFAULT '',
    "scaleMin" INTEGER NOT NULL,
    "scaleMax" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "answerKey" TEXT NOT NULL,
    "valueMap" JSONB,
    "defaultWeight" INTEGER NOT NULL DEFAULT 2,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MatchQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "gewerk" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "city" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "montage" TEXT NOT NULL DEFAULT '',
    "fahrzeitIstArbeitszeit" BOOLEAN NOT NULL DEFAULT false,
    "startpunkt" TEXT NOT NULL DEFAULT 'Betrieb',
    "urlaubstage" INTEGER,
    "startText" TEXT NOT NULL DEFAULT 'Ab sofort',
    "extras" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "JobStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "CompanySource" NOT NULL DEFAULT 'SELF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCriterion" (
    "id" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "minValue" DOUBLE PRECISION NOT NULL,
    "maxValue" DOUBLE PRECISION NOT NULL,
    "weight" INTEGER NOT NULL,

    CONSTRAINT "JobCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'SENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOffer" (
    "id" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "contactPerson" TEXT NOT NULL DEFAULT '',
    "status" "JobOfferStatus" NOT NULL DEFAULT 'NEW',
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "status" "ContactRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchQuestion_key_key" ON "MatchQuestion"("key");

-- CreateIndex
CREATE INDEX "JobPosting_companyId_idx" ON "JobPosting"("companyId");

-- CreateIndex
CREATE INDEX "JobPosting_status_gewerk_idx" ON "JobPosting"("status", "gewerk");

-- CreateIndex
CREATE UNIQUE INDEX "JobCriterion_jobPostingId_questionId_key" ON "JobCriterion"("jobPostingId", "questionId");

-- CreateIndex
CREATE INDEX "JobApplication_userId_idx" ON "JobApplication"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_jobPostingId_userId_key" ON "JobApplication"("jobPostingId", "userId");

-- CreateIndex
CREATE INDEX "JobOffer_userId_idx" ON "JobOffer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JobOffer_jobPostingId_userId_key" ON "JobOffer"("jobPostingId", "userId");

-- CreateIndex
CREATE INDEX "ContactRequest_userId_idx" ON "ContactRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactRequest_companyId_userId_key" ON "ContactRequest"("companyId", "userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCriterion" ADD CONSTRAINT "JobCriterion_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCriterion" ADD CONSTRAINT "JobCriterion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "MatchQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
