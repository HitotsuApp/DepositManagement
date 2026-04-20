/**
 * 金額を日本語形式でフォーマットする
 */
export const formatYen = (value?: number | null): string => {
  if (value == null) return ""
  return value.toLocaleString("ja-JP")
}

/**
 * 日付をフォーマットする
 */
export const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return ""
  const d = typeof date === "string" ? new Date(date) : date
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${month}/${day}`
}

/**
 * 年月を日本語形式でフォーマットする（例: "4月"）
 */
export const formatMonth = (year: number, month: number): string => {
  return `${month}月`
}

/**
 * 日付を和暦表記にする（例: 令和7年4月6日）。
 * `Intl` の日本暦（Unicode 拡張 ca-japanese）を用い、環境のロケールデータに従う。
 * 取得できない場合は西暦「YYYY年M月D日」にフォールバックする。
 */
export function formatJapaneseEraYmd(date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("ja-JP-u-ca-japanese", {
      era: "long",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(date)

    let era = ""
    let year = ""
    let month = ""
    let day = ""
    for (const p of parts) {
      if (p.type === "era") era = p.value
      else if (p.type === "year") year = p.value
      else if (p.type === "month") month = p.value
      else if (p.type === "day") day = p.value
    }
    if (era && year && month && day) {
      return `${era}${year}年${month}月${day}日`
    }
  } catch {
    // noop → fallback below
  }
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  return `${y}年${m}月${d}日`
}

/**
 * 年月を和暦表記にする（例: 令和7年4月）。
 * 対象月の1日を基準に `Intl` の日本暦を用いる。
 * 取得できない場合は西暦「YYYY年M月」にフォールバックする。
 */
export function formatJapaneseEraYearMonth(year: number, month: number): string {
  const date = new Date(year, month - 1, 1)
  try {
    const parts = new Intl.DateTimeFormat("ja-JP-u-ca-japanese", {
      era: "long",
      year: "numeric",
      month: "numeric",
    }).formatToParts(date)

    let era = ""
    let y = ""
    let m = ""
    for (const p of parts) {
      if (p.type === "era") era = p.value
      else if (p.type === "year") y = p.value
      else if (p.type === "month") m = p.value
    }
    if (era && y && m) {
      return `${era}${y}年${m}月`
    }
  } catch {
    // noop → fallback below
  }
  return `${year}年${month}月`
}
