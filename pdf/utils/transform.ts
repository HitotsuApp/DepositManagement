import { Facility, Unit, Resident, Transaction } from "@prisma/client"
import { filterTransactionsByMonth } from "@/lib/balance"
import { formatDate } from "./format"

export interface PrintData {
  statement: {
    month: string
  }
  unit: {
    name: string
  }
  transactions: Array<{
    category: string
    userName: string
    date: string
    label: string
    payee: string
    income: number
    expense: number
    balance: number
  }>
  summary: {
    totalIncome: number
    totalExpense: number
    currentBalance: number
  }
  facility: {
    name: string
    position: string
    staffName: string
  }
}

interface FacilityWithRelations extends Facility {
  units: Unit[]
  residents: (Resident & {
    transactions: Transaction[]
    unit: Unit
  })[]
}

/**
 * Prismaで取得したデータを印刷用JSONに整形する
 */
export function transformToPrintData(
  facility: FacilityWithRelations,
  unitId: number,
  year: number,
  month: number
): PrintData {
  // ユニットを取得
  const unit = facility.units.find((u) => u.id === unitId)
  if (!unit) {
    throw new Error(`Unit ${unitId} not found`)
  }

  // ユニットに属する利用者を取得
  const unitResidents = facility.residents.filter((r) => r.unitId === unitId)

  // 前月末日を計算（繰越行用）
  const previousMonthEnd = new Date(year, month - 1, 0, 23, 59, 59, 999)

  // 指定年月の取引を取得
  const allTransactions: Array<Transaction & { resident: Resident & { unit: Unit } }> = []
  
  unitResidents.forEach((resident) => {
    const monthTransactions = filterTransactionsByMonth(
      resident.transactions,
      year,
      month
    )
    
    // 前月末までの残高を計算（繰越行用）
    const previousBalance = resident.transactions
      .filter((t) => new Date(t.transactionDate) <= previousMonthEnd)
      .reduce((balance, t) => {
        if (t.transactionType === "in" || t.transactionType === "correct_in") {
          return balance + t.amount
        } else if (t.transactionType === "out" || t.transactionType === "correct_out") {
          return balance - t.amount
        }
        return balance
      }, 0)

    // 繰越行を追加（前月末残高が0でない場合、または当月に取引がある場合）
    if (previousBalance !== 0 || monthTransactions.length > 0) {
      allTransactions.push({
        id: -1, // 仮のID
        residentId: resident.id,
        transactionDate: previousMonthEnd,
        transactionType: "in",
        amount: 0,
        description: null,
        payee: null,
        reason: null,
        createdAt: previousMonthEnd,
        resident: {
          ...resident,
          unit: unit,
        },
        _previousBalance: previousBalance,
        _isCarryOver: true,
      } as any)
    }

    // 当月の取引を追加
    monthTransactions.forEach((t) => {
      allTransactions.push({
        ...t,
        resident: {
          ...resident,
          unit: unit,
        },
      } as any)
    })
  })

  // 日付順にソート
  allTransactions.sort((a, b) => {
    const dateA = new Date(a.transactionDate).getTime()
    const dateB = new Date(b.transactionDate).getTime()
    if (dateA !== dateB) return dateA - dateB
    // 同じ日付の場合は繰越行を先に
    if ((a as any)._isCarryOver) return -1
    if ((b as any)._isCarryOver) return 1
    return a.id - b.id
  })

  // 残高を計算しながら整形
  let runningBalance = 0
  const transactions = allTransactions.map((t) => {
    const isCarryOver = (t as any)._isCarryOver
    const previousBalance = (t as any)._previousBalance ?? 0

    if (isCarryOver) {
      runningBalance = previousBalance
      return {
        category: unit.name,
        userName: t.resident.name,
        date: "",
        label: "前月より繰越",
        payee: "",
        income: previousBalance > 0 ? previousBalance : 0,
        expense: previousBalance < 0 ? Math.abs(previousBalance) : 0,
        balance: previousBalance,
      }
    }

    // 通常の取引
    const isIncome =
      t.transactionType === "in" || t.transactionType === "correct_in"
    const amount = t.amount

    if (isIncome) {
      runningBalance += amount
    } else {
      runningBalance -= amount
    }

    return {
      category: unit.name,
      userName: t.resident.name,
      date: formatDate(t.transactionDate),
      label: t.description || "",
      payee: t.payee || "",
      income: isIncome ? amount : 0,
      expense: isIncome ? 0 : amount,
      balance: runningBalance,
    }
  })

  // 合計を計算
  const totalIncome = transactions.reduce((sum, t) => sum + t.income, 0)
  const totalExpense = transactions.reduce((sum, t) => sum + t.expense, 0)
  const currentBalance = runningBalance

  // 年月を日本語形式に変換（例: "4月"）
  const monthStr = `${month}月`

  return {
    statement: {
      month: monthStr,
    },
    unit: {
      name: unit.name,
    },
    transactions,
    summary: {
      totalIncome,
      totalExpense,
      currentBalance,
    },
    facility: {
      name: facility.name,
      position: facility.positionName || "",
      staffName: facility.positionHolderName || "",
    },
  }
}

export interface ResidentPrintData {
  statement: {
    month: string
  }
  resident: {
    name: string
  }
  transactions: Array<{
    date: string
    type: string
    label: string
    payee: string
    income: number
    expense: number
    balance: number
  }>
  summary: {
    totalIncome: number
    totalExpense: number
    currentBalance: number
  }
  facility: {
    name: string
    position: string
    staffName: string
  }
}

interface ResidentWithRelations extends Resident {
  transactions: Transaction[]
  facility: Facility
  unit: Unit
}

/**
 * Prismaで取得した利用者データを印刷用JSONに整形する
 */
export function transformToResidentPrintData(
  resident: ResidentWithRelations,
  year: number,
  month: number
): ResidentPrintData {
  // 前月末日を計算（繰越行用）
  const previousMonthEnd = new Date(year, month - 1, 0, 23, 59, 59, 999)

  // 指定年月の取引を取得
  const monthTransactions = filterTransactionsByMonth(
    resident.transactions,
    year,
    month
  )

  // 前月末までの残高を計算（繰越行用）
  const previousBalance = resident.transactions
    .filter((t) => new Date(t.transactionDate) <= previousMonthEnd)
    .reduce((balance, t) => {
      if (t.transactionType === "in" || t.transactionType === "correct_in") {
        return balance + t.amount
      } else if (t.transactionType === "out" || t.transactionType === "correct_out") {
        return balance - t.amount
      }
      return balance
    }, 0)

  // 取引リストを作成（繰越行 + 当月取引）
  const allTransactions: Array<Transaction & { _isCarryOver?: boolean; _previousBalance?: number }> = []

  // 繰越行を追加（前月末残高が0でない場合、または当月に取引がある場合）
  if (previousBalance !== 0 || monthTransactions.length > 0) {
    allTransactions.push({
      id: -1,
      residentId: resident.id,
      transactionDate: previousMonthEnd,
      transactionType: "in",
      amount: 0,
      description: null,
      payee: null,
      reason: null,
      createdAt: previousMonthEnd,
      _previousBalance: previousBalance,
      _isCarryOver: true,
    } as any)
  }

  // 当月の取引を追加
  allTransactions.push(...monthTransactions)

  // 日付順にソート
  allTransactions.sort((a, b) => {
    const dateA = new Date(a.transactionDate).getTime()
    const dateB = new Date(b.transactionDate).getTime()
    if (dateA !== dateB) return dateA - dateB
    // 同じ日付の場合は繰越行を先に
    if ((a as any)._isCarryOver) return -1
    if ((b as any)._isCarryOver) return 1
    return a.id - b.id
  })

  // 残高を計算しながら整形
  let runningBalance = 0
  const transactions = allTransactions.map((t) => {
    const isCarryOver = (t as any)._isCarryOver
    const previousBalance = (t as any)._previousBalance ?? 0

    if (isCarryOver) {
      runningBalance = previousBalance
      return {
        date: "",
        type: "前月より繰越",
        label: "前月より繰越",
        payee: "",
        income: previousBalance > 0 ? previousBalance : 0,
        expense: previousBalance < 0 ? Math.abs(previousBalance) : 0,
        balance: previousBalance,
      }
    }

    // 通常の取引
    const isIncome =
      t.transactionType === "in" || t.transactionType === "correct_in"
    const amount = t.amount

    if (isIncome) {
      runningBalance += amount
    } else {
      runningBalance -= amount
    }

    // 区分ラベルを取得
    let typeLabel = ""
    switch (t.transactionType) {
      case "in":
        typeLabel = "入金"
        break
      case "out":
        typeLabel = "出金"
        break
      case "correct_in":
        typeLabel = "訂正入金"
        break
      case "correct_out":
        typeLabel = "訂正出金"
        break
      default:
        typeLabel = t.transactionType
    }

    return {
      date: formatDate(t.transactionDate),
      type: typeLabel,
      label: t.description || "",
      payee: t.payee || "",
      income: isIncome ? amount : 0,
      expense: isIncome ? 0 : amount,
      balance: runningBalance,
    }
  })

  // 合計を計算
  const totalIncome = transactions.reduce((sum, t) => sum + t.income, 0)
  const totalExpense = transactions.reduce((sum, t) => sum + t.expense, 0)
  const currentBalance = runningBalance

  // 年月を日本語形式に変換（例: "4月"）
  const monthStr = `${month}月`

  return {
    statement: {
      month: monthStr,
    },
    resident: {
      name: resident.name,
    },
    transactions,
    summary: {
      totalIncome,
      totalExpense,
      currentBalance,
    },
    facility: {
      name: resident.facility.name,
      position: resident.facility.positionName || "",
      staffName: resident.facility.positionHolderName || "",
    },
  }
}
