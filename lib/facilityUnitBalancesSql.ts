import { neonHttpSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'

/** `/api/facilities/[id]?year&month` の unit_balances CTE 集計（Prisma $queryRaw と同一） */
export interface FacilityMonthUnitBalanceRow {
  facilityName: string | null
  unitId: number | null
  unitName: string | null
  balance: unknown
}

const FACILITY_MONTH_UNIT_BALANCES_SQL = `
WITH unit_balances AS (
  SELECT
    r."unitId" AS "unitId",
    COALESCE(SUM(
      CASE
        WHEN t."transactionType" IN ('in', 'past_correct_in') THEN t.amount
        WHEN t."transactionType" IN ('out', 'past_correct_out') THEN -t.amount
        ELSE 0
      END
    ), 0) AS balance
  FROM "Resident" r
  LEFT JOIN "Transaction" t ON t."residentId" = r.id
  WHERE r."facilityId" = $1
    AND r."isActive" = true
    AND r."endDate" IS NULL
    AND (t."transactionDate" IS NULL OR t."transactionDate" <= $2)
    AND (t."transactionType" IS NULL OR t."transactionType" NOT IN ('correct_in', 'correct_out'))
  GROUP BY r."unitId"
)
SELECT
  f.name AS "facilityName",
  u.id AS "unitId",
  u.name AS "unitName",
  COALESCE(ub.balance, 0) AS balance
FROM "Facility" f
LEFT JOIN "Unit" u
  ON u."facilityId" = f.id
  AND u."isActive" = true
LEFT JOIN unit_balances ub ON ub."unitId" = u.id
WHERE f.id = $1
ORDER BY u."displaySortOrder" ASC NULLS LAST, u.id ASC
`

/** Cloudflare Edge では Prisma Query Engine より Neon HTTP の方が CPU が軽い */
export async function fetchFacilityMonthUnitBalances(
  facilityId: number,
  targetDateInclusive: Date
): Promise<FacilityMonthUnitBalanceRow[]> {
  return withTransientDbRetries(
    `facilityMonthUnitBalances(facilityId=${facilityId})`,
    async () => {
      const sql = neonHttpSql()
      const rows = await sql(FACILITY_MONTH_UNIT_BALANCES_SQL.trim(), [
        facilityId,
        targetDateInclusive,
      ])
      return rows as FacilityMonthUnitBalanceRow[]
    }
  )
}
