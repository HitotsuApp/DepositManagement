/**
 * GET /api/facilities/[id]/transactions と bulk-input-bootstrap 共通:
 * CTE で前月まで残高ウィンドウ + 当月行に balance を付与したチャンクエリ。
 */

import type { NeonSql } from '@/lib/neonHttpSql'

/** Map from facilityTransactions.route mapRowsToPayload と揃える行 */
export interface TransactionWithBalanceLedgerRow {
  id: number
  transactionDate: Date | string
  transactionType: string
  amount: number
  description: string | null
  payee: string | null
  reason: string | null
  residentId: number
  residentName: string
  res_dsp_prefix: string | null
  res_dsp_opt: string | null
  balance: unknown
  facility_balance: unknown
}

export interface ChunkScalarsRow extends TransactionWithBalanceLedgerRow {
  opening_total: unknown
  month_txn_total: unknown
}

export async function sqlFacilityTransactionsFirstChunkJoined(
  sql: NeonSql,
  facilityId: number,
  startDate: Date,
  endDate: Date,
  previousMonthEndDate: Date,
  limitLogical: number
): Promise<ChunkScalarsRow[]> {
  return (await sql`
      WITH previous_balances AS (
        SELECT
          t_pb."residentId",
          COALESCE(SUM(
            CASE
              WHEN t_pb."transactionType" IN ('in', 'past_correct_in') THEN t_pb.amount
              WHEN t_pb."transactionType" IN ('out', 'past_correct_out') THEN -t_pb.amount
              ELSE 0
            END
          ), 0) AS balance
        FROM "Transaction" t_pb
        INNER JOIN "Resident" r_pb ON r_pb.id = t_pb."residentId"
          AND r_pb."facilityId" = ${facilityId}
          AND r_pb."isActive" = true
        WHERE t_pb."transactionDate" <= ${previousMonthEndDate}
          AND t_pb."transactionType" NOT IN ('correct_in', 'correct_out')
        GROUP BY t_pb."residentId"
      ),
      facility_opening AS (
        SELECT COALESCE(SUM(COALESCE(pb.balance, 0)), 0)::numeric AS total
        FROM "Resident" r
        LEFT JOIN previous_balances pb ON pb."residentId" = r.id
        WHERE r."facilityId" = ${facilityId}
          AND r."isActive" = true
      ),
      current_transactions AS (
        SELECT
          t.id,
          t."transactionDate",
          t."transactionType",
          t.amount,
          t.description,
          t.payee,
          t.reason,
          t."residentId",
          r.name AS "residentName",
          r."displayNamePrefix" AS res_dsp_prefix,
          r."namePrefixDisplayOption" AS res_dsp_opt,
          COALESCE(pb.balance, 0) AS previous_balance,
          CASE
            WHEN t."transactionType" IN ('in', 'past_correct_in') THEN t.amount
            WHEN t."transactionType" IN ('out', 'past_correct_out') THEN -t.amount
            ELSE 0
          END AS transaction_amount
        FROM "Transaction" t
        INNER JOIN "Resident" r ON t."residentId" = r.id
          AND r."facilityId" = ${facilityId}
          AND r."isActive" = true
        LEFT JOIN previous_balances pb ON t."residentId" = pb."residentId"
        WHERE t."transactionDate" >= ${startDate}
          AND t."transactionDate" <= ${endDate}
      ),
      balanced AS (
        SELECT
          ct.id,
          ct."transactionDate",
          ct."transactionType",
          ct.amount,
          ct.description,
          ct.payee,
          ct.reason,
          ct."residentId",
          ct."residentName",
          ct.res_dsp_prefix,
          ct.res_dsp_opt,
          (ct.previous_balance + SUM(ct.transaction_amount) OVER (
            PARTITION BY ct."residentId"
            ORDER BY ct."transactionDate" ASC, ct.id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ))::numeric AS balance,
          (fo.total + SUM(ct.transaction_amount) OVER (
            ORDER BY ct."transactionDate" ASC, ct.id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ))::numeric AS facility_balance,
          ROW_NUMBER() OVER (ORDER BY ct."transactionDate" ASC, ct.id ASC) AS rn,
          GREATEST(0, ${limitLogical}::int - CASE WHEN fo.total <> 0::numeric THEN 1 ELSE 0 END)::int AS effective_cap
        FROM current_transactions ct
        CROSS JOIN facility_opening fo
      ),
      combined AS (
        SELECT * FROM balanced b WHERE b.rn <= b.effective_cap
      ),
      scalars AS (
        SELECT
          fo2.total AS opening_total,
          (SELECT COUNT(*)::bigint FROM current_transactions)::bigint AS month_txn_total
        FROM facility_opening fo2
        LIMIT 1
      )
      SELECT
        sc.opening_total,
        sc.month_txn_total,
        c.id,
        c."transactionDate",
        c."transactionType",
        c.amount,
        c.description,
        c.payee,
        c.reason,
        c."residentId",
        c."residentName",
        c.res_dsp_prefix,
        c.res_dsp_opt,
        c.balance,
        c.facility_balance
      FROM scalars sc
      LEFT JOIN combined c ON TRUE
      ORDER BY c."transactionDate" ASC NULLS LAST, c.id ASC NULLS LAST`) as ChunkScalarsRow[]
}
