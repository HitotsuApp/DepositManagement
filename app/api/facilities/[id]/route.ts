export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { fetchFacilityMonthUnitBalances } from '@/lib/facilityUnitBalancesSql'
import { fetchFacilityByIdForApi } from '@/lib/facilityByIdSql'
import { getPrisma } from '@/lib/prisma'
import { neonHttpSql } from '@/lib/neonHttpSql'
import { validateId, validateMaxLength, MAX_LENGTHS } from '@/lib/validation'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
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
    // 施設詳細画面用のリクエスト（yearとmonthが指定されている場合）
    if (year && month) {
      const yearNum = Number(year)
      const monthNum = Number(month)
      if (
        !Number.isInteger(yearNum) ||
        yearNum < 1970 ||
        yearNum > 2100 ||
        !Number.isInteger(monthNum) ||
        monthNum < 1 ||
        monthNum > 12
      ) {
        return NextResponse.json(
          { error: 'year, month が不正です' },
          { status: 400 }
        )
      }

      const targetDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999)
      if (Number.isNaN(targetDate.getTime())) {
        return NextResponse.json({ error: '指定日付が無効です' }, { status: 400 })
      }

      const rows = await fetchFacilityMonthUnitBalances(facilityId, targetDate)

      if (!rows.length || rows[0].facilityName === null || rows[0].facilityName === undefined) {
        return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
      }

      const facilityName = rows[0].facilityName

      let totalAmount = 0
      const unitSummaries: { id: number; name: string; totalAmount: number }[] = []
      for (const row of rows) {
        if (row.unitId == null || row.unitName == null) continue
        const b = Number(row.balance)
        totalAmount += b
        unitSummaries.push({
          id: row.unitId,
          name: row.unitName,
          totalAmount: b,
        })
      }

      const response = NextResponse.json({
        facilityName,
        totalAmount,
        units: unitSummaries,
      })
      
      // キャッシュヘッダーの追加（更新頻度が高いため短いキャッシュ時間）
      response.headers.set('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=59')
      
      return response
    }

    // 通常の施設取得（マスタ管理用など）
    const sql = neonHttpSql()
    const facility = await fetchFacilityByIdForApi(sql, facilityId)

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

    if (body.noticeTemplateNormal != null && body.noticeTemplateNormal !== '' && !validateMaxLength(body.noticeTemplateNormal, MAX_LENGTHS.NOTICE_TEMPLATE)) {
      return NextResponse.json(
        { error: `【通常】お知らせテンプレートは${MAX_LENGTHS.NOTICE_TEMPLATE}文字以内で入力してください` },
        { status: 400 }
      )
    }

    if (body.noticeTemplateMoveOut != null && body.noticeTemplateMoveOut !== '' && !validateMaxLength(body.noticeTemplateMoveOut, MAX_LENGTHS.NOTICE_TEMPLATE)) {
      return NextResponse.json(
        { error: `【退居】お知らせテンプレートは${MAX_LENGTHS.NOTICE_TEMPLATE}文字以内で入力してください` },
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
        useSameOrderForDisplayAndPrint: body.useSameOrderForDisplayAndPrint !== undefined ? body.useSameOrderForDisplayAndPrint : undefined,
        useUnitOrderForPrint: body.useUnitOrderForPrint !== undefined ? body.useUnitOrderForPrint : undefined,
        residentDisplaySortMode: body.residentDisplaySortMode !== undefined ? (body.residentDisplaySortMode === "aiueo" ? "aiueo" : "manual") : undefined,
        residentPrintSortMode: body.residentPrintSortMode !== undefined ? (body.residentPrintSortMode === "aiueo" ? "aiueo" : "manual") : undefined,
        noticeTemplateNormal: body.noticeTemplateNormal !== undefined ? (body.noticeTemplateNormal !== null && body.noticeTemplateNormal !== '' ? body.noticeTemplateNormal : null) : undefined,
        noticeTemplateMoveOut: body.noticeTemplateMoveOut !== undefined ? (body.noticeTemplateMoveOut !== null && body.noticeTemplateMoveOut !== '' ? body.noticeTemplateMoveOut : null) : undefined,
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
