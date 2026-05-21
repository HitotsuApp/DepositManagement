/**
 * GET /api/facilities の一覧（Prisma Facility 全列互換）
 */

import type { NeonSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'

/** Neon から返した生行を Prisma Facility JSON に寄せた形 */
export type FacilityFullRowRaw = Record<string, unknown>

function iso(d: unknown): string {
  if (d instanceof Date) return d.toISOString()
  if (typeof d === 'string') return d
  return String(d)
}

export function mapFacilityRowToApiShape(row: FacilityFullRowRaw): Record<string, unknown> {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    positionName: row.positionName == null ? null : String(row.positionName),
    positionHolderName: row.positionHolderName == null ? null : String(row.positionHolderName),
    sortOrder: Number(row.sortOrder ?? 0),
    useSameOrderForDisplayAndPrint: Boolean(row.useSameOrderForDisplayAndPrint ?? true),
    useUnitOrderForPrint: Boolean(row.useUnitOrderForPrint ?? true),
    residentDisplaySortMode: row.residentDisplaySortMode == null ? null : String(row.residentDisplaySortMode),
    residentPrintSortMode: row.residentPrintSortMode == null ? null : String(row.residentPrintSortMode),
    noticeTemplateNormal: row.noticeTemplateNormal == null ? null : String(row.noticeTemplateNormal),
    noticeTemplateMoveOut:
      row.noticeTemplateMoveOut == null ? null : String(row.noticeTemplateMoveOut),
    isActive: Boolean(row.isActive),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export async function fetchFacilitiesList(
  sql: NeonSql,
  opts: {
    includeInactive: boolean
    facilityId: number | null
  }
): Promise<FacilityFullRowRaw[]> {
  return withTransientDbRetries('facilitiesList.all', async () => {
    const { includeInactive, facilityId } = opts

    const idOk =
      facilityId != null && Number.isInteger(facilityId) && facilityId > 0 ? facilityId : null

    if (!includeInactive && idOk != null) {
      return (await sql`
        SELECT
          id,
          name,
          "positionName",
          "positionHolderName",
          "sortOrder",
          "useSameOrderForDisplayAndPrint",
          "useUnitOrderForPrint",
          "residentDisplaySortMode",
          "residentPrintSortMode",
          "noticeTemplateNormal",
          "noticeTemplateMoveOut",
          "isActive",
          "createdAt",
          "updatedAt"
        FROM "Facility"
        WHERE "isActive" = true
          AND id = ${idOk}
        ORDER BY "sortOrder" ASC
      `) as FacilityFullRowRaw[]
    }

    if (!includeInactive && idOk == null) {
      return (await sql`
        SELECT
          id,
          name,
          "positionName",
          "positionHolderName",
          "sortOrder",
          "useSameOrderForDisplayAndPrint",
          "useUnitOrderForPrint",
          "residentDisplaySortMode",
          "residentPrintSortMode",
          "noticeTemplateNormal",
          "noticeTemplateMoveOut",
          "isActive",
          "createdAt",
          "updatedAt"
        FROM "Facility"
        WHERE "isActive" = true
        ORDER BY "sortOrder" ASC
      `) as FacilityFullRowRaw[]
    }

    if (includeInactive && idOk != null) {
      return (await sql`
        SELECT
          id,
          name,
          "positionName",
          "positionHolderName",
          "sortOrder",
          "useSameOrderForDisplayAndPrint",
          "useUnitOrderForPrint",
          "residentDisplaySortMode",
          "residentPrintSortMode",
          "noticeTemplateNormal",
          "noticeTemplateMoveOut",
          "isActive",
          "createdAt",
          "updatedAt"
        FROM "Facility"
        WHERE id = ${idOk}
        ORDER BY "sortOrder" ASC
      `) as FacilityFullRowRaw[]
    }

    return (await sql`
      SELECT
        id,
        name,
        "positionName",
        "positionHolderName",
        "sortOrder",
        "useSameOrderForDisplayAndPrint",
        "useUnitOrderForPrint",
        "residentDisplaySortMode",
        "residentPrintSortMode",
        "noticeTemplateNormal",
        "noticeTemplateMoveOut",
        "isActive",
        "createdAt",
        "updatedAt"
      FROM "Facility"
      ORDER BY "sortOrder" ASC
    `) as FacilityFullRowRaw[]
  })
}
