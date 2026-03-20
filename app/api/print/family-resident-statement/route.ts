export const runtime = "edge"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { getPrisma } from "@/lib/prisma"
import {
  transformToResidentPrintDataForRange,
  buildNoticeFromFacilityTemplate,
  type ResidentPrintData,
} from "@/pdf/utils/transform"
import {
  sortResidentsForPrint,
  sortUnitsForPrint,
  type SortableResident,
  type SortableUnit,
} from "@/lib/sortOrder"

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
  const prisma = getPrisma()
  try {
    const { searchParams } = new URL(request.url)
    const facilityId = searchParams.get("facilityId")
    const startDateStr = searchParams.get("startDate")
    const endDateStr = searchParams.get("endDate")

    if (!facilityId || !startDateStr || !endDateStr) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      )
    }

    const startDate = parseYmdToLocalDate(startDateStr, 0, 0, 0, 0)
    const endDate = parseYmdToLocalDate(endDateStr, 23, 59, 59, 999)
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "Invalid date parameters" },
        { status: 400 }
      )
    }
    if (startDate.getTime() > endDate.getTime()) {
      return NextResponse.json(
        { error: "startDate must be <= endDate" },
        { status: 400 }
      )
    }

    const facility = await prisma.facility.findUnique({
      where: { id: Number(facilityId) },
      include: {
        units: {
          where: { isActive: true },
        },
        residents: {
          where: {
            isActive: true,
          },
        },
      },
    })

    if (!facility) {
      return NextResponse.json({ error: "Facility not found" }, { status: 404 })
    }

    const useSameOrder =
      (facility as { useSameOrderForDisplayAndPrint?: boolean }).useSameOrderForDisplayAndPrint ?? true
    const useUnitOrder =
      (facility as { useUnitOrderForPrint?: boolean }).useUnitOrderForPrint ?? true
    const residentPrintSortMode =
      (facility as { residentPrintSortMode?: string | null }).residentPrintSortMode ?? null

    const sortedUnits = sortUnitsForPrint(
      facility.units as unknown as SortableUnit[],
      useSameOrder
    )
    const sortedResidents = sortResidentsForPrint(
      facility.residents as unknown as SortableResident[],
      sortedUnits as unknown as SortableUnit[],
      useSameOrder,
      useUnitOrder,
      residentPrintSortMode === "aiueo" ? "aiueo" : "manual"
    )

    // Bルール:
    // 期間の「終了日時点」で在籍している利用者のみ対象
    // - startDate が終了日時点より後なら除外（まだ入居していない）
    // - endDate が終了日時点より前なら除外（すでに退居済み）
    const filteredResidents = sortedResidents.filter((r) => {
      const startOk = r.startDate === null || r.startDate === undefined || r.startDate <= endDate
      const endOk = r.endDate === null || r.endDate === undefined || r.endDate >= endDate
      return startOk && endOk
    })

    const facilityNoticeTemplate =
      (facility as { noticeTemplateNormal?: string | null }).noticeTemplateNormal ?? null

    const residentStatements: ResidentPrintData[] = await Promise.all(
      filteredResidents.map(async (resident) => {
        const residentWithRelations = await prisma.resident.findUnique({
          where: { id: resident.id },
          include: {
            transactions: {
              where: {
                transactionDate: { lte: endDate },
              },
              orderBy: { transactionDate: "asc" },
            },
            facility: true,
            unit: true,
          },
        })

        if (!residentWithRelations) {
          throw new Error(`Resident ${resident.id} not found`)
        }

        const printData = transformToResidentPrintDataForRange(
          residentWithRelations as any,
          startDate,
          endDate
        )

        const notice = buildNoticeFromFacilityTemplate(facilityNoticeTemplate, "normal")
        if (notice) printData.notice = notice

        return printData
      })
    )

    return NextResponse.json({ residentStatements })
  } catch (error) {
    console.error("Failed to generate family resident statements:", error)
    return NextResponse.json(
      { error: "Failed to generate family resident statements" },
      { status: 500 }
    )
  }
}

