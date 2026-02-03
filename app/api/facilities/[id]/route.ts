export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { validateId, validateMaxLength, MAX_LENGTHS } from '@/lib/validation'
import { Prisma } from '@prisma/client'

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
      // select を使用して必要なフィールドのみを取得（パフォーマンス最適化）
      const facility = await prisma.facility.findUnique({
        where: { id: facilityId },
        select: {
          id: true,
          name: true,
          units: {
            where: { 
              isActive: true,
              facilityId: facilityId, // 明示的に施設IDでフィルタリング
            },
            select: {
              id: true,
              name: true,
            },
            orderBy: { name: 'asc' },
          },
          residents: {
            where: {
              isActive: true,
              endDate: null, // 終了日が設定されていない利用者のみ
              facilityId: facilityId, // 明示的に施設IDでフィルタリング
            },
            select: {
              id: true,
              name: true,
              unitId: true,
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
      })

      if (!facility) {
        return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
      }

      // ユニット別・利用者別・施設別の残高をDB側で一括集計（パフォーマンス最適化）
      const targetDate = new Date(Number(year), Number(month), 0, 23, 59, 59, 999)
      interface BalanceRow {
        unitId: number | null
        residentId: number
        balance: number | string
      }

      const balancesRaw = await prisma.$queryRaw<BalanceRow[]>`
        SELECT 
          r."unitId",
          r.id as "residentId",
          COALESCE(SUM(
            CASE 
              WHEN t."transactionType" IN ('in', 'past_correct_in') THEN t.amount
              WHEN t."transactionType" IN ('out', 'past_correct_out') THEN -t.amount
              ELSE 0
            END
          ), 0) as balance
        FROM "Resident" r
        LEFT JOIN "Transaction" t ON t."residentId" = r.id
        WHERE r."facilityId" = ${facilityId}
          AND r."isActive" = true
          AND r."endDate" IS NULL
          AND (t."transactionDate" IS NULL OR t."transactionDate" <= ${targetDate})
          AND (t."transactionType" IS NULL OR t."transactionType" NOT IN ('correct_in', 'correct_out'))
        GROUP BY r."unitId", r.id
      `

      // ユニット別合計と利用者別残高を計算
      const unitBalancesMap = new Map<number, number>()
      const residentBalancesMap = new Map<number, number>()
      let facilityTotal = 0

      balancesRaw.forEach(row => {
        const balance = Number(row.balance)
        facilityTotal += balance
        residentBalancesMap.set(row.residentId, balance)
        if (row.unitId) {
          unitBalancesMap.set(row.unitId, (unitBalancesMap.get(row.unitId) || 0) + balance)
        }
      })

      // ユニット別合計
      const unitSummaries = facility.units.map(unit => ({
        id: unit.id,
        name: unit.name,
        totalAmount: unitBalancesMap.get(unit.id) || 0,
      }))

      // 表示用の利用者リスト（unitIdが指定されている場合は絞り込み）
      const displayResidents = unitId 
        ? facility.residents.filter(r => r.unitId === Number(unitId))
        : facility.residents

      // 利用者別残高（DB側で集計した結果を使用）
      const residentSummaries = displayResidents.map(resident => ({
        id: resident.id,
        name: resident.name,
        balance: residentBalancesMap.get(resident.id) || 0,
      }))

      // 施設合計（DB側で集計した結果を使用）
      const totalAmount = facilityTotal

      const response = NextResponse.json({
        facilityName: facility.name,
        totalAmount,
        units: unitSummaries,
        residents: residentSummaries,
      })
      
      // キャッシュヘッダーの追加（更新頻度が高いため短いキャッシュ時間）
      response.headers.set('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=59')
      
      return response
    }

    // 通常の施設取得（マスタ管理用など）
    const facility = await prisma.facility.findUnique({
      where: { id: facilityId },
    })

    if (!facility) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    const response = NextResponse.json(facility)
    
    // キャッシュヘッダーの追加
    response.headers.set('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=55')
    
    return response
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
