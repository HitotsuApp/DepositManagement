import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const facilities = await prisma.facility.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json(facilities)
  } catch (error) {
    console.error('Failed to fetch facilities:', error)
    return NextResponse.json({ error: 'Failed to fetch facilities' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const facility = await prisma.facility.create({
      data: {
        name: body.name,
        positionName: body.positionName || null,
        positionHolderName: body.positionHolderName || null,
        sortOrder: body.sortOrder || 0,
        isActive: body.isActive !== undefined ? body.isActive : true,
      },
    })
    return NextResponse.json(facility)
  } catch (error) {
    console.error('Failed to create facility:', error)
    return NextResponse.json({ error: 'Failed to create facility' }, { status: 500 })
  }
}

