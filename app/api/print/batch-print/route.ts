export const runtime = 'edge';
export const dynamic = 'force-dynamic'

import { NextResponse } from "next/server"
import { getPrisma } from "@/lib/prisma"
import { loadResidentsForDepositPrint } from "@/lib/residentPrintEligibility"
import { transformToPrintData, transformToResidentPrintData, buildNoticeFromFacilityTemplate, type FacilityWithRelations } from "@/pdf/utils/transform"
import { sortResidentsForPrint, sortUnitsForPrint, type SortableResident, type SortableUnit } from "@/lib/sortOrder"

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

    const residents = await loadResidentsForDepositPrint(prisma, fid, y, m, null)

    // 施設設定に応じてユニット・利用者をソート
    const useSameOrder = (facility as { useSameOrderForDisplayAndPrint?: boolean }).useSameOrderForDisplayAndPrint ?? true
    const useUnitOrder = (facility as { useUnitOrderForPrint?: boolean }).useUnitOrderForPrint ?? true
    const residentPrintSortMode = (facility as { residentPrintSortMode?: string | null }).residentPrintSortMode ?? null
    const sortedUnits = sortUnitsForPrint(facility.units as unknown as SortableUnit[], useSameOrder)
    const sortedResidents = sortResidentsForPrint(
      residents as unknown as SortableResident[],
      facility.units as unknown as SortableUnit[],
      useSameOrder,
      useUnitOrder,
      residentPrintSortMode === "aiueo" ? "aiueo" : "manual"
    )
    const sortedFacility = {
      ...facility,
      units: sortedUnits,
      residents: sortedResidents,
    }

    // 施設の預り金合計データを取得（unitIdはnullで全利用者対象）
    const facilitySummary = transformToPrintData(
      sortedFacility as unknown as FacilityWithRelations,
      null, // unitIdはnullで全利用者対象
      y,
      m
    )

    const facilityNoticeTemplate = (facility as { noticeTemplateNormal?: string | null }).noticeTemplateNormal ?? null

    // 各利用者の明細書データを取得（ソート順で）
    const residentStatements = await Promise.all(
      sortedResidents.map(async (resident) => {
        // 利用者データを再取得（transformToResidentPrintDataに必要な形式で）
        const residentWithRelations = await prisma.resident.findUnique({
          where: { id: resident.id },
          include: {
            transactions: {
              orderBy: { transactionDate: "asc" },
            },
            facility: true,
            unit: true,
          },
        })

        if (!residentWithRelations) {
          throw new Error(`Resident ${resident.id} not found`)
        }

        const printData = transformToResidentPrintData(
          residentWithRelations,
          y,
          m
        )
        const notice = buildNoticeFromFacilityTemplate(facilityNoticeTemplate, 'normal')
        if (notice) printData.notice = notice
        return printData
      })
    )

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
