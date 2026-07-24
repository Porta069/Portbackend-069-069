-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('APPLICANT', 'EMPLOYER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'APPLICANT',
ADD COLUMN     "companyName" TEXT;
