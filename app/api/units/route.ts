import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const units = await prisma.unit.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        facility: true,
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(units)
  } catch (error) {
    console.error('Failed to fetch units:', error)
    return NextResponse.json({ error: 'Failed to fetch units' }, { status: 500 })
  }
}

export async function POST(request: Request) {
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

