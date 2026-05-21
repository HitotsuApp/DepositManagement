export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { validateId } from '@/lib/validation'
import { neonHttpSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'
import {
  BULK_TRANSACTIONS_CHUNK_LIMIT,
  BULK_TRANSACTIONS_CURSOR_SENTINEL_DATE,
  BULK_TRANSACTIONS_CURSOR_SENTINEL_ID,
} from '@/lib/bulkFacilityTransactionsFetch'
import {
  assembleFacilityTransactionsChunk1FromJoinedRows,
  mapFacilityLedgerBalancedRowsToBulkPayload,
} from '@/lib/buildFacilityBulkTransactionsPayload'
import {
  sqlFacilityTransactionsFirstChunkJoined,
  type ChunkScalarsRow,
  type TransactionWithBalanceLedgerRow,
} from '@/lib/facilityBulkTransactionsLedgerSql'

const MAX_CHUNK_ROW_LIMIT = 200

function parseLimit(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return BULK_TRANSACTIONS_CHUNK_LIMIT
  return Math.min(Math.floor(n), MAX_CHUNK_ROW_LIMIT)
}

/** クエリ値がセンチネル年月とみなせるとき true（論理チャンク2の開始位置として先頭取引より前を表す） */
function cursorIsContinuationFromStart(dateStr: string, idStr: string | null): boolean {
  const id = Number(idStr)
  if (!Number.isFinite(id) || id !== BULK_TRANSACTIONS_CURSOR_SENTINEL_ID) return false
  return dateStr.trim() === BULK_TRANSACTIONS_CURSOR_SENTINEL_DATE.trim()
}


export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const facilityId = validateId(params.id)
    if (!facilityId) {
      return NextResponse.json({ error: '無効なIDです' }, { status: 400 })
    }
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get('year')) || new Date().getFullYear()
    const month = Number(searchParams.get('month')) || new Date().getMonth() + 1
    const resume = searchParams.get('resume') === '1'

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)
    const previousMonthEndDate = new Date(year, month - 1, 0, 23, 59, 59, 999)

    const sql = neonHttpSql()

    const probe = await withTransientDbRetries(
      `facilityTransactions.probe(${facilityId})`,
      async () =>
        (await sql`SELECT id FROM "Facility" WHERE id = ${facilityId} LIMIT 1`) as {
          id: number
        }[]
    )

    if (probe.length === 0) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    if (resume) {
      const afterDateRaw = searchParams.get('afterTransactionDate')
      const afterIdRaw = searchParams.get('afterTransactionId')
      const hasBothAfterParams =
        afterDateRaw !== null &&
        afterDateRaw !== '' &&
        afterIdRaw !== null &&
        afterIdRaw !== ''

      let continuationFromBeginning = !hasBothAfterParams
      let afterDateParsed: Date = new Date(BULK_TRANSACTIONS_CURSOR_SENTINEL_DATE)
      let afterIdNum: number = BULK_TRANSACTIONS_CURSOR_SENTINEL_ID

      if (hasBothAfterParams) {
        if (cursorIsContinuationFromStart(afterDateRaw!, afterIdRaw)) {
          continuationFromBeginning = true
        } else {
          afterIdNum = Number(afterIdRaw)
          afterDateParsed = new Date(afterDateRaw!)
          if (
            Number.isNaN(afterIdNum) ||
            Number.isNaN(afterDateParsed.getTime()) ||
            !Number.isInteger(afterIdNum)
          ) {
            return NextResponse.json({ error: '無効なカーソルです' }, { status: 400 })
          }
        }
      }

      const limitLogical = parseLimit(searchParams.get('limit'))
      const resumeTakeLimit = Math.min(limitLogical + 1, MAX_CHUNK_ROW_LIMIT + 1)

      const resumedRows = (await withTransientDbRetries(
        `facilityTransactions.resume(${facilityId})`,
        async () =>
          continuationFromBeginning
            ? await sql`
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
            ))::numeric AS facility_balance
          FROM current_transactions ct
          CROSS JOIN facility_opening fo
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
        WHERE TRUE
        ORDER BY b."transactionDate" ASC, b.id ASC
        LIMIT ${resumeTakeLimit}::int`
            : await sql`
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
            ))::numeric AS facility_balance
          FROM current_transactions ct
          CROSS JOIN facility_opening fo
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
        WHERE (
          b."transactionDate" > ${afterDateParsed}
          OR (b."transactionDate" = ${afterDateParsed} AND b.id > ${afterIdNum})
        )
        ORDER BY b."transactionDate" ASC, b.id ASC
        LIMIT ${resumeTakeLimit}::int`
      )) as TransactionWithBalanceLedgerRow[]

      const trimmed =
        resumedRows.length > limitLogical
          ? resumedRows.slice(0, limitLogical)
          : resumedRows
      const hasMoreResume = resumedRows.length > limitLogical

      const response = NextResponse.json({
        transactions: mapFacilityLedgerBalancedRowsToBulkPayload(trimmed),
        hasMore: hasMoreResume,
      })
      response.headers.set('Cache-Control', 'no-store')
      return response
    }

    const limitLogical = parseLimit(searchParams.get('limit'))

    const joinedRows = (await withTransientDbRetries(
      `facilityTransactions.chunk(${facilityId})`,
      async () =>
        sqlFacilityTransactionsFirstChunkJoined(
          sql,
          facilityId,
          startDate,
          endDate,
          previousMonthEndDate,
          limitLogical
        )
    )) as ChunkScalarsRow[]

    const assembled = assembleFacilityTransactionsChunk1FromJoinedRows(
      joinedRows,
      limitLogical,
      year,
      month
    )

    const response = NextResponse.json({
      transactions: assembled.transactions,
      hasMore: assembled.hasMore,
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.error('Failed to fetch facility transactions:', error)
    return NextResponse.json({ error: 'Failed to fetch facility transactions' }, { status: 500 })
  }
}
