export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { sortUnitsForDisplay, sortResidentsForDisplay } from '@/lib/sortOrder'

export async function GET() {
  const prisma = getPrisma()
  try {
    const oneMonthAgo = new Date()
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
    oneMonthAgo.setHours(0, 0, 0, 0)

    const facilities = await prisma.facility.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        residentDisplaySortMode: true,
        units: {
          where: { isActive: true },
            select: {
            id: true,
            name: true,
            capacity: true,
            displaySortOrder: true,
            printSortOrder: true,
            residents: {
              where: {
                OR: [
                  { isActive: true },
                  // 退居後1ヶ月以内の方も含める
                  { isActive: false, endDate: { gte: oneMonthAgo } },
                ],
              },
              select: {
                id: true,
                name: true,
                nameFurigana: true,
                displayNamePrefix: true,
                namePrefixDisplayOption: true,
                displaySortOrder: true,
                printSortOrder: true,
                unitId: true,
                isActive: true,
                startDate: true,
                endDate: true,
              },
            },
          },
        },
      },
    })

    const result = facilities.map((facility) => {
      const sortedUnits = sortUnitsForDisplay(facility.units)

      const sortedUnitWithResidents = sortedUnits.map((unit) => {
        const activeResidents = unit.residents.filter(r => r.isActive)
        const recentlyDischargedResidents = unit.residents.filter(r => !r.isActive)

        const sortedActive = sortResidentsForDisplay(
          activeResidents,
          facility.units,
          false,
          (facility.residentDisplaySortMode as 'manual' | 'aiueo' | null | undefined) ?? null
        )

        const allResidents = [...sortedActive, ...recentlyDischargedResidents].map(r => ({
          id: r.id,
          name: r.name,
          nameFurigana: r.nameFurigana,
          displayNamePrefix: r.displayNamePrefix,
          namePrefixDisplayOption: r.namePrefixDisplayOption,
          displaySortOrder: r.displaySortOrder,
          unitId: r.unitId,
          isRecentAdmission:
            r.isActive &&
            r.startDate !== null &&
            new Date(r.startDate) >= oneMonthAgo,
          isRecentDischarge: !r.isActive,
        }))

        return {
          id: unit.id,
          name: unit.name,
          capacity: unit.capacity,
          displaySortOrder: unit.displaySortOrder,
          residents: allResidents,
        }
      })

      // 総数はアクティブな利用者のみカウント
      const totalResidents = facility.units.reduce(
        (sum, u) => sum + u.residents.filter(r => r.isActive).length,
        0
      )

      return {
        id: facility.id,
        name: facility.name,
        residentDisplaySortMode: facility.residentDisplaySortMode,
        units: sortedUnitWithResidents,
        totalResidents,
      }
    })

    const response = NextResponse.json(result)
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.error('Failed to fetch whiteboard data:', error)
    return NextResponse.json({ error: 'Failed to fetch whiteboard data' }, { status: 500 })
  }
}
