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
    <View style={styles.container}>
      <View style={styles.grandTotalContainer}>
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
  grandTotalContainer: {
    flexDirection: "column",
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: "NotoSansJP",
    marginBottom: 4,
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "NotoSansJP",
    textAlign: "right",
  },
})

export default SummaryBlock
