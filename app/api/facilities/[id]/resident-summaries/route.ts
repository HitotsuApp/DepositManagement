export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { validateId } from '@/lib/validation'
import { sortResidentsForDisplay, type SortableResident, type SortableUnit } from '@/lib/sortOrder'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const prisma = getPrisma()
  try {
    const facilityId = validateId(params.id)
    if (!facilityId) {
      return NextResponse.json({ error: '無効なIDです' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')
    const unitIdParam = searchParams.get('unitId')

    if (!yearParam || !monthParam || !unitIdParam) {
      return NextResponse.json(
        { error: 'year, month, unitId は必須です' },
        { status: 400 }
      )
    }

    const year = Number(yearParam)
    const month = Number(monthParam)
    const unitIdNum = validateId(unitIdParam)
    if (
      !unitIdNum ||
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      return NextResponse.json({ error: 'パラメータが不正です' }, { status: 400 })
    }

    const targetDate = new Date(year, month, 0, 23, 59, 59, 999)

    /** 並び順に施設フラグまで含めていたため、そのまま同じクエリ結果から拾うには Facility 名下行が最低1必要 */
    const [facilityProbe, unitProbe] = await Promise.all([
      prisma.facility.findUnique({ where: { id: facilityId }, select: { id: true } }),
      prisma.unit.findFirst({
        where: { id: unitIdNum, facilityId, isActive: true },
        select: { id: true },
      }),
    ])
    if (!facilityProbe) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }
    if (!unitProbe) {
      return NextResponse.json({ error: 'ユニットが見つかりません' }, { status: 404 })
    }

    /** 利用者一覧＋月末時点残高を生 SQL で取得（findUnique の大口 include は使わない） */
    interface ResidentRow {
      residentDisplaySortMode: string | null
      useUnitOrderForPrint: boolean | null
      residentId: number | null
      name: string | null
      nameFurigana: string | null
      unitId: number | null
      displaySortOrder: number | null
      printSortOrder: number | null
      displayNamePrefix: string | null
      namePrefixDisplayOption: string | null
      balance: unknown
    }

    const residentRows = await prisma.$queryRaw<ResidentRow[]>`
      SELECT
        f."residentDisplaySortMode",
        f."useUnitOrderForPrint",
        r.id AS "residentId",
        r.name,
        r."nameFurigana",
        r."unitId",
        r."displaySortOrder",
        r."printSortOrder",
        r."displayNamePrefix",
        r."namePrefixDisplayOption",
        COALESCE((
          SELECT SUM(CASE
            WHEN t_inner."transactionType" IN ('in', 'past_correct_in') THEN t_inner.amount
            WHEN t_inner."transactionType" IN ('out', 'past_correct_out') THEN -t_inner.amount
            ELSE 0 END)
          FROM "Transaction" t_inner
          WHERE t_inner."residentId" = r.id
            AND (
              t_inner."transactionType" IS NULL
              OR t_inner."transactionType" NOT IN ('correct_in', 'correct_out')
            )
            AND (
              t_inner."transactionDate" <= ${targetDate}
            )
        ), 0) AS balance
      FROM "Facility" f
      LEFT JOIN "Resident" r ON r."facilityId" = ${facilityId}
        AND r."unitId" = ${unitIdNum}
        AND r."isActive" = true
        AND r."endDate" IS NULL
      WHERE f.id = ${facilityId}
      ORDER BY r.id ASC NULLS LAST
    `

    /** 競合状態で施設削除直後のみ想定される */
    if (residentRows.length === 0) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    /** 並び順用ユニット（findUnique の大口 include は使わず最小列のみ） */
    const unitsLite = await prisma.unit.findMany({
      where: { facilityId, isActive: true },
      select: {
        id: true,
        name: true,
        displaySortOrder: true,
        printSortOrder: true,
      },
      orderBy: [{ displaySortOrder: 'asc' }, { id: 'asc' }],
    })

    const residentDisplaySortMode = residentRows[0].residentDisplaySortMode ?? null
    const useUnitOrder =
      residentRows[0].useUnitOrderForPrint ??
      /** @remarks 画面の並びにも施設フラグどおり適用していたため踏襲 */ true

    type ResidentForSort = {
      id: number
      name: string
      nameFurigana?: string | null
      unitId: number | null
      displaySortOrder: number | null
      printSortOrder: number | null
      displayNamePrefix?: string | null
      namePrefixDisplayOption?: string | null
      balanceNum: number
    }

    const residentsForSort: ResidentForSort[] = []
    for (const row of residentRows) {
      if (row.residentId == null) continue
      residentsForSort.push({
        id: row.residentId,
        name: row.name ?? '',
        nameFurigana: row.nameFurigana,
        unitId: row.unitId,
        displaySortOrder: row.displaySortOrder,
        printSortOrder: row.printSortOrder,
        displayNamePrefix: row.displayNamePrefix,
        namePrefixDisplayOption: row.namePrefixDisplayOption,
        balanceNum: Number(row.balance),
      })
    }

    const sortedResidents = sortResidentsForDisplay(
      residentsForSort as unknown as SortableResident[],
      unitsLite as unknown as SortableUnit[],
      useUnitOrder,
      residentDisplaySortMode === 'aiueo' ? 'aiueo' : 'manual'
    ) as ResidentForSort[]

    const residents = sortedResidents.map((resident) => ({
      id: resident.id,
      name: resident.name,
      displayNamePrefix: resident.displayNamePrefix,
      namePrefixDisplayOption: resident.namePrefixDisplayOption,
      balance: resident.balanceNum ?? 0,
    }))

    const response = NextResponse.json({ residents })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.error('Failed to fetch resident summaries:', error)
    return NextResponse.json({ error: 'Failed to fetch resident summaries' }, { status: 500 })
  }
}
