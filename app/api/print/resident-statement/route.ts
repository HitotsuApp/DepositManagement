export const runtime = 'edge';
export const dynamic = 'force-dynamic'

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { transformToResidentPrintData } from "@/pdf/utils/transform"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const residentId = searchParams.get("residentId")
    const year = searchParams.get("year")
    const month = searchParams.get("month")

    if (!residentId || !year || !month) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      )
    }

    const resident = await prisma.resident.findUnique({
      where: { id: Number(residentId) },
      include: {
        transactions: {
          orderBy: { transactionDate: "asc" },
        },
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

    const printData = transformToResidentPrintData(
      resident,
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
