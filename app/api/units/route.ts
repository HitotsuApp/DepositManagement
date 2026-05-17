export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { validateMaxLength, validateSortOrder, MAX_LENGTHS } from '@/lib/validation'

export async function GET(request: Request) {
  const prisma = getPrisma()

  try {
    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const facilityIdParam = searchParams.get('facilityId')
    const facilityId = facilityIdParam ? Number(facilityIdParam) : null
    const facilityScoped =
      facilityId != null &&
      Number.isInteger(facilityId) &&
      facilityId > 0

    const units = await prisma.unit.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(facilityScoped ? { facilityId } : {}),
      },
      select: {
        id: true,
        name: true,
        facilityId: true,
        capacity: true,
        displaySortOrder: true,
        printSortOrder: true,
        isActive: true,
        ...(facilityScoped
          ? {}
          : {
              facility: {
                select: {
                  id: true,
                  name: true,
                },
              },
            }),
      },
      orderBy: [{ displaySortOrder: 'asc' }, { id: 'asc' }],
    })

    const response = NextResponse.json(units)

    // ?facilityId 付きは施設単位で URL が分かれるためやや長め。未指定一覧は施設一覧と同格の短め TTL。
    response.headers.set(
      'Cache-Control',
      facilityScoped
        ? 'public, s-maxage=120, stale-while-revalidate=300'
        : 'public, s-maxage=60, stale-while-revalidate=120'
    )
    
    return response
  } catch (error) {
    console.error('Failed to fetch units:', error)
    return NextResponse.json({ error: 'Failed to fetch units' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const prisma = getPrisma()
  try {
    const body = await request.json()
    
    // バリデーション
    if (!body.facilityId || body.facilityId === 0) {
      return NextResponse.json(
        { error: '施設を選択してください' },
        { status: 400 }
      )
    }
    
    if (!body.name || body.name.trim() === '') {
      return NextResponse.json(
        { error: 'ユニット名を入力してください' },
        { status: 400 }
      )
    }
    
    if (!validateMaxLength(body.name, MAX_LENGTHS.UNIT_NAME)) {
      return NextResponse.json(
        { error: `ユニット名は${MAX_LENGTHS.UNIT_NAME}文字以内で入力してください` },
        { status: 400 }
      )
    }

    // 施設が存在するか確認
    const facility = await prisma.facility.findUnique({
      where: { id: body.facilityId },
    })

    if (!facility) {
      return NextResponse.json(
        { error: '選択された施設が見つかりません' },
        { status: 404 }
      )
    }

    const displaySortOrder = validateSortOrder(body.displaySortOrder)
    const printSortOrder = validateSortOrder(body.printSortOrder)

    const capacity =
      body.capacity !== undefined && body.capacity !== null && body.capacity !== ''
        ? Number(body.capacity)
        : null

    const unit = await prisma.unit.create({
      data: {
        facilityId: body.facilityId,
        name: body.name.trim(),
        capacity: capacity !== null && !isNaN(capacity) && capacity > 0 ? capacity : null,
        displaySortOrder,
        printSortOrder,
        isActive: body.isActive !== undefined ? body.isActive : true,
      },
      include: {
        facility: true,
      },
    })
    return NextResponse.json(unit)
  } catch (error) {
    console.error('Failed to create unit:', error)
    return NextResponse.json({ error: 'Failed to create unit' }, { status: 500 })
  }
}

