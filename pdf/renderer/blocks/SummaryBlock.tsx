import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { resolveTemplate } from "../../utils/resolve"
import { formatYen } from "../../utils/format"

interface SummaryBlockProps {
  summary: {
    rows: Array<{
      label: string
      income: string
      expense: string
      balance: string
    }>
  }
  data: Record<string, any>
}

const SummaryBlock = ({ summary, data }: SummaryBlockProps) => {
  return (
    <View style={styles.container}>
      {summary.rows.map((row, i) => {
        const income = resolveTemplate(row.income, data)
        const expense = resolveTemplate(row.expense, data)
        const balance = resolveTemplate(row.balance, data)

        return (
          <View key={i} style={styles.row}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.value}>
              入金：{formatYen(Number(income) || 0)}　
              出金：{formatYen(Number(expense) || 0)}　
              残高：{formatYen(Number(balance) || 0)}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    paddingTop: 8,
    borderTop: "2px solid #000",
  },
  row: {
    flexDirection: "row",
    marginBottom: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: "bold",
    marginRight: 8,
    fontFamily: "NotoSansJP",
  },
  value: {
    fontSize: 10,
    fontFamily: "NotoSansJP",
  },
})

export default SummaryBlock
