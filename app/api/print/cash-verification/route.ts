export const runtime = 'edge';
export const dynamic = 'force-dynamic'

import { NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import React from "react"
import { CashVerificationPdfRenderer } from "@/pdf/renderer/CashVerificationPdfRenderer"
import { getPrisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const prisma = getPrisma()
  try {
    const { searchParams } = new URL(request.url)
    const facilityId = searchParams.get("facilityId")
    const year = searchParams.get("year")
    const month = searchParams.get("month")
    
    // 紙幣・硬貨のデータを取得（クエリパラメータから）
    const billsParam = searchParams.get("bills")
    const coinsParam = searchParams.get("coins")

    if (!facilityId || !year || !month) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      )
    }

    // 施設情報を取得
    const facility = await prisma.facility.findUnique({
      where: { id: Number(facilityId) },
    })

    if (!facility) {
      return NextResponse.json(
        { error: "Facility not found" },
        { status: 404 }
      )
    }

    // 施設の預り金合計をDB側で集計（パフォーマンス最適化）
    const targetDate = new Date(Number(year), Number(month), 0, 23, 59, 59, 999)
    interface FacilityBalanceRow {
      balance: number | string
    }

    const facilityBalanceRaw = await prisma.$queryRaw<FacilityBalanceRow[]>`
      SELECT 
        COALESCE(SUM(
          CASE 
            WHEN t."transactionType" IN ('in', 'past_correct_in') THEN t.amount
            WHEN t."transactionType" IN ('out', 'past_correct_out') THEN -t.amount
            ELSE 0
          END
        ), 0) as balance
      FROM "Resident" r
      LEFT JOIN "Transaction" t ON t."residentId" = r.id
      WHERE r."facilityId" = ${Number(facilityId)}
        AND r."isActive" = true
        AND r."endDate" IS NULL
        AND (t."transactionDate" IS NULL OR t."transactionDate" <= ${targetDate})
        AND (t."transactionType" IS NULL OR t."transactionType" NOT IN ('correct_in', 'correct_out'))
    `

    const facilityBalance = Number(facilityBalanceRaw[0]?.balance || 0)

    // 紙幣・硬貨のデータをパース
    const bills = billsParam ? JSON.parse(decodeURIComponent(billsParam)) : []
    const coins = coinsParam ? JSON.parse(decodeURIComponent(coinsParam)) : []

    // 合計金額を計算
    const totalAmount = bills.reduce((sum: number, b: any) => sum + (b.amount || 0), 0) +
                       coins.reduce((sum: number, c: any) => sum + (c.amount || 0), 0)

    // 差異を計算
    const difference = facilityBalance - totalAmount

    // 印刷日を取得
    const printDate = new Date().toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })

    // PDFデータを準備
    const pdfData = {
      facilityName: facility.name,
      facilityBalance,
      bills,
      coins,
      totalAmount,
      difference,
      printDate,
    }

    // PDFを生成
    const pdfDocument = React.createElement(CashVerificationPdfRenderer, { data: pdfData })
    const pdfBuffer = await renderToBuffer(pdfDocument as any)

    // PDFを返す（BufferをUint8Arrayに変換）
    const uint8Array = new Uint8Array(pdfBuffer)
    
    return new Response(uint8Array, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="現金確認_${facility.name}_${year}年${month}月.pdf"`,
      },
    })
  } catch (error) {
    console.error("Failed to generate cash verification PDF:", error)
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    )
  }
}
