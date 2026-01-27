import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { formatYen } from "../../utils/format"

interface UnitSummaryBlockProps {
  unitSummaries: Array<{
    unitId: number
    unitName: string
    totalIncome: number
    totalExpense: number
    netAmount: number
    residents: Array<{
      residentId: number
      residentName: string
      totalIncome: number
      totalExpense: number
      netAmount: number
    }>
  }>
}

const UnitSummaryBlock = ({ unitSummaries }: UnitSummaryBlockProps) => {
  if (!unitSummaries || unitSummaries.length === 0) {
    return null
  }

  return (
    <View style={styles.container}>
      {unitSummaries.map((unit) => (
        <View key={unit.unitId} style={styles.unitBox}>
          <Text style={styles.unitName}>{unit.unitName}</Text>
          <View style={styles.unitTotalRow}>
            <Text style={styles.unitTotalLabel}>ユニット合計:</Text>
            <Text style={styles.unitTotalValue}>
              {formatYen(unit.netAmount)}
            </Text>
          </View>
          {unit.residents.map((resident) => (
            <View key={resident.residentId} style={styles.residentRow}>
              <Text style={styles.residentName}>
                ・{resident.residentName}:
              </Text>
              <Text style={styles.residentValue}>
                {formatYen(resident.netAmount)}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginTop: 15,
  },
  unitBox: {
    border: "1px solid #000",
    padding: 8,
    marginBottom: 8,
  },
  unitName: {
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: "NotoSansJP",
    marginBottom: 6,
  },
  unitTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  unitTotalLabel: {
    fontSize: 11,
    fontFamily: "NotoSansJP",
  },
  unitTotalValue: {
    fontSize: 11,
    fontFamily: "NotoSansJP",
    fontWeight: "bold",
  },
  residentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginLeft: 10,
    marginBottom: 2,
  },
  residentName: {
    fontSize: 10,
    fontFamily: "NotoSansJP",
  },
  residentValue: {
    fontSize: 10,
    fontFamily: "NotoSansJP",
    textAlign: "right",
  },
})

export default UnitSummaryBlock
