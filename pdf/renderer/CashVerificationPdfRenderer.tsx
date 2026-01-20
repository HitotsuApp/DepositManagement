import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer"
import { formatYen } from "../utils/format"

// 日本語フォントを登録（ローカルファイルから読み込み）
try {
  Font.register({
    family: "NotoSansJP",
    fonts: [
      {
        src: "/fonts/NotoSansJP-Regular.ttf",
        fontWeight: "normal",
      },
      {
        src: "/fonts/NotoSansJP-Bold.ttf",
        fontWeight: "bold",
      },
    ],
  })
} catch (error) {
  console.warn("Failed to register Noto Sans JP font:", error)
}

interface CashDenomination {
  value: number
  label: string
  count: number
  amount: number
}

interface CashVerificationData {
  facilityName: string
  facilityBalance: number
  bills: CashDenomination[]
  coins: CashDenomination[]
  totalAmount: number
  difference: number
  printDate: string
}

interface CashVerificationPdfRendererProps {
  data: CashVerificationData
}

export const CashVerificationPdfRenderer = ({ data }: CashVerificationPdfRendererProps) => {
  return (
    <Document>
      <Page size="A4" orientation="portrait" style={styles.page}>
        {/* 金種表（預り金）セクション */}
        <View style={styles.headerSection}>
          <View style={styles.headerTitle}>
            <Text style={styles.headerTitleText}>金種表（預り金）</Text>
          </View>
          <View style={styles.headerAmount}>
            <Text style={styles.headerAmountText}>{formatYen(data.facilityBalance)}</Text>
          </View>
          <View style={styles.headerFacility}>
            <Text style={styles.headerFacilityText}>{data.facilityName}</Text>
          </View>
          <View style={styles.headerDate}>
            <Text style={styles.headerDateText}>印刷日: {data.printDate}</Text>
          </View>
        </View>

        {/* 計算式セクション */}
        <View style={styles.calculationSection}>
          <Text style={styles.calculationText}>
            {formatYen(data.facilityBalance)}（預り金合計）ー{formatYen(data.totalAmount)}（現金合計）＝{formatYen(data.difference)}（差異）
          </Text>
        </View>

        {/* 紙幣セクション */}
        <View style={styles.section}>
          <View style={styles.sectionTitle}>
            <Text style={styles.sectionTitleText}>紙幣</Text>
          </View>
          <View style={styles.table}>
            {/* テーブルヘッダー */}
            <View style={styles.tableHeader}>
              <View style={[styles.tableHeaderCell, { width: "40%" }]}>
                <Text style={styles.tableHeaderText}>額面</Text>
              </View>
              <View style={[styles.tableHeaderCell, { width: "30%" }]}>
                <Text style={styles.tableHeaderText}>枚数</Text>
              </View>
              <View style={[styles.tableHeaderCell, { width: "30%" }]}>
                <Text style={styles.tableHeaderText}>金額</Text>
              </View>
            </View>
            {/* テーブルボディ */}
            {data.bills.map((bill, index) => (
              <View key={index} style={styles.tableRow}>
                <View style={[styles.tableCell, { width: "40%" }]}>
                  <Text style={styles.tableCellText}>{bill.label}</Text>
                </View>
                <View style={[styles.tableCell, { width: "30%" }]}>
                  <Text style={[styles.tableCellText, styles.tableCellCenter]}>
                    {bill.count || 0}
                  </Text>
                </View>
                <View style={[styles.tableCell, { width: "30%" }]}>
                  <Text style={[styles.tableCellText, styles.tableCellRight]}>
                    {formatYen(bill.amount)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* 【本】セクション */}
        <View style={styles.section}>
          <View style={styles.coinSectionTitle}>
            <Text style={styles.coinSectionTitleText}>【本】</Text>
          </View>
          <View style={styles.table}>
            {/* テーブルヘッダー */}
            <View style={styles.tableHeader}>
              <View style={[styles.tableHeaderCell, { width: "40%" }]}>
                <Text style={styles.tableHeaderText}>額面</Text>
              </View>
              <View style={[styles.tableHeaderCell, { width: "30%" }]}>
                <Text style={styles.tableHeaderText}>本数（50枚セット）</Text>
              </View>
              <View style={[styles.tableHeaderCell, { width: "30%" }]}>
                <Text style={styles.tableHeaderText}>金額</Text>
              </View>
            </View>
            {/* テーブルボディ */}
            {data.coins.map((coin, index) => (
              <View key={index} style={styles.tableRow}>
                <View style={[styles.tableCell, { width: "40%" }]}>
                  <Text style={styles.tableCellText}>{coin.label}</Text>
                </View>
                <View style={[styles.tableCell, { width: "30%" }]}>
                  <Text style={[styles.tableCellText, styles.tableCellCenter]}>
                    {coin.count || 0}
                  </Text>
                </View>
                <View style={[styles.tableCell, { width: "30%" }]}>
                  <Text style={[styles.tableCellText, styles.tableCellRight]}>
                    {formatYen(coin.amount)}
                  </Text>
                </View>
              </View>
            ))}
            {/* 合計行 */}
            <View style={styles.tableFooter}>
              <View style={[styles.tableCell, { width: "70%" }]}>
                <Text style={[styles.tableCellText, styles.tableCellRight, styles.tableFooterText]}>
                  合計
                </Text>
              </View>
              <View style={[styles.tableCell, { width: "30%" }]}>
                <Text style={[styles.tableCellText, styles.tableCellRight, styles.tableFooterText]}>
                  {formatYen(data.totalAmount)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansJP",
    padding: 20, // 30から20に削減
    fontSize: 8, // 9から8に削減
    color: "#000",
  },
  headerSection: {
    padding: 8, // 10から8に削減
    marginBottom: 5, // 8から5に削減
    position: "relative",
    minHeight: 50, // 最小高さを設定
  },
  calculationSection: {
    marginBottom: 5,
    padding: 3,
  },
  calculationText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  headerTitle: {
    marginBottom: 3, // 5から3に削減
  },
  headerTitleText: {
    fontSize: 11, // 12から11に削減
    fontWeight: "bold",
  },
  headerAmount: {
    marginBottom: 3, // 5から3に削減
  },
  headerAmountText: {
    fontSize: 18, // 20から18に削減
    fontWeight: "bold",
  },
  headerFacility: {
    marginBottom: 3, // 5から3に削減
  },
  headerFacilityText: {
    fontSize: 8, // 9から8に削減
  },
  headerDate: {
    position: "absolute",
    bottom: 6, // 8から6に削減
    right: 8, // 10から8に削減
  },
  headerDateText: {
    fontSize: 7, // 8から7に削減
  },
  section: {
    marginBottom: 5, // 8から5に削減
  },
  sectionTitle: {
    marginBottom: 3, // 5から3に削減
  },
  sectionTitleText: {
    fontSize: 10, // 11から10に削減
    fontWeight: "bold",
  },
  coinSectionTitle: {
    backgroundColor: "#f0f0f0",
    padding: 3, // 4から3に削減
    marginBottom: 3, // 5から3に削減
    borderRadius: 2,
  },
  coinSectionTitleText: {
    fontSize: 9, // 10から9に削減
    fontWeight: "bold",
  },
  table: {
    border: "1pt solid #000",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottom: "1pt solid #000",
    backgroundColor: "#f5f5f5",
  },
  tableHeaderCell: {
    padding: 3, // 4から3に削減
    borderRight: "0.5pt solid #000",
  },
  tableHeaderText: {
    fontSize: 8, // 9から8に削減
    fontWeight: "bold",
    textAlign: "center",
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #000",
  },
  tableCell: {
    padding: 2, // 3から2に削減
    borderRight: "0.5pt solid #000",
  },
  tableCellText: {
    fontSize: 8, // 9から8に削減
  },
  tableCellCenter: {
    textAlign: "center",
  },
  tableCellRight: {
    textAlign: "right",
  },
  tableFooter: {
    flexDirection: "row",
    borderTop: "2pt solid #000",
    backgroundColor: "#f5f5f5",
  },
  tableFooterText: {
    fontWeight: "bold",
  },
})
