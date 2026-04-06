/**
 * A4 縦・出納帳（deposit-statement）用のページ分割。
 * 固定20行ではなく、余白・ヘッダー・合計ブロックの概算高さから行数を算出する。
 *
 * 定数は `TableBlock` の実スタイル（fontSize 8, paddingVertical 2, border）に沿った
 * 1行あたりの目安高さを使う。
 * 摘要が複数行になると行高が伸びるため、理論上は最終ページで詰まる可能性は残る。
 */

const A4_HEIGHT_PT = 842

/**
 * 1ページ目のタイトル＋施設名ブロック（概算）
 * TextBlock: 16pt タイトル + marginBottom 10 + 12pt 施設名 等
 */
const FIRST_PAGE_HEADER_PT = 72

const TABLE_MARGIN_TOP_PT = 10

/**
 * テーブル見出し行（headerRow: paddingVertical 4×2 + font 8 + 下罫線）
 */
const TABLE_HEADER_ROW_PT = 26

/**
 * データ行1行の目安高さ（pt）
 * row: paddingVertical 2×2 + fontSize 8 の1行 + 下罫線
 */
const DATA_ROW_PT = 22

/** テーブル内「合計」行（summaryRow: paddingVertical 4×2 + 罫線） */
const TABLE_SUMMARY_ROW_PT = 32

/** 預り金総合計（SummaryBlock: marginTop 10 + ラベル14 + 値16 程度） */
const GRAND_TOTAL_BLOCK_PT = 56

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
