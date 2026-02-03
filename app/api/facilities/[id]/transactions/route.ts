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

    // 前月までの残高計算のために、各利用者の前月までの取引を取得
    // これは集計クエリで効率化できるが、残高計算のロジックが複雑なため、最小限のデータを取得
    const residentsForBalance = await prisma.resident.findMany({
      where: {
        facilityId,
        isActive: true,
      },
      select: {
        id: true,
        transactions: {
          where: {
            transactionDate: {
              lte: previousMonthEndDate,
            },
          },
          select: {
            transactionDate: true,
            transactionType: true,
            amount: true,
          },
          orderBy: { transactionDate: 'asc' },
        },
      },
    })
    console.timeEnd('main-query')

    if (!facility) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    console.time('processing-logic')
    // 前月までの残高を計算（各利用者ごと）
    const previousBalances = new Map<number, number>()
    residentsForBalance.forEach(resident => {
      let balance = 0
      resident.transactions.forEach(transaction => {
        if (transaction.transactionType === 'in') {
          balance += transaction.amount
        } else if (transaction.transactionType === 'out') {
          balance -= transaction.amount
        } else if (transaction.transactionType === 'past_correct_in') {
          balance += transaction.amount
        } else if (transaction.transactionType === 'past_correct_out') {
          balance -= transaction.amount
        }
        // correct_in と correct_out は計算しない（打ち消し処理）
      })
      previousBalances.set(resident.id, balance)
    })

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
