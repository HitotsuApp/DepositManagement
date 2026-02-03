export const runtime = 'edge';
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(request: Request) {
  const prisma = getPrisma()
  try {
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get('year')) || new Date().getFullYear()
    const month = Number(searchParams.get('month')) || new Date().getMonth() + 1
    const facilityIdParam = searchParams.get('facilityId')
    const facilityId = facilityIdParam ? Number(facilityIdParam) : null

    // 施設情報のみを取得（取引データは不要）
    const facilities = await prisma.facility.findMany({
      where: {
        isActive: true,
        ...(facilityId ? { id: facilityId } : {}),
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { sortOrder: 'asc' },
    })

    // 全施設の残高をDB側で一括集計（パフォーマンス最適化）
    const targetDate = new Date(year, month, 0, 23, 59, 59, 999)
    interface FacilityBalanceRow {
      facilityId: number
      balance: number | string
    }

    const facilityBalancesRaw = await prisma.$queryRaw<FacilityBalanceRow[]>`
      SELECT 
        r."facilityId",
        COALESCE(SUM(
          CASE 
            WHEN t."transactionType" IN ('in', 'past_correct_in') THEN t.amount
            WHEN t."transactionType" IN ('out', 'past_correct_out') THEN -t.amount
            ELSE 0
          END
        ), 0) as balance
      FROM "Resident" r
      LEFT JOIN "Transaction" t ON t."residentId" = r.id
      WHERE r."isActive" = true
        AND r."endDate" IS NULL
        AND (t."transactionDate" IS NULL OR t."transactionDate" <= ${targetDate})
        AND (t."transactionType" IS NULL OR t."transactionType" NOT IN ('correct_in', 'correct_out'))
        ${facilityId ? Prisma.sql`AND r."facilityId" = ${facilityId}` : Prisma.empty}
      GROUP BY r."facilityId"
    `

    // Mapに変換（PostgreSQLのnumeric型をNumberに変換）
    const facilityBalancesMap = new Map<number, number>()
    facilityBalancesRaw.forEach(row => {
      facilityBalancesMap.set(row.facilityId, Number(row.balance))
    })

    // 施設情報と残高を結合
    const facilitySummaries = facilities.map(facility => ({
      id: facility.id,
      name: facility.name,
      totalAmount: facilityBalancesMap.get(facility.id) || 0,
    }))

    // 全施設の合計を計算（施設数分のデータのみなのでJavaScript側でOK）
    const totalAmount = facilitySummaries.reduce((sum, f) => sum + f.totalAmount, 0)

    const response = NextResponse.json({
      totalAmount,
      facilities: facilitySummaries,
    })
    
    // キャッシュヘッダーの追加（更新頻度が高いため短いキャッシュ時間）
    response.headers.set('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=59')
    
    return response
  } catch (error) {
    console.error('Failed to fetch dashboard:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch dashboard'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

