export const runtime = 'edge'

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { neonHttpSql } from '@/lib/neonHttpSql'
import {
  fetchActiveFacilitiesForDashboard,
  fetchFacilityBalancesForDashboard,
} from '@/lib/dashboardFacilityBalancesSql'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get('year')) || new Date().getFullYear()
    const month = Number(searchParams.get('month')) || new Date().getMonth() + 1
    const facilityIdParam = searchParams.get('facilityId')
    const facilityIdFilter =
      facilityIdParam !== null &&
      facilityIdParam !== '' &&
      Number.isInteger(Number(facilityIdParam)) &&
      Number(facilityIdParam) > 0
        ? Number(facilityIdParam)
        : null

    const targetDate = new Date(year, month, 0, 23, 59, 59, 999)
    const sql = neonHttpSql()

    const [facilities, facilityBalancesRaw] = await Promise.all([
      fetchActiveFacilitiesForDashboard(sql, facilityIdFilter),
      fetchFacilityBalancesForDashboard(sql, targetDate, facilityIdFilter),
    ])

    const facilityBalancesMap = new Map<number, number>()
    facilityBalancesRaw.forEach((row) => {
      facilityBalancesMap.set(row.facilityId, Number(row.balance))
    })

    const facilitySummaries = facilities.map((facility) => ({
      id: facility.id,
      name: facility.name,
      totalAmount: facilityBalancesMap.get(facility.id) || 0,
    }))

    const totalAmount = facilitySummaries.reduce((sum, f) => sum + f.totalAmount, 0)

    const response = NextResponse.json({
      totalAmount,
      facilities: facilitySummaries,
    })

    response.headers.set('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=59')

    return response
  } catch (error) {
    console.error('Failed to fetch dashboard:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch dashboard'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
