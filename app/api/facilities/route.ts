import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateMaxLength, MAX_LENGTHS } from '@/lib/validation'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const facilityIdParam = searchParams.get('facilityId')
    const facilityId = facilityIdParam ? Number(facilityIdParam) : null

    const facilities = await prisma.facility.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(facilityId ? { id: facilityId } : {}),
      },
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
    
    // バリデーション
    if (!body.name || body.name.trim() === '') {
      return NextResponse.json(
        { error: '施設名を入力してください' },
        { status: 400 }
      )
    }
    
    if (!validateMaxLength(body.name, MAX_LENGTHS.FACILITY_NAME)) {
      return NextResponse.json(
        { error: `施設名は${MAX_LENGTHS.FACILITY_NAME}文字以内で入力してください` },
        { status: 400 }
      )
    }
    
    if (body.positionName && !validateMaxLength(body.positionName, MAX_LENGTHS.POSITION_NAME)) {
      return NextResponse.json(
        { error: `役職名は${MAX_LENGTHS.POSITION_NAME}文字以内で入力してください` },
        { status: 400 }
      )
    }
    
    if (body.positionHolderName && !validateMaxLength(body.positionHolderName, MAX_LENGTHS.POSITION_HOLDER_NAME)) {
      return NextResponse.json(
        { error: `役職者の名前は${MAX_LENGTHS.POSITION_HOLDER_NAME}文字以内で入力してください` },
        { status: 400 }
      )
    }
    
    const facility = await prisma.facility.create({
      data: {
        name: body.name.trim(),
        positionName: body.positionName ? body.positionName.trim() : null,
        positionHolderName: body.positionHolderName ? body.positionHolderName.trim() : null,
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

