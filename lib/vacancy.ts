/** 所属一覧ボード（whiteboard）と同一の空床判定ロジック */

export function isVirtualEmptyBed(name: string): boolean {
  const trimmed = name.trim()
  return trimmed === '空床' || /^\d+$/.test(trimmed)
}

export function calcUnitVacancy(capacity: number | null, residentCount: number): number {
  if (capacity == null || capacity <= 0) return 0
  return Math.max(0, capacity - residentCount)
}

/** 全角数字（HP タイトル日付用） */
export function toFullWidthDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) =>
    String.fromCharCode(d.charCodeAt(0) + 0xfee0)
  )
}

/** JST の「６月２３日」形式（更新日ラベル） */
export function formatJapaneseUpdateDateLabel(date: Date): string {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
  })
  const parts = formatter.formatToParts(date)
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? '0')
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? '0')
  return `${toFullWidthDigits(month)}月${toFullWidthDigits(day)}日`
}

export type PublicVacancyFacility = {
  id: number
  name: string
  vacancy: number
}

export type PublicVacancyResponse = {
  updatedAt: string
  updateDateLabel: string
  facilities: PublicVacancyFacility[]
}
