/**
 * 取引の作成・訂正マークを Prisma なしで Neon HTTP から実行する（Edge Worker の wallTime 改善）
 */

import type { NeonSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'
import { isRowCorrectMarkAllowedForViewMonth } from '@/lib/bulkInputPageUtils'
import { BUSINESS_TIME_ZONE, getZonedCalendarParts } from '@/lib/calendarDate'
import type { TransactionCreatePayload } from '@/lib/transactionCreateValidation'

/** API が返す取引行（Prisma create と同様に JSON 化しやすい形） */
export type TransactionRow = {
  id: number
  residentId: number
  transactionDate: string
  transactionType: string
  amount: number
  description: string | null
  payee: string | null
  reason: string | null
  createdAt: string
}

function toTransactionRow(raw: Record<string, unknown>): TransactionRow {
  const td = raw.transactionDate
  const created = raw.createdAt
  return {
    id: Number(raw.id),
    residentId: Number(raw.residentId),
    transactionDate:
      td instanceof Date
        ? td.toISOString()
        : typeof td === 'string'
          ? td
          : String(td),
    transactionType: String(raw.transactionType),
    amount: Number(raw.amount),
    description: raw.description == null ? null : String(raw.description),
    payee: raw.payee == null ? null : String(raw.payee),
    reason: raw.reason == null ? null : String(raw.reason),
    createdAt:
      created instanceof Date
        ? created.toISOString()
        : typeof created === 'string'
          ? created
          : String(created),
  }
}

/**
 * 単一 INSERT。`validateTransactionCreateBody` で正規化済みの payload を渡す。
 */
export async function createTransactionNeon(
  sql: NeonSql,
  payload: TransactionCreatePayload
): Promise<TransactionRow> {
  return withTransientDbRetries('createTransactionNeon', async () => {
    const rows = (await sql`
      INSERT INTO "Transaction" (
        "residentId",
        "transactionDate",
        "transactionType",
        "amount",
        "description",
        "payee",
        "reason"
      )
      VALUES (
        ${payload.residentId},
        ${payload.transactionDate},
        ${payload.transactionType},
        ${payload.amount},
        ${payload.description},
        ${payload.payee},
        ${payload.reason}
      )
      RETURNING *
    `) as Record<string, unknown>[]
    const first = rows[0]
    if (!first) throw new Error('INSERT returned no rows')
    return toTransactionRow(first)
  })
}

/**
 * 複数 INSERT を **1 つの Postgres トランザクション**（HTTP 1 往復）で実行。
 */
export async function createTransactionsBatchNeon(
  sql: NeonSql,
  payloads: TransactionCreatePayload[]
): Promise<TransactionRow[]> {
  if (payloads.length === 0) return []

  return withTransientDbRetries('createTransactionsBatchNeon', async () => {
    const queries = payloads.map((p) =>
      sql`
        INSERT INTO "Transaction" (
          "residentId",
          "transactionDate",
          "transactionType",
          "amount",
          "description",
          "payee",
          "reason"
        )
        VALUES (
          ${p.residentId},
          ${p.transactionDate},
          ${p.transactionType},
          ${p.amount},
          ${p.description},
          ${p.payee},
          ${p.reason}
        )
        RETURNING *
      `
    )

    const results = await sql.transaction(queries)
    return results.map((rows, index) => {
      const first = (rows as Record<string, unknown>[])[0]
      if (!first) throw new Error(`INSERT batch index ${index} returned no rows`)
      return toTransactionRow(first)
    })
  })
}

export type MarkCorrectErrorCode =
  | 'NOT_FOUND'
  | 'ALREADY_CORRECT'
  | 'WRONG_TYPE'
  | 'MONTH_NOT_ALLOWED'

export async function markTransactionCorrectNeon(
  sql: NeonSql,
  transactionId: number
): Promise<
  { ok: true; transaction: TransactionRow } | { ok: false; error: MarkCorrectErrorCode }
> {
  return withTransientDbRetries('markTransactionCorrectNeon', async () => {
    const rows = (await sql`
      SELECT id, "transactionDate", "transactionType"
      FROM "Transaction"
      WHERE id = ${transactionId}
    `) as { id: number; transactionDate: Date | string; transactionType: string }[]

    const current = rows[0]
    if (!current) return { ok: false, error: 'NOT_FOUND' }

    if (
      current.transactionType === 'correct_in' ||
      current.transactionType === 'correct_out'
    ) {
      return { ok: false, error: 'ALREADY_CORRECT' }
    }

    let newTransactionType: string
    if (current.transactionType === 'in') {
      newTransactionType = 'correct_in'
    } else if (current.transactionType === 'out') {
      newTransactionType = 'correct_out'
    } else {
      return { ok: false, error: 'WRONG_TYPE' }
    }

    const { year: txYear, month: txMonth } = getZonedCalendarParts(
      new Date(current.transactionDate),
      BUSINESS_TIME_ZONE
    )
    if (!isRowCorrectMarkAllowedForViewMonth(txYear, txMonth)) {
      return { ok: false, error: 'MONTH_NOT_ALLOWED' }
    }

    const updated = (await sql`
      UPDATE "Transaction"
      SET "transactionType" = ${newTransactionType}
      WHERE id = ${transactionId}
      RETURNING *
    `) as Record<string, unknown>[]

    const row = updated[0]
    if (!row) return { ok: false, error: 'NOT_FOUND' }
    return { ok: true, transaction: toTransactionRow(row) }
  })
}
