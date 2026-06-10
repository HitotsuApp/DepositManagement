/**
 * まとめて入力系画面: 登録後に resume 全件再取得せず、クライアントで明細を差分マージする。
 * 残高・施設残高は facility transactions API と同じ ledger 規則で再計算する。
 */

import type { FacilityTransactionPayload } from '@/lib/bulkFacilityTransactionsFetch'
import {
  isExcludedFromLedgerBalanceCalculation,
  ledgerSignedContribution,
} from '@/lib/balanceLedgerContribution'
import type { TransactionRow } from '@/lib/transactionWriteSql'

export type BulkInputResidentLookup = {
  id: number
  name: string
  displayNamePrefix?: string | null
  namePrefixDisplayOption?: string | null
}

function isCarryOverRow(t: FacilityTransactionPayload): boolean {
  return !!(t.isCarryOver || t.id === -1)
}

function sortBulkInputTransactions(
  txs: FacilityTransactionPayload[]
): FacilityTransactionPayload[] {
  return [...txs].sort((a, b) => {
    const dateA = new Date(a.transactionDate).getTime()
    const dateB = new Date(b.transactionDate).getTime()
    if (dateA !== dateB) return dateA - dateB
    return a.id - b.id
  })
}

/** 当月明細（繰越行除く）から、利用者ごとの「月初前残高」を逆算する */
export function deriveResidentOpeningsFromMonthRows(
  transactions: FacilityTransactionPayload[]
): Map<number, number> {
  const sorted = sortBulkInputTransactions(
    transactions.filter((t) => !isCarryOverRow(t))
  )
  const openings = new Map<number, number>()
  for (const tx of sorted) {
    if (openings.has(tx.residentId)) continue
    const contrib = isExcludedFromLedgerBalanceCalculation(tx.transactionType)
      ? 0
      : ledgerSignedContribution(tx.transactionType, tx.amount)
    openings.set(tx.residentId, tx.balance - contrib)
  }
  return openings
}

/** 施設繰越行を先頭に保ち、残高列を ledger 規則で一括再計算する */
export function recalculateBulkInputTransactionBalances(
  transactions: FacilityTransactionPayload[],
  residentOpeningBeforeMonth: Map<number, number>
): FacilityTransactionPayload[] {
  const carryover = transactions.find(isCarryOverRow)
  const facilityOpening = carryover?.facilityBalance ?? 0
  const sorted = sortBulkInputTransactions(
    transactions.filter((t) => !isCarryOverRow(t))
  )

  const residentRunning = new Map(residentOpeningBeforeMonth)
  let facilityRunning = facilityOpening

  const recalculated = sorted.map((tx) => {
    const contrib = isExcludedFromLedgerBalanceCalculation(tx.transactionType)
      ? 0
      : ledgerSignedContribution(tx.transactionType, tx.amount)

    const prevResident = residentRunning.get(tx.residentId) ?? 0
    const newResidentBalance = prevResident + contrib
    residentRunning.set(tx.residentId, newResidentBalance)
    facilityRunning += contrib

    return {
      ...tx,
      balance: newResidentBalance,
      facilityBalance: facilityRunning,
    }
  })

  return carryover ? [carryover, ...recalculated] : recalculated
}

export function transactionRowToBulkPayload(
  row: TransactionRow,
  residentName: string
): FacilityTransactionPayload {
  return {
    id: row.id,
    transactionDate: row.transactionDate,
    transactionType: row.transactionType,
    amount: row.amount,
    description: row.description,
    payee: row.payee,
    reason: row.reason,
    balance: 0,
    facilityBalance: 0,
    residentId: row.residentId,
    residentName,
  }
}

/** 利用者詳細 API から月初前残高（繰越相当）を取得 */
export async function fetchResidentOpeningBeforeMonth(
  residentId: number,
  year: number,
  month: number
): Promise<number> {
  const res = await fetch(
    `/api/residents/${residentId}?year=${year}&month=${month}`,
    { cache: 'no-store' }
  )
  if (!res.ok) return 0
  const data = (await res.json()) as {
    transactions?: Array<{ isCarryOver?: boolean; balance?: number }>
  }
  const carryover = data.transactions?.find((t) => t.isCarryOver)
  return carryover != null ? Number(carryover.balance) : 0
}

async function ensureResidentOpenings(
  openings: Map<number, number>,
  existing: FacilityTransactionPayload[],
  created: TransactionRow[],
  year: number,
  month: number
): Promise<void> {
  const residentIdsInExisting = new Set(
    existing.filter((t) => !isCarryOverRow(t)).map((t) => t.residentId)
  )

  const missing = new Set<number>()
  for (const row of created) {
    if (openings.has(row.residentId)) continue
    if (residentIdsInExisting.has(row.residentId)) continue
    missing.add(row.residentId)
  }

  await Promise.all(
    [...missing].map(async (residentId) => {
      const opening = await fetchResidentOpeningBeforeMonth(residentId, year, month)
      openings.set(residentId, opening)
    })
  )
}

export type MergeCreatedTransactionsParams = {
  existing: FacilityTransactionPayload[]
  created: TransactionRow[]
  residents: BulkInputResidentLookup[]
  residentDisplayName: (r: BulkInputResidentLookup) => string
  year: number
  month: number
}

/** 新規登録行を日付順に挿入し、残高を再計算した一覧を返す */
export async function mergeCreatedTransactionsIntoList(
  params: MergeCreatedTransactionsParams
): Promise<FacilityTransactionPayload[]> {
  const { existing, created, residents, residentDisplayName, year, month } = params
  if (created.length === 0) return existing

  const nameById = new Map(residents.map((r) => [r.id, residentDisplayName(r)]))
  const openings = deriveResidentOpeningsFromMonthRows(existing)
  await ensureResidentOpenings(openings, existing, created, year, month)

  const newRows = created.map((row) =>
    transactionRowToBulkPayload(row, nameById.get(row.residentId) ?? '')
  )

  const carryover = existing.filter(isCarryOverRow)
  const mergedReal = sortBulkInputTransactions([
    ...existing.filter((t) => !isCarryOverRow(t)),
    ...newRows,
  ])

  return recalculateBulkInputTransactionBalances([...carryover, ...mergedReal], openings)
}

/** 訂正マーク（correct_in/out）後の一覧更新 */
export function applyMarkCorrectToTransactionList(
  transactions: FacilityTransactionPayload[],
  updated: TransactionRow
): FacilityTransactionPayload[] {
  const openings = deriveResidentOpeningsFromMonthRows(transactions)
  const withType = transactions.map((t) =>
    t.id === updated.id
      ? {
          ...t,
          transactionType: updated.transactionType,
        }
      : t
  )
  return recalculateBulkInputTransactionBalances(withType, openings)
}
