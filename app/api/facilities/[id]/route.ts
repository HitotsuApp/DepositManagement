export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { calculateBalanceUpToMonth } from '@/lib/balance'
import { validateId, validateMaxLength, MAX_LENGTHS } from '@/lib/validation'

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
              endDate: null, // 終了日が設定されていない利用者のみ
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
  const prisma = getPrisma()
  try {
    const facilityId = validateId(params.id)
    if (!facilityId) {
      return NextResponse.json(
        { error: '無効なIDです' },
        { status: 400 }
      )
    }
    const body = await request.json()
    
    // バリデーション
    if (!body.name || body.name.trim() === '') {
      return NextResponse.json(
        { error: '施設名を入力してください' },
        { status: 400 }
      )
    }
    
    if (!validateMaxLength(body.name, MAX_LENGTHS.FACILITY_NAME)) {
      return NextResponse.json(
        { error: `施設名は${MAX_LENGTHS.FACILITY_NAME}文字以内で入力してください` },
        { status: 400 }
      )
    }
    
    if (body.positionName !== undefined && body.positionName !== null && !validateMaxLength(body.positionName, MAX_LENGTHS.POSITION_NAME)) {
      return NextResponse.json(
        { error: `役職名は${MAX_LENGTHS.POSITION_NAME}文字以内で入力してください` },
        { status: 400 }
      )
    }
    
    if (body.positionHolderName !== undefined && body.positionHolderName !== null && !validateMaxLength(body.positionHolderName, MAX_LENGTHS.POSITION_HOLDER_NAME)) {
      return NextResponse.json(
        { error: `役職者の名前は${MAX_LENGTHS.POSITION_HOLDER_NAME}文字以内で入力してください` },
        { status: 400 }
      )
    }

    const facility = await prisma.facility.update({
      where: { id: facilityId },
      data: {
        name: body.name.trim(),
        positionName: body.positionName !== undefined ? (body.positionName ? body.positionName.trim() : null) : undefined,
        positionHolderName: body.positionHolderName !== undefined ? (body.positionHolderName ? body.positionHolderName.trim() : null) : undefined,
        sortOrder: body.sortOrder !== undefined ? body.sortOrder : undefined,
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
  const prisma = getPrisma()
  try {
    const facilityId = validateId(params.id)
    if (!facilityId) {
      return NextResponse.json(
        { error: '無効なIDです' },
        { status: 400 }
      )
    }
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
