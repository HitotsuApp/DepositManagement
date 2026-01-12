import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateBalanceUpToMonth } from '@/lib/balance'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const facilityId = Number(params.id)
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const unitId = searchParams.get('unitId')

    // 施設詳細画面用のリクエスト（yearとmonthが指定されている場合）
    if (year && month) {
      // ユニット別合計の計算には全ての利用者が必要なため、unitIdでフィルタリングせずに取得
      const facility = await prisma.facility.findUnique({
        where: { id: facilityId },
        include: {
          units: {
            where: { 
              isActive: true,
              facilityId: facilityId, // 明示的に施設IDでフィルタリング
            },
            orderBy: { name: 'asc' },
          },
          residents: {
            where: {
              isActive: true,
              facilityId: facilityId, // 明示的に施設IDでフィルタリング
            },
            include: {
              transactions: {
                orderBy: { transactionDate: 'asc' },
              },
            },
          },
        },
      })

      if (!facility) {
        return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
      }

      // ユニット別合計（全ての利用者を使用して計算）
      const unitSummaries = facility.units.map(unit => {
        const unitResidents = facility.residents.filter(r => r.unitId === unit.id)
        const totalAmount = unitResidents.reduce((sum, resident) => {
          return sum + calculateBalanceUpToMonth(resident.transactions, Number(year), Number(month))
        }, 0)
        return {
          id: unit.id,
          name: unit.name,
          totalAmount,
        }
      })

      // 表示用の利用者リスト（unitIdが指定されている場合は絞り込み）
      const displayResidents = unitId 
        ? facility.residents.filter(r => r.unitId === Number(unitId))
        : facility.residents

      // 利用者別残高（表示用の利用者リストから計算）
      const residentSummaries = displayResidents.map(resident => {
        const balance = calculateBalanceUpToMonth(resident.transactions, Number(year), Number(month))
        return {
          id: resident.id,
          name: resident.name,
          balance,
        }
      })

      // 施設合計（常に全利用者の合計を表示）
      const totalAmount = facility.residents.reduce((sum, resident) => {
        return sum + calculateBalanceUpToMonth(resident.transactions, Number(year), Number(month))
      }, 0)

      return NextResponse.json({
        facilityName: facility.name,
        totalAmount,
        units: unitSummaries,
        residents: residentSummaries,
      })
    }

    // 通常の施設取得（マスタ管理用など）
    const facility = await prisma.facility.findUnique({
      where: { id: facilityId },
    })

    if (!facility) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    return NextResponse.json(facility)
  } catch (error) {
    console.error('Failed to fetch facility:', error)
    return NextResponse.json({ error: 'Failed to fetch facility' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const facilityId = Number(params.id)
    const body = await request.json()

    const facility = await prisma.facility.update({
      where: { id: facilityId },
      data: {
        name: body.name,
        positionName: body.positionName !== undefined ? body.positionName : null,
        positionHolderName: body.positionHolderName !== undefined ? body.positionHolderName : null,
        sortOrder: body.sortOrder !== undefined ? body.sortOrder : 0,
      },
    })

    return NextResponse.json(facility)
  } catch (error) {
    console.error('Failed to update facility:', error)
    return NextResponse.json({ error: 'Failed to update facility' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const facilityId = Number(params.id)
    const body = await request.json()

    const facility = await prisma.facility.update({
      where: { id: facilityId },
      data: {
        isActive: body.isActive !== undefined ? body.isActive : false,
      },
    })

    return NextResponse.json(facility)
  } catch (error) {
    console.error('Failed to update facility status:', error)
    return NextResponse.json({ error: 'Failed to update facility status' }, { status: 500 })
  }
}
