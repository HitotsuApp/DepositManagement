/**
 * resume SQL 軽量化の parity 検証（DB 不要・固定フィクスチャ）。
 * 実行: npx tsx scripts/verify-resume-balance-parity.ts
 */

import {
  assertResumeReferenceParity,
  legacyResumeChunkReference,
  type ResumeReferenceTxn,
} from '../lib/facilityBulkTransactionsResumeReference'

function d(iso: string): Date {
  return new Date(iso)
}

function buildMonthTxns(): ResumeReferenceTxn[] {
  return [
    { id: 1, transactionDate: d('2026-06-01T10:00:00.000Z'), transactionType: 'in', amount: 1000, residentId: 10 },
    { id: 2, transactionDate: d('2026-06-01T10:00:00.000Z'), transactionType: 'out', amount: 200, residentId: 20 },
    { id: 3, transactionDate: d('2026-06-02T10:00:00.000Z'), transactionType: 'in', amount: 500, residentId: 10 },
    { id: 4, transactionDate: d('2026-06-02T11:00:00.000Z'), transactionType: 'correct_in', amount: 999, residentId: 30 },
    { id: 5, transactionDate: d('2026-06-03T10:00:00.000Z'), transactionType: 'past_correct_out', amount: 100, residentId: 20 },
    { id: 6, transactionDate: d('2026-06-03T10:00:00.000Z'), transactionType: 'in', amount: 300, residentId: 30 },
    { id: 7, transactionDate: d('2026-06-04T10:00:00.000Z'), transactionType: 'out', amount: 50, residentId: 10 },
    { id: 8, transactionDate: d('2026-06-04T10:00:00.000Z'), transactionType: 'in', amount: 80, residentId: 20 },
    { id: 9, transactionDate: d('2026-06-05T10:00:00.000Z'), transactionType: 'in', amount: 40, residentId: 40 },
    { id: 10, transactionDate: d('2026-06-05T10:00:00.000Z'), transactionType: 'out', amount: 10, residentId: 10 },
  ]
}

const previousBalances = new Map<number, number>([
  [10, 5000],
  [20, 2000],
  [30, 0],
  [40, 100],
])

const facilityOpening = 7100
const monthTxns = buildMonthTxns()

const cases: Array<{
  label: string
  limit: number
  fromStart: boolean
  afterDate: Date
  afterId: number
}> = [
  { label: 'fromStart limit=3', limit: 3, fromStart: true, afterDate: d('1970-01-01T00:00:00.000Z'), afterId: 0 },
  { label: 'fromStart limit=60', limit: 60, fromStart: true, afterDate: d('1970-01-01T00:00:00.000Z'), afterId: 0 },
  { label: 'after id=2 limit=3', limit: 3, fromStart: false, afterDate: d('2026-06-01T10:00:00.000Z'), afterId: 2 },
  { label: 'after id=4 (correct_in) limit=5', limit: 5, fromStart: false, afterDate: d('2026-06-02T11:00:00.000Z'), afterId: 4 },
  { label: 'after id=7 same-day limit=2', limit: 2, fromStart: false, afterDate: d('2026-06-04T10:00:00.000Z'), afterId: 7 },
  { label: 'after id=9 tail limit=10', limit: 10, fromStart: false, afterDate: d('2026-06-05T10:00:00.000Z'), afterId: 9 },
]

let passed = 0
for (const c of cases) {
  assertResumeReferenceParity(
    monthTxns,
    previousBalances,
    facilityOpening,
    c.limit,
    c.fromStart,
    c.afterDate,
    c.afterId,
    c.label
  )
  passed++
}

// 全ページ walk で整合
let cursorDate = d('1970-01-01T00:00:00.000Z')
let cursorId = 0
let fromStart = true
const limit = 3
let page = 0
while (page < 20) {
  page++
  const chunk = legacyResumeChunkReference(
    monthTxns,
    previousBalances,
    facilityOpening,
    limit,
    fromStart,
    cursorDate,
    cursorId
  )
  assertResumeReferenceParity(
    monthTxns,
    previousBalances,
    facilityOpening,
    limit,
    fromStart,
    cursorDate,
    cursorId,
    `walk page ${page}`
  )
  if (!chunk.hasMore) break
  const last = chunk.rows[chunk.rows.length - 1]
  cursorDate = last.transactionDate
  cursorId = last.id
  fromStart = false
}

console.log(`resume balance parity: ${passed} cases + walk OK`)
