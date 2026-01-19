import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateBalanceUpToMonth } from '@/lib/balance'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get('year')) || new Date().getFullYear()
    const month = Number(searchParams.get('month')) || new Date().getMonth() + 1
    const facilityIdParam = searchParams.get('facilityId')
    const facilityId = facilityIdParam ? Number(facilityIdParam) : null

    const facilities = await prisma.facility.findMany({
      where: {
        isActive: true,
        ...(facilityId ? { id: facilityId } : {}),
      },
      include: {
        residents: {
          where: { 
            isActive: true,
            endDate: null, // 終了日が設定されていない利用者のみ
          },
          include: {
            transactions: {
              orderBy: { transactionDate: 'asc' },
            },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    })

    const facilitySummaries = facilities.map(facility => {
      const totalAmount = facility.residents.reduce((sum, resident) => {
        return sum + calculateBalanceUpToMonth(resident.transactions, year, month)
      }, 0)
      return {
        id: facility.id,
        name: facility.name,
        totalAmount,
      }
    })

    const totalAmount = facilitySummaries.reduce((sum, f) => sum + f.totalAmount, 0)

    return NextResponse.json({
      totalAmount,
      facilities: facilitySummaries,
    })
  } catch (error) {
    console.error('Failed to fetch dashboard:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 })
  }
}

