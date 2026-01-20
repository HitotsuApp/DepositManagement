import { NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import React from "react"
import { CashVerificationPdfRenderer } from "@/pdf/renderer/CashVerificationPdfRenderer"
import { prisma } from "@/lib/prisma"
import { calculateBalanceUpToMonth } from "@/lib/balance"

export async function GET(request: Request) {
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

    // 施設の預り金合計を取得
    const facilityDetail = await prisma.facility.findUnique({
      where: { id: Number(facilityId) },
      include: {
        residents: {
          where: {
            isActive: true,
            endDate: null,
          },
          include: {
            transactions: {
              orderBy: { transactionDate: "asc" },
            },
          },
        },
      },
    })

    if (!facilityDetail) {
      return NextResponse.json(
        { error: "Facility detail not found" },
        { status: 404 }
      )
    }

    // 預り金合計を計算（指定年月までの累計）
    const facilityBalance = facilityDetail.residents.reduce((sum, resident) => {
      return sum + calculateBalanceUpToMonth(resident.transactions, Number(year), Number(month))
    }, 0)

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

    // PDFを返す（BufferをArrayBufferに変換）
    const arrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    )
    
    return new Response(arrayBuffer, {
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
