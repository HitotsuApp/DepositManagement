/**
 * GET /api/facilities/[id]/resident-summaries の Neon HTTP クエリ。
 * SQL・ビジネス結果は旧 Prisma 実装と一致させる。
 */

import type { NeonSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'

/** 並び順付きユニット行（route の unitsLite と同じ形） */
export interface UnitLiteRow {
  id: number
  name: string
  displaySortOrder: number | null
  printSortOrder: number | null
}

/** $queryRaw 相当のresident行 */
export interface ResidentBalanceRow {
  residentDisplaySortMode: string | null
  useUnitOrderForPrint: boolean | null
  residentId: number | null
  name: string | null
  nameFurigana: string | null
  unitId: number | null
  displaySortOrder: number | null
  printSortOrder: number | null
  displayNamePrefix: string | null
  namePrefixDisplayOption: string | null
  balance: unknown
}

export async function probeFacilityExists(sql: NeonSql, facilityId: number): Promise<boolean> {
  return withTransientDbRetries(`residentSummaries.probeFacility(${facilityId})`, async () => {
    const rows = (await sql`
      SELECT id FROM "Facility" WHERE id = ${facilityId} LIMIT 1
    `) as { id: number }[]
    return rows.length > 0
  })
}

export async function probeUnitExistsInFacility(
  sql: NeonSql,
  facilityId: number,
  unitId: number
): Promise<boolean> {
  return withTransientDbRetries(
    `residentSummaries.probeUnit(${facilityId},${unitId})`,
    async () => {
      const rows = (await sql`
        SELECT id
        FROM "Unit"
        WHERE id = ${unitId}
          AND "facilityId" = ${facilityId}
          AND "isActive" = true
        LIMIT 1
      `) as { id: number }[]
      return rows.length > 0
    }
  )
}

export async function fetchResidentBalanceRows(
  sql: NeonSql,
  facilityId: number,
  unitIdNum: number,
  targetDate: Date
): Promise<ResidentBalanceRow[]> {
  return withTransientDbRetries(
    `residentSummaries.balances(${facilityId},u=${unitIdNum})`,
    async () => {
      return (await sql`
        SELECT
          f."residentDisplaySortMode",
          f."useUnitOrderForPrint",
          r.id AS "residentId",
          r.name,
          r."nameFurigana",
          r."unitId",
          r."displaySortOrder",
          r."printSortOrder",
          r."displayNamePrefix",
          r."namePrefixDisplayOption",
          COALESCE((
            SELECT SUM(CASE
              WHEN t_inner."transactionType" IN ('in', 'past_correct_in') THEN t_inner.amount
              WHEN t_inner."transactionType" IN ('out', 'past_correct_out') THEN -t_inner.amount
              ELSE 0 END)
            FROM "Transaction" t_inner
            WHERE t_inner."residentId" = r.id
              AND (
                t_inner."transactionType" IS NULL
                OR t_inner."transactionType" NOT IN ('correct_in', 'correct_out')
              )
              AND (
                t_inner."transactionDate" <= ${targetDate}
              )
          ), 0) AS balance
        FROM "Facility" f
        LEFT JOIN "Resident" r ON r."facilityId" = ${facilityId}
          AND r."unitId" = ${unitIdNum}
          AND r."isActive" = true
          AND r."endDate" IS NULL
        WHERE f.id = ${facilityId}
        ORDER BY r.id ASC NULLS LAST
      `) as ResidentBalanceRow[]
    }
  )
}

export async function fetchUnitsLiteForSort(
  sql: NeonSql,
  facilityId: number
): Promise<UnitLiteRow[]> {
  return withTransientDbRetries(`residentSummaries.unitsLite(${facilityId})`, async () => {
    return (await sql`
      SELECT id, name, "displaySortOrder", "printSortOrder"
      FROM "Unit"
      WHERE "facilityId" = ${facilityId}
        AND "isActive" = true
      ORDER BY "displaySortOrder" ASC NULLS LAST, id ASC
    `) as UnitLiteRow[]
  })
}
