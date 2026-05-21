/**
 * GET /api/dashboard の施設リストと月末残高一括集計（Neon HTTP）
 */

import type { NeonSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'

export interface DashboardFacilityStub {
  id: number
  name: string | null
}

export interface FacilityBalanceAggregateRow {
  facilityId: number
  balance: unknown
}

export async function fetchActiveFacilitiesForDashboard(
  sql: NeonSql,
  facilityFilterId: number | null
): Promise<DashboardFacilityStub[]> {
  return withTransientDbRetries('dashboard.facilitiesStub', async () => {
    if (facilityFilterId != null && Number.isInteger(facilityFilterId) && facilityFilterId > 0) {
      return (await sql`
        SELECT id, name
        FROM "Facility"
        WHERE "isActive" = true
          AND id = ${facilityFilterId}
        ORDER BY "sortOrder" ASC
      `) as DashboardFacilityStub[]
    }
    return (await sql`
      SELECT id, name
      FROM "Facility"
      WHERE "isActive" = true
      ORDER BY "sortOrder" ASC
    `) as DashboardFacilityStub[]
  })
}

/** Prisma `$queryRaw` と同一ロジック */
export async function fetchFacilityBalancesForDashboard(
  sql: NeonSql,
  targetDate: Date,
  facilityFilterId: number | null
): Promise<FacilityBalanceAggregateRow[]> {
  return withTransientDbRetries('dashboard.facilityBalances', async () => {
    if (facilityFilterId != null && Number.isInteger(facilityFilterId) && facilityFilterId > 0) {
      return (await sql`
        SELECT
          r."facilityId",
          COALESCE(SUM(
            CASE
              WHEN t."transactionType" IN ('in', 'past_correct_in') THEN t.amount
              WHEN t."transactionType" IN ('out', 'past_correct_out') THEN -t.amount
              ELSE 0
            END
          ), 0) AS balance
        FROM "Resident" r
        LEFT JOIN "Transaction" t ON t."residentId" = r.id
        WHERE r."isActive" = true
          AND r."endDate" IS NULL
          AND (t."transactionDate" IS NULL OR t."transactionDate" <= ${targetDate})
          AND (t."transactionType" IS NULL OR t."transactionType" NOT IN ('correct_in', 'correct_out'))
          AND r."facilityId" = ${facilityFilterId}
        GROUP BY r."facilityId"
      `) as FacilityBalanceAggregateRow[]
    }

    return (await sql`
      SELECT
        r."facilityId",
        COALESCE(SUM(
          CASE
            WHEN t."transactionType" IN ('in', 'past_correct_in') THEN t.amount
            WHEN t."transactionType" IN ('out', 'past_correct_out') THEN -t.amount
            ELSE 0
          END
        ), 0) AS balance
      FROM "Resident" r
      LEFT JOIN "Transaction" t ON t."residentId" = r.id
      WHERE r."isActive" = true
        AND r."endDate" IS NULL
        AND (t."transactionDate" IS NULL OR t."transactionDate" <= ${targetDate})
        AND (t."transactionType" IS NULL OR t."transactionType" NOT IN ('correct_in', 'correct_out'))
      GROUP BY r."facilityId"
    `) as FacilityBalanceAggregateRow[]
  })
}
