import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateBalance, filterTransactionsByMonth, calculateBalanceUpToMonth } from '@/lib/balance'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const residentId = Number(params.id)
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get('year')) || new Date().getFullYear()
    const month = Number(searchParams.get('month')) || new Date().getMonth() + 1

    const resident = await prisma.resident.findUnique({
      where: { id: residentId },
      include: {
        transactions: {
          orderBy: { transactionDate: 'asc' },
        },
      },
    })

    if (!resident) {
      return NextResponse.json({ error: 'Resident not found' }, { status: 404 })
    }

    // 指定年月までの累積残高を計算
    const balance = calculateBalanceUpToMonth(resident.transactions, year, month)

    // 全取引から累積残高を計算し、指定年月の取引のみをフィルタリング
    const allTransactionsWithBalance = calculateBalance(resident.transactions)
    const transactionsWithBalance = allTransactionsWithBalance.filter(t => {
      const transactionDate = new Date(t.transactionDate)
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0, 23, 59, 59, 999)
      return transactionDate >= startDate && transactionDate <= endDate
    })

    return NextResponse.json({
      residentName: resident.name,
      balance,
      transactions: transactionsWithBalance,
    })
  } catch (error) {
    console.error('Failed to fetch resident:', error)
    return NextResponse.json({ error: 'Failed to fetch resident' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const residentId = Number(params.id)
    const body = await request.json()

    const resident = await prisma.resident.update({
      where: { id: residentId },
      data: {
        facilityId: body.facilityId,
        unitId: body.unitId,
        name: body.name,
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
  try {
    const residentId = Number(params.id)
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
