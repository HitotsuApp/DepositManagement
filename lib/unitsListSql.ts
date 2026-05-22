/**
 * GET /api/units の一覧（Prisma unit.findMany 互換）
 */

import type { NeonSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'

export type UnitListRowScoped = {
  id: number
  name: string
  facilityId: number
  capacity: number | null
  displaySortOrder: number | null
  printSortOrder: number | null
  isActive: boolean
}

export type UnitListRowWithFacility = UnitListRowScoped & {
  facility: { id: number; name: string }
}

function parseFacilityNested(value: unknown): { id: number; name: string } | null {
  if (value && typeof value === 'object' && 'id' in value && 'name' in value) {
    const o = value as { id: unknown; name: unknown }
    return { id: Number(o.id), name: String(o.name) }
  }
  if (typeof value === 'string') {
    try {
      return parseFacilityNested(JSON.parse(value))
    } catch {
      return null
    }
  }
  return null
}

function mapScopedRow(row: Record<string, unknown>): UnitListRowScoped {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    facilityId: Number(row.facilityId),
    capacity: row.capacity == null ? null : Number(row.capacity),
    displaySortOrder: row.displaySortOrder == null ? null : Number(row.displaySortOrder),
    printSortOrder: row.printSortOrder == null ? null : Number(row.printSortOrder),
    isActive: Boolean(row.isActive),
  }
}

export async function fetchUnitsListForApi(opts: {
  sql: NeonSql
  facilityId: number | null
  facilityScoped: boolean
  includeInactive: boolean
}): Promise<UnitListRowScoped[] | UnitListRowWithFacility[]> {
  const { sql, facilityId, facilityScoped, includeInactive } = opts

  if (!facilityScoped || facilityId == null) {
    return withTransientDbRetries('unitsList.global', async () => {
      const rows =
        includeInactive ?
          (
            await sql`
            SELECT
              u.id,
              u.name,
              u."facilityId",
              u.capacity,
              u."displaySortOrder",
              u."printSortOrder",
              u."isActive",
              json_build_object('id', f.id, 'name', f.name) AS facility
            FROM "Unit" u
            INNER JOIN "Facility" f ON f.id = u."facilityId"
            ORDER BY u."displaySortOrder" ASC NULLS LAST, u.id ASC
          `
          ) as Record<string, unknown>[]
        : (
            await sql`
            SELECT
              u.id,
              u.name,
              u."facilityId",
              u.capacity,
              u."displaySortOrder",
              u."printSortOrder",
              u."isActive",
              json_build_object('id', f.id, 'name', f.name) AS facility
            FROM "Unit" u
            INNER JOIN "Facility" f ON f.id = u."facilityId"
            WHERE u."isActive" = true
            ORDER BY u."displaySortOrder" ASC NULLS LAST, u.id ASC
          `
          ) as Record<string, unknown>[]

      const out: UnitListRowWithFacility[] = []
      for (const row of rows) {
        const fac = parseFacilityNested(row.facility)
        if (!fac) continue
        out.push({
          ...mapScopedRow(row),
          facility: fac,
        })
      }
      return out
    })
  }

  return withTransientDbRetries(`unitsList.facility(${facilityId})`, async () => {
    const rows =
      includeInactive ?
        (
          await sql`
          SELECT
            u.id,
            u.name,
            u."facilityId",
            u.capacity,
            u."displaySortOrder",
            u."printSortOrder",
            u."isActive"
          FROM "Unit" u
          WHERE u."facilityId" = ${facilityId}
          ORDER BY u."displaySortOrder" ASC NULLS LAST, u.id ASC
        `
        ) as Record<string, unknown>[]
      : (
          await sql`
          SELECT
            u.id,
            u.name,
            u."facilityId",
            u.capacity,
            u."displaySortOrder",
            u."printSortOrder",
            u."isActive"
          FROM "Unit" u
          WHERE u."facilityId" = ${facilityId}
            AND u."isActive" = true
          ORDER BY u."displaySortOrder" ASC NULLS LAST, u.id ASC
        `
        ) as Record<string, unknown>[]

    return rows.map(mapScopedRow)
  })
}
