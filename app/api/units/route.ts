export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { validateMaxLength, MAX_LENGTHS } from '@/lib/validation'

export async function GET(request: Request) {
  console.time('prisma-init')
  const prisma = getPrisma()
  console.timeEnd('prisma-init')

  try {
    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const facilityIdParam = searchParams.get('facilityId')
    const facilityId = facilityIdParam ? Number(facilityIdParam) : null

    console.time('main-query')
    // 必要なフィールドのみをselectで取得
    const units = await prisma.unit.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(facilityId ? { facilityId } : {}),
      },
      select: {
        id: true,
        name: true,
        facilityId: true,
      },
      orderBy: { name: 'asc' },
    })
    console.timeEnd('main-query')

    const response = NextResponse.json(units)
    
    // キャッシュヘッダーの追加
    response.headers.set('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=55')
    
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

    const unit = await prisma.unit.create({
      data: {
        facilityId: body.facilityId,
        name: body.name.trim(),
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

