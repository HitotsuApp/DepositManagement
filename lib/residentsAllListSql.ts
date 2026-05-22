/**
 * GET /api/residents で facilityId 未指定時の一覧（Prisma resident.findMany 互換）
 */

import type { NeonSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'

/** Prisma `resident.findMany`（全利用者マスタ一覧）と同一形状 */
export type ResidentMasterListRow = {
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
  facility: { id: number; name: string }
  unit: { id: number; name: string }
}

function normalizeJsonDate(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return String(value)
}

function parseNestedFacilityUnit(
  facilityVal: unknown,
  unitVal: unknown
): { facility: { id: number; name: string }; unit: { id: number; name: string } } | null {
  const parseFo = (
    value: unknown
  ): { id: number; name: string } | null => {
    if (value && typeof value === 'object' && 'id' in value && 'name' in value) {
      const o = value as { id: unknown; name: unknown }
      return { id: Number(o.id), name: String(o.name) }
    }
    if (typeof value === 'string') {
      try {
        return parseFo(JSON.parse(value))
      } catch {
        return null
      }
    }
    return null
  }

  const facility = parseFo(facilityVal)
  const unit = parseFo(unitVal)
  if (!facility || !unit) return null
  return { facility, unit }
}

export async function fetchResidentsMasterListAll(
  sql: NeonSql,
  includeInactive: boolean
): Promise<ResidentMasterListRow[]> {
  return withTransientDbRetries('residentsAllList', async () => {
    const rows =
      includeInactive ?
        (
          await sql`
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
            json_build_object('id', f.id, 'name', f.name) AS facility,
            json_build_object('id', u.id, 'name', u.name) AS unit
          FROM "Resident" r
          INNER JOIN "Facility" f ON f.id = r."facilityId"
          INNER JOIN "Unit" u ON u.id = r."unitId"
          ORDER BY r."displaySortOrder" ASC NULLS LAST, r.id ASC
        `
        ) as Record<string, unknown>[]
      : (
          await sql`
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
            json_build_object('id', f.id, 'name', f.name) AS facility,
            json_build_object('id', u.id, 'name', u.name) AS unit
          FROM "Resident" r
          INNER JOIN "Facility" f ON f.id = r."facilityId"
          INNER JOIN "Unit" u ON u.id = r."unitId"
          WHERE r."isActive" = true
          ORDER BY r."displaySortOrder" ASC NULLS LAST, r.id ASC
        `
        ) as Record<string, unknown>[]

    const out: ResidentMasterListRow[] = []
    for (const row of rows) {
      const nested = parseNestedFacilityUnit(row.facility, row.unit)
      if (!nested) continue

      out.push({
        id: Number(row.id),
        name: String(row.name ?? ''),
        nameFurigana: row.nameFurigana == null ? null : String(row.nameFurigana),
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
        facility: nested.facility,
        unit: nested.unit,
      })
    }
    return out
  })
}
