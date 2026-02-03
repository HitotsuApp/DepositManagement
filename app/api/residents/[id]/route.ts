export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { calculateBalance, filterTransactionsByMonth, calculateBalanceUpToMonth } from '@/lib/balance'
import { validateId, validateMaxLength, MAX_LENGTHS } from '@/lib/validation'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const prisma = getPrisma()
  try {
    const residentId = validateId(params.id)
    if (!residentId) {
      return NextResponse.json(
        { error: '無効なIDです' },
        { status: 400 }
      )
    }
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get('year')) || new Date().getFullYear()
    const month = Number(searchParams.get('month')) || new Date().getMonth() + 1

    // select を使用して必要なフィールドのみを取得（パフォーマンス最適化）
    const resident = await prisma.resident.findUnique({
      where: { id: residentId },
      select: {
        id: true,
        name: true,
        facilityId: true,
        transactions: {
          select: {
            id: true,
            transactionDate: true,
            transactionType: true,
            amount: true,
            description: true,
            payee: true,
            reason: true,
            createdAt: true,
            residentId: true,
          },
          orderBy: { transactionDate: 'asc' },
        },
      },
    })

    if (!resident) {
      return NextResponse.json({ error: 'Resident not found' }, { status: 404 })
    }

    // 指定年月までの累積残高を計算
    const balance = calculateBalanceUpToMonth(resident.transactions as any, year, month)

    // 全取引から累積残高を計算し、指定年月の取引のみをフィルタリング
    const allTransactionsWithBalance = calculateBalance(resident.transactions as any)
    const transactionsWithBalance = allTransactionsWithBalance.filter(t => {
      const transactionDate = new Date(t.transactionDate)
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0, 23, 59, 59, 999)
      return transactionDate >= startDate && transactionDate <= endDate
    })

    const response = NextResponse.json({
      residentName: resident.name,
      facilityId: resident.facilityId,
      balance,
      transactions: transactionsWithBalance,
    })
    
    // キャッシュヘッダーの追加（更新頻度が高いため短いキャッシュ時間）
    response.headers.set('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=59')
    
    return response
  } catch (error) {
    console.error('Failed to fetch resident:', error)
    return NextResponse.json({ error: 'Failed to fetch resident' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const prisma = getPrisma()
  try {
    const residentId = validateId(params.id)
    if (!residentId) {
      return NextResponse.json(
        { error: '無効なIDです' },
        { status: 400 }
      )
    }
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

    const resident = await prisma.resident.update({
      where: { id: residentId },
      data: {
        facilityId: body.facilityId,
        unitId: body.unitId,
        name: body.name.trim(),
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      },
    })

    return NextResponse.json(resident)
  } catch (error) {
    console.error('Failed to update resident:', error)
    return NextResponse.json({ error: 'Failed to update resident' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const prisma = getPrisma()
  try {
    const residentId = validateId(params.id)
    if (!residentId) {
      return NextResponse.json(
        { error: '無効なIDです' },
        { status: 400 }
      )
    }
    const body = await request.json()

    const resident = await prisma.resident.update({
      where: { id: residentId },
      data: {
        isActive: body.isActive !== undefined ? body.isActive : false,
      },
    })

    return NextResponse.json(resident)
  } catch (error) {
    console.error('Failed to update resident status:', error)
    return NextResponse.json({ error: 'Failed to update resident status' }, { status: 500 })
  }
}
