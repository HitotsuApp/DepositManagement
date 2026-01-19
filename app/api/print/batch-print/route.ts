import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { transformToPrintData, transformToResidentPrintData } from "@/pdf/utils/transform"

export async function GET(request: Request) {
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

    // 施設の預り金合計データを取得（unitIdはnullで全利用者対象）
    const facilitySummary = transformToPrintData(
      facility,
      null, // unitIdはnullで全利用者対象
      Number(year),
      Number(month)
    )

    // 各利用者の明細書データを取得
    const residentStatements = await Promise.all(
      facility.residents.map(async (resident) => {
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

        return transformToResidentPrintData(
          residentWithRelations,
          Number(year),
          Number(month)
        )
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
