/**
 * 預り金出納帳Excel取込（deposit_import_spec.md）
 *
 * 取込対象は「ユニット名(A)・利用者名(B)の両方がある明細行」のみ。
 * - 種別(G列): 専用カラムがないため description 先頭に `[種別]` を付与（空・「合計」は付与しない）
 * - 残高(L列): 保存しない。プレビューで data 行の理論残高と突合（Excel の繰越は参照しない）
 * - 繰越行・合計行・A/B 欠け行: パース上は区別するが DB に登録しない（本システムの残高に任せる）
 */

import * as XLSX from 'xlsx'

/** 列 A–L のインデックス（0始まり） */
export const COL = {
  UNIT: 0,
  USER: 1,
  MONTH: 2,
  DAY: 4,
  CATEGORY: 6,
  DESCRIPTION: 7,
  PAYEE: 8,
  DEPOSIT: 9,
  WITHDRAWAL: 10,
  BALANCE: 11,
} as const

export type ParsedLedgerRowKind = 'carry' | 'data' | 'total' | 'header' | 'empty'

export interface ParsedLedgerRow {
  sheetRow1Based: number
  kind: ParsedLedgerRowKind
  unitName: string
  userName: string
  month: number | null
  day: number | null
  category: string | null
  description: string | null
  payee: string | null
  deposit: number
  withdrawal: number
  excelBalance: number | null
}

export interface SheetTotalSummary {
  deposit: number
  withdrawal: number
  balance: number
  sheetRow1Based: number
}

export interface ParsedSheetResult {
  rows: ParsedLedgerRow[]
  /** G列に「合計」を含む最終行（行ズレ対策で末尾から探索） */
  totalRow: SheetTotalSummary | null
}

const CARRY_RE =
  /前月より繰越|前年度より繰越|先月からの繰越|先月より繰越|先月から繰越|前月からの繰越/

export function normalizeJapaneseLabel(s: string): string {
  return s
    .replace(/\u3000/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return String(v).trim()
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

function hasTotalMarker(category: string, description: string): boolean {
  return category.includes('合計') || description.includes('合計')
}

/** ユニット・氏名・種別・摘要がすべて空で、入出金のいずれかがある行＝金額のみの締め（合計）行 */
function isAmountOnlyFooterRow(
  unitName: string,
  userName: string,
  category: string,
  description: string,
  deposit: number,
  withdrawal: number
): boolean {
  if (unitName || userName || category || description) return false
  return deposit !== 0 || withdrawal !== 0
}

export function isCarryDescription(description: string): boolean {
  return CARRY_RE.test(description)
}

/**
 * シート名を「N月分」で検索（全半角・末尾スペース差を吸収）
 */
export function pickLedgerSheetName(
  workbook: XLSX.WorkBook,
  sheetMonth: number
): string | null {
  const prefix = `${sheetMonth}月分`
  const sheets = workbook.SheetNames
  const exact = sheets.find((n) => normalizeJapaneseLabel(n).startsWith(prefix))
  if (exact) return exact
  const loose = sheets.find((n) => normalizeJapaneseLabel(n).includes(`${sheetMonth}月分`))
  return loose ?? null
}

export function readWorkbookFromBuffer(buffer: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: 'array', cellDates: true })
}

/**
 * @param baseYear そのシートの日付に使う西暦年（例: 2025年4月分なら 2025）
 * @param sheetMonth シートの月（1–12）。日付欠落明細のフォールバックに使用
 */
export function parseDepositLedgerSheet(
  sheet: XLSX.WorkSheet,
  baseYear: number,
  sheetMonth: number
): ParsedSheetResult {
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  })

  const rows: ParsedLedgerRow[] = []
  let totalRow: SheetTotalSummary | null = null

  for (let i = 0; i < matrix.length; i++) {
    const sheetRow1Based = i + 1
    const line = matrix[i] ?? []
    if (i === 0) {
      rows.push({
        sheetRow1Based,
        kind: 'header',
        unitName: '',
        userName: '',
        month: null,
        day: null,
        category: null,
        description: null,
        payee: null,
        deposit: 0,
        withdrawal: 0,
        excelBalance: null,
      })
      continue
    }

    const unitName = normalizeJapaneseLabel(toStr(line[COL.UNIT]))
    const userName = normalizeJapaneseLabel(toStr(line[COL.USER]))
    const category = toStr(line[COL.CATEGORY])
    const description = toStr(line[COL.DESCRIPTION])
    const payeeRaw = toStr(line[COL.PAYEE])
    const deposit = toNum(line[COL.DEPOSIT])
    const withdrawal = toNum(line[COL.WITHDRAWAL])
    const balRaw = line[COL.BALANCE]
    const excelBalance =
      balRaw === null || balRaw === undefined || balRaw === '' ? null : toNum(balRaw)

    if (hasTotalMarker(category, description)) {
      const tr: ParsedLedgerRow = {
        sheetRow1Based,
        kind: 'total',
        unitName,
        userName,
        month: toNum(line[COL.MONTH]) || null,
        day: toNum(line[COL.DAY]) || null,
        category: category || null,
        description: description || null,
        payee: payeeRaw || null,
        deposit,
        withdrawal,
        excelBalance,
      }
      rows.push(tr)
      totalRow = {
        deposit,
        withdrawal,
        balance: excelBalance ?? 0,
        sheetRow1Based,
      }
      continue
    }

    const gEmpty = !category
    const hEmpty = !description
    if (gEmpty && hEmpty && deposit === 0 && withdrawal === 0) {
      rows.push({
        sheetRow1Based,
        kind: 'empty',
        unitName,
        userName,
        month: null,
        day: null,
        category: null,
        description: null,
        payee: null,
        deposit: 0,
        withdrawal: 0,
        excelBalance,
      })
      continue
    }

    if (isCarryDescription(description)) {
      rows.push({
        sheetRow1Based,
        kind: 'carry',
        unitName,
        userName,
        month: sheetMonth,
        day: 1,
        category: category || null,
        description: description || null,
        payee: payeeRaw || null,
        deposit,
        withdrawal,
        excelBalance,
      })
      continue
    }

    if (
      isAmountOnlyFooterRow(unitName, userName, category, description, deposit, withdrawal)
    ) {
      const tr: ParsedLedgerRow = {
        sheetRow1Based,
        kind: 'total',
        unitName,
        userName,
        month: toNum(line[COL.MONTH]) || null,
        day: toNum(line[COL.DAY]) || null,
        category: category || null,
        description: description || null,
        payee: payeeRaw || null,
        deposit,
        withdrawal,
        excelBalance,
      }
      rows.push(tr)
      totalRow = {
        deposit,
        withdrawal,
        balance: excelBalance ?? 0,
        sheetRow1Based,
      }
      continue
    }

    if (!gEmpty || !hEmpty || deposit !== 0 || withdrawal !== 0) {
      const m = toNum(line[COL.MONTH]) || sheetMonth
      const d = toNum(line[COL.DAY])
      rows.push({
        sheetRow1Based,
        kind: 'data',
        unitName,
        userName,
        month: m,
        day: d || null,
        category: category || null,
        description: description || null,
        payee: payeeRaw || null,
        deposit,
        withdrawal,
        excelBalance,
      })
    } else {
      rows.push({
        sheetRow1Based,
        kind: 'empty',
        unitName,
        userName,
        month: null,
        day: null,
        category: null,
        description: null,
        payee: null,
        deposit: 0,
        withdrawal: 0,
        excelBalance,
      })
    }
  }

  return { rows, totalRow }
}

export function buildDescriptionForDb(category: string | null, description: string | null): string {
  const d = (description ?? '').trim()
  const c = (category ?? '').trim()
  if (!c || c.includes('合計')) {
    return d
  }
  if (!d) return `[${c}]`
  return `[${c}] ${d}`
}

export interface TransactionDraft {
  residentKey: string
  unitName: string
  userName: string
  transactionDate: Date
  transactionType: 'in' | 'out'
  amount: number
  description: string | null
  payee: string | null
  sourceSheetRow1Based: number
}

export function rowDateOrThrow(
  baseYear: number,
  month: number | null,
  day: number | null,
  sheetMonthFallback: number,
  sheetRow1Based: number
): Date {
  const m = month ?? sheetMonthFallback
  const dd = day ?? 1
  if (m < 1 || m > 12 || dd < 1 || dd > 31) {
    throw new Error(`行${sheetRow1Based}: 日付が不正です（月=${m} 日=${dd}）`)
  }
  const dt = new Date(baseYear, m - 1, dd, 0, 0, 0, 0)
  if (
    dt.getFullYear() !== baseYear ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== dd
  ) {
    throw new Error(`行${sheetRow1Based}: 存在しない日付です`)
  }
  return dt
}

/**
 * 取引草案（マッチ前）。ユニット・氏名が揃った data 行のみ展開（繰越・合計・A/B 欠けは対象外）
 */
export function expandRowsToTransactionDrafts(
  parsed: ParsedSheetResult,
  baseYear: number,
  sheetMonth: number
): { drafts: TransactionDraft[]; errors: string[] } {
  const drafts: TransactionDraft[] = []
  const errors: string[] = []

  for (const row of parsed.rows) {
    if (
      row.kind === 'header' ||
      row.kind === 'empty' ||
      row.kind === 'total' ||
      row.kind === 'carry'
    ) {
      continue
    }
    if (row.kind !== 'data') continue
    if (!row.unitName || !row.userName) continue

    const residentKey = `${normalizeJapaneseLabel(row.unitName)}|${normalizeJapaneseLabel(row.userName)}`

    try {
      const dt = rowDateOrThrow(
        baseYear,
        row.month,
        row.day,
        sheetMonth,
        row.sheetRow1Based
      )
      const desc = buildDescriptionForDb(row.category, row.description)
      if (row.deposit > 0 && row.withdrawal > 0) {
        drafts.push({
          residentKey,
          unitName: row.unitName,
          userName: row.userName,
          transactionDate: dt,
          transactionType: 'in',
          amount: row.deposit,
          description: desc,
          payee: row.payee?.trim() ? row.payee.trim() : null,
          sourceSheetRow1Based: row.sheetRow1Based,
        })
        drafts.push({
          residentKey,
          unitName: row.unitName,
          userName: row.userName,
          transactionDate: dt,
          transactionType: 'out',
          amount: row.withdrawal,
          description: desc,
          payee: row.payee?.trim() ? row.payee.trim() : null,
          sourceSheetRow1Based: row.sheetRow1Based,
        })
      } else if (row.deposit > 0) {
        drafts.push({
          residentKey,
          unitName: row.unitName,
          userName: row.userName,
          transactionDate: dt,
          transactionType: 'in',
          amount: row.deposit,
          description: desc,
          payee: row.payee?.trim() ? row.payee.trim() : null,
          sourceSheetRow1Based: row.sheetRow1Based,
        })
      } else if (row.withdrawal > 0) {
        drafts.push({
          residentKey,
          unitName: row.unitName,
          userName: row.userName,
          transactionDate: dt,
          transactionType: 'out',
          amount: row.withdrawal,
          description: desc,
          payee: row.payee?.trim() ? row.payee.trim() : null,
          sourceSheetRow1Based: row.sheetRow1Based,
        })
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  return { drafts, errors }
}

/** プレビュー用: 取引草案から入金合計・出金合計 */
export function sumDraftsByType(drafts: TransactionDraft[]): {
  deposit: number
  withdrawal: number
} {
  let deposit = 0
  let withdrawal = 0
  for (const d of drafts) {
    if (d.transactionType === 'in') deposit += d.amount
    else withdrawal += d.amount
  }
  return { deposit, withdrawal }
}

/**
 * data 行のみで理論残高を計算し Excel L 列と比較（Excel の繰越は無視するため先頭行は差が出ることがある）
 */
export function computeBalanceWarnings(parsed: ParsedSheetResult): {
  sheetRow1Based: number
  detail: string
}[] {
  const warnings: { sheetRow1Based: number; detail: string }[] = []
  const byKey = new Map<string, ParsedLedgerRow[]>()

  for (const row of parsed.rows) {
    if (row.kind !== 'data') continue
    if (!row.unitName || !row.userName) continue
    const key = `${normalizeJapaneseLabel(row.unitName)}|${normalizeJapaneseLabel(row.userName)}`
    const list = byKey.get(key) ?? []
    list.push(row)
    byKey.set(key, list)
  }

  for (const [, rows] of byKey) {
    rows.sort((a, b) => a.sheetRow1Based - b.sheetRow1Based)
    let running = 0
    for (const row of rows) {
      running += row.deposit - row.withdrawal
      if (row.excelBalance !== null) {
        const diff = Math.abs(running - row.excelBalance)
        if (diff > 0.005) {
          warnings.push({
            sheetRow1Based: row.sheetRow1Based,
            detail: `利用者 ${row.unitName}/${row.userName}: 計算残高 ${running} と Excel残高 ${row.excelBalance} が一致しません（差 ${diff}）。Excel に繰越・期首残高がある場合は差が出ることがあります`,
          })
        }
      }
    }
  }

  return warnings
}
