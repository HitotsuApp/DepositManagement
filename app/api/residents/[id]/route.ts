export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { calculateBalance, calculateBalanceUpToMonth } from '@/lib/balance'
import { validateId, validateMaxLength, validateSortOrder, MAX_LENGTHS, NAME_PREFIX_DISPLAY_OPTIONS } from '@/lib/validation'
import { sanitizeFurigana } from '@/lib/furigana'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const prisma = getPrisma()
  try {
    const residentId = validateId(params.id)
    if (!residentId) {
      return NextResponse.json(
        { error: '無効なIDです' },
        { status: 400 }
      )
    }
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get('year')) || new Date().getFullYear()
    const month = Number(searchParams.get('month')) || new Date().getMonth() + 1

    // select を使用して必要なフィールドのみを取得（パフォーマンス最適化）
    const resident = await prisma.resident.findUnique({
      where: { id: residentId },
      select: {
        id: true,
        name: true,
        nameFurigana: true,
        facilityId: true,
        displayNamePrefix: true,
        namePrefixDisplayOption: true,
        transactions: {
          select: {
            id: true,
            transactionDate: true,
            transactionType: true,
            amount: true,
            description: true,
            payee: true,
            reason: true,
            createdAt: true,
            residentId: true,
          },
          orderBy: [{ transactionDate: 'asc' }, { id: 'asc' }],
        },
      },
    })

    if (!resident) {
      return NextResponse.json({ error: 'Resident not found' }, { status: 404 })
    }

    // 指定年月までの累積残高を計算
    const balance = calculateBalanceUpToMonth(resident.transactions as any, year, month)

    // 全取引から累積残高を計算し、指定年月の取引のみをフィルタリング
    const allTransactionsWithBalance = calculateBalance(resident.transactions as any)
    const monthTransactions = allTransactionsWithBalance.filter(t => {
      const transactionDate = new Date(t.transactionDate)
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0, 23, 59, 59, 999)
      return transactionDate >= startDate && transactionDate <= endDate
    })

    // 前月末残高（PDF の「前月より繰越」と同じ計算ルール）
    const prevYear = month === 1 ? year - 1 : year
    const prevMonth = month === 1 ? 12 : month - 1
    const previousMonthBalance = calculateBalanceUpToMonth(
      resident.transactions as any,
      prevYear,
      prevMonth
    )

    let transactionsWithBalance = monthTransactions
    if (previousMonthBalance !== 0) {
      const previousMonthEnd = new Date(year, month - 1, 0, 23, 59, 59, 999)
      transactionsWithBalance = [
        {
          id: -1,
          transactionDate: previousMonthEnd,
          transactionType: previousMonthBalance > 0 ? 'in' : 'out',
          amount: Math.abs(previousMonthBalance),
          description: null,
          payee: null,
          reason: null,
          balance: previousMonthBalance,
          createdAt: previousMonthEnd,
          residentId,
          isCarryOver: true,
        } as any,
        ...monthTransactions,
      ]
    }

    const response = NextResponse.json({
      residentName: resident.name,
      nameFurigana: resident.nameFurigana,
      displayNamePrefix: resident.displayNamePrefix,
      namePrefixDisplayOption: resident.namePrefixDisplayOption,
      facilityId: resident.facilityId,
      balance,
      transactions: transactionsWithBalance,
    })
    
    // キャッシュヘッダーの追加（更新頻度が高いため短いキャッシュ時間）
    response.headers.set('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=59')
    
    return response
  } catch (error) {
    console.error('Failed to fetch resident:', error)
    return NextResponse.json({ error: 'Failed to fetch resident' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const prisma = getPrisma()
  try {
    const residentId = validateId(params.id)
    if (!residentId) {
      return NextResponse.json(
        { error: '無効なIDです' },
        { status: 400 }
      )
    }
    const body = await request.json()
    
    // バリデーション
    if (!body.name || body.name.trim() === '') {
      return NextResponse.json(
        { error: '利用者名を入力してください' },
        { status: 400 }
      )
    }
    
    if (!validateMaxLength(body.name, MAX_LENGTHS.RESIDENT_NAME)) {
      return NextResponse.json(
        { error: `利用者名は${MAX_LENGTHS.RESIDENT_NAME}文字以内で入力してください` },
        { status: 400 }
      )
    }

    const displaySortOrder = body.displaySortOrder !== undefined ? validateSortOrder(body.displaySortOrder) : undefined
    const printSortOrder = body.printSortOrder !== undefined ? validateSortOrder(body.printSortOrder) : undefined
    // 空でない値が入力されたがバリデーションに失敗した場合のみエラー（null/''はクリアとして許可）
    const hasDisplayValue = body.displaySortOrder !== undefined && body.displaySortOrder !== null && body.displaySortOrder !== ''
    const hasPrintValue = body.printSortOrder !== undefined && body.printSortOrder !== null && body.printSortOrder !== ''
    if (hasDisplayValue && displaySortOrder === null) {
      return NextResponse.json(
        { error: '表示順は0以上の整数で入力してください' },
        { status: 400 }
      )
    }
    if (hasPrintValue && printSortOrder === null) {
      return NextResponse.json(
        { error: '印刷順は0以上の整数で入力してください' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {
      facilityId: body.facilityId,
      unitId: body.unitId,
      name: body.name.trim(),
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
    }
    if (displaySortOrder !== undefined) updateData.displaySortOrder = displaySortOrder
    if (printSortOrder !== undefined) updateData.printSortOrder = printSortOrder

    if (body.nameFurigana !== undefined) {
      const nameFuriganaRaw = body.nameFurigana
      updateData.nameFurigana = nameFuriganaRaw !== null && nameFuriganaRaw !== ""
        ? sanitizeFurigana(String(nameFuriganaRaw)).slice(0, MAX_LENGTHS.RESIDENT_NAME_FURIGANA) || null
        : null
      if (updateData.nameFurigana && (updateData.nameFurigana as string).length > MAX_LENGTHS.RESIDENT_NAME_FURIGANA) {
        return NextResponse.json(
          { error: `ふりがなは${MAX_LENGTHS.RESIDENT_NAME_FURIGANA}文字以内で入力してください` },
          { status: 400 }
        )
      }
    }

    const displayNamePrefix = body.displayNamePrefix !== undefined
      ? (body.displayNamePrefix?.trim() || null)
      : undefined
    if (displayNamePrefix !== undefined) {
      if (displayNamePrefix && !validateMaxLength(displayNamePrefix, MAX_LENGTHS.DISPLAY_NAME_PREFIX)) {
        return NextResponse.json(
          { error: `表示オプションの文言は${MAX_LENGTHS.DISPLAY_NAME_PREFIX}文字以内で入力してください` },
          { status: 400 }
        )
      }
      updateData.displayNamePrefix = displayNamePrefix
      updateData.namePrefixDisplayOption = displayNamePrefix
        ? (NAME_PREFIX_DISPLAY_OPTIONS.includes(body.namePrefixDisplayOption) ? body.namePrefixDisplayOption : 'both')
        : 'both'
    }

    const resident = await prisma.resident.update({
      where: { id: residentId },
      data: updateData as any,
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
  const prisma = getPrisma()
  try {
    const residentId = validateId(params.id)
    if (!residentId) {
      return NextResponse.json(
        { error: '無効なIDです' },
        { status: 400 }
      )
    }
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
