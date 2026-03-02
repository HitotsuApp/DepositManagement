-- AlterTable
ALTER TABLE "Facility" ADD COLUMN     "useSameOrderForDisplayAndPrint" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "useUnitOrderForPrint" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Resident" ADD COLUMN     "displaySortOrder" INTEGER,
ADD COLUMN     "printSortOrder" INTEGER;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "displaySortOrder" INTEGER,
ADD COLUMN     "printSortOrder" INTEGER;
