import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateMaxLength, MAX_LENGTHS } from '@/lib/validation'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const facilityIdParam = searchParams.get('facilityId')
    const facilityId = facilityIdParam ? Number(facilityIdParam) : null

    const residents = await prisma.resident.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(facilityId ? { facilityId } : {}),
      },
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
    
    // バリデーション
    if (!body.name || body.name.trim() === '') {
      return NextResponse.json(
        { error: '利用者名を入力してください' },
        { status: 400 }
      )
    }
    
    if (!validateMaxLength(body.name, MAX_LENGTHS.RESIDENT_NAME)) {
      return NextResponse.json(
        { error: `利用者名は${MAX_LENGTHS.RESIDENT_NAME}文字以内で入力してください` },
        { status: 400 }
      )
    }
    
    const resident = await prisma.resident.create({
      data: {
        facilityId: body.facilityId,
        unitId: body.unitId,
        name: body.name.trim(),
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

