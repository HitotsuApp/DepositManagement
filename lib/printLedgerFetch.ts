import type { TransformTransaction } from '@/pdf/utils/printModelTypes'
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

/** チャンク1回あたりの Neon 往復を 1 にまとめる（opening 集約 + 期間内取引）。 */
async function fetchOpeningAndTransactionsOneChunk(
  sql: SqlLedger,
  facilityId: number,
  chunk: number[],
  cutoffInclusive: Date,
  rangeStartInclusive: Date,
  rangeEndInclusive: Date
): Promise<{ openings: Map<number, number>; txs: Map<number, TransformTransaction[]> }> {
  const openings = new Map<number, number>()
  const txs = new Map<number, TransformTransaction[]>()

  type UnifiedRow = {
    ledgerKind: string
    residentId: number
    opening: number | string | null
    id: number | null
    transactionDate: Date | string | null
    transactionType: string | null
    amount: number | string | null
    description: string | null
    payee: string | null
    reason: string | null
    createdAt: Date | string | null
  }

  // UNION 直下では ORDER BY に式不可（0A000）。サブクエリの外で並べ替える。
  const query = `
SELECT *
FROM (
  (
    SELECT
      'opening'::text AS "ledgerKind",
      t."residentId"::int AS "residentId",
      ${OPENING_SUM_BODY},
      NULL::int AS id,
      NULL::timestamp AS "transactionDate",
      NULL::text AS "transactionType",
      NULL::numeric AS amount,
      NULL::text AS description,
      NULL::text AS payee,
      NULL::text AS reason,
      NULL::timestamp AS "createdAt"
    FROM "Transaction" t
    INNER JOIN "Resident" r ON r.id = t."residentId" AND r."facilityId" = $2::int
    WHERE t."residentId" = ANY($1::int[])
      AND t."transactionDate" <= $3
      AND t."transactionType" NOT IN ('correct_in','correct_out')
    GROUP BY t."residentId"
  )
  UNION ALL
  (
    SELECT
      'tx'::text AS "ledgerKind",
      t."residentId"::int AS "residentId",
      NULL::float AS "opening",
      t.id,
      t."transactionDate",
      t."transactionType",
      t.amount,
      t.description,
      t.payee,
      t.reason,
      t."createdAt"
    FROM "Transaction" t
    INNER JOIN "Resident" r ON r.id = t."residentId" AND r."facilityId" = $2::int
    WHERE t."residentId" = ANY($1::int[])
      AND t."transactionDate" >= $4
      AND t."transactionDate" <= $5
  )
) AS ledger
ORDER BY ledger."residentId" ASC,
  CASE ledger."ledgerKind" WHEN 'opening' THEN 1 ELSE 2 END ASC,
  ledger."transactionDate" ASC NULLS LAST,
  ledger.id ASC NULLS LAST`

  const rows = (await withTransientDbRetries(
    `printLedger.openingPlusTxUnified(${facilityId},${chunk.length}ids)`,
    () =>
      sql(query, [
        chunk,
        facilityId,
        cutoffInclusive,
        rangeStartInclusive,
        rangeEndInclusive,
      ])
  )) as UnifiedRow[]

  for (const row of rows) {
    if (row.ledgerKind === 'opening') {
      openings.set(row.residentId, Number(row.opening))
      continue
    }
    const tid = row.residentId
    const list = txs.get(tid) ?? []
    list.push({
      id: row.id as number,
      residentId: row.residentId,
      transactionDate: new Date(row.transactionDate as Date | string),
      transactionType: row.transactionType as string,
      amount: Number(row.amount),
      description: row.description,
      payee: row.payee,
      reason: row.reason,
      createdAt: new Date(row.createdAt as Date | string),
    })
    txs.set(tid, list)
  }

  return { openings, txs }
}

/**
 * 繰越（cutoff 以前・correct_in/out 除外の集約）と、期間内の全種別の取引をまとめて取得。
 * チャンクあたり Neon 往復 1（opening + tx を UNION）。
 */
export async function fetchOpeningBalancesAndTransactionsInRangeByResidentChunks(
  sql: SqlLedger,
  facilityId: number,
  residentIds: number[],
  cutoffInclusive: Date,
  rangeStartInclusive: Date,
  rangeEndInclusive: Date
): Promise<{
  openingBalances: Map<number, number>
  transactionsByResident: Map<number, TransformTransaction[]>
}> {
  const openingBalances = new Map<number, number>()
  const transactionsByResident = new Map<number, TransformTransaction[]>()
  const unique = [...new Set(residentIds)]
  if (unique.length === 0) {
    return { openingBalances, transactionsByResident }
  }

  for (const chunk of chunkIds(unique)) {
    const { openings, txs } = await fetchOpeningAndTransactionsOneChunk(
      sql,
      facilityId,
      chunk,
      cutoffInclusive,
      rangeStartInclusive,
      rangeEndInclusive
    )
    for (const [k, v] of openings) {
      openingBalances.set(k, v)
    }
    for (const [k, arr] of txs) {
      const existing = transactionsByResident.get(k) ?? []
      transactionsByResident.set(k, existing.concat(arr))
    }
  }
  return { openingBalances, transactionsByResident }
}

export function getLedgerSqlForPrint(): SqlLedger {
  return neonHttpSql()
}
