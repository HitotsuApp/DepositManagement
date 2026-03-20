import { Document, Page, StyleSheet } from "@react-pdf/renderer"
import TextBlock from "./blocks/TextBlock"
import TableBlock from "./blocks/TableBlock"
import NoticeBlock from "./blocks/NoticeBlock"
import FooterBlock from "./blocks/FooterBlock"
import { type ResidentPrintData } from "../utils/transform"

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
  notice?: {
    title: string
    lines: string[]
    fontSize?: number
    marginTop?: number
  }
  footer?: {
    lines: string[]
    align?: "left" | "center" | "right"
    marginTop?: number
  }
}

const ROWS_PER_PAGE = 20

const chunk = <T,>(arr: T[], size: number): T[][] => {
  if (arr.length === 0) return [[]]
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
      {pageIndex === 0 &&
        template.header?.rows.map((row, i) => (
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

      {/* お知らせは最終ページのみ（resident-statementテンプレートの場合） */}
      {pageIndex === pages.length - 1 &&
        template.templateId === "resident-statement" && (
          <NoticeBlock notice={(data.notice ?? template.notice)!} />
        )}

      {/* フッターは最終ページのみ（resident-statementテンプレートの場合） */}
      {pageIndex === pages.length - 1 &&
        template.footer &&
        template.templateId === "resident-statement" && (
          <FooterBlock footer={template.footer} data={data} />
        )}
    </Page>
  ))
}

export const ResidentsOnlyPdfRenderer = ({
  template,
  residentStatements,
}: {
  template: Template
  residentStatements: ResidentPrintData[]
}) => {
  const residentPages = residentStatements.flatMap((residentData, index) =>
    renderPages(
      template,
      residentData,
      `resident-${index}`
    )
  )

  return <Document>{residentPages}</Document>
}

const styles = StyleSheet.create({
  page: {
    fontSize: 10,
    fontFamily: "NotoSansJP",
  },
})

