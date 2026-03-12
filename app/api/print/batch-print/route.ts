export const runtime = 'edge';
export const dynamic = 'force-dynamic'

import { NextResponse } from "next/server"
import { getPrisma } from "@/lib/prisma"
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

    // 施設情報と全利用者情報を取得
    const facility = await prisma.facility.findUnique({
      where: { id: Number(facilityId) },
      include: {
        units: {
          where: { isActive: true },
        },
        residents: {
          where: {
            isActive: true,
            endDate: null, // 終了日が設定されていない利用者のみ
          },
          include: {
            transactions: {
              orderBy: { transactionDate: "asc" },
            },
            unit: true,
          },
        },
      },
    })

    if (!facility) {
      return NextResponse.json(
        { error: "Facility not found" },
        { status: 404 }
      )
    }

    // 施設設定に応じてユニット・利用者をソート
    const useSameOrder = (facility as { useSameOrderForDisplayAndPrint?: boolean }).useSameOrderForDisplayAndPrint ?? true
    const useUnitOrder = (facility as { useUnitOrderForPrint?: boolean }).useUnitOrderForPrint ?? true
    const residentPrintSortMode = (facility as { residentPrintSortMode?: string | null }).residentPrintSortMode ?? null
    const sortedUnits = sortUnitsForPrint(facility.units as unknown as SortableUnit[], useSameOrder)
    const sortedResidents = sortResidentsForPrint(
      facility.residents as unknown as SortableResident[],
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
      Number(year),
      Number(month)
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
          Number(year),
          Number(month)
        )
        printData.notice = buildNoticeFromFacilityTemplate(facilityNoticeTemplate)
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
