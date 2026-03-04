export const runtime = 'edge';
export const dynamic = 'force-dynamic'

import { NextResponse } from "next/server"
import { getPrisma } from "@/lib/prisma"
import { transformToPrintData, type FacilityWithRelations } from "@/pdf/utils/transform"
import { sortResidentsForPrint, sortUnitsForPrint, type SortableResident, type SortableUnit } from "@/lib/sortOrder"

export async function GET(request: Request) {
  const prisma = getPrisma()
  try {
    const { searchParams } = new URL(request.url)
    const facilityId = searchParams.get("facilityId")
    const unitId = searchParams.get("unitId")
    const year = searchParams.get("year")
    const month = searchParams.get("month")

    if (!facilityId || !year || !month) {
      return NextResponse.json(
        { error: "Missing required parameters" },
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
            ...(unitId ? { unitId: Number(unitId) } : {}),
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

    const printData = transformToPrintData(
      sortedFacility as unknown as FacilityWithRelations,
      unitId ? Number(unitId) : null,
      Number(year),
      Number(month)
    )

    return NextResponse.json(printData)
  } catch (error) {
    console.error("Failed to generate print data:", error)
    return NextResponse.json(
      { error: "Failed to generate print data" },
      { status: 500 }
    )
  }
}
