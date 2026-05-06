import { Document, Page, StyleSheet } from "@react-pdf/renderer"
import TextBlock from "./blocks/TextBlock"
import TableBlock from "./blocks/TableBlock"
import NoticeBlock from "./blocks/NoticeBlock"
import FooterBlock from "./blocks/FooterBlock"
import { type ResidentPrintData } from "../utils/transform"
import {
  chunkResidentStatementRows,
  COMPACT_DATA_ROW_PADDING_VERTICAL,
  FAMILY_COMPACT_TABLE_MARGIN_TOP_PT,
  getPageHeightPt,
  RESIDENT_COMPACT_CHUNK_OPTS,
} from "../utils/depositPdfLayout"

/** TableBlock の列見出し行縦パディング（depositPdfLayout の FAMILY_COMPACT_TABLE_HEADER_ROW_PT と対応） */
const FAMILY_TABLE_HEADER_PADDING_V = 1
/** テーブル合計行の縦パディング（depositPdfLayout の FAMILY_COMPACT_TABLE_SUMMARY_ROW_PT と対応） */
const FAMILY_TABLE_SUMMARY_PADDING_V = 1

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

const renderPages = (
  template: Template,
  data: Record<string, any>,
  pageKeyPrefix: string
) => {
  const transactions = data.transactions ?? []
  const pageHeightPt = getPageHeightPt(
    template.document.paper,
    template.document.orientation
  )
  const pages = chunkResidentStatementRows(
    transactions,
    template.document.margin.top,
    template.document.margin.bottom,
    pageHeightPt,
    RESIDENT_COMPACT_CHUNK_OPTS
  )
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
          tableMarginTop={FAMILY_COMPACT_TABLE_MARGIN_TOP_PT}
          headerPaddingVertical={FAMILY_TABLE_HEADER_PADDING_V}
          summaryPaddingVertical={FAMILY_TABLE_SUMMARY_PADDING_V}
          dataRowPaddingVertical={COMPACT_DATA_ROW_PADDING_VERTICAL}
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

