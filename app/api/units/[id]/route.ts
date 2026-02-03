export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { validateId, validateMaxLength, MAX_LENGTHS } from '@/lib/validation'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const prisma = getPrisma()
  try {
    const unitId = validateId(params.id)
    if (!unitId) {
      return NextResponse.json(
        { error: '無効なIDです' },
        { status: 400 }
      )
    }
    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
      include: {
        facility: true,
      },
    })

    if (!unit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
    }

    return NextResponse.json(unit)
  } catch (error) {
    console.error('Failed to fetch unit:', error)
    return NextResponse.json({ error: 'Failed to fetch unit' }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const prisma = getPrisma()
  try {
    const unitId = validateId(params.id)
    if (!unitId) {
      return NextResponse.json(
        { error: '無効なIDです' },
        { status: 400 }
      )
    }
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

    const unit = await prisma.unit.update({
      where: { id: unitId },
      data: {
        facilityId: body.facilityId,
        name: body.name.trim(),
      },
      include: {
        facility: true,
      },
    })

    return NextResponse.json(unit)
  } catch (error) {
    console.error('Failed to update unit:', error)
    return NextResponse.json({ error: 'Failed to update unit' }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const prisma = getPrisma()
  try {
    const unitId = validateId(params.id)
    if (!unitId) {
      return NextResponse.json(
        { error: '無効なIDです' },
        { status: 400 }
      )
    }
    const body = await request.json()

    const unit = await prisma.unit.update({
      where: { id: unitId },
      data: {
        isActive: body.isActive !== undefined ? body.isActive : false,
      },
    })

    return NextResponse.json(unit)
  } catch (error) {
    console.error('Failed to update unit status:', error)
    return NextResponse.json({ error: 'Failed to update unit status' }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

