/**
 * 業務上の「暦日」を Asia/Tokyo で扱う（施設別 TZ が必要になったら設定化を検討）。
 */

export const BUSINESS_TIME_ZONE = 'Asia/Tokyo'

const TWO = (n: number) => String(n).padStart(2, '0')

export function getZonedCalendarParts(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
  let year = 0
  let month = 0
  let day = 0
  for (const p of dtf.formatToParts(date)) {
    if (p.type === 'year') year = Number(p.value)
    else if (p.type === 'month') month = Number(p.value)
    else if (p.type === 'day') day = Number(p.value)
  }
  return { year, month, day }
}

/** 指定タイムゾーンでの暦日を YYYY-MM-DD で返す */
export function formatCalendarDateInTimeZone(date: Date, timeZone: string): string {
  const { year, month, day } = getZonedCalendarParts(date, timeZone)
  return `${year}-${TWO(month)}-${TWO(day)}`
}

export function formatJapanCalendarDate(date: Date): string {
  return formatCalendarDateInTimeZone(date, BUSINESS_TIME_ZONE)
}

/** 暦の年月日から YYYY-MM-DD（タイムゾーン無関係のラベル用） */
export function formatNumericCalendarDate(year: number, month: number, day: number): string {
  return `${year}-${TWO(month)}-${TWO(day)}`
}

/** グレゴリオ暦の month は 1–12。ランタイム TZ に依存しない末日計算。 */
export function lastDayOfGregorianMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate()
}
