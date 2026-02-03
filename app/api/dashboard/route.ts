export const runtime = 'edge';
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { calculateBalanceUpToMonth, TransactionForBalance } from '@/lib/balance'

export async function GET(request: Request) {
  const prisma = getPrisma()
  try {
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get('year')) || new Date().getFullYear()
    const month = Number(searchParams.get('month')) || new Date().getMonth() + 1
    const facilityIdParam = searchParams.get('facilityId')
    const facilityId = facilityIdParam ? Number(facilityIdParam) : null

    // select を使用して必要なフィールドのみを取得（パフォーマンス最適化）
    const facilities = await prisma.facility.findMany({
      where: {
        isActive: true,
        ...(facilityId ? { id: facilityId } : {}),
      },
      select: {
        id: true,
        name: true,
        residents: {
          where: { 
            isActive: true,
            endDate: null, // 終了日が設定されていない利用者のみ
          },
          select: {
            id: true,
            transactions: {
              select: {
                id: true,
                transactionDate: true,
                transactionType: true,
                amount: true,
              },
              orderBy: { transactionDate: 'asc' },
            },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    })

    const facilitySummaries = facilities.map(facility => {
      const totalAmount = facility.residents.reduce((sum, resident) => {
        return sum + calculateBalanceUpToMonth(resident.transactions as TransactionForBalance[], year, month)
      }, 0)
      return {
        id: facility.id,
        name: facility.name,
        totalAmount,
      }
    })

    const totalAmount = facilitySummaries.reduce((sum, f) => sum + f.totalAmount, 0)

    const response = NextResponse.json({
      totalAmount,
      facilities: facilitySummaries,
    })
    
    // キャッシュヘッダーの追加
    response.headers.set('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=55')
    
    return response
  } catch (error) {
    console.error('Failed to fetch dashboard:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch dashboard'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

