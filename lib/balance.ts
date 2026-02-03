import { Transaction } from '@prisma/client'

export interface TransactionWithBalance extends Transaction {
  balance: number
}

/**
 * 残高計算に必要な最小限の取引データ型
 */
export type TransactionForBalance = Pick<Transaction, 'id' | 'transactionDate' | 'transactionType' | 'amount'>

/**
 * 取引リストから残高を計算する
 * 取引は日付順にソートされている必要がある
 * 訂正区分（correct_in, correct_out）は計算から除外される（打ち消し処理）
 * 過去訂正区分（past_correct_in, past_correct_out）は計算に含まれる
 */
export function calculateBalance(transactions: Transaction[]): TransactionWithBalance[] {
  let balance = 0
  return transactions.map(transaction => {
    // 通常の入金・出金は計算に含める
    if (transaction.transactionType === 'in') {
      balance += transaction.amount
    } else if (transaction.transactionType === 'out') {
      balance -= transaction.amount
    } else if (transaction.transactionType === 'past_correct_in') {
      // 過去訂正入金は計算に含める
      balance += transaction.amount
    } else if (transaction.transactionType === 'past_correct_out') {
      // 過去訂正出金は計算に含める
      balance -= transaction.amount
    }
    // correct_in と correct_out は計算しない（打ち消し処理）
    return {
      ...transaction,
      balance,
    }
  })
}

/**
 * 指定年月の取引をフィルタリング
 */
export function filterTransactionsByMonth<T extends Transaction>(
  transactions: T[],
  year: number,
  month: number
): T[] {
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59, 999)
  
  return transactions.filter(transaction => {
    const transactionDate = new Date(transaction.transactionDate)
    return transactionDate >= startDate && transactionDate <= endDate
  })
}

/**
 * 指定年月までの累積残高を計算
 * 訂正区分（correct_in, correct_out）は計算から除外される（打ち消し処理）
 * 過去訂正区分（past_correct_in, past_correct_out）は計算に含まれる
 * 取引は日付順にソートしてから計算する
 */
export function calculateBalanceUpToMonth(
  transactions: Transaction[] | TransactionForBalance[],
  year: number,
  month: number
): number {
  const targetDate = new Date(year, month, 0, 23, 59, 59, 999)
  
  // 日付順にソート（同じ日付の場合はID順）
  const sortedTransactions = [...transactions].sort((a, b) => {
    const dateA = new Date(a.transactionDate).getTime()
    const dateB = new Date(b.transactionDate).getTime()
    if (dateA !== dateB) return dateA - dateB
    return a.id - b.id
  })
  
  let balance = 0
  for (const transaction of sortedTransactions) {
    const transactionDate = new Date(transaction.transactionDate)
    if (transactionDate <= targetDate) {
      // 通常の入金・出金は計算に含める
      if (transaction.transactionType === 'in') {
        balance += transaction.amount
      } else if (transaction.transactionType === 'out') {
        balance -= transaction.amount
      } else if (transaction.transactionType === 'past_correct_in') {
        // 過去訂正入金は計算に含める
        balance += transaction.amount
      } else if (transaction.transactionType === 'past_correct_out') {
        // 過去訂正出金は計算に含める
        balance -= transaction.amount
      }
      // correct_in と correct_out は計算しない（打ち消し処理）
    }
  }
  
  return balance
}

