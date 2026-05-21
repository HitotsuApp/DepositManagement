export const runtime = 'edge';
export const dynamic = 'force-dynamic'

import { NextResponse } from "next/server"
import { getPrisma } from "@/lib/prisma"
import {
  fetchOpeningBalancesAndTransactionsInRangeByResidentChunks,
  getLedgerSqlForPrint,
} from "@/lib/printLedgerFetch"
import { getCalendarMonthRange } from "@/lib/residentPrintEligibility"
import { transformToResidentPrintData, buildNoticeFromFacilityTemplate } from "@/pdf/utils/transform"

export async function GET(request: Request) {
  const prisma = getPrisma()
  try {
    const { searchParams } = new URL(request.url)
    const residentId = searchParams.get("residentId")
    const year = searchParams.get("year")
    const month = searchParams.get("month")
    const noticeType = searchParams.get("noticeType") === "moveout" ? "moveout" : "normal"

    if (!residentId || !year || !month) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      )
    }

    const y = Number(year)
    const m = Number(month)
    const { monthEnd, monthStart } = getCalendarMonthRange(y, m)
    const previousMonthEnd = new Date(y, m - 1, 0, 23, 59, 59, 999)

    const resident = await prisma.resident.findUnique({
      where: { id: Number(residentId) },
      include: {
        facility: true,
        unit: true,
      },
    })

    if (!resident) {
      return NextResponse.json(
        { error: "Resident not found" },
        { status: 404 }
      )
    }

    const sql = getLedgerSqlForPrint()
    const facilityIdOfResident = resident.facilityId
    const { openingBalances: openingMap, transactionsByResident: txMap } =
      await fetchOpeningBalancesAndTransactionsInRangeByResidentChunks(
        sql,
        facilityIdOfResident,
        [resident.id],
        previousMonthEnd,
        monthStart,
        monthEnd
      )

    const residentForPrint = {
      ...resident,
      transactions: txMap.get(resident.id) ?? [],
    }

    const printData = transformToResidentPrintData(
      residentForPrint,
      y,
      m,
      noticeType === "moveout" ? "japaneseEraYearMonth" : "monthOnly",
      {
        openingBalanceThruPreviousMonthEnd:
          openingMap.get(resident.id) ?? 0,
      }
    )

    const facility = resident.facility as { noticeTemplateNormal?: string | null; noticeTemplateMoveOut?: string | null }
    const templateRaw = noticeType === "moveout" ? facility.noticeTemplateMoveOut : facility.noticeTemplateNormal
    const notice = buildNoticeFromFacilityTemplate(templateRaw, noticeType)
    if (notice) printData.notice = notice

    return NextResponse.json(printData)
  } catch (error) {
    console.error("Failed to generate print data:", error)
    return NextResponse.json(
      { error: "Failed to generate print data" },
      { status: 500 }
    )
  }
}
