/**
 * GET /api/residents/[id] の Neon HTTP クエリ（Prisma の findUnique + transactions と同一結果）
 */

import type { NeonSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'

export type ResidentDetailHeaderRow = {
  id: number
  name: string
  nameFurigana: string | null
  facilityId: number
  displayNamePrefix: string | null
  namePrefixDisplayOption: string | null
}

/** balance.ts の computeResidentMonthViewFromSortedTransactions へ渡す行 */
export type ResidentDetailTransactionRow = {
  id: number
  transactionDate: Date | string
  transactionType: string
  amount: number
  description: string | null
  payee: string | null
  reason: string | null
  createdAt: Date | string
  residentId: number
}

function normalizeJsonDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  if (value == null) throw new Error('residentDetailSql: unexpected null date column')
  return String(value)
}

export async function fetchResidentDetailHeader(
  sql: NeonSql,
  residentId: number
): Promise<ResidentDetailHeaderRow | null> {
  return withTransientDbRetries(`residentDetail.header(${residentId})`, async () => {
    const rows = (await sql`
      SELECT
        r.id,
        r.name,
        r."nameFurigana",
        r."facilityId",
        r."displayNamePrefix",
        r."namePrefixDisplayOption"
      FROM "Resident" r
      WHERE r.id = ${residentId}
      LIMIT 1
    `) as Record<string, unknown>[]

    if (rows.length === 0) return null
    const r = rows[0]
    return {
      id: Number(r.id),
      name: String(r.name ?? ''),
      nameFurigana: r.nameFurigana == null ? null : String(r.nameFurigana),
      facilityId: Number(r.facilityId),
      displayNamePrefix: r.displayNamePrefix == null ? null : String(r.displayNamePrefix),
      namePrefixDisplayOption:
        r.namePrefixDisplayOption == null ? null : String(r.namePrefixDisplayOption),
    }
  })
}

export async function fetchTransactionsUpToMonthEnd(
  sql: NeonSql,
  residentId: number,
  endOfSelectedMonthInclusive: Date
): Promise<ResidentDetailTransactionRow[]> {
  return withTransientDbRetries(`residentDetail.txs(${residentId})`, async () => {
    const rows = (await sql`
      SELECT
        t.id,
        t."transactionDate",
        t."transactionType",
        t.amount,
        t.description,
        t.payee,
        t.reason,
        t."createdAt",
        t."residentId"
      FROM "Transaction" t
      WHERE t."residentId" = ${residentId}
        AND t."transactionDate" <= ${endOfSelectedMonthInclusive}
      ORDER BY t."transactionDate" ASC, t.id ASC
    `) as Record<string, unknown>[]

    return rows.map((r) => ({
      id: Number(r.id),
      transactionDate: normalizeJsonDate(r.transactionDate),
      transactionType: String(r.transactionType),
      amount: Number(r.amount),
      description: r.description == null ? null : String(r.description),
      payee: r.payee == null ? null : String(r.payee),
      reason: r.reason == null ? null : String(r.reason),
      createdAt: normalizeJsonDate(r.createdAt),
      residentId: Number(r.residentId),
    }))
  })
}
