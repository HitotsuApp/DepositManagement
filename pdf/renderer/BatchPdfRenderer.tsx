import { Document, Page, StyleSheet } from "@react-pdf/renderer"
import TextBlock from "./blocks/TextBlock"
import TableBlock from "./blocks/TableBlock"
import SummaryBlock from "./blocks/SummaryBlock"
import UnitSummaryBlock from "./blocks/UnitSummaryBlock"
import { PrintData, ResidentPrintData } from "../utils/transform"
import depositStatementTemplate from "../templates/deposit-statement.json"
import residentStatementTemplate from "../templates/resident-statement.json"

interface BatchPrintData {
  facilitySummary: PrintData
  residentStatements: ResidentPrintData[]
}

interface Template {
  templateId: string
  version: string
  document: {
    title: string
    paper: string
    orientation: "portrait" | "landscape"
    margin: {
      top: number
      right: number
      bottom: number
      left: number
    }
  }
  header?: {
    rows: Array<{
      type: string
      value: string
      align?: "left" | "center" | "right"
      fontSize?: number
      bold?: boolean
      marginBottom?: number
    }>
  }
  tables?: Array<{
    id: string
    columns: Array<{
      key: string
      label: string
      width: number
      align?: "left" | "center" | "right"
    }>
    dataSource: string
  }>
  summary?: {
    rows: Array<{
      label: string
      income: string
      expense: string
      balance?: string
    }>
  }
}

const ROWS_PER_PAGE = 20

const chunk = <T,>(arr: T[], size: number): T[][] => {
  return arr.reduce(
    (acc, _, i) => (i % size ? acc : [...acc, arr.slice(i, i + size)]),
    [] as T[][]
  )
}

const renderPages = (
  template: Template,
  data: Record<string, any>,
  pageKeyPrefix: string
) => {
  const transactions = data.transactions ?? []
  const pages = chunk(transactions, ROWS_PER_PAGE)
  const table = template.tables?.[0]

  return pages.map((pageRows, pageIndex) => (
    <Page
      key={`${pageKeyPrefix}-${pageIndex}`}
      size={template.document.paper as any}
      orientation={template.document.orientation}
      style={[
        styles.page,
        {
          paddingTop: template.document.margin.top,
          paddingRight: template.document.margin.right,
          paddingBottom: template.document.margin.bottom,
          paddingLeft: template.document.margin.left,
        },
      ]}
    >
      {/* ヘッダーは1ページ目のみ */}
      {pageIndex === 0 && template.header?.rows.map((row, i) => (
        <TextBlock key={i} row={row} data={data} />
      ))}

      {/* テーブル */}
      {table && (
        <TableBlock
          table={table}
          data={{ ...data, transactions: pageRows }}
          summary={template.summary}
          showSummary={pageIndex === pages.length - 1}
        />
      )}

      {/* 合計行の下に預り金総合計を表示（最終ページのみ、deposit-statementテンプレートの場合） */}
      {pageIndex === pages.length - 1 && template.summary && template.templateId === "deposit-statement" && (
        <SummaryBlock summary={template.summary} data={data} />
      )}

      {/* ユニット別・利用者別の合計を表示（最終ページのみ、deposit-statementテンプレートの場合） */}
      {pageIndex === pages.length - 1 && data.unitSummaries && template.templateId === "deposit-statement" && (
        <UnitSummaryBlock unitSummaries={data.unitSummaries} />
      )}
    </Page>
  ))
}

export const BatchPdfRenderer = ({ data }: { data: BatchPrintData }) => {
  // 施設合計のページを生成
  const facilityPages = renderPages(
    depositStatementTemplate as Template,
    data.facilitySummary,
    "facility"
  )

  // 各利用者のページを生成
  const residentPages = data.residentStatements.flatMap((residentData, index) =>
    renderPages(
      residentStatementTemplate as Template,
      residentData,
      `resident-${index}`
    )
  )

  return (
    <Document>
      {/* 施設合計ページ */}
      {facilityPages}
      
      {/* 各利用者のページ */}
      {residentPages}
    </Document>
  )
}

const styles = StyleSheet.create({
  page: {
    fontSize: 10,
    fontFamily: "NotoSansJP",
  },
})
