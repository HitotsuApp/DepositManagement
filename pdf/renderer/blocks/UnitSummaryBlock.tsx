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

// 利用者を一定数ごとにグループ化する関数
const chunkResidents = <T,>(array: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}

// 1行に表示する最大セル数（A4用紙の幅を考慮）
const MAX_CELLS_PER_ROW = 4

const UnitSummaryBlock = ({ unitSummaries }: UnitSummaryBlockProps) => {
  if (!unitSummaries || unitSummaries.length === 0) {
    return null
  }

  return (
    <View style={styles.container}>
      {unitSummaries.map((unit) => {
        // 利用者をグループ化
        const residentChunks = chunkResidents(unit.residents, MAX_CELLS_PER_ROW)

        return (
          <View key={unit.unitId} style={styles.unitBox}>
            <Text style={styles.unitName}>{unit.unitName}</Text>
            
            {/* セル区切りのテーブル */}
            <View style={styles.tableContainer}>
              {residentChunks.map((chunk, chunkIndex) => {
                const isLastChunk = chunkIndex === residentChunks.length - 1

                return (
                  <View key={`chunk-${chunkIndex}`}>
                    {/* 1行目: 利用者名（背景グレー） */}
                    <View style={styles.nameRow}>
                      {chunk.map((resident, index) => (
                        <View
                          key={`name-${resident.residentId}`}
                          style={[
                            styles.cell,
                            styles.nameCell,
                            ...(index < chunk.length - 1 ? [styles.cellBorderRight] : []),
                          ]}
                        >
                          <Text style={styles.nameText}>{resident.residentName}</Text>
                        </View>
                      ))}
                    </View>
                    
                    {/* 2行目: 当月残高 */}
                    <View
                      style={[
                        styles.valueRow,
                        isLastChunk ? styles.valueRowLast : styles.valueRowNotLast,
                      ]}
                    >
                      {chunk.map((resident, index) => (
                        <View
                          key={`value-${resident.residentId}`}
                          style={[
                            styles.cell,
                            styles.valueCell,
                            ...(index < chunk.length - 1 ? [styles.cellBorderRight] : []),
                          ]}
                        >
                          <Text style={styles.valueText}>
                            {formatYen(resident.netAmount)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )
              })}
            </View>
            
            {/* ユニット合計 */}
            <View style={styles.unitTotalRow}>
              <Text style={styles.unitTotalLabel}>ユニット合計:</Text>
              <Text style={styles.unitTotalValue}>
                {formatYen(unit.netAmount)}
              </Text>
            </View>
          </View>
        )
      })}
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
    marginBottom: 8,
  },
  tableContainer: {
    border: "1px solid #000",
    marginBottom: 8,
  },
  nameRow: {
    flexDirection: "row",
    backgroundColor: "#f0f0f0",
    borderBottom: "1px solid #ccc",
  },
  valueRow: {
    flexDirection: "row",
  },
  valueRowNotLast: {
    borderBottom: "1px solid #ccc",
  },
  valueRowLast: {
    borderBottom: "1px solid #000",
  },
  cell: {
    padding: 4,
    flex: 1,
    minWidth: 80,
  },
  cellBorderRight: {
    borderRight: "1px solid #ccc",
  },
  nameCell: {
    backgroundColor: "#f0f0f0",
  },
  nameText: {
    fontSize: 10,
    fontFamily: "NotoSansJP",
    textAlign: "left",
  },
  valueCell: {
    backgroundColor: "#ffffff",
  },
  valueText: {
    fontSize: 10,
    fontFamily: "NotoSansJP",
    textAlign: "right",
  },
  unitTotalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
  },
  unitTotalLabel: {
    fontSize: 11,
    fontFamily: "NotoSansJP",
    fontWeight: "bold",
  },
  unitTotalValue: {
    fontSize: 11,
    fontFamily: "NotoSansJP",
    fontWeight: "bold",
  },
})

export default UnitSummaryBlock
