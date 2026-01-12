import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const residents = await prisma.resident.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        facility: true,
        unit: true,
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(residents)
  } catch (error) {
    console.error('Failed to fetch residents:', error)
    return NextResponse.json({ error: 'Failed to fetch residents' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const resident = await prisma.resident.create({
      data: {
        facilityId: body.facilityId,
        unitId: body.unitId,
        name: body.name,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        isActive: body.isActive !== undefined ? body.isActive : true,
      },
    })
    return NextResponse.json(resident)
  } catch (error) {
    console.error('Failed to create resident:', error)
    return NextResponse.json({ error: 'Failed to create resident' }, { status: 500 })
  }
}

