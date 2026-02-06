export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const prisma = getPrisma()
  try {
    const residents = await prisma.resident.findMany({
      where: {
        endDate: {
          not: null,
        },
      },
      select: {
        id: true,
        name: true,
        facilityId: true,
        unitId: true,
        endDate: true,
        facility: {
          select: {
            id: true,
            name: true,
          },
        },
        unit: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        endDate: 'desc',
      },
    })

    return NextResponse.json(residents)
  } catch (error) {
    console.error('Failed to fetch ended residents:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ended residents' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const prisma = getPrisma()
  try {
    // 終了者を取得
    const endedResidents = await prisma.resident.findMany({
      where: {
        endDate: {
          not: null,
        },
      },
      select: {
        id: true,
      },
    })

    const residentIds = endedResidents.map(r => r.id)

    if (residentIds.length === 0) {
      return NextResponse.json({ message: '削除対象の終了者がいません' })
    }

    // トランザクション処理で削除
    await prisma.$transaction(async (tx) => {
      // 1. 先にTransactionを削除（外部キー制約のため）
      await tx.transaction.deleteMany({
        where: {
          residentId: {
            in: residentIds,
          },
        },
      })

      // 2. Residentを削除
      await tx.resident.deleteMany({
        where: {
          id: {
            in: residentIds,
          },
        },
      })
    })

    return NextResponse.json({
      message: `${residentIds.length}件の終了者データを削除しました`,
      deletedCount: residentIds.length,
    })
  } catch (error) {
    console.error('Failed to delete ended residents:', error)
    return NextResponse.json(
      { error: 'Failed to delete ended residents' },
      { status: 500 }
    )
  }
}
