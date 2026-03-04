-- AlterTable: 新しいカラムを追加
ALTER TABLE "Facility" ADD COLUMN "residentDisplaySortMode" TEXT;
ALTER TABLE "Facility" ADD COLUMN "residentPrintSortMode" TEXT;

-- 既存データの移行: residentSortMode から新カラムへ
UPDATE "Facility" SET "residentDisplaySortMode" = "residentSortMode", "residentPrintSortMode" = "residentSortMode" WHERE "residentSortMode" = 'aiueo';
UPDATE "Facility" SET "residentDisplaySortMode" = 'manual', "residentPrintSortMode" = 'manual' WHERE "residentSortMode" IS NULL OR "residentSortMode" = 'manual';

-- 旧カラムを削除
ALTER TABLE "Facility" DROP COLUMN "residentSortMode";
