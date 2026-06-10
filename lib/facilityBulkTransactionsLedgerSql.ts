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

/**
 * resume 軽量版: カーソル後の取引だけにウィンドウをかける（当月全件再走査を避ける）。
 * continuationFromBeginning=true のときは当月先頭から resumeTakeLimit 件。
 */
export async function sqlFacilityTransactionsResumeChunk(
  sql: NeonSql,
  facilityId: number,
  startDate: Date,
  endDate: Date,
  previousMonthEndDate: Date,
  resumeTakeLimit: number,
  continuationFromBeginning: boolean,
  afterDateParsed: Date,
  afterIdNum: number
): Promise<TransactionWithBalanceLedgerRow[]> {
  if (continuationFromBeginning) {
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
      cursor_facility_base AS (
        SELECT fo.total::numeric AS base FROM facility_opening fo
      ),
      next_rows AS (
        SELECT * FROM current_transactions mt
        ORDER BY mt."transactionDate" ASC, mt.id ASC
        LIMIT ${resumeTakeLimit}::int
      ),
      resident_base AS (
        SELECT
          nr."residentId",
          COALESCE(pb.balance, 0)::numeric AS base_balance
        FROM (SELECT DISTINCT "residentId" FROM next_rows) nr
        LEFT JOIN previous_balances pb ON pb."residentId" = nr."residentId"
      ),
      balanced AS (
        SELECT
          nr.id,
          nr."transactionDate",
          nr."transactionType",
          nr.amount,
          nr.description,
          nr.payee,
          nr.reason,
          nr."residentId",
          nr."residentName",
          nr.res_dsp_prefix,
          nr.res_dsp_opt,
          (rb.base_balance + SUM(nr.transaction_amount) OVER (
            PARTITION BY nr."residentId"
            ORDER BY nr."transactionDate" ASC, nr.id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ))::numeric AS balance,
          (cfb.base + SUM(nr.transaction_amount) OVER (
            ORDER BY nr."transactionDate" ASC, nr.id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ))::numeric AS facility_balance
        FROM next_rows nr
        CROSS JOIN cursor_facility_base cfb
        LEFT JOIN resident_base rb ON rb."residentId" = nr."residentId"
      )
      SELECT
        b.id,
        b."transactionDate",
        b."transactionType",
        b.amount,
        b.description,
        b.payee,
        b.reason,
        b."residentId",
        b."residentName",
        b.res_dsp_prefix,
        b.res_dsp_opt,
        b.balance,
        b.facility_balance
      FROM balanced b
      ORDER BY b."transactionDate" ASC, b.id ASC`) as TransactionWithBalanceLedgerRow[]
  }

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
    cursor_facility_base AS (
      SELECT
        (fo.total + COALESCE((
          SELECT SUM(mt.transaction_amount)
          FROM current_transactions mt
          WHERE mt."transactionDate" < ${afterDateParsed}
            OR (mt."transactionDate" = ${afterDateParsed} AND mt.id <= ${afterIdNum})
        ), 0))::numeric AS base
      FROM facility_opening fo
    ),
    next_rows AS (
      SELECT * FROM current_transactions mt
      WHERE mt."transactionDate" > ${afterDateParsed}
        OR (mt."transactionDate" = ${afterDateParsed} AND mt.id > ${afterIdNum})
      ORDER BY mt."transactionDate" ASC, mt.id ASC
      LIMIT ${resumeTakeLimit}::int
    ),
    resident_base AS (
      SELECT
        nr."residentId",
        (COALESCE(pb.balance, 0) + COALESCE((
          SELECT SUM(mt2.transaction_amount)
          FROM current_transactions mt2
          WHERE mt2."residentId" = nr."residentId"
            AND (
              mt2."transactionDate" < ${afterDateParsed}
              OR (mt2."transactionDate" = ${afterDateParsed} AND mt2.id <= ${afterIdNum})
            )
        ), 0))::numeric AS base_balance
      FROM (SELECT DISTINCT "residentId" FROM next_rows) nr
      LEFT JOIN previous_balances pb ON pb."residentId" = nr."residentId"
    ),
    balanced AS (
      SELECT
        nr.id,
        nr."transactionDate",
        nr."transactionType",
        nr.amount,
        nr.description,
        nr.payee,
        nr.reason,
        nr."residentId",
        nr."residentName",
        nr.res_dsp_prefix,
        nr.res_dsp_opt,
        (rb.base_balance + SUM(nr.transaction_amount) OVER (
          PARTITION BY nr."residentId"
          ORDER BY nr."transactionDate" ASC, nr.id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ))::numeric AS balance,
        (cfb.base + SUM(nr.transaction_amount) OVER (
          ORDER BY nr."transactionDate" ASC, nr.id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ))::numeric AS facility_balance
      FROM next_rows nr
      CROSS JOIN cursor_facility_base cfb
      LEFT JOIN resident_base rb ON rb."residentId" = nr."residentId"
    )
    SELECT
      b.id,
      b."transactionDate",
      b."transactionType",
      b.amount,
      b.description,
      b.payee,
      b.reason,
      b."residentId",
      b."residentName",
      b.res_dsp_prefix,
      b.res_dsp_opt,
      b.balance,
      b.facility_balance
    FROM balanced b
    ORDER BY b."transactionDate" ASC, b.id ASC`) as TransactionWithBalanceLedgerRow[]
}
