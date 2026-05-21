import { neonHttpSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'
import type { Facility, Unit } from '@prisma/client'

/** 印刷（deposit-statement / batch-print）用: 施設 + アクティブユニット（Prisma findUnique と同一データ） */
export async function fetchFacilityWithActiveUnitsForPrint(
  facilityId: number
): Promise<(Facility & { units: Unit[] }) | null> {
  return withTransientDbRetries(
    `printFacility(activeUnits:${facilityId})`,
    async () => {
      const sql = neonHttpSql()
      const facilityRows = (await sql(
        `
SELECT
  f.id,
  f.name,
  f."positionName",
  f."positionHolderName",
  f."sortOrder",
  f."useSameOrderForDisplayAndPrint",
  f."useUnitOrderForPrint",
  f."residentDisplaySortMode",
  f."residentPrintSortMode",
  f."noticeTemplateNormal",
  f."noticeTemplateMoveOut",
  f."isActive",
  f."createdAt",
  f."updatedAt"
FROM "Facility" f
WHERE f.id = $1
LIMIT 1
`,
        [facilityId]
      )) as Record<string, unknown>[]

      if (!facilityRows.length) return null

      const facility = parseFacilityRow(facilityRows[0])

      const unitRows = (await sql(
        `
SELECT
  u.id,
  u."facilityId",
  u.name,
  u.capacity,
  u."displaySortOrder",
  u."printSortOrder",
  u."isActive",
  u."createdAt",
  u."updatedAt"
FROM "Unit" u
WHERE u."facilityId" = $1 AND u."isActive" = true
ORDER BY u."displaySortOrder" ASC NULLS LAST, u.id ASC
`,
        [facilityId]
      )) as Record<string, unknown>[]

      const units = unitRows.map(parseUnitRow)

      return { ...facility, units }
    }
  )
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value
  if (value == null) return new Date(0)
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? new Date(0) : d
}

function parseFacilityRow(row: Record<string, unknown>): Facility {
  return {
    id: Number(row.id),
    name: String(row.name),
    positionName: row.positionName != null ? String(row.positionName) : null,
    positionHolderName:
      row.positionHolderName != null ? String(row.positionHolderName) : null,
    sortOrder: Number(row.sortOrder),
    useSameOrderForDisplayAndPrint: Boolean(row.useSameOrderForDisplayAndPrint),
    useUnitOrderForPrint: Boolean(row.useUnitOrderForPrint),
    residentDisplaySortMode:
      row.residentDisplaySortMode != null
        ? String(row.residentDisplaySortMode)
        : null,
    residentPrintSortMode:
      row.residentPrintSortMode != null ? String(row.residentPrintSortMode) : null,
    noticeTemplateNormal:
      row.noticeTemplateNormal != null ? String(row.noticeTemplateNormal) : null,
    noticeTemplateMoveOut:
      row.noticeTemplateMoveOut != null ? String(row.noticeTemplateMoveOut) : null,
    isActive: Boolean(row.isActive),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  }
}

function parseUnitRow(row: Record<string, unknown>): Unit {
  return {
    id: Number(row.id),
    facilityId: Number(row.facilityId),
    name: String(row.name),
    capacity: row.capacity == null ? null : Number(row.capacity),
    displaySortOrder:
      row.displaySortOrder == null ? null : Number(row.displaySortOrder),
    printSortOrder: row.printSortOrder == null ? null : Number(row.printSortOrder),
    isActive: Boolean(row.isActive),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  }
}
