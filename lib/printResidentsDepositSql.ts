import type { Resident, Unit } from '@prisma/client'
import { neonHttpSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'

/** `loadResidentsForDepositPrint` 用: Prisma と同一フィールド形状 */
export type ResidentWithUnitRow = Resident & { unit: Unit }

function toDate(value: unknown): Date {
  if (value instanceof Date) return value
  if (value == null) return new Date(0)
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? new Date(0) : d
}

function toDateOrNull(value: unknown): Date | null {
  if (value == null || value === '') return null
  const d = toDate(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseResidentUnitRow(row: Record<string, unknown>): ResidentWithUnitRow {
  const unitJson = row.unit
  let unit: Unit
  if (unitJson && typeof unitJson === 'object' && !Array.isArray(unitJson)) {
    const u = unitJson as Record<string, unknown>
    unit = {
      id: Number(u.id),
      facilityId: Number(u.facilityId),
      name: String(u.name),
      capacity: u.capacity == null ? null : Number(u.capacity),
      displaySortOrder:
        u.displaySortOrder == null ? null : Number(u.displaySortOrder),
      printSortOrder: u.printSortOrder == null ? null : Number(u.printSortOrder),
      isActive: Boolean(u.isActive),
      createdAt: toDate(u.createdAt),
      updatedAt: toDate(u.updatedAt),
    }
  } else {
    unit = {} as Unit
  }

  return {
    id: Number(row.id),
    name: String(row.name),
    nameFurigana:
      row.nameFurigana != null ? String(row.nameFurigana) : null,
    facilityId: Number(row.facilityId),
    unitId: Number(row.unitId),
    displaySortOrder:
      row.displaySortOrder == null ? null : Number(row.displaySortOrder),
    printSortOrder: row.printSortOrder == null ? null : Number(row.printSortOrder),
    displayNamePrefix:
      row.displayNamePrefix != null ? String(row.displayNamePrefix) : null,
    namePrefixDisplayOption:
      row.namePrefixDisplayOption != null
        ? String(row.namePrefixDisplayOption)
        : null,
    startDate: toDateOrNull(row.startDate),
    endDate: toDateOrNull(row.endDate),
    isActive: Boolean(row.isActive),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
    unit,
  }
}

const BASE_RESIDENT_UNIT_SELECT = `
SELECT
  r.id,
  r.name,
  r."nameFurigana",
  r."facilityId",
  r."unitId",
  r."displaySortOrder",
  r."printSortOrder",
  r."displayNamePrefix",
  r."namePrefixDisplayOption",
  r."startDate",
  r."endDate",
  r."isActive",
  r."createdAt",
  r."updatedAt",
  json_build_object(
    'id', u.id,
    'facilityId', u."facilityId",
    'name', u.name,
    'capacity', u.capacity,
    'displaySortOrder', u."displaySortOrder",
    'printSortOrder', u."printSortOrder",
    'isActive', u."isActive",
    'createdAt', u."createdAt",
    'updatedAt', u."updatedAt"
  ) AS unit
FROM "Resident" r
INNER JOIN "Unit" u ON u.id = r."unitId"
`

/** 当月に取引がある利用者 ID（distinct）。Prisma fetchResidentIdsWithTransactionsInMonth 相当 */
export async function fetchResidentIdsWithTransactionsInMonthSql(
  facilityId: number,
  monthStart: Date,
  monthEnd: Date,
  unitId: number | null
): Promise<number[]> {
  return withTransientDbRetries(
    `printTxResidents(${facilityId},${monthStart.toISOString()})`,
    async () => {
      const sql = neonHttpSql()
      const rows = (await sql(
        `
SELECT DISTINCT t."residentId" AS id
FROM "Transaction" t
INNER JOIN "Resident" r ON r.id = t."residentId"
WHERE r."facilityId" = $1
  AND ($4::integer IS NULL OR r."unitId" = $4)
  AND t."transactionDate" >= $2
  AND t."transactionDate" <= $3
`,
        [facilityId, monthStart, monthEnd, unitId ?? null]
      )) as Record<string, unknown>[]

      return rows.map((x) => Number(x.id)).filter(Number.isFinite)
    }
  )
}

/** 対象年月と在籍が重なる利用者（アクティブのみ）。Overlap セット */
export async function fetchResidentsOverlapCalendarMonthSql(
  facilityId: number,
  monthStart: Date,
  monthEnd: Date,
  unitId: number | null
): Promise<ResidentWithUnitRow[]> {
  return withTransientDbRetries(
    `printResidentsOverlap(${facilityId})`,
    async () => {
      const sql = neonHttpSql()
      const rows = (await sql(
        `
${BASE_RESIDENT_UNIT_SELECT}
WHERE r."facilityId" = $1
  AND r."isActive" = true
  AND ($4::integer IS NULL OR r."unitId" = $4)
  AND (r."startDate" IS NULL OR r."startDate" <= $3)
  AND (r."endDate" IS NULL OR r."endDate" >= $2)
`,
        [facilityId, monthStart, monthEnd, unitId ?? null]
      )) as Record<string, unknown>[]

      return rows.map(parseResidentUnitRow)
    }
  )
}

/** ID リストで利用者を取得（extras: 当月取引のみだが overlap 外） */
export async function fetchResidentsByIdsFacilityScopedSql(
  facilityId: number,
  ids: number[],
  unitId: number | null
): Promise<ResidentWithUnitRow[]> {
  if (ids.length === 0) return []
  return withTransientDbRetries(
    `printResidentsByIds(${facilityId},n=${ids.length})`,
    async () => {
      const sql = neonHttpSql()
      const rows = (await sql(
        `
${BASE_RESIDENT_UNIT_SELECT}
WHERE r."facilityId" = $1
  AND r.id = ANY($2::int[])
  AND ($3::integer IS NULL OR r."unitId" = $3)
`,
        [facilityId, ids, unitId ?? null]
      )) as Record<string, unknown>[]

      return rows.map(parseResidentUnitRow)
    }
  )
}

