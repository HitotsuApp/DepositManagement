import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { formatYen } from "../../utils/format"

interface SummaryBlockProps {
  summary: {
    rows: Array<{
      label: string
      income: string
      expense: string
      balance?: string
    }>
  }
  data: Record<string, any>
}

const SummaryBlock = ({ summary, data }: SummaryBlockProps) => {
  // 預り金総合計のみを表示（合計行はTableBlock内で表示される）
  if (!data.grandTotal) {
    return null
  }

  return (
    <View style={styles.container} wrap={false}>
      <View style={styles.grandTotalRow}>
        <Text style={styles.grandTotalLabel}>預り金総合計</Text>
        <Text style={styles.grandTotalValue}>
          {formatYen(data.grandTotal.netAmount || 0)}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
  },
  /** ラベルと金額を同一行にし、ページ途中で分割されないよう wrap=false と併用 */
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    width: "100%",
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: "NotoSansJP",
    flexShrink: 0,
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "NotoSansJP",
    textAlign: "right",
    flexShrink: 0,
  },
})

export default SummaryBlock
