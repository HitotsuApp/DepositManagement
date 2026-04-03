import { Document, Page, StyleSheet, Font } from "@react-pdf/renderer"
import TextBlock from "./blocks/TextBlock"
import TableBlock from "./blocks/TableBlock"
import SummaryBlock from "./blocks/SummaryBlock"
import UnitSummaryBlock from "./blocks/UnitSummaryBlock"
import NoticeBlock from "./blocks/NoticeBlock"
import FooterBlock from "./blocks/FooterBlock"
import { chunkDepositStatementRows } from "../utils/depositPdfLayout"

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
  // フォールバック: デフォルトフォントを使用
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

interface PdfRendererProps {
  template: Template
  data: Record<string, any>
}

const ROWS_PER_PAGE = 20

const chunk = <T,>(arr: T[], size: number): T[][] => {
  return arr.reduce(
    (acc, _, i) => (i % size ? acc : [...acc, arr.slice(i, i + size)]),
    [] as T[][]
  )
}

/** 摘要列（26%幅）向け：半角1・全角2の表示幅で折り返し（列幅20%時22に合わせた比率） */
const DEPOSIT_LABEL_WRAP_UNITS = 29

export const PdfRenderer = ({ template, data }: PdfRendererProps) => {
  const transactions = data.transactions ?? []
  const isDeposit = template.templateId === "deposit-statement"
  const pages = isDeposit
    ? chunkDepositStatementRows(
        transactions,
        template.document.margin.top,
        template.document.margin.bottom
      )
    : chunk(transactions, ROWS_PER_PAGE)

  // テーブルが1つだけの場合を想定
  const table = template.tables?.[0]

  const pagePadding = {
    paddingTop: template.document.margin.top,
    paddingRight: template.document.margin.right,
    paddingBottom: template.document.margin.bottom,
    paddingLeft: template.document.margin.left,
  }

  const hasUnitSummaryPage =
    isDeposit && data.unitSummaries && (data.unitSummaries as unknown[]).length > 0

  return (
    <Document>
      {pages.map((pageRows, pageIndex) => (
        <Page
          key={pageIndex}
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
      ))}
      {hasUnitSummaryPage && (
        <Page
          key="deposit-unit-summary"
          size={template.document.paper as any}
          orientation={template.document.orientation}
          style={[styles.page, pagePadding]}
        >
          <UnitSummaryBlock unitSummaries={data.unitSummaries} />
        </Page>
      )}
    </Document>
  )
}

const styles = StyleSheet.create({
  page: {
    fontSize: 10,
    fontFamily: "NotoSansJP",
  },
})
