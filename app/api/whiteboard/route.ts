export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { sortUnitsForDisplay, sortResidentsForDisplay } from '@/lib/sortOrder'

export async function GET() {
  const prisma = getPrisma()
  try {
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
            displaySortOrder: true,
            printSortOrder: true,
            residents: {
              where: { isActive: true },
              select: {
                id: true,
                name: true,
                nameFurigana: true,
                displayNamePrefix: true,
                namePrefixDisplayOption: true,
                displaySortOrder: true,
                printSortOrder: true,
                unitId: true,
              },
            },
          },
        },
      },
    })

    const result = facilities.map((facility) => {
      const sortedUnits = sortUnitsForDisplay(facility.units)

      const sortedUnitWithResidents = sortedUnits.map((unit) => {
        const sortedResidents = sortResidentsForDisplay(
          unit.residents,
          facility.units,
          false,
          (facility.residentDisplaySortMode as 'manual' | 'aiueo' | null | undefined) ?? null
        )
        return {
          id: unit.id,
          name: unit.name,
          displaySortOrder: unit.displaySortOrder,
          residents: sortedResidents,
        }
      })

      return {
        id: facility.id,
        name: facility.name,
        residentDisplaySortMode: facility.residentDisplaySortMode,
        units: sortedUnitWithResidents,
        totalResidents: facility.units.reduce((sum, u) => sum + u.residents.length, 0),
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
