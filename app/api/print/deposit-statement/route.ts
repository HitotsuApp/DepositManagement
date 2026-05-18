export const runtime = 'edge';
export const dynamic = 'force-dynamic'

import { NextResponse } from "next/server"
import { getPrisma } from "@/lib/prisma"
import { loadResidentsForDepositPrint } from "@/lib/residentPrintEligibility"
import { transformToPrintData, type FacilityWithRelations } from "@/pdf/utils/transform"

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

    const fid = Number(facilityId)
    const y = Number(year)
    const m = Number(month)
    const uid = unitId ? Number(unitId) : null

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
      uid
    )

    const printData = transformToPrintData(
      { ...facility, residents } as unknown as FacilityWithRelations,
      uid,
      y,
      m,
      { residentOpeningBalances: openingBalancesThruPreviousMonthEnd }
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
