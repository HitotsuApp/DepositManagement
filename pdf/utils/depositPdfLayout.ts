/**
 * 出納帳・利用者明細など、TableBlock ベースの PDF 向けページ分割。
 *
 * ## 方針（重み付けの目的関数は使わない）
 * - **制約**: 各チャンクの明細の合計高さが、そのページタイプの予算（`bFirst` / `bMid` / `bLast`）以下。最終チャンクは合計行・預り金総合計の予約を含む `bLast` 以下。
 * - **縦の余白（概算）**: 同一ページ数 K のとき、各ページで「データ領域の予算 − 載せた明細の見積高さ」を足すと、**ページ数 K が小さいほど予算の和も小さく**、余白の合計を抑えやすい。そのため **ページ数を減らす前方向貪欲**（先頭ページを `bFirst` まで詰め、続きを `bMid` で詰め、末尾だけ `bLast` に収める）を使う。厳密な「空白面積の最小」の全体最適化は行わない。
 * - **本部報告**（`DEPOSIT_REPORT_COMPACT_CHUNK_OPTS`）: 2ページ目以降に列見出しが無い前提で `continuationTableHeaderPt=0`（`TableBlock` の `showColumnHeader` と整合）。
 *
 * 利用者明細は従来どおり 1 行あたり固定高さ。出納帳は摘要の折り返し行数に応じた可変行高。
 * 利用者名・支払先など他列の折り返しは未モデル化のため、極端に長い場合ははみ出し得る。
 */

import { countWrappedLines } from "./wrapText"

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
export const COMPACT_DATA_ROW_PT = 16

/** TableBlock.dataRowPaddingVertical と揃える */
export const COMPACT_DATA_ROW_PADDING_VERTICAL = 1

/**
 * 摘要列の `wrapColumnUnits` と同じ表示幅（半角1・全角2）。
 * TableBlock・行高見積り・PDF 分割で共通利用する。
 */
export const DEPOSIT_LABEL_WRAP_DISPLAY_UNITS = 29

/** 摘要が2行目以降に折り返すとき、1行ぶん追加で確保する高さ(pt)の目安 */
const DEPOSIT_LABEL_EXTRA_LINE_HEIGHT_PT = 10

/** TableBlock と同じ `wrapTextByDisplayWidth` 規則で、`label` 列の論理行数から明細行の高さを見積る */
export function estimateDepositDetailRowHeightPt(
  label: string,
  wrapUnits: number = DEPOSIT_LABEL_WRAP_DISPLAY_UNITS
): number {
  const lines = Math.max(1, countWrappedLines(label, wrapUnits))
  return COMPACT_DATA_ROW_PT + (lines - 1) * DEPOSIT_LABEL_EXTRA_LINE_HEIGHT_PT
}

/** 本部報告（deposit-statement）1ページ目：タイトル〜施設名（コンパクトテンプレ向け概算） */
export const DEPOSIT_REPORT_COMPACT_FIRST_PAGE_HEADER_PT = 38

/** テーブル内「合計」行直下の SummaryBlock（預り金総合計・dense の margin に合わせた概算） */
export const DEPOSIT_REPORT_COMPACT_GRAND_TOTAL_PT = 20

export type DepositStatementChunkOpts = {
  dataRowPt?: number
  tableMarginTopPt?: number
  tableHeaderRowPt?: number
  /**
   * 2ページ目以降のテーブルで列見出し行を出さない場合は 0。
   * 未指定時は tableHeaderRowPt と同じ（すべてのページに列見出しとみなす）。
   */
  continuationTableHeaderPt?: number
  tableSummaryRowPt?: number
  firstPageHeaderPt?: number
  lastPageBelowTablePt?: number
}

/** 本部報告PDF：家族向けと同じテーブル詰め＋上記ヘッダー／預り金総合計の予約 */
export const DEPOSIT_REPORT_COMPACT_CHUNK_OPTS: DepositStatementChunkOpts = {
  dataRowPt: COMPACT_DATA_ROW_PT,
  tableMarginTopPt: FAMILY_COMPACT_TABLE_MARGIN_TOP_PT,
  tableHeaderRowPt: FAMILY_COMPACT_TABLE_HEADER_ROW_PT,
  continuationTableHeaderPt: 0,
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

/** 利用者明細向けの固定行高分割（貪欲）。重み付けなし。 */
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
    /** 2ページ目以降で列見出しなしのとき 0。省略時は tableHeaderRowPt と同じ */
    continuationTableHeaderPt?: number
  }
): T[][] {
  const { tableMarginTopPt: tm, tableHeaderRowPt: th0 } = budget
  const thCont = budget.continuationTableHeaderPt ?? th0
  const sr = budget.tableSummaryRowPt ?? TABLE_SUMMARY_ROW_PT
  const dr = budget.dataRowPt ?? DEFAULT_DATA_ROW_PT
  const overheadFirst = budget.firstPageExtraPt + tm + th0
  const overheadMid = tm + thCont
  const overheadLast = tm + thCont + sr + budget.lastPageBelowTablePt

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
        th0 -
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

function sumHeights(heights: number[]): number {
  return heights.reduce((a, b) => a + b, 0)
}

/**
 * 複数ページ時の明細分割（ページ数最小）。重み付けなし。
 * セグメント [i,j) の cap: 先頭ページ bFirst、途中 bMid、最終チャンク bLast。
 * 単票で収まるケースは呼び出し側で除外済み。(0,n) は取らない。
 *
 * 同じ最少ページ数の解が複数ある場合、各 i で **j を大きく**（現セグメントを長く）する。
 * これにより **1ページ目を可能な限り詰める**（先頭の余白だらけを避ける）タイブレークになる。
 */
function chunkDepositMinPageDp<T>(
  rows: T[],
  heights: number[],
  bFirst: number,
  bMid: number,
  bLast: number
): T[][] | null {
  const n = rows.length
  if (n === 0) return []
  const prefix: number[] = new Array(n + 1).fill(0)
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i] + heights[i]
  }
  const rangeSum = (i: number, j: number) => prefix[j] - prefix[i]

  const INF = 1_000_000_000
  const dp = new Array<number>(n + 1).fill(INF)
  const jump = new Array<number>(n + 1).fill(-1)
  dp[n] = 0

  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j <= n; j++) {
      if (i === 0 && j === n) continue
      const seg = rangeSum(i, j)
      let cap: number
      if (j === n) {
        cap = bLast
      } else if (i === 0) {
        cap = bFirst
      } else {
        cap = bMid
      }
      if (seg > cap || dp[j] >= INF) {
        continue
      }
      const nextCost = dp[j] + 1
      if (
        nextCost < dp[i] ||
        (nextCost === dp[i] && j > jump[i])
      ) {
        dp[i] = nextCost
        jump[i] = j
      }
    }
  }

  if (dp[0] >= INF) {
    return null
  }

  const chunks: T[][] = []
  let i = 0
  while (i < n) {
    const j = jump[i]
    if (j < 0 || j <= i) {
      return null
    }
    chunks.push(rows.slice(i, j))
    i = j
  }
  return chunks
}

/**
 * 出納帳：各行の `heights` に基づく分割。
 * 複数ページ時は「ページ数最小」の DP（`chunkDepositMinPageDp`）。重み付けは使わない。
 */
export function chunkDepositStatementRowsWithHeights<T>(
  rows: T[],
  heights: number[],
  marginTop: number,
  marginBottom: number,
  pageHeightPt: number,
  opts?: DepositStatementChunkOpts
): T[][] {
  const usable = pageHeightPt - marginTop - marginBottom
  if (usable <= 0) return rows.length === 0 ? [[]] : [[...rows]]

  const tm = opts?.tableMarginTopPt ?? DEFAULT_TABLE_MARGIN_TOP_PT
  const th0 = opts?.tableHeaderRowPt ?? FAMILY_COMPACT_TABLE_HEADER_ROW_PT
  const thCont =
    opts?.continuationTableHeaderPt !== undefined
      ? opts.continuationTableHeaderPt
      : th0
  const sr = opts?.tableSummaryRowPt ?? TABLE_SUMMARY_ROW_PT
  const firstExtra = opts?.firstPageHeaderPt ?? DEPOSIT_FIRST_PAGE_HEADER_PT
  const lastBelow =
    opts?.lastPageBelowTablePt ?? DEPOSIT_GRAND_TOTAL_BLOCK_PT

  const fallback = () =>
    chunkByVerticalBudget(rows, usable, {
      firstPageExtraPt: firstExtra,
      lastPageBelowTablePt: lastBelow,
      tableMarginTopPt: tm,
      tableHeaderRowPt: th0,
      continuationTableHeaderPt: opts?.continuationTableHeaderPt,
      tableSummaryRowPt: sr,
      dataRowPt: opts?.dataRowPt ?? DEFAULT_DATA_ROW_PT,
    })

  const n = rows.length
  if (n === 0) return [[]]
  if (heights.length !== n) return fallback()

  const totalData = sumHeights(heights)
  const singlePageOverhead =
    firstExtra + tm + th0 + sr + lastBelow
  if (totalData + singlePageOverhead <= usable) {
    return [rows.slice()]
  }

  const overheadFirst = firstExtra + tm + th0
  const bFirst = usable - overheadFirst
  const bMid = usable - tm - thCont
  const bLast = usable - tm - thCont - sr - lastBelow

  if (bFirst <= 0 || bMid <= 0 || bLast <= 0) return fallback()

  const dpChunks = chunkDepositMinPageDp(rows, heights, bFirst, bMid, bLast)
  if (dpChunks != null) {
    return dpChunks
  }

  return fallback()
}

/**
 * 出納帳の明細をページへ分割。`estimateDepositDetailRowHeightPt` で行高 → `chunkDepositStatementRowsWithHeights`（ページ数最小 DP）。
 */
export function chunkDepositStatementRows<T extends { label?: unknown }>(
  rows: T[],
  marginTop: number,
  marginBottom: number,
  pageHeightPt: number,
  opts?: DepositStatementChunkOpts
): T[][] {
  const heights = rows.map((r) =>
    estimateDepositDetailRowHeightPt(
      typeof r.label === "string" ? r.label : ""
    )
  )
  return chunkDepositStatementRowsWithHeights(
    rows,
    heights,
    marginTop,
    marginBottom,
    pageHeightPt,
    opts
  )
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
