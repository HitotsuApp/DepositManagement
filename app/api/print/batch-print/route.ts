export const runtime = 'edge';
export const dynamic = 'force-dynamic'

import { NextResponse } from "next/server"
import { getPrisma } from "@/lib/prisma"
import {
  loadResidentsForDepositPrint,
} from "@/lib/residentPrintEligibility"
import { transformToPrintData, transformToResidentPrintData, buildNoticeFromFacilityTemplate, type FacilityWithRelations, type ResidentPrintData } from "@/pdf/utils/transform"
import { sortResidentsForPrint, type SortableResident, type SortableUnit } from "@/lib/sortOrder"

export async function GET(request: Request) {
  const prisma = getPrisma()
  try {
    const { searchParams } = new URL(request.url)
    const facilityId = searchParams.get("facilityId")
    const year = searchParams.get("year")
    const month = searchParams.get("month")

    if (!facilityId || !year || !month) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      )
    }

    const fid = Number(facilityId)
    const y = Number(year)
    const m = Number(month)

    const facility = await prisma.facility.findUnique({
      where: { id: fid },
      include: {
        units: {
          where: { isActive: true },
        },
      },
    })

    if (!facility) {
      return NextResponse.json(
        { error: "Facility not found" },
        { status: 404 }
      )
    }

    const { residents, openingBalancesThruPreviousMonthEnd } = await loadResidentsForDepositPrint(
      prisma,
      fid,
      y,
      m,
      null
    )

    const residentPrintSortMode = (facility as { residentPrintSortMode?: string | null }).residentPrintSortMode ?? null
    const useSameOrder =
      (facility as { useSameOrderForDisplayAndPrint?: boolean }).useSameOrderForDisplayAndPrint ?? true
    const useUnitOrder = (facility as { useUnitOrderForPrint?: boolean }).useUnitOrderForPrint ?? true
    const sortedResidents = sortResidentsForPrint(
      residents as unknown as SortableResident[],
      facility.units as unknown as SortableUnit[],
      useSameOrder,
      useUnitOrder,
      residentPrintSortMode === "aiueo" ? "aiueo" : "manual"
    )

    const facilitySummary = transformToPrintData(
      { ...facility, residents } as unknown as FacilityWithRelations,
      null,
      y,
      m,
      { residentOpeningBalances: openingBalancesThruPreviousMonthEnd }
    )

    const facilityNoticeTemplate = (facility as { noticeTemplateNormal?: string | null }).noticeTemplateNormal ?? null

    let residentStatements: ResidentPrintData[] = []

    if (sortedResidents.length > 0) {
      residentStatements = sortedResidents.map((resident) => {
        const base = residents.find((r) => r.id === resident.id)
        if (!base) {
          throw new Error(`Resident ${resident.id} not found`)
        }
        const residentWithRelations = {
          ...base,
          facility,
          transactions: base.transactions,
          unit: base.unit,
        }
        const printData = transformToResidentPrintData(
          residentWithRelations,
          y,
          m,
          "monthOnly",
          {
            openingBalanceThruPreviousMonthEnd:
              openingBalancesThruPreviousMonthEnd.get(resident.id) ?? 0,
          }
        )
        const notice = buildNoticeFromFacilityTemplate(facilityNoticeTemplate, "normal")
        if (notice) printData.notice = notice
        return printData
      })
    }

    return NextResponse.json({
      facilitySummary,
      residentStatements,
    })
  } catch (error) {
    console.error("Failed to generate batch print data:", error)
    return NextResponse.json(
      { error: "Failed to generate batch print data" },
      { status: 500 }
    )
  }
}
