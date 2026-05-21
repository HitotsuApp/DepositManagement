export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { validateId } from '@/lib/validation'
import { sortResidentsForDisplay, type SortableResident, type SortableUnit } from '@/lib/sortOrder'
import { neonHttpSql } from '@/lib/neonHttpSql'
import {
  fetchResidentBalanceRows,
  fetchUnitsLiteForSort,
  probeFacilityExists,
  probeUnitExistsInFacility,
} from '@/lib/residentSummariesSql'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
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
    const sql = neonHttpSql()

    const [facilityOk, unitOk] = await Promise.all([
      probeFacilityExists(sql, facilityId),
      probeUnitExistsInFacility(sql, facilityId, unitIdNum),
    ])
    if (!facilityOk) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }
    if (!unitOk) {
      return NextResponse.json({ error: 'ユニットが見つかりません' }, { status: 404 })
    }

    const [residentRows, unitsLite] = await Promise.all([
      fetchResidentBalanceRows(sql, facilityId, unitIdNum, targetDate),
      fetchUnitsLiteForSort(sql, facilityId),
    ])

    if (residentRows.length === 0) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

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
