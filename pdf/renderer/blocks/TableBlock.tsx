import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { formatYen } from "../../utils/format"
import { resolveTemplate } from "../../utils/resolve"

interface Column {
  key: string
  label: string
  width: number
  align?: "left" | "center" | "right"
}

interface TableBlockProps {
  table: {
    id: string
    columns: Column[]
    dataSource: string
  }
  data: Record<string, any>
  summary?: {
    rows: Array<{
      label: string
      income: string
      expense: string
      balance: string
    }>
  }
  showSummary?: boolean
}

const TableBlock = ({ table, data, summary, showSummary }: TableBlockProps) => {
  const rows = data[table.dataSource] ?? []

  // 合計行のデータを準備
  const summaryRow = showSummary && summary ? (() => {
    const summaryData = summary.rows[0]
    const income = resolveTemplate(summaryData.income, data)
    const expense = resolveTemplate(summaryData.expense, data)
    const balance = resolveTemplate(summaryData.balance, data)

    // テーブルの列構造に合わせて合計行を作成
    const summaryRowData: Record<string, any> = {}
    table.columns.forEach((col) => {
      if (col.key === "income") {
        summaryRowData[col.key] = Number(income) || 0
      } else if (col.key === "expense") {
        summaryRowData[col.key] = Number(expense) || 0
      } else if (col.key === "balance") {
        summaryRowData[col.key] = Number(balance) || 0
      } else {
        // 最初の列に「合計（表示）」を表示、それ以外は空
        summaryRowData[col.key] = col.key === table.columns[0].key ? summaryData.label : ""
      }
    })
    return summaryRowData
  })() : null

  return (
    <View style={styles.table}>
      {/* ヘッダー */}
      <View style={styles.headerRow}>
        {table.columns.map((col, colIndex) => (
          <View
            key={col.key}
            style={[
              styles.headerCellContainer,
              { width: `${col.width}%` },
              colIndex < table.columns.length - 1 && styles.cellBorderRight,
            ]}
          >
            <Text style={styles.headerCell}>
              {col.label}
            </Text>
          </View>
        ))}
      </View>

      {/* ボディ */}
      {rows.map((row: Record<string, any>, i: number) => (
        <View key={i} style={styles.row}>
          {table.columns.map((col, colIndex) => {
            const raw = row[col.key]
            const value =
              col.align === "right" && typeof raw === "number"
                ? formatYen(raw)
                : raw ?? ""

            return (
              <View
                key={col.key}
                style={[
                  styles.cellContainer,
                  { width: `${col.width}%` },
                  colIndex < table.columns.length - 1 && styles.cellBorderRight,
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
        <View style={styles.summaryRow}>
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
                  colIndex < table.columns.length - 1 && styles.cellBorderRight,
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
  table: {
    marginTop: 10,
  },
  headerRow: {
    flexDirection: "row",
    borderBottom: "2px solid #000",
    paddingVertical: 6,
    backgroundColor: "#f0f0f0",
  },
  headerCellContainer: {
    paddingHorizontal: 4,
  },
  headerCell: {
    fontSize: 9,
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
    paddingVertical: 4,
  },
  cellContainer: {
    paddingHorizontal: 4,
  },
  cell: {
    fontSize: 9,
    fontFamily: "NotoSansJP",
  },
  summaryRow: {
    flexDirection: "row",
    borderTop: "2px solid #000",
    borderBottom: "1px solid #ccc",
    paddingVertical: 6,
    backgroundColor: "#f9f9f9",
  },
  summaryCellContainer: {
    paddingHorizontal: 4,
  },
  summaryCell: {
    fontSize: 9,
    fontFamily: "NotoSansJP",
    fontWeight: "bold",
  },
})

export default TableBlock
