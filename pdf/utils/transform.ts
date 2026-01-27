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
  unitSummaries: Array<{
    unitId: number
    unitName: string
    totalIncome: number
    totalExpense: number
    netAmount: number
    residents: Array<{
      residentId: number
      residentName: string
      totalIncome: number
      totalExpense: number
      netAmount: number
    }>
  }>
  grandTotal: {
    totalIncome: number
    totalExpense: number
    netAmount: number
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
  unitId: number | null,
  year: number,
  month: number
): PrintData {
  // ユニットを取得（unitIdが指定されている場合）
  const unit = unitId ? facility.units.find((u) => u.id === unitId) : null
  if (unitId && !unit) {
    throw new Error(`Unit ${unitId} not found`)
  }

  // 利用者を取得（unitIdが指定されている場合はそのユニットの利用者のみ、nullの場合は全利用者）
  const targetResidents = unitId
    ? facility.residents.filter((r) => r.unitId === unitId)
    : facility.residents

  // 前月末日を計算（繰越行用）
  const previousMonthEnd = new Date(year, month - 1, 0, 23, 59, 59, 999)

  // 指定年月の取引を取得
  const allTransactions: Array<Transaction & { resident: Resident & { unit: Unit } }> = []
  
  targetResidents.forEach((resident) => {
    const monthTransactions = filterTransactionsByMonth(
      resident.transactions,
      year,
      month
    )
    
    // 前月末までの残高を計算（繰越行用）
    // 訂正区分は計算から除外
    // 取引を日付順にソートしてから計算（同じ日付の場合はID順）
    const previousTransactions = resident.transactions
      .filter((t) => new Date(t.transactionDate) <= previousMonthEnd)
      .sort((a, b) => {
        const dateA = new Date(a.transactionDate).getTime()
        const dateB = new Date(b.transactionDate).getTime()
        if (dateA !== dateB) return dateA - dateB
        return a.id - b.id
      })
    
    const previousBalance = previousTransactions.reduce((balance, t) => {
      if (t.transactionType === "in") {
        return balance + t.amount
      } else if (t.transactionType === "out") {
        return balance - t.amount
      } else if (t.transactionType === "past_correct_in") {
        // 過去訂正入金は計算に含める
        return balance + t.amount
      } else if (t.transactionType === "past_correct_out") {
        // 過去訂正出金は計算に含める
        return balance - t.amount
      }
      // correct_in と correct_out は計算しない（打ち消し処理）
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
          unit: unit || resident.unit || null,
        },
        _previousBalance: previousBalance,
        _isCarryOver: true,
      } as any)
    }

    // 当月の取引を追加
    // correct_in/correct_out（訂正ボタンで変更されたもの）は除外
    // past_correct_in/past_correct_out（過去訂正入力フォームから作成されたもの）は含める
    monthTransactions
      .filter((t) => {
        // correct_in と correct_out は除外（打ち消し処理）
        return t.transactionType !== "correct_in" && t.transactionType !== "correct_out"
      })
      .forEach((t) => {
        allTransactions.push({
          ...t,
        resident: {
          ...resident,
          unit: unit || resident.unit || null,
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

  // 各利用者の最終残高を計算するためのマップ
  const residentFinalBalances = new Map<number, number>()

  // 残高を計算しながら整形
  let runningBalance = 0
  const transactions = allTransactions.map((t) => {
    const isCarryOver = (t as any)._isCarryOver
    const previousBalance = (t as any)._previousBalance ?? 0

    if (isCarryOver) {
      runningBalance = previousBalance
      // 繰越行の時点での残高を記録（取引がない利用者の場合も考慮）
      residentFinalBalances.set(t.residentId, previousBalance)
      // unitIdが指定されている場合は常にそのユニット名を使用
      // 指定されていない場合は各利用者のユニット名を使用
      const categoryName = unitId && unit
        ? unit.name
        : (t.resident.unit?.name || facility.name)
      return {
        category: categoryName,
        userName: t.resident.name,
        date: "",
        label: "前月より繰越",
        payee: "",
        income: previousBalance > 0 ? previousBalance : 0,
        expense: previousBalance < 0 ? Math.abs(previousBalance) : 0,
        balance: previousBalance,
      }
    }

    // 通常の取引（訂正区分は既にフィルタリングされている）
    const isIncome = t.transactionType === "in" || t.transactionType === "past_correct_in"
    const isExpense = t.transactionType === "out" || t.transactionType === "past_correct_out"
    const amount = t.amount

    if (isIncome) {
      runningBalance += amount
    } else if (isExpense) {
      runningBalance -= amount
    }
    // その他の取引タイプは処理しない（念のため）

    // 各利用者の最終残高を記録
    residentFinalBalances.set(t.residentId, runningBalance)

    // unitIdが指定されている場合は常にそのユニット名を使用
    // 指定されていない場合は各利用者のユニット名を使用
    const categoryName = unitId && unit
      ? unit.name
      : (t.resident.unit?.name || facility.name)
    
    return {
      category: categoryName,
      userName: t.resident.name,
      date: formatDate(t.transactionDate),
      label: t.description || "",
      payee: t.payee || "",
      income: isIncome ? amount : 0,
      expense: isExpense ? amount : 0,
      balance: runningBalance,
    }
  })

  // 合計を計算
  const totalIncome = transactions.reduce((sum, t) => sum + t.income, 0)
  const totalExpense = transactions.reduce((sum, t) => sum + t.expense, 0)
  // 各利用者の最終残高の合計を計算
  const currentBalance = Array.from(residentFinalBalances.values()).reduce((sum, balance) => sum + balance, 0)

  // ユニット別・利用者別の当月合計を計算（繰越行は含めない）
  const unitSummaries = facility.units.map((unit) => {
    const unitResidents = facility.residents.filter((r) => r.unitId === unit.id)
    
    const unitResidentSummaries = unitResidents.map((resident) => {
      // 当月の取引のみを取得（繰越行は含めない）
      const monthTransactions = filterTransactionsByMonth(
        resident.transactions,
        year,
        month
      ).filter((t) => {
        // correct_in と correct_out は除外（打ち消し処理）
        return t.transactionType !== "correct_in" && t.transactionType !== "correct_out"
      })

      // 当月の入金・出金合計を計算
      const residentIncome = monthTransactions.reduce((sum, t) => {
        if (t.transactionType === "in" || t.transactionType === "past_correct_in") {
          return sum + t.amount
        }
        return sum
      }, 0)

      const residentExpense = monthTransactions.reduce((sum, t) => {
        if (t.transactionType === "out" || t.transactionType === "past_correct_out") {
          return sum + t.amount
        }
        return sum
      }, 0)

      return {
        residentId: resident.id,
        residentName: resident.name,
        totalIncome: residentIncome,
        totalExpense: residentExpense,
        netAmount: residentIncome - residentExpense,
      }
    })

    // ユニット全体の合計
    const unitTotalIncome = unitResidentSummaries.reduce((sum, r) => sum + r.totalIncome, 0)
    const unitTotalExpense = unitResidentSummaries.reduce((sum, r) => sum + r.totalExpense, 0)

    return {
      unitId: unit.id,
      unitName: unit.name,
      totalIncome: unitTotalIncome,
      totalExpense: unitTotalExpense,
      netAmount: unitTotalIncome - unitTotalExpense,
      residents: unitResidentSummaries,
    }
  })

  // 預り金総合計（全ユニットの合計）
  const grandTotalIncome = unitSummaries.reduce((sum, u) => sum + u.totalIncome, 0)
  const grandTotalExpense = unitSummaries.reduce((sum, u) => sum + u.totalExpense, 0)

  // 年月を日本語形式に変換（例: "4月"）
  const monthStr = `${month}月`

  return {
    statement: {
      month: monthStr,
    },
    unit: {
      name: unit ? unit.name : facility.name,
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
    unitSummaries,
    grandTotal: {
      totalIncome: grandTotalIncome,
      totalExpense: grandTotalExpense,
      netAmount: grandTotalIncome - grandTotalExpense,
    },
  }
}

export interface ResidentPrintData {
  statement: {
    month: string
  }
  unit: {
    name: string
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
  // 訂正区分は計算から除外
  // 取引を日付順にソートしてから計算（同じ日付の場合はID順）
  const previousTransactions = resident.transactions
    .filter((t) => new Date(t.transactionDate) <= previousMonthEnd)
    .sort((a, b) => {
      const dateA = new Date(a.transactionDate).getTime()
      const dateB = new Date(b.transactionDate).getTime()
      if (dateA !== dateB) return dateA - dateB
      return a.id - b.id
    })
  
  const previousBalance = previousTransactions.reduce((balance, t) => {
    if (t.transactionType === "in") {
      return balance + t.amount
    } else if (t.transactionType === "out") {
      return balance - t.amount
    } else if (t.transactionType === "past_correct_in") {
      // 過去訂正入金は計算に含める
      return balance + t.amount
    } else if (t.transactionType === "past_correct_out") {
      // 過去訂正出金は計算に含める
      return balance - t.amount
    }
    // correct_in と correct_out は計算しない（打ち消し処理）
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
  // correct_in/correct_out（訂正ボタンで変更されたもの）は除外
  // past_correct_in/past_correct_out（過去訂正入力フォームから作成されたもの）は含める
  allTransactions.push(
    ...monthTransactions.filter((t) => {
      // correct_in と correct_out は除外（打ち消し処理）
      return t.transactionType !== "correct_in" && t.transactionType !== "correct_out"
    })
  )

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

    // 通常の取引（訂正区分は既にフィルタリングされている）
    const isIncome = t.transactionType === "in" || t.transactionType === "past_correct_in"
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
      case "past_correct_in":
        typeLabel = "過去訂正入金"
        break
      case "past_correct_out":
        typeLabel = "過去訂正出金"
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
    unit: {
      name: resident.unit.name,
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
