export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { validateMaxLength, validateSortOrder, MAX_LENGTHS, NAME_PREFIX_DISPLAY_OPTIONS } from '@/lib/validation'
import { sanitizeFurigana } from '@/lib/furigana'

export async function GET(request: Request) {
  console.time('prisma-init')
  const prisma = getPrisma()
  console.timeEnd('prisma-init')

  try {
    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const facilityIdParam = searchParams.get('facilityId')
    const facilityId = facilityIdParam ? Number(facilityIdParam) : null

    console.time('main-query')
    // 必要なフィールドのみをselectで取得
    const residents = await prisma.resident.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(facilityId ? { facilityId } : {}),
      },
      select: {
        id: true,
        name: true,
        nameFurigana: true,
        facilityId: true,
        unitId: true,
        displaySortOrder: true,
        printSortOrder: true,
        displayNamePrefix: true,
        namePrefixDisplayOption: true,
        isActive: true,
        startDate: true,
        endDate: true,
        facility: {
          select: {
            id: true,
            name: true,
          },
        },
        unit: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ displaySortOrder: 'asc' }, { id: 'asc' }],
    })
    console.timeEnd('main-query')

    const response = NextResponse.json(residents)
    
    // キャッシュヘッダーの追加
    response.headers.set('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=55')
    
    return response
  } catch (error) {
    console.error('Failed to fetch residents:', error)
    return NextResponse.json({ error: 'Failed to fetch residents' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const prisma = getPrisma()
  try {
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
    
    const displaySortOrder = validateSortOrder(body.displaySortOrder)
    const printSortOrder = validateSortOrder(body.printSortOrder)

    const nameFuriganaRaw = body.nameFurigana !== undefined ? body.nameFurigana : null
    const nameFurigana = nameFuriganaRaw !== null && nameFuriganaRaw !== ""
      ? sanitizeFurigana(String(nameFuriganaRaw)).slice(0, MAX_LENGTHS.RESIDENT_NAME_FURIGANA) || null
      : null
    if (nameFurigana && nameFurigana.length > MAX_LENGTHS.RESIDENT_NAME_FURIGANA) {
      return NextResponse.json(
        { error: `ふりがなは${MAX_LENGTHS.RESIDENT_NAME_FURIGANA}文字以内で入力してください` },
        { status: 400 }
      )
    }

    const displayNamePrefix = body.displayNamePrefix?.trim() || null
    if (displayNamePrefix && !validateMaxLength(displayNamePrefix, MAX_LENGTHS.DISPLAY_NAME_PREFIX)) {
      return NextResponse.json(
        { error: `表示オプションの文言は${MAX_LENGTHS.DISPLAY_NAME_PREFIX}文字以内で入力してください` },
        { status: 400 }
      )
    }
    const namePrefixDisplayOption = NAME_PREFIX_DISPLAY_OPTIONS.includes(body.namePrefixDisplayOption)
      ? body.namePrefixDisplayOption
      : 'both'

    const resident = await prisma.resident.create({
      data: {
        facilityId: body.facilityId,
        unitId: body.unitId,
        name: body.name.trim(),
        nameFurigana,
        displaySortOrder,
        printSortOrder,
        displayNamePrefix: displayNamePrefix || null,
        namePrefixDisplayOption: displayNamePrefix ? namePrefixDisplayOption : 'both',
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        isActive: body.isActive !== undefined ? body.isActive : true,
      },
    })
    return NextResponse.json(resident)
  } catch (error) {
    console.error('Failed to create resident:', error)
    return NextResponse.json({ error: 'Failed to create resident' }, { status: 500 })
  }
}

