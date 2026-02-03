export const runtime = 'edge';
export const dynamic = 'force-dynamic'

import { NextResponse } from "next/server"
import { getPrisma } from "@/lib/prisma"
import { transformToPrintData } from "@/pdf/utils/transform"

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

    const printData = transformToPrintData(
      facility,
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
