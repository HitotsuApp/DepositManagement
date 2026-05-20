import { neonHttpSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'

/** Prisma `resident.findMany`（facilityId 指定・select 相当）に揃えた1行 */
export type ResidentFacilityScopedRow = {
  id: number
  name: string
  nameFurigana: string | null
  facilityId: number
  unitId: number
  displaySortOrder: number | null
  printSortOrder: number | null
  displayNamePrefix: string | null
  namePrefixDisplayOption: string | null
  isActive: boolean
  startDate: string | null
  endDate: string | null
  unit: { id: number; name: string }
}

const RESIDENTS_BY_FACILITY_SQL = `
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
  r."isActive",
  r."startDate" AS "startDate",
  r."endDate" AS "endDate",
  json_build_object('id', u.id, 'name', u.name) AS unit
FROM "Resident" r
INNER JOIN "Unit" u ON u.id = r."unitId"
WHERE r."facilityId" = $1
  AND ($2::boolean = true OR r."isActive" = true)
ORDER BY r."displaySortOrder" ASC NULLS LAST, r.id ASC
`

function normalizeJsonDate(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return String(value)
}

function parseUnit(value: unknown): { id: number; name: string } {
  if (value && typeof value === 'object' && 'id' in value && 'name' in value) {
    const o = value as { id: unknown; name: unknown }
    return { id: Number(o.id), name: String(o.name) }
  }
  if (typeof value === 'string') {
    try {
      return parseUnit(JSON.parse(value))
    } catch {
      /* fallthrough */
    }
  }
  return { id: 0, name: '' }
}

/** `GET /api/residents?facilityId=` の hot path（Prisma WASM 回避） */
export async function fetchResidentsByFacilityId(
  facilityId: number,
  includeInactive: boolean
): Promise<ResidentFacilityScopedRow[]> {
  const raw = await withTransientDbRetries(
    `residentsByFacility(facilityId=${facilityId})`,
    async () => {
      const sql = neonHttpSql()
      return (await sql(RESIDENTS_BY_FACILITY_SQL.trim(), [
        facilityId,
        includeInactive,
      ])) as Record<string, unknown>[]
    }
  )

  return raw.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    nameFurigana: row.nameFurigana != null ? String(row.nameFurigana) : null,
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
    isActive: Boolean(row.isActive),
    startDate: normalizeJsonDate(row.startDate),
    endDate: normalizeJsonDate(row.endDate),
    unit: parseUnit(row.unit),
  }))
}
