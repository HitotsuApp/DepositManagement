export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { validateId } from '@/lib/validation'
import { sortResidentsForDisplay, type SortableResident, type SortableUnit } from '@/lib/sortOrder'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const prisma = getPrisma()
  try {
    const facilityId = validateId(params.id)
    if (!facilityId) {
      return NextResponse.json({ error: '無効なIDです' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')
    const unitIdParam = searchParams.get('unitId')

    if (!yearParam || !monthParam || !unitIdParam) {
      return NextResponse.json(
        { error: 'year, month, unitId は必須です' },
        { status: 400 }
      )
    }

    const year = Number(yearParam)
    const month = Number(monthParam)
    const unitIdNum = validateId(unitIdParam)
    if (
      !unitIdNum ||
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      return NextResponse.json({ error: 'パラメータが不正です' }, { status: 400 })
    }

    const unitRow = await prisma.unit.findFirst({
      where: {
        id: unitIdNum,
        facilityId,
        isActive: true,
      },
      select: { id: true },
    })
    if (!unitRow) {
      return NextResponse.json({ error: 'ユニットが見つかりません' }, { status: 404 })
    }

    const facility = await prisma.facility.findUnique({
      where: { id: facilityId },
      select: {
        id: true,
        residentDisplaySortMode: true,
        useUnitOrderForPrint: true,
        units: {
          where: {
            isActive: true,
            facilityId,
          },
          select: {
            id: true,
            name: true,
            displaySortOrder: true,
            printSortOrder: true,
          },
          orderBy: [{ displaySortOrder: 'asc' }, { id: 'asc' }],
        },
        residents: {
          where: {
            facilityId,
            unitId: unitIdNum,
            isActive: true,
            endDate: null,
          },
          select: {
            id: true,
            name: true,
            nameFurigana: true,
            unitId: true,
            displaySortOrder: true,
            printSortOrder: true,
            displayNamePrefix: true,
            namePrefixDisplayOption: true,
          },
          orderBy: [{ id: 'asc' }],
        },
      },
    })

    if (!facility) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    const targetDate = new Date(year, month, 0, 23, 59, 59, 999)
    interface BalanceRow {
      unitId: number | null
      residentId: number
      balance: number | string
    }

    const balancesRaw = await prisma.$queryRaw<BalanceRow[]>`
      SELECT 
        r."unitId",
        r.id as "residentId",
        COALESCE(SUM(
          CASE 
            WHEN t."transactionType" IN ('in', 'past_correct_in') THEN t.amount
            WHEN t."transactionType" IN ('out', 'past_correct_out') THEN -t.amount
            ELSE 0
          END
        ), 0) as balance
      FROM "Resident" r
      LEFT JOIN "Transaction" t ON t."residentId" = r.id
      WHERE r."facilityId" = ${facilityId}
        AND r."unitId" = ${unitIdNum}
        AND r."isActive" = true
        AND r."endDate" IS NULL
        AND (t."transactionDate" IS NULL OR t."transactionDate" <= ${targetDate})
        AND (t."transactionType" IS NULL OR t."transactionType" NOT IN ('correct_in', 'correct_out'))
      GROUP BY r."unitId", r.id
    `

    const residentBalancesMap = new Map<number, number>()
    balancesRaw.forEach((row) => {
      residentBalancesMap.set(row.residentId, Number(row.balance))
    })

    const residentDisplaySortMode = facility.residentDisplaySortMode ?? null
    const useUnitOrder = facility.useUnitOrderForPrint ?? true
    const sortedResidents = sortResidentsForDisplay(
      facility.residents as unknown as SortableResident[],
      facility.units as unknown as SortableUnit[],
      useUnitOrder,
      residentDisplaySortMode === 'aiueo' ? 'aiueo' : 'manual'
    )

    const residents = sortedResidents.map((resident) => ({
      id: resident.id,
      name: resident.name,
      displayNamePrefix: resident.displayNamePrefix,
      namePrefixDisplayOption: resident.namePrefixDisplayOption,
      balance: residentBalancesMap.get(resident.id) || 0,
    }))

    const response = NextResponse.json({ residents })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.error('Failed to fetch resident summaries:', error)
    return NextResponse.json({ error: 'Failed to fetch resident summaries' }, { status: 500 })
  }
}
