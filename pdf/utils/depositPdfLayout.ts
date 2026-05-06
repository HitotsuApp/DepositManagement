/**
 * 出納帳・利用者明細など、TableBlock ベースの PDF 向けページ分割。
 * 固定行数ではなく余白・ヘッダー・最終ページのfooter等の概算高さから行数を算出する。
 *
 * 摘要が複数行になると行高が伸びるため、理論上は最終ページで詰まる可能性は残る。
 */

export type PaperSize = "A4" | "A5"

/** react-pdf と整合しやすい pt 近似（ISO、整数化） */
const PAGE_DIMS_PT: Record<PaperSize, { short: number; long: number }> = {
  A4: { short: 595, long: 842 },
  A5: { short: 420, long: 595 },
}

/**
 * 本文が縦に積まれる方向のページ高さ（pt）。
 * portrait: 長辺、landscape: 短辺。
 */
export function getPageHeightPt(
  paper: string,
  orientation: "portrait" | "landscape"
): number {
  const key = (paper?.toUpperCase() === "A5" ? "A5" : "A4") as PaperSize
  const d = PAGE_DIMS_PT[key] ?? PAGE_DIMS_PT.A4
  return orientation === "portrait" ? d.long : d.short
}

export const DEFAULT_TABLE_MARGIN_TOP_PT = 10

/**
 * テーブル見出し行（headerRow: paddingVertical 4×2 + font 8 + 下罫線）
 */
export const DEFAULT_TABLE_HEADER_ROW_PT = 26

/** テーブル先頭との隙間をさらに詰めた版（TableBlock と揃える） */
export const FAMILY_COMPACT_TABLE_MARGIN_TOP_PT = 1
/** 列見出し paddingVertical 1 に合わせた概算 */
export const FAMILY_COMPACT_TABLE_HEADER_ROW_PT = 19
/** テーブル「合計」行（summaryPaddingVertical 1 に合わせた概算） */
export const FAMILY_COMPACT_TABLE_SUMMARY_ROW_PT = 23
/** タイトル〜残高行までの概算（family テンプレの margin に合わせて更新） */
export const FAMILY_COMPACT_FIRST_PAGE_HEADER_PT = 42

/**
 * 最終ページで「テーブル合計」行より下に描画される領域の概算高さ（pt）。
 * 対象はお知らせブロック一式＋施設名・管理者名フッター（marginTop を含む）のみ。
 * テーブルの合計行そのものの高さは tableSummaryRowPt で別カウント。
 */
export const FAMILY_COMPACT_BELOW_TABLE_PT = 104

/**
 * データ行1行の目安高さ（pt）
 * TableBlock 明細行: paddingVertical 2（上下） + fontSize 8 1行目安 + 下罫線 の概算。
 */
export const DEFAULT_DATA_ROW_PT = 22

/** 明細行 paddingVertical 1 と揃えた1行あたり概算（単行中心。折り返し多いページは切れ注意） */
export const COMPACT_DATA_ROW_PT = 18

/** TableBlock.dataRowPaddingVertical と揃える */
export const COMPACT_DATA_ROW_PADDING_VERTICAL = 1

/** 本部報告（deposit-statement）1ページ目：タイトル〜施設名（コンパクトテンプレ向け概算） */
export const DEPOSIT_REPORT_COMPACT_FIRST_PAGE_HEADER_PT = 38

/** テーブル内「合計」行直下の SummaryBlock（預り金総合計・dense の margin に合わせた概算） */
export const DEPOSIT_REPORT_COMPACT_GRAND_TOTAL_PT = 40

export type DepositStatementChunkOpts = {
  dataRowPt?: number
  tableMarginTopPt?: number
  tableHeaderRowPt?: number
  tableSummaryRowPt?: number
  firstPageHeaderPt?: number
  lastPageBelowTablePt?: number
}

/** 本部報告PDF：家族向けと同じテーブル詰め＋上記ヘッダー／預り金総合計の予約 */
export const DEPOSIT_REPORT_COMPACT_CHUNK_OPTS: DepositStatementChunkOpts = {
  dataRowPt: COMPACT_DATA_ROW_PT,
  tableMarginTopPt: FAMILY_COMPACT_TABLE_MARGIN_TOP_PT,
  tableHeaderRowPt: FAMILY_COMPACT_TABLE_HEADER_ROW_PT,
  tableSummaryRowPt: FAMILY_COMPACT_TABLE_SUMMARY_ROW_PT,
  firstPageHeaderPt: DEPOSIT_REPORT_COMPACT_FIRST_PAGE_HEADER_PT,
  lastPageBelowTablePt: DEPOSIT_REPORT_COMPACT_GRAND_TOTAL_PT,
}

/** テーブル内「合計」行（summaryRow: paddingVertical 4×2 + 罫線） */
const TABLE_SUMMARY_ROW_PT = 32

/** 1ページ目のタイトル＋施設名ブロック（出納帳 deposit-statement 向け概算） */
const DEPOSIT_FIRST_PAGE_HEADER_PT = 72

/** 預り金総合計（SummaryBlock: marginTop 10 + ラベル14 + 値16 程度） */
const DEPOSIT_GRAND_TOTAL_BLOCK_PT = 56

/** 1ページ目ヘッダー（利用者明細：タイトル16+余白 + 2行12pt 等の概算） */
const RESIDENT_FIRST_PAGE_HEADER_PT = 72

/**
 * 最終ページでテーブル「合計」行の下に載るブロック（お知らせ＋フッター）の概算。
 * 一般の利用者明細: Notice marginTop20・Footer marginTop30 を想定。
 */
const RESIDENT_BELOW_TABLE_PT = 160

function chunkByVerticalBudget<T>(
  rows: T[],
  usable: number,
  budget: {
    firstPageExtraPt: number
    lastPageBelowTablePt: number
    tableMarginTopPt: number
    tableHeaderRowPt: number
    tableSummaryRowPt?: number
    dataRowPt?: number
  }
): T[][] {
  const { tableMarginTopPt: tm, tableHeaderRowPt: th } = budget
  const sr = budget.tableSummaryRowPt ?? TABLE_SUMMARY_ROW_PT
  const dr = budget.dataRowPt ?? DEFAULT_DATA_ROW_PT
  const overheadFirst = budget.firstPageExtraPt + tm + th
  const overheadMid = tm + th
  const overheadLast = tm + th + sr + budget.lastPageBelowTablePt

  const rowsFirstPage = Math.max(
    1,
    Math.floor((usable - overheadFirst) / dr)
  )
  const rowsMiddlePage = Math.max(
    1,
    Math.floor((usable - overheadMid) / dr)
  )
  const rowsLastPageMulti = Math.max(
    1,
    Math.floor((usable - overheadLast) / dr)
  )
  const rowsSinglePage = Math.max(
    1,
    Math.floor(
      (usable -
        budget.firstPageExtraPt -
        tm -
        th -
        sr -
        budget.lastPageBelowTablePt) /
        dr
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

export function chunkDepositStatementRows<T>(
  rows: T[],
  marginTop: number,
  marginBottom: number,
  pageHeightPt: number,
  opts?: DepositStatementChunkOpts
): T[][] {
  const usable = pageHeightPt - marginTop - marginBottom
  if (usable <= 0) return rows.length === 0 ? [[]] : [[...rows]]

  return chunkByVerticalBudget(rows, usable, {
    firstPageExtraPt:
      opts?.firstPageHeaderPt ?? DEPOSIT_FIRST_PAGE_HEADER_PT,
    lastPageBelowTablePt:
      opts?.lastPageBelowTablePt ?? DEPOSIT_GRAND_TOTAL_BLOCK_PT,
    tableMarginTopPt:
      opts?.tableMarginTopPt ?? DEFAULT_TABLE_MARGIN_TOP_PT,
    tableHeaderRowPt:
      opts?.tableHeaderRowPt ?? DEFAULT_TABLE_HEADER_ROW_PT,
    tableSummaryRowPt: opts?.tableSummaryRowPt,
    dataRowPt: opts?.dataRowPt ?? DEFAULT_DATA_ROW_PT,
  })
}

export type ResidentStatementChunkOpts = {
  tableMarginTopPt?: number
  tableHeaderRowPt?: number
  firstPageHeaderPt?: number
  lastPageBelowTablePt?: number
  tableSummaryRowPt?: number
  dataRowPt?: number
}

/** 利用者明細・家族向けA4縦と同一のページ分割（コンパクト行・ヘッダー・フッタ予約） */
export const RESIDENT_COMPACT_CHUNK_OPTS: ResidentStatementChunkOpts = {
  firstPageHeaderPt: FAMILY_COMPACT_FIRST_PAGE_HEADER_PT,
  tableMarginTopPt: FAMILY_COMPACT_TABLE_MARGIN_TOP_PT,
  tableHeaderRowPt: FAMILY_COMPACT_TABLE_HEADER_ROW_PT,
  lastPageBelowTablePt: FAMILY_COMPACT_BELOW_TABLE_PT,
  tableSummaryRowPt: FAMILY_COMPACT_TABLE_SUMMARY_ROW_PT,
  dataRowPt: COMPACT_DATA_ROW_PT,
}

export function chunkResidentStatementRows<T>(
  rows: T[],
  marginTop: number,
  marginBottom: number,
  pageHeightPt: number,
  opts?: ResidentStatementChunkOpts
): T[][] {
  const usable = pageHeightPt - marginTop - marginBottom
  if (usable <= 0) return rows.length === 0 ? [[]] : [[...rows]]

  const tableMarginTopPt =
    opts?.tableMarginTopPt ?? DEFAULT_TABLE_MARGIN_TOP_PT
  const tableHeaderRowPt =
    opts?.tableHeaderRowPt ?? DEFAULT_TABLE_HEADER_ROW_PT
  const firstPageExtraPt =
    opts?.firstPageHeaderPt ?? RESIDENT_FIRST_PAGE_HEADER_PT

  const lastPageBelowTablePt =
    opts?.lastPageBelowTablePt ?? RESIDENT_BELOW_TABLE_PT
  const tableSummaryRowPt = opts?.tableSummaryRowPt ?? TABLE_SUMMARY_ROW_PT
  const dataRowPt = opts?.dataRowPt ?? DEFAULT_DATA_ROW_PT

  return chunkByVerticalBudget(rows, usable, {
    firstPageExtraPt: firstPageExtraPt,
    lastPageBelowTablePt,
    tableMarginTopPt,
    tableHeaderRowPt,
    tableSummaryRowPt,
    dataRowPt,
  })
}
