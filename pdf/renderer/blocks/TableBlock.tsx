import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { formatYen } from "../../utils/format"
import { resolveTemplate } from "../../utils/resolve"
import { wrapTextByDisplayWidth } from "../../utils/wrapText"

interface Column {
  key: string
  label: string
  width: number
  align?: "left" | "center" | "right"
}

const DEFAULT_TABLE_MARGIN_TOP = 10
const DEFAULT_HEADER_PADDING_VERTICAL = 4
const DEFAULT_SUMMARY_PADDING_VERTICAL = 4
const DEFAULT_ROW_PADDING_VERTICAL = 2

interface TableBlockProps {
  table: {
    id: string
    columns: Column[]
    dataSource: string
  }
  data: Record<string, any>
  /** テーブル先頭〜列見出しの上までの余白（省略時は 10） */
  tableMarginTop?: number
  /** 列名行の paddingVertical（省略時は 4） */
  headerPaddingVertical?: number
  /** 合計行の paddingVertical（省略時は 4） */
  summaryPaddingVertical?: number
  /** 明細データ行の paddingVertical（省略時は 2）。1 にすると行高が詰まる */
  dataRowPaddingVertical?: number
  /** false のとき列見出し行を出さない（続きページ用）。true が既定 */
  showColumnHeader?: boolean
  /** 列キーごとに、1行あたりの表示幅（半角=1・全角相当=2）で折り返す */
  wrapColumnUnits?: Partial<Record<string, number>>
  summary?: {
    rows: Array<{
      label: string
      income: string
      expense: string
      balance?: string
    }>
  }
  showSummary?: boolean
}

const TableBlock = ({
  table,
  data,
  tableMarginTop,
  headerPaddingVertical,
  summaryPaddingVertical,
  dataRowPaddingVertical,
  wrapColumnUnits,
  summary,
  showSummary,
  showColumnHeader = true,
}: TableBlockProps) => {
  const rows = data[table.dataSource] ?? []

  // 合計行のデータを準備
  const summaryRow = showSummary && summary ? (() => {
    const summaryData = summary.rows[0]
    const income = resolveTemplate(summaryData.income, data)
    const expense = resolveTemplate(summaryData.expense, data)
    const balance = summaryData.balance ? resolveTemplate(summaryData.balance, data) : null

    // テーブルの列構造に合わせて合計行を作成
    const summaryRowData: Record<string, any> = {}
    table.columns.forEach((col) => {
      if (col.key === "income") {
        summaryRowData[col.key] = Number(income) || 0
      } else if (col.key === "expense") {
        summaryRowData[col.key] = Number(expense) || 0
      } else if (col.key === "balance" && balance !== null) {
        summaryRowData[col.key] = Number(balance) || 0
      } else {
        // 最初の列に「合計（表示）」を表示、それ以外は空
        summaryRowData[col.key] = col.key === table.columns[0].key ? summaryData.label : ""
      }
    })
    return summaryRowData
  })() : null

  const marginTop = tableMarginTop ?? DEFAULT_TABLE_MARGIN_TOP
  const headerPv = headerPaddingVertical ?? DEFAULT_HEADER_PADDING_VERTICAL
  const summaryPv = summaryPaddingVertical ?? DEFAULT_SUMMARY_PADDING_VERTICAL
  const rowPv = dataRowPaddingVertical ?? DEFAULT_ROW_PADDING_VERTICAL

  return (
    <View style={[styles.table, { marginTop }]}>
      {/* 列見出し */}
      {showColumnHeader && (
        <View style={[styles.headerRow, { paddingVertical: headerPv }]}>
          {table.columns.map((col, colIndex) => (
            <View
              key={col.key}
              style={[
                styles.headerCellContainer,
                { width: `${col.width}%` },
                ...(colIndex < table.columns.length - 1 ? [styles.cellBorderRight] : []),
              ]}
            >
              <Text style={styles.headerCell}>
                {col.label}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ボディ */}
      {rows.map((row: Record<string, any>, i: number) => (
        <View
          key={i}
          style={[
            styles.row,
            { paddingVertical: rowPv },
            ...(!showColumnHeader && i === 0
              ? [styles.rowFirstNoColHeader]
              : []),
          ]}
        >
          {table.columns.map((col, colIndex) => {
            const raw = row[col.key]
            const wrapped =
              wrapColumnUnits?.[col.key] != null && typeof raw === "string"
                ? wrapTextByDisplayWidth(raw, wrapColumnUnits[col.key]!)
                : raw
            const value =
              col.align === "right" && typeof raw === "number"
                ? formatYen(raw)
                : wrapped ?? ""

            return (
              <View
                key={col.key}
                style={[
                  styles.cellContainer,
                  { width: `${col.width}%` },
                  ...(colIndex < table.columns.length - 1 ? [styles.cellBorderRight] : []),
                ]}
              >
                <Text
                  style={[
                    styles.cell,
                    { textAlign: col.align ?? "left" },
                  ]}
                >
                  {value}
                </Text>
              </View>
            )
          })}
        </View>
      ))}

      {/* 合計行 */}
      {summaryRow && (
        <View style={[styles.summaryRow, { paddingVertical: summaryPv }]}>
          {table.columns.map((col, colIndex) => {
            const raw = summaryRow[col.key]
            const value =
              col.align === "right" && typeof raw === "number"
                ? formatYen(raw)
                : raw ?? ""

            return (
              <View
                key={col.key}
                style={[
                  styles.summaryCellContainer,
                  { width: `${col.width}%` },
                  ...(colIndex < table.columns.length - 1 ? [styles.cellBorderRight] : []),
                ]}
              >
                <Text
                  style={[
                    styles.summaryCell,
                    { textAlign: col.align ?? "left" },
                  ]}
                >
                  {value}
                </Text>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  table: {},
  headerRow: {
    flexDirection: "row",
    borderBottom: "2px solid #000",
    backgroundColor: "#f0f0f0",
  },
  headerCellContainer: {
    paddingHorizontal: 4,
  },
  headerCell: {
    fontSize: 8,
    fontWeight: "bold",
    fontFamily: "NotoSansJP",
    textAlign: "center",
  },
  cellBorderRight: {
    borderRight: "1px solid #ddd",
  },
  row: {
    flexDirection: "row",
    borderBottom: "1px solid #ccc",
  },
  /** 列見出しが無い続きページ先頭行：表頭相当の上罫線 */
  rowFirstNoColHeader: {
    borderTop: "2px solid #000",
  },
  cellContainer: {
    paddingHorizontal: 4,
  },
  cell: {
    fontSize: 8,
    fontFamily: "NotoSansJP",
  },
  summaryRow: {
    flexDirection: "row",
    borderTop: "2px solid #000",
    borderBottom: "1px solid #ccc",
    backgroundColor: "#f9f9f9",
  },
  summaryCellContainer: {
    paddingHorizontal: 4,
  },
  summaryCell: {
    fontSize: 8,
    fontFamily: "NotoSansJP",
    fontWeight: "bold",
  },
})

export default TableBlock
