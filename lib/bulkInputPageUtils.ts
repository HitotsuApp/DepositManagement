/** まとめて入力系ページ共通：入出金の対象日範囲（当日基準の10日ルール） */

import {
  BUSINESS_TIME_ZONE,
  formatJapanCalendarDate,
  formatNumericCalendarDate,
  getZonedCalendarParts,
  lastDayOfGregorianMonth,
} from '@/lib/calendarDate'

export function getInOutDateRange(): { min: string; max: string } {
  const now = new Date()
  const { year: cy, month: cm, day: cd } = getZonedCalendarParts(now, BUSINESS_TIME_ZONE)

  if (cd <= 10) {
    const prevY = cm === 1 ? cy - 1 : cy
    const prevM = cm === 1 ? 12 : cm - 1
    const min = formatNumericCalendarDate(prevY, prevM, 1)
    const lastDay = lastDayOfGregorianMonth(cy, cm)
    const max = formatNumericCalendarDate(cy, cm, lastDay)
    return { min, max }
  }

  const min = formatNumericCalendarDate(cy, cm, 1)
  const max = formatNumericCalendarDate(cy, cm, cd)
  return { min, max }
}

/**
 * 明細行の「訂正」（in/out → correct_in/out）を UI で出してよいか。
 * - 閲覧中の年月がカレンダー上の当月、または
 * - 当日が10日以内で閲覧中の年月が直前の先月（前月締め後のグレース期間用）。
 */
export function isRowCorrectMarkAllowedForViewMonth(
  viewYear: number,
  viewMonth: number,
  now: Date = new Date()
): boolean {
  const { year: cy, month: cm, day: cd } = getZonedCalendarParts(now, BUSINESS_TIME_ZONE)
  if (viewYear === cy && viewMonth === cm) return true
  if (cd > 10) return false
  const prevY = cm === 1 ? cy - 1 : cy
  const prevM = cm === 1 ? 12 : cm - 1
  return viewYear === prevY && viewMonth === prevM
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
  const today = formatJapanCalendarDate(new Date())
  if (today < range.min) return range.min
  if (today > range.max) return range.max
  return today
}

/** 過去月画面での過去訂正行の初期日付（bulk-input と同ロジック） */
export function defaultPastCorrectDateForFacilityMonth(
  facilityYear: number,
  facilityMonth: number
): string {
  const todayStr = formatJapanCalendarDate(new Date())
  const lastDay = lastDayOfGregorianMonth(facilityYear, facilityMonth)
  const lastStr = formatNumericCalendarDate(facilityYear, facilityMonth, lastDay)
  return todayStr > lastStr ? lastStr : todayStr
}
