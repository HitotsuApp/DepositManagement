import { Document, Page, StyleSheet } from "@react-pdf/renderer"
import TextBlock from "./blocks/TextBlock"
import TableBlock from "./blocks/TableBlock"
import SummaryBlock from "./blocks/SummaryBlock"
import UnitSummaryBlock from "./blocks/UnitSummaryBlock"
import NoticeBlock from "./blocks/NoticeBlock"
import FooterBlock from "./blocks/FooterBlock"
import { PrintData, ResidentPrintData } from "../utils/transform"
import depositStatementTemplate from "../templates/deposit-statement.json"
import residentStatementTemplate from "../templates/resident-statement.json"
import { chunkDepositStatementRows } from "../utils/depositPdfLayout"

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
  return arr.reduce(
    (acc, _, i) => (i % size ? acc : [...acc, arr.slice(i, i + size)]),
    [] as T[][]
  )
}

/** 摘要列幅26%に合わせた表示幅単位（20%時22から比率換算） */
const DEPOSIT_LABEL_WRAP_UNITS = 29

const renderPages = (
  template: Template,
  data: Record<string, any>,
  pageKeyPrefix: string
) => {
  const transactions = data.transactions ?? []
  const isDeposit = template.templateId === "deposit-statement"
  const pages = isDeposit
    ? chunkDepositStatementRows(
        transactions,
        template.document.margin.top,
        template.document.margin.bottom
      )
    : chunk(transactions, ROWS_PER_PAGE)
  const table = template.tables?.[0]

  const pagePadding = {
    paddingTop: template.document.margin.top,
    paddingRight: template.document.margin.right,
    paddingBottom: template.document.margin.bottom,
    paddingLeft: template.document.margin.left,
  }

  const hasUnitSummaryPage =
    isDeposit && data.unitSummaries && (data.unitSummaries as unknown[]).length > 0

  const pageElements = pages.map((pageRows, pageIndex) => (
    <Page
      key={`${pageKeyPrefix}-${pageIndex}`}
      size={template.document.paper as any}
      orientation={template.document.orientation}
      style={[
        styles.page,
        pagePadding,
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
          wrapColumnUnits={isDeposit ? { label: DEPOSIT_LABEL_WRAP_UNITS } : undefined}
          summary={template.summary}
          showSummary={pageIndex === pages.length - 1}
        />
      )}

      {/* 合計行の下に預り金総合計を表示（最終ページのみ、deposit-statementテンプレートの場合） */}
      {pageIndex === pages.length - 1 && template.summary && template.templateId === "deposit-statement" && (
        <SummaryBlock summary={template.summary} data={data} />
      )}

      {/* お知らせは最終ページのみ（resident-statementテンプレートの場合） */}
      {pageIndex === pages.length - 1 && template.templateId === "resident-statement" && (
        <NoticeBlock notice={(data.notice ?? template.notice)!} />
      )}

      {/* フッターは最終ページのみ（resident-statementテンプレートの場合） */}
      {pageIndex === pages.length - 1 && template.footer && template.templateId === "resident-statement" && (
        <FooterBlock footer={template.footer} data={data} />
      )}
    </Page>
  ))

  if (hasUnitSummaryPage) {
    return [
      <Page
        key={`${pageKeyPrefix}-unit`}
        size={template.document.paper as any}
        orientation={template.document.orientation}
        style={[styles.page, pagePadding]}
      >
        <UnitSummaryBlock unitSummaries={data.unitSummaries} />
      </Page>,
      ...pageElements,
    ]
  }

  return pageElements
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
