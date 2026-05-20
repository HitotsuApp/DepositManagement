import type { Transaction } from '@prisma/client'
import { neonHttpSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'

type SqlLedger = ReturnType<typeof neonHttpSql>

/** @see lib/balanceLedgerContribution.ts — Postgres CASE と一致させること */
const OPENING_SUM_BODY = `COALESCE(SUM(
  CASE
    WHEN t."transactionType" IN ('in','past_correct_in') THEN t.amount
    WHEN t."transactionType" IN ('out','past_correct_out') THEN -t.amount
    ELSE 0
  END
), 0)::float AS "opening"`

const CHUNK_RESIDENT_IDS = 120

function chunkIds(ids: number[]): number[][] {
  if (ids.length === 0) return []
  const out: number[][] = []
  for (let i = 0; i < ids.length; i += CHUNK_RESIDENT_IDS) {
    out.push(ids.slice(i, i + CHUNK_RESIDENT_IDS))
  }
  return out
}

/** 取引日時 ≤ cutoff（SQL 比較）での利用者別繰越開き（correct_in/out は集計から除外） */
export async function fetchOpeningBalancesByResidentChunks(
  sql: SqlLedger,
  facilityId: number,
  residentIds: number[],
  cutoffInclusive: Date
): Promise<Map<number, number>> {
  const map = new Map<number, number>()
  const unique = [...new Set(residentIds)]
  for (const chunk of chunkIds(unique)) {
    const rows = (await withTransientDbRetries(
      `printLedger.openingBalances(${facilityId},${chunk.length}ids)`,
      () =>
        sql(
          `SELECT t."residentId"::int AS "residentId",
          ${OPENING_SUM_BODY}
       FROM "Transaction" t
       INNER JOIN "Resident" r ON r.id = t."residentId" AND r."facilityId" = $2
       WHERE t."residentId" = ANY($1::int[])
         AND t."transactionDate" <= $3
         AND t."transactionType" NOT IN ('correct_in','correct_out')
       GROUP BY t."residentId"`,
          [chunk, facilityId, cutoffInclusive]
        )
    )) as { residentId: number; opening: number | string }[]
    for (const r of rows) {
      map.set(r.residentId, Number(r.opening))
    }
  }
  return map
}

/** 期間内の取引（種別はすべて。呼び出し側で表示フィルタ）。施設越境防止済み。 */
export async function fetchTransactionsInRangeByResidentChunks(
  sql: SqlLedger,
  facilityId: number,
  residentIds: number[],
  rangeStartInclusive: Date,
  rangeEndInclusive: Date
): Promise<Map<number, Transaction[]>> {
  const map = new Map<number, Transaction[]>()

  type Row = {
    id: number
    residentId: number
    transactionDate: Date | string
    transactionType: string
    amount: number | string
    description: string | null
    payee: string | null
    reason: string | null
    createdAt: Date | string
  }

  const unique = [...new Set(residentIds)]

  for (const chunk of chunkIds(unique)) {
    const rows = (await withTransientDbRetries(
      `printLedger.txRange(${facilityId},${chunk.length}ids)`,
      () =>
        sql(
          `SELECT
         t.id,
         t."residentId",
         t."transactionDate",
         t."transactionType",
         t.amount,
         t.description,
         t.payee,
         t.reason,
         t."createdAt"
       FROM "Transaction" t
       INNER JOIN "Resident" r ON r.id = t."residentId" AND r."facilityId" = $2
       WHERE t."residentId" = ANY($1::int[])
         AND t."transactionDate" >= $3
         AND t."transactionDate" <= $4
       ORDER BY t."residentId" ASC, t."transactionDate" ASC, t.id ASC`,
          [chunk, facilityId, rangeStartInclusive, rangeEndInclusive]
        )
    )) as Row[]

    for (const row of rows) {
      const tid = row.residentId
      const list = map.get(tid) ?? []
      list.push({
        id: row.id,
        residentId: row.residentId,
        transactionDate: new Date(row.transactionDate),
        transactionType: row.transactionType,
        amount: Number(row.amount),
        description: row.description,
        payee: row.payee,
        reason: row.reason,
        createdAt: new Date(row.createdAt),
      } as Transaction)
      map.set(tid, list)
    }
  }
  return map
}

export function getLedgerSqlForPrint(): SqlLedger {
  return neonHttpSql()
}
