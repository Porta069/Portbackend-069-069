-- AlterTable
ALTER TABLE "JobPosting" ADD COLUMN     "aufgaben" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "aufgabenMin" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "ausbildungMin" TEXT,
ADD COLUMN     "bereiche" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "berufe" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "deutschMin" TEXT,
ADD COLUMN     "erfahrungMax" TEXT,
ADD COLUMN     "erfahrungMin" TEXT,
ADD COLUMN     "fuehrerscheinMin" TEXT,
ADD COLUMN     "gebotenes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "gewichte" JSONB,
ADD COLUMN     "montageMin" TEXT,
ADD COLUMN     "startBis" TEXT;
