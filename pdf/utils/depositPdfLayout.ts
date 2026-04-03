/**
 * A4 縦・出納帳（deposit-statement）用のページ分割。
 * 固定20行ではなく、余白・ヘッダー・合計ブロックの概算高さから行数を算出する。
 *
 * 注意: 摘要の複数行化で行高が伸びると理論上ははみ出し得るため、
 * DATA_ROW_PT はやや大きめに取って安全側に寄せている。
 */

const A4_HEIGHT_PT = 842

/** 1ページ目のタイトル＋施設名ブロック（概算） */
const FIRST_PAGE_HEADER_PT = 82
const TABLE_MARGIN_TOP_PT = 10
const TABLE_HEADER_ROW_PT = 34
/** データ行（9pt + padding + border）。摘要が折り返しで伸びる分の余裕 */
const DATA_ROW_PT = 34
/** テーブル内の合計行 */
const TABLE_SUMMARY_ROW_PT = 40
/** 預り金総合計（SummaryBlock） */
const GRAND_TOTAL_BLOCK_PT = 62

export function chunkDepositStatementRows<T>(rows: T[], marginTop: number, marginBottom: number): T[][] {
  const usable = A4_HEIGHT_PT - marginTop - marginBottom
  if (usable <= 0) return rows.length === 0 ? [[]] : [[...rows]]

  const rowsFirstPage = Math.max(
    1,
    Math.floor(
      (usable - FIRST_PAGE_HEADER_PT - TABLE_MARGIN_TOP_PT - TABLE_HEADER_ROW_PT) / DATA_ROW_PT
    )
  )
  const rowsMiddlePage = Math.max(
    1,
    Math.floor((usable - TABLE_MARGIN_TOP_PT - TABLE_HEADER_ROW_PT) / DATA_ROW_PT)
  )
  const rowsLastPageMulti = Math.max(
    1,
    Math.floor(
      (usable -
        TABLE_MARGIN_TOP_PT -
        TABLE_HEADER_ROW_PT -
        TABLE_SUMMARY_ROW_PT -
        GRAND_TOTAL_BLOCK_PT) /
        DATA_ROW_PT
    )
  )
  const rowsSinglePage = Math.max(
    1,
    Math.floor(
      (usable -
        FIRST_PAGE_HEADER_PT -
        TABLE_MARGIN_TOP_PT -
        TABLE_HEADER_ROW_PT -
        TABLE_SUMMARY_ROW_PT -
        GRAND_TOTAL_BLOCK_PT) /
        DATA_ROW_PT
    )
  )

  const n = rows.length
  if (n === 0) return [[]]

  if (n <= rowsSinglePage) {
    return [rows.slice()]
  }

  const chunks: T[][] = []
  let remaining = n
  const first = Math.max(1, Math.min(rowsFirstPage, n - rowsLastPageMulti))
  chunks.push(rows.slice(0, first))
  remaining -= first

  while (remaining > rowsLastPageMulti) {
    const take = Math.min(remaining, rowsMiddlePage)
    const start = n - remaining
    chunks.push(rows.slice(start, start + take))
    remaining -= take
  }

  if (remaining > 0) {
    const start = n - remaining
    chunks.push(rows.slice(start))
  }

  return chunks
}
