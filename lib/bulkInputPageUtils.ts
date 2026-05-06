/** まとめて入力系ページ共通：入出金の対象日範囲（当日基準の10日ルール） */

export function getInOutDateRange(): { min: string; max: string } {
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth() + 1
  const currentDay = currentDate.getDate()

  if (currentDay <= 10) {
    const previousMonthFirstDay = new Date(currentYear, currentMonth - 2, 1)
    const currentMonthLastDay = new Date(currentYear, currentMonth, 0)
    return {
      min: previousMonthFirstDay.toISOString().split('T')[0],
      max: currentMonthLastDay.toISOString().split('T')[0],
    }
  }

  const currentMonthFirstDay = new Date(currentYear, currentMonth - 1, 1)
  return {
    min: currentMonthFirstDay.toISOString().split('T')[0],
    max: currentDate.toISOString().split('T')[0],
  }
}

/** 取引区分の表示ラベル */
export function getTransactionTypeLabel(type: string): string {
  switch (type) {
    case 'in':
      return '入金'
    case 'out':
      return '出金'
    case 'correct_in':
      return '訂正入金'
    case 'correct_out':
      return '訂正出金'
    case 'past_correct_in':
      return '過去訂正入金'
    case 'past_correct_out':
      return '過去訂正出金'
    default:
      return type
  }
}

/** 当年月表示の新規入出金行の初期日付（範囲内にクリップ） */
export function defaultInOutDateForNewRow(): string {
  const range = getInOutDateRange()
  const today = new Date().toISOString().split('T')[0]
  if (today < range.min) return range.min
  if (today > range.max) return range.max
  return today
}

/** 過去月画面での過去訂正行の初期日付（bulk-input と同ロジック） */
export function defaultPastCorrectDateForFacilityMonth(
  facilityYear: number,
  facilityMonth: number
): string {
  const today = new Date()
  const lastDayOfMonth = new Date(facilityYear, facilityMonth, 0)
  const todayStr = today.toISOString().split('T')[0]
  const lastStr = lastDayOfMonth.toISOString().split('T')[0]
  return todayStr > lastStr ? lastStr : todayStr
}
