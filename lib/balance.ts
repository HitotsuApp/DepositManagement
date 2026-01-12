import { Transaction } from '@prisma/client'

export interface TransactionWithBalance extends Transaction {
  balance: number
}

/**
 * 取引リストから残高を計算する
 * 取引は日付順にソートされている必要がある
 */
export function calculateBalance(transactions: Transaction[]): TransactionWithBalance[] {
  let balance = 0
  return transactions.map(transaction => {
    if (transaction.transactionType === 'in' || transaction.transactionType === 'correct_in') {
      balance += transaction.amount
    } else if (transaction.transactionType === 'out' || transaction.transactionType === 'correct_out') {
      balance -= transaction.amount
    }
    return {
      ...transaction,
      balance,
    }
  })
}

/**
 * 指定年月の取引をフィルタリング
 */
export function filterTransactionsByMonth(
  transactions: Transaction[],
  year: number,
  month: number
): Transaction[] {
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59, 999)
  
  return transactions.filter(transaction => {
    const transactionDate = new Date(transaction.transactionDate)
    return transactionDate >= startDate && transactionDate <= endDate
  })
}

/**
 * 指定年月までの累積残高を計算
 */
export function calculateBalanceUpToMonth(
  transactions: Transaction[],
  year: number,
  month: number
): number {
  const targetDate = new Date(year, month, 0, 23, 59, 59, 999)
  
  let balance = 0
  for (const transaction of transactions) {
    const transactionDate = new Date(transaction.transactionDate)
    if (transactionDate <= targetDate) {
      if (transaction.transactionType === 'in' || transaction.transactionType === 'correct_in') {
        balance += transaction.amount
      } else if (transaction.transactionType === 'out' || transaction.transactionType === 'correct_out') {
        balance -= transaction.amount
      }
    }
  }
  
  return balance
}

