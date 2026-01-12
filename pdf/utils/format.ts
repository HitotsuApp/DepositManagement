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
