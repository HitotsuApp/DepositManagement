export const runtime = 'edge'

export const dynamic = 'force-dynamic'

import { requireApiSession } from "@/lib/requireApiSession"
import { NextResponse } from "next/server"
import { neonHttpSql } from "@/lib/neonHttpSql"
import { fetchResidentWithFacilityUnitForStatement } from "@/lib/residentStatementMetaSql"
import {
  fetchOpeningBalancesAndTransactionsInRangeByResidentChunks,
  getLedgerSqlForPrint,
} from "@/lib/printLedgerFetch"
import { getCalendarMonthRange } from "@/lib/residentPrintEligibility"
import {
  transformToResidentPrintData,
  transformToResidentPrintDataForRange,
  buildNoticeFromFacilityTemplate,
} from "@/pdf/utils/transform"

function parseYmdToLocalDate(
  ymd: string,
  hours: number,
  minutes: number,
  seconds: number,
  milliseconds: number
) {
  const [y, m, d] = ymd.split("-").map((v) => Number(v))
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, hours, minutes, seconds, milliseconds)
}

export async function GET(request: Request) {
  const unauthorized = await requireApiSession()
  if (unauthorized) return unauthorized

  try {
    const { searchParams } = new URL(request.url)
    const residentId = searchParams.get("residentId")
    const year = searchParams.get("year")
    const month = searchParams.get("month")
    const startDateStr = searchParams.get("startDate")
    const endDateStr = searchParams.get("endDate")
    const noticeType = searchParams.get("noticeType") === "moveout" ? "moveout" : "normal"
    const useRange = Boolean(startDateStr && endDateStr)

    if (!residentId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      )
    }
    if (!useRange && (!year || !month)) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      )
    }

    const residentIdNum = Number(residentId)
    if (!Number.isInteger(residentIdNum) || residentIdNum <= 0) {
      return NextResponse.json(
        { error: "Invalid resident id" },
        { status: 400 }
      )
    }

    let rangeStart: Date | null = null
    let rangeEnd: Date | null = null
    let y = 0
    let m = 0
    let monthStart: Date | null = null
    let monthEnd: Date | null = null
    let previousMonthEnd: Date | null = null

    if (useRange) {
      rangeStart = parseYmdToLocalDate(startDateStr!, 0, 0, 0, 0)
      rangeEnd = parseYmdToLocalDate(endDateStr!, 23, 59, 59, 999)
      if (!rangeStart || !rangeEnd) {
        return NextResponse.json(
          { error: "Invalid date parameters" },
          { status: 400 }
        )
      }
      if (rangeStart.getTime() > rangeEnd.getTime()) {
        return NextResponse.json(
          { error: "startDate must be <= endDate" },
          { status: 400 }
        )
      }
    } else {
      y = Number(year)
      m = Number(month)
      const cal = getCalendarMonthRange(y, m)
      monthStart = cal.monthStart
      monthEnd = cal.monthEnd
      previousMonthEnd = new Date(y, m - 1, 0, 23, 59, 59, 999)
    }

    const sqlMeta = neonHttpSql()
    const resident = await fetchResidentWithFacilityUnitForStatement(
      sqlMeta,
      residentIdNum
    )

    if (!resident) {
      return NextResponse.json(
        { error: "Resident not found" },
        { status: 404 }
      )
    }

    const sql = getLedgerSqlForPrint()
    const facilityIdOfResident = resident.facilityId

    const openingCutoff = useRange
      ? new Date(rangeStart!.getTime() - 1)
      : previousMonthEnd!
    const txFrom = useRange ? rangeStart! : monthStart!
    const txTo = useRange ? rangeEnd! : monthEnd!

    const { openingBalances: openingMap, transactionsByResident: txMap } =
      await fetchOpeningBalancesAndTransactionsInRangeByResidentChunks(
        sql,
        facilityIdOfResident,
        [resident.id],
        openingCutoff,
        txFrom,
        txTo
      )

    const residentForPrint = {
      ...resident,
      transactions: txMap.get(resident.id) ?? [],
    }

    const printData = useRange
      ? transformToResidentPrintDataForRange(
          residentForPrint,
          rangeStart!,
          rangeEnd!,
          {
            openingBalanceThruInstantBeforeStart:
              openingMap.get(resident.id) ?? 0,
          }
        )
      : transformToResidentPrintData(
          residentForPrint,
          y,
          m,
          noticeType === "moveout" ? "japaneseEraYearMonth" : "monthOnly",
          {
            openingBalanceThruPreviousMonthEnd:
              openingMap.get(resident.id) ?? 0,
          }
        )

    const facility = resident.facility as {
      noticeTemplateNormal?: string | null
      noticeTemplateMoveOut?: string | null
    }
    const templateRaw =
      noticeType === "moveout"
        ? facility.noticeTemplateMoveOut
        : facility.noticeTemplateNormal
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
