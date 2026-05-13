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

/**
 * 取引が transactionDate / id 昇順にソート済みであることが前提（DB orderBy と一致）。
 * calculateBalanceUpToMonth と同じ集計ルールだがコピー sort をしない。
 */
export function calculateBalanceUpToMonthPresorted(
  sortedTransactions: Transaction[] | TransactionForBalance[],
  year: number,
  month: number
): number {
  const targetDate = new Date(year, month, 0, 23, 59, 59, 999)
  let balance = 0
  for (const transaction of sortedTransactions) {
    const transactionDate = new Date(transaction.transactionDate)
    if (transactionDate <= targetDate) {
      if (transaction.transactionType === 'in') {
        balance += transaction.amount
      } else if (transaction.transactionType === 'out') {
        balance -= transaction.amount
      } else if (transaction.transactionType === 'past_correct_in') {
        balance += transaction.amount
      } else if (transaction.transactionType === 'past_correct_out') {
        balance -= transaction.amount
      }
    }
  }
  return balance
}

type TransactionRowForResidentApi = TransactionForBalance & {
  description?: string | null
  payee?: string | null
  reason?: string | null
  createdAt?: Date
  residentId?: number
}

/**
 * GET /api/residents/[id] 用: ソート済み取引を 1 パスで処理し CPU を抑える。
 * 訂正区分の扱いは calculateBalance / calculateBalanceUpToMonth と同一。
 */
export function computeResidentMonthViewFromSortedTransactions<T extends TransactionRowForResidentApi>(
  sortedTransactions: T[],
  year: number,
  month: number
): {
  balance: number
  previousMonthBalance: number
  monthTransactionsWithBalance: Array<T & { balance: number }>
} {
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59, 999)
  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  const prevMonthEndDate = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999)

  let running = 0
  let balanceAtMonthEnd = 0
  let previousMonthBalance = 0
  const monthTransactionsWithBalance: Array<T & { balance: number }> = []

  for (const tx of sortedTransactions) {
    if (tx.transactionType === 'in') {
      running += tx.amount
    } else if (tx.transactionType === 'out') {
      running -= tx.amount
    } else if (tx.transactionType === 'past_correct_in') {
      running += tx.amount
    } else if (tx.transactionType === 'past_correct_out') {
      running -= tx.amount
    }

    const d = new Date(tx.transactionDate)
    if (d <= endDate) {
      balanceAtMonthEnd = running
    }
    if (d <= prevMonthEndDate) {
      previousMonthBalance = running
    }
    if (d >= startDate && d <= endDate) {
      monthTransactionsWithBalance.push({ ...tx, balance: running })
    }
  }

  return {
    balance: balanceAtMonthEnd,
    previousMonthBalance,
    monthTransactionsWithBalance,
  }
}

