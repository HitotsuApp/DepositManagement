/**
 * GET /api/facilities/[id]（マスタ単体）の 1行取得 — Prisma Facility 全列・API形状は mapFacilityRowToApiShape と同一
 */

import type { NeonSql } from '@/lib/neonHttpSql'
import type { FacilityFullRowRaw } from '@/lib/facilitiesListSql'
import { mapFacilityRowToApiShape } from '@/lib/facilitiesListSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'

export async function fetchFacilityByIdForApi(
  sql: NeonSql,
  facilityId: number
): Promise<Record<string, unknown> | null> {
  return withTransientDbRetries(`facilityById(${facilityId})`, async () => {
    const rows = (await sql`
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
      WHERE id = ${facilityId}
      LIMIT 1
    `) as FacilityFullRowRaw[]

    if (rows.length === 0) return null
    return mapFacilityRowToApiShape(rows[0])
  })
}
