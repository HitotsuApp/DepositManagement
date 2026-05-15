export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getPrisma } from '@/lib/prisma'
import { validateId } from '@/lib/validation'
import { getResidentDisplayName } from '@/lib/displayName'
import {
  BULK_TRANSACTIONS_CHUNK_LIMIT,
  BULK_TRANSACTIONS_CURSOR_SENTINEL_DATE,
  BULK_TRANSACTIONS_CURSOR_SENTINEL_ID,
  type FacilityTransactionPayload,
} from '@/lib/bulkFacilityTransactionsFetch'

const MAX_CHUNK_ROW_LIMIT = 200

interface TransactionWithBalanceRow {
  id: number
  transactionDate: Date
  transactionType: string
  amount: number
  description: string | null
  payee: string | null
  reason: string | null
  residentId: number
  residentName: string
  balance: number | string
  facility_balance: number | string
}

interface PreviousBalanceRow {
  residentId: number
  balance: number | string
}

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

function mapRowsToPayload(
  rows: TransactionWithBalanceRow[],
  residentDisplayNameMap: Map<number, string>
): FacilityTransactionPayload[] {
  return rows.map((t) => ({
    id: t.id,
    transactionDate: t.transactionDate.toISOString(),
    transactionType: t.transactionType,
    amount: t.amount,
    description: t.description,
    payee: t.payee,
    reason: t.reason,
    balance: Number(t.balance),
    facilityBalance: Number(t.facility_balance),
    residentId: t.residentId,
    residentName: residentDisplayNameMap.get(t.residentId) ?? t.residentName,
  }))
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  console.time('prisma-init')
  const prisma = getPrisma()
  console.timeEnd('prisma-init')

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

    console.time('main-query')
    const facility = await prisma.facility.findUnique({
      where: { id: facilityId },
      select: {
        id: true,
        residents: {
          where: {
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            displayNamePrefix: true,
            namePrefixDisplayOption: true,
          },
          orderBy: { name: 'asc' },
        },
      },
    })
    console.timeEnd('main-query')

    if (!facility) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    const residentDisplayNameMap = new Map<number, string>()
    facility.residents.forEach((resident) => {
      residentDisplayNameMap.set(
        resident.id,
        getResidentDisplayName(resident as any, 'screen')
      )
    })
    const residentIds = Array.from(residentDisplayNameMap.keys())

    if (residentIds.length === 0) {
      const res = NextResponse.json({
        transactions: [],
        hasMore: false,
      })
      res.headers.set('Cache-Control', 'no-store')
      return res
    }

    console.time('previous-balance-aggregate')
    let previousBalances = new Map<number, number>()
    try {
      const previousBalancesRaw = await prisma.$queryRaw<PreviousBalanceRow[]>`
        SELECT 
          "residentId",
          COALESCE(SUM(
            CASE 
              WHEN "transactionType" IN ('in', 'past_correct_in') THEN amount
              WHEN "transactionType" IN ('out', 'past_correct_out') THEN -amount
              ELSE 0
            END
          ), 0) as balance
        FROM "Transaction"
        WHERE "transactionDate" <= ${previousMonthEndDate}
          AND "transactionType" NOT IN ('correct_in', 'correct_out')
          AND "residentId" IN (
            SELECT id FROM "Resident"
            WHERE "facilityId" = ${facilityId}
              AND "isActive" = true
          )
        GROUP BY "residentId"
      `
      previousBalancesRaw.forEach((row) => {
        previousBalances.set(row.residentId, Number(row.balance))
      })
    } catch (error) {
      console.error('Failed to calculate previous balances with aggregate query:', error)
      throw new Error('前月残高の計算に失敗しました')
    }
    console.timeEnd('previous-balance-aggregate')

    let facilityOpeningTotal = 0
    residentIds.forEach((rid) => {
      facilityOpeningTotal += previousBalances.get(rid) ?? 0
    })

    console.time('tx-count-query')
    const [{ count: monthTxnCount }] = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Transaction" t
      INNER JOIN "Resident" r ON t."residentId" = r.id
      WHERE t."transactionDate" >= ${startDate}
        AND t."transactionDate" <= ${endDate}
        AND t."residentId" IN (${Prisma.join(residentIds)})
        AND r."facilityId" = ${facilityId}
        AND r."isActive" = true
    `
    console.timeEnd('tx-count-query')

    const totalTxnInMonth = Number(monthTxnCount)

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

      const continuationFilterSql = continuationFromBeginning
        ? Prisma.sql`TRUE`
        : Prisma.sql`(
          b."transactionDate" > ${afterDateParsed}
          OR (b."transactionDate" = ${afterDateParsed} AND b.id > ${afterIdNum})
        )`

      console.time('balance-resume-query')
      const resumedRows = await prisma.$queryRaw<TransactionWithBalanceRow[]>`
        WITH previous_balances AS (
          SELECT 
            "residentId",
            COALESCE(SUM(
              CASE 
                WHEN "transactionType" IN ('in', 'past_correct_in') THEN amount
                WHEN "transactionType" IN ('out', 'past_correct_out') THEN -amount
                ELSE 0
              END
            ), 0) as balance
          FROM "Transaction"
          WHERE "transactionDate" <= ${previousMonthEndDate}
            AND "transactionType" NOT IN ('correct_in', 'correct_out')
            AND "residentId" IN (${Prisma.join(residentIds)})
          GROUP BY "residentId"
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
            r.name as "residentName",
            COALESCE(pb.balance, 0) as previous_balance,
            CASE 
              WHEN t."transactionType" IN ('in', 'past_correct_in') THEN t.amount
              WHEN t."transactionType" IN ('out', 'past_correct_out') THEN -t.amount
              ELSE 0
            END as transaction_amount
          FROM "Transaction" t
          INNER JOIN "Resident" r ON t."residentId" = r.id
          LEFT JOIN previous_balances pb ON t."residentId" = pb."residentId"
          WHERE t."transactionDate" >= ${startDate}
            AND t."transactionDate" <= ${endDate}
            AND t."residentId" IN (${Prisma.join(residentIds)})
            AND r."facilityId" = ${facilityId}
            AND r."isActive" = true
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
            (ct.previous_balance + SUM(ct.transaction_amount) OVER (
              PARTITION BY ct."residentId" 
              ORDER BY ct."transactionDate" ASC, ct.id ASC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ))::numeric as balance,
            (fo.total + SUM(ct.transaction_amount) OVER (
              ORDER BY ct."transactionDate" ASC, ct.id ASC
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ))::numeric as facility_balance
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
          b.balance,
          b.facility_balance
        FROM balanced b
        WHERE ${continuationFilterSql}
        ORDER BY b."transactionDate" ASC, b.id ASC
      `
      console.timeEnd('balance-resume-query')

      const response = NextResponse.json({
        transactions: mapRowsToPayload(resumedRows, residentDisplayNameMap),
        hasMore: false,
      })
      response.headers.set('Cache-Control', 'no-store')
      return response
    }

    const limitLogical = parseLimit(searchParams.get('limit'))
    const carryoverSlots = facilityOpeningTotal !== 0 ? 1 : 0
    const effectiveTxnLimit = Math.max(0, limitLogical - carryoverSlots)

    console.time('balance-calculation-query')
    const chunkedRows = await prisma.$queryRaw<TransactionWithBalanceRow[]>`
      WITH previous_balances AS (
        SELECT 
          "residentId",
          COALESCE(SUM(
            CASE 
              WHEN "transactionType" IN ('in', 'past_correct_in') THEN amount
              WHEN "transactionType" IN ('out', 'past_correct_out') THEN -amount
              ELSE 0
            END
          ), 0) as balance
        FROM "Transaction"
        WHERE "transactionDate" <= ${previousMonthEndDate}
          AND "transactionType" NOT IN ('correct_in', 'correct_out')
          AND "residentId" IN (${Prisma.join(residentIds)})
        GROUP BY "residentId"
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
          r.name as "residentName",
          COALESCE(pb.balance, 0) as previous_balance,
          CASE 
            WHEN t."transactionType" IN ('in', 'past_correct_in') THEN t.amount
            WHEN t."transactionType" IN ('out', 'past_correct_out') THEN -t.amount
            ELSE 0
          END as transaction_amount
        FROM "Transaction" t
        INNER JOIN "Resident" r ON t."residentId" = r.id
        LEFT JOIN previous_balances pb ON t."residentId" = pb."residentId"
        WHERE t."transactionDate" >= ${startDate}
          AND t."transactionDate" <= ${endDate}
          AND t."residentId" IN (${Prisma.join(residentIds)})
          AND r."facilityId" = ${facilityId}
          AND r."isActive" = true
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
          (ct.previous_balance + SUM(ct.transaction_amount) OVER (
            PARTITION BY ct."residentId" 
            ORDER BY ct."transactionDate" ASC, ct.id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ))::numeric as balance,
          (fo.total + SUM(ct.transaction_amount) OVER (
            ORDER BY ct."transactionDate" ASC, ct.id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ))::numeric as facility_balance,
          ROW_NUMBER() OVER (ORDER BY ct."transactionDate" ASC, ct.id ASC) AS rn
        FROM current_transactions ct
        CROSS JOIN facility_opening fo
      )
      SELECT 
        id,
        "transactionDate",
        "transactionType",
        amount,
        description,
        payee,
        reason,
        "residentId",
        "residentName",
        balance,
        facility_balance
      FROM balanced
      WHERE rn <= ${effectiveTxnLimit}
      ORDER BY "transactionDate" ASC, id ASC
    `
    console.timeEnd('balance-calculation-query')

    let payload = mapRowsToPayload(chunkedRows, residentDisplayNameMap)

    if (facilityOpeningTotal !== 0) {
      const previousMonthEnd = new Date(year, month - 1, 0, 23, 59, 59, 999)
      payload = [
        {
          id: -1,
          transactionDate: previousMonthEnd.toISOString(),
          transactionType: 'carryover_facility',
          amount: 0,
          description: null,
          payee: null,
          reason: null,
          balance: 0,
          facilityBalance: facilityOpeningTotal,
          residentId: -1,
          residentName: '',
          isCarryOver: true,
        },
        ...payload,
      ]
    }

    const hasMore = totalTxnInMonth > effectiveTxnLimit

    const response = NextResponse.json({
      transactions: payload,
      hasMore,
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.error('Failed to fetch facility transactions:', error)
    return NextResponse.json({ error: 'Failed to fetch facility transactions' }, { status: 500 })
  }
}
