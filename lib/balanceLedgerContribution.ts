import type { Transaction } from '@prisma/client'
import type { TransactionForBalance } from '@/lib/balance'

/**
 * 印刷API・facility transactions の previous_balances CTE と同じ開き規則（単一ソース）。
 *
 * - correct_in / correct_out はクエリで除外するか、このモジュールの計算でも無視する
 * - in / past_correct_in: +amount、out / past_correct_out: -amount、それ以外: 寄与しない
 *
 * 簡易確認: parityAssertBalanceLedgerContributionDev は開発環境のみ手動実行すること。
 */

export function ledgerSignedContribution(transactionType: string, amount: number): number {
  if (transactionType === 'in' || transactionType === 'past_correct_in') return amount
  if (transactionType === 'out' || transactionType === 'past_correct_out') return -amount
  return 0
}

export function isExcludedFromLedgerBalanceCalculation(transactionType: string): boolean {
  return transactionType === 'correct_in' || transactionType === 'correct_out'
}

/** 並び順を DB の order と揃える（同日は id）。 */
export function sortTransactionsForLedger<
  T extends Pick<Transaction, 'id' | 'transactionDate'>,
>(txs: T[]): T[] {
  return [...txs].sort((a, b) => {
    const dateA = new Date(a.transactionDate).getTime()
    const dateB = new Date(b.transactionDate).getTime()
    if (dateA !== dateB) return dateA - dateB
    return a.id - b.id
  })
}

/**
 * カットオフ日時までに発生した取引のみで累積（print transform の繰越と同一）。
 */
export function sumLedgerThruCutoffInclusive(
  transactions: Iterable<
    Pick<Transaction, 'id' | 'transactionDate' | 'transactionType' | 'amount'>
  >,
  cutoffInclusive: Date
): number {
  const sorted = sortTransactionsForLedger([...transactions])
  let balance = 0
  const cut = cutoffInclusive.getTime()
  for (const t of sorted) {
    if (new Date(t.transactionDate).getTime() > cut) continue
    if (isExcludedFromLedgerBalanceCalculation(t.transactionType)) continue
    balance += ledgerSignedContribution(t.transactionType, t.amount)
  }
  return balance
}

/** 開発時の単純自己検証（本番コードからは呼ばない） */
export function parityAssertBalanceLedgerContributionDev(): void {
  const cutoff = new Date(2026, 3, 30, 23, 59, 59, 999)
  const rows: TransactionForBalance[] = [
    { id: 1, transactionDate: new Date(2026, 0, 10), transactionType: 'in', amount: 100 },
    { id: 2, transactionDate: new Date(2026, 1, 5), transactionType: 'out', amount: 30 },
    {
      id: 3,
      transactionDate: new Date(2026, 3, 1),
      transactionType: 'correct_in',
      amount: 999,
    },
    { id: 4, transactionDate: new Date(2026, 3, 15), transactionType: 'past_correct_out', amount: 5 },
    { id: 5, transactionDate: new Date(2026, 5, 1), transactionType: 'in', amount: 42 },
  ]
  let s = sumLedgerThruCutoffInclusive(rows, cutoff)
  if (Math.abs(s - 65) > 1e-6) throw new Error(`parity opening expected 65 got ${s}`)
  const prevEnd = new Date(2026, 2, 31, 23, 59, 59, 999)
  s = sumLedgerThruCutoffInclusive(rows, prevEnd)
  if (Math.abs(s - 70) > 1e-6) throw new Error(`parity opening expected 70 got ${s}`)
}
