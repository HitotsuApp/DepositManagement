export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { validateId } from '@/lib/validation'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  console.time('prisma-init')
  const prisma = getPrisma()
  console.timeEnd('prisma-init')

  try {
    const facilityId = validateId(params.id)
    if (!facilityId) {
      return NextResponse.json(
        { error: '無効なIDです' },
        { status: 400 }
      )
    }
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get('year')) || new Date().getFullYear()
    const month = Number(searchParams.get('month')) || new Date().getMonth() + 1

    // 指定年月の開始日と終了日を計算
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)
    // 前月の最終日（前月の残高を計算するため）
    const previousMonthEndDate = new Date(year, month - 1, 0, 23, 59, 59, 999)

    console.time('main-query')
    // 施設内の全利用者とその取引を取得（必要なフィールドのみselect）
    // 当月の取引と、前月までの取引（残高計算用）を別々に取得
    const facility = await prisma.facility.findUnique({
      where: { id: facilityId },
      select: {
        id: true,
        residents: {
          where: {
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            // 当月の取引のみ取得
            transactions: {
              where: {
                transactionDate: {
                  gte: startDate,
                  lte: endDate,
                },
              },
              select: {
                id: true,
                transactionDate: true,
                transactionType: true,
                amount: true,
                description: true,
                payee: true,
                reason: true,
              },
              orderBy: { transactionDate: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
    })

    console.timeEnd('main-query')

    if (!facility) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    console.time('previous-balance-aggregate')
    // 前月までの残高をDB側で一括集計（パフォーマンス最適化）
    // 数千件のデータ転送を削減し、DB側で集計することで処理時間を大幅に短縮
    interface PreviousBalanceRow {
      residentId: number
      balance: number | string // PostgreSQLのSUMはnumeric型を返すため
    }

    let previousBalances = new Map<number, number>()
    try {
      const previousBalancesRaw = await prisma.$queryRaw<PreviousBalanceRow[]>`
        SELECT 
          "residentId",
          COALESCE(SUM(
            CASE 
              WHEN "transactionType" IN ('in', 'past_correct_in') THEN amount
              WHEN "transactionType" IN ('out', 'past_correct_out') THEN -amount
              ELSE 0
            END
          ), 0) as balance
        FROM "Transaction"
        WHERE "transactionDate" <= ${previousMonthEndDate}
          AND "transactionType" NOT IN ('correct_in', 'correct_out')
          AND "residentId" IN (
            SELECT id FROM "Resident"
            WHERE "facilityId" = ${facilityId}
              AND "isActive" = true
          )
        GROUP BY "residentId"
      `

      // Mapに変換（PostgreSQLのnumeric型をNumberに変換）
      previousBalancesRaw.forEach(row => {
        previousBalances.set(row.residentId, Number(row.balance))
      })
    } catch (error) {
      console.error('Failed to calculate previous balances with aggregate query:', error)
      // フォールバック: 既存の方法に戻す（エラー時のみ）
      // 通常は発生しないが、念のため
      throw new Error('前月残高の計算に失敗しました')
    }
    console.timeEnd('previous-balance-aggregate')

    console.time('processing-logic')

    // 全利用者の取引を統合し、利用者名を含める
    const allTransactions: Array<{
      id: number
      transactionDate: string
      transactionType: string
      amount: number
      description: string | null
      payee: string | null
      reason: string | null
      balance: number
      residentId: number
      residentName: string
    }> = []

    facility.residents.forEach(resident => {
      // 前月の残高を取得
      const previousBalance = previousBalances.get(resident.id) || 0
      
      // 当月の取引から累積残高を計算（前月の残高から開始）
      let currentBalance = previousBalance
      const transactionsWithBalance = resident.transactions.map(transaction => {
        // 通常の入金・出金は計算に含める
        if (transaction.transactionType === 'in') {
          currentBalance += transaction.amount
        } else if (transaction.transactionType === 'out') {
          currentBalance -= transaction.amount
        } else if (transaction.transactionType === 'past_correct_in') {
          // 過去訂正入金は計算に含める
          currentBalance += transaction.amount
        } else if (transaction.transactionType === 'past_correct_out') {
          // 過去訂正出金は計算に含める
          currentBalance -= transaction.amount
        }
        // correct_in と correct_out は計算しない（打ち消し処理）
        
        return {
          id: transaction.id,
          transactionDate: transaction.transactionDate.toISOString(),
          transactionType: transaction.transactionType,
          amount: transaction.amount,
          description: transaction.description,
          payee: transaction.payee,
          reason: transaction.reason,
          balance: currentBalance,
          residentId: resident.id,
          residentName: resident.name,
        }
      })

      allTransactions.push(...transactionsWithBalance)
    })

    // 日付順にソート（同じ日付の場合はID順）
    allTransactions.sort((a, b) => {
      const dateA = new Date(a.transactionDate).getTime()
      const dateB = new Date(b.transactionDate).getTime()
      if (dateA !== dateB) return dateA - dateB
      return a.id - b.id
    })
    console.timeEnd('processing-logic')

    const response = NextResponse.json({
      transactions: allTransactions,
    })
    
    // SWRキャッシュ設定
    response.headers.set('Cache-Control', 'public, s-maxage=2, stale-while-revalidate=30')
    
    return response
  } catch (error) {
    console.error('Failed to fetch facility transactions:', error)
    return NextResponse.json({ error: 'Failed to fetch facility transactions' }, { status: 500 })
  }
}
