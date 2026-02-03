export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'

export async function POST(request: Request) {
  const prisma = getPrisma()
  try {
    const body = await request.json()
    const { facilityId, direction } = body // direction: 'up' | 'down'

    if (!facilityId || !direction) {
      return NextResponse.json({ error: 'facilityId and direction are required' }, { status: 400 })
    }

    // 現在の施設を取得
    const currentFacility = await prisma.facility.findUnique({
      where: { id: facilityId },
    })

    if (!currentFacility) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    // すべての施設を取得（表示順でソート）
    const allFacilities = await prisma.facility.findMany({
      orderBy: { sortOrder: 'asc' },
    })

    // 現在の施設のインデックスを見つける
    const currentIndex = allFacilities.findIndex(f => f.id === facilityId)

    if (currentIndex === -1) {
      return NextResponse.json({ error: 'Facility not found in list' }, { status: 404 })
    }

    // 上下移動の方向に応じてインデックスを計算
    let targetIndex: number
    if (direction === 'up' && currentIndex > 0) {
      targetIndex = currentIndex - 1
    } else if (direction === 'down' && currentIndex < allFacilities.length - 1) {
      targetIndex = currentIndex + 1
    } else {
      // 移動できない場合（最初/最後）
      return NextResponse.json({ error: 'Cannot move in that direction' }, { status: 400 })
    }

    // 交換する施設を取得
    const targetFacility = allFacilities[targetIndex]

    // 順序を交換
    await prisma.$transaction([
      prisma.facility.update({
        where: { id: currentFacility.id },
        data: { sortOrder: targetFacility.sortOrder },
      }),
      prisma.facility.update({
        where: { id: targetFacility.id },
        data: { sortOrder: currentFacility.sortOrder },
      }),
    ])

    // 更新後の施設リストを返す
    const updatedFacilities = await prisma.facility.findMany({
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json(updatedFacilities)
  } catch (error) {
    console.error('Failed to reorder facilities:', error)
    return NextResponse.json({ error: 'Failed to reorder facilities' }, { status: 500 })
  }
}

