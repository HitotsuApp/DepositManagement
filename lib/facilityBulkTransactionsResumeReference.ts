/**
 * resume 残高計算の参照実装（SQL 軽量化の parity 検証用）。
 * facility transactions API と同一の ledger 規則。
 */

import { ledgerSignedContribution } from '@/lib/balanceLedgerContribution'

export type ResumeReferenceTxn = {
  id: number
  transactionDate: Date
  transactionType: string
  amount: number
  residentId: number
}

export type ResumeReferenceBalancedRow = ResumeReferenceTxn & {
  balance: number
  facility_balance: number
}

function txnAmount(transactionType: string, amount: number): number {
  return ledgerSignedContribution(transactionType, amount)
}

function sortTxns(txs: ResumeReferenceTxn[]): ResumeReferenceTxn[] {
  return [...txs].sort((a, b) => {
    const dateA = a.transactionDate.getTime()
    const dateB = b.transactionDate.getTime()
    if (dateA !== dateB) return dateA - dateB
    return a.id - b.id
  })
}

function isAtOrBeforeCursor(
  tx: ResumeReferenceTxn,
  afterDate: Date,
  afterId: number
): boolean {
  const t = tx.transactionDate.getTime()
  const c = afterDate.getTime()
  if (t < c) return true
  if (t > c) return false
  return tx.id <= afterId
}

function isAfterCursor(tx: ResumeReferenceTxn, afterDate: Date, afterId: number): boolean {
  return !isAtOrBeforeCursor(tx, afterDate, afterId)
}

/** 旧 resume SQL 相当: 当月全件ウィンドウ → カーソル後に LIMIT */
export function legacyResumeChunkReference(
  monthTxns: ResumeReferenceTxn[],
  previousBalances: Map<number, number>,
  facilityOpening: number,
  limitLogical: number,
  continuationFromBeginning: boolean,
  afterDate: Date,
  afterId: number
): { rows: ResumeReferenceBalancedRow[]; hasMore: boolean } {
  const sorted = sortTxns(monthTxns)
  const balanced: ResumeReferenceBalancedRow[] = []
  const residentRunning = new Map<number, number>()
  let facilityRunning = facilityOpening

  for (const tx of sorted) {
    const contrib = txnAmount(tx.transactionType, tx.amount)
    const prevResident = residentRunning.get(tx.residentId) ?? previousBalances.get(tx.residentId) ?? 0
    const newResident = prevResident + contrib
    residentRunning.set(tx.residentId, newResident)
    facilityRunning += contrib
    balanced.push({
      ...tx,
      balance: newResident,
      facility_balance: facilityRunning,
    })
  }

  const filtered = continuationFromBeginning
    ? balanced
    : balanced.filter((tx) => isAfterCursor(tx, afterDate, afterId))

  const takeLimit = limitLogical + 1
  const slice = filtered.slice(0, takeLimit)
  return {
    rows: slice.slice(0, limitLogical),
    hasMore: slice.length > limitLogical,
  }
}

/** 新 resume SQL 相当: カーソル起点 + 次チャンクのみウィンドウ */
export function optimizedResumeChunkReference(
  monthTxns: ResumeReferenceTxn[],
  previousBalances: Map<number, number>,
  facilityOpening: number,
  limitLogical: number,
  continuationFromBeginning: boolean,
  afterDate: Date,
  afterId: number
): { rows: ResumeReferenceBalancedRow[]; hasMore: boolean } {
  const sorted = sortTxns(monthTxns)

  let facilityBase = facilityOpening
  const residentBase = new Map<number, number>()

  if (!continuationFromBeginning) {
    for (const tx of sorted) {
      if (!isAtOrBeforeCursor(tx, afterDate, afterId)) break
      const contrib = txnAmount(tx.transactionType, tx.amount)
      facilityBase += contrib
      const prev = residentBase.get(tx.residentId) ?? previousBalances.get(tx.residentId) ?? 0
      residentBase.set(tx.residentId, prev + contrib)
    }
  }

  const candidates = continuationFromBeginning
    ? sorted
    : sorted.filter((tx) => isAfterCursor(tx, afterDate, afterId))

  const takeLimit = limitLogical + 1
  const nextSlice = candidates.slice(0, takeLimit)
  const hasMore = nextSlice.length > limitLogical
  const chunk = nextSlice.slice(0, limitLogical)

  const residentRunning = new Map<number, number>()
  let facilityRunning = facilityBase

  const rows: ResumeReferenceBalancedRow[] = []
  for (const tx of chunk) {
    const contrib = txnAmount(tx.transactionType, tx.amount)
    const base =
      residentRunning.get(tx.residentId) ??
      residentBase.get(tx.residentId) ??
      previousBalances.get(tx.residentId) ??
      0
    const newResident = base + contrib
    residentRunning.set(tx.residentId, newResident)
    facilityRunning += contrib
    rows.push({
      ...tx,
      balance: newResident,
      facility_balance: facilityRunning,
    })
  }

  return { rows, hasMore }
}

export function assertResumeReferenceParity(
  monthTxns: ResumeReferenceTxn[],
  previousBalances: Map<number, number>,
  facilityOpening: number,
  limitLogical: number,
  continuationFromBeginning: boolean,
  afterDate: Date,
  afterId: number,
  label: string
): void {
  const legacy = legacyResumeChunkReference(
    monthTxns,
    previousBalances,
    facilityOpening,
    limitLogical,
    continuationFromBeginning,
    afterDate,
    afterId
  )
  const optimized = optimizedResumeChunkReference(
    monthTxns,
    previousBalances,
    facilityOpening,
    limitLogical,
    continuationFromBeginning,
    afterDate,
    afterId
  )

  if (legacy.hasMore !== optimized.hasMore) {
    throw new Error(
      `${label}: hasMore mismatch legacy=${legacy.hasMore} optimized=${optimized.hasMore}`
    )
  }
  if (legacy.rows.length !== optimized.rows.length) {
    throw new Error(
      `${label}: row count mismatch legacy=${legacy.rows.length} optimized=${optimized.rows.length}`
    )
  }

  for (let i = 0; i < legacy.rows.length; i++) {
    const a = legacy.rows[i]
    const b = optimized.rows[i]
    if (a.id !== b.id) {
      throw new Error(`${label}: id mismatch at ${i}: ${a.id} vs ${b.id}`)
    }
    if (Math.abs(a.balance - b.balance) > 1e-6) {
      throw new Error(
        `${label}: balance mismatch id=${a.id}: ${a.balance} vs ${b.balance}`
      )
    }
    if (Math.abs(a.facility_balance - b.facility_balance) > 1e-6) {
      throw new Error(
        `${label}: facility_balance mismatch id=${a.id}: ${a.facility_balance} vs ${b.facility_balance}`
      )
    }
  }
}
