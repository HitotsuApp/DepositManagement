export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { calculateBalance, filterTransactionsByMonth } from '@/lib/balance'
import { validateId } from '@/lib/validation'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const prisma = getPrisma()
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

    // 施設内の全利用者とその取引を取得
    const facility = await prisma.facility.findUnique({
      where: { id: facilityId },
      include: {
        residents: {
          where: {
            isActive: true,
          },
          include: {
            transactions: {
              orderBy: { transactionDate: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
    })

    if (!facility) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

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
      // 全取引から累積残高を計算し、指定年月の取引のみをフィルタリング
      const allTransactionsWithBalance = calculateBalance(resident.transactions)
      const transactionsWithBalance = filterTransactionsByMonth(
        allTransactionsWithBalance,
        year,
        month
      )

      transactionsWithBalance.forEach(transaction => {
        allTransactions.push({
          ...transaction,
          transactionDate: transaction.transactionDate.toISOString(),
          residentId: resident.id,
          residentName: resident.name,
        })
      })
    })

    // 日付順にソート（同じ日付の場合はID順）
    allTransactions.sort((a, b) => {
      const dateA = new Date(a.transactionDate).getTime()
      const dateB = new Date(b.transactionDate).getTime()
      if (dateA !== dateB) return dateA - dateB
      return a.id - b.id
    })

    return NextResponse.json({
      transactions: allTransactions,
    })
  } catch (error) {
    console.error('Failed to fetch facility transactions:', error)
    return NextResponse.json({ error: 'Failed to fetch facility transactions' }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
