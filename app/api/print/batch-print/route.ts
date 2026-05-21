export const runtime = 'edge';
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { fetchFacilityWithActiveUnitsForPrint } from '@/lib/printFacilitySql'
import { loadResidentsForDepositPrint } from '@/lib/residentPrintEligibility'
import { buildDepositPrintRawWire } from '@/lib/toDepositPrintRawWire'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const facilityId = searchParams.get('facilityId')
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    if (!facilityId || !year || !month) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    const fid = Number(facilityId)
    const y = Number(year)
    const m = Number(month)

    const facility = await fetchFacilityWithActiveUnitsForPrint(fid)

    if (!facility) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    const { residents, openingBalancesThruPreviousMonthEnd } =
      await loadResidentsForDepositPrint(fid, y, m, null)

    const body = buildDepositPrintRawWire(
      facility,
      residents,
      openingBalancesThruPreviousMonthEnd
    )
    return NextResponse.json(body)
  } catch (error) {
    console.error('Failed to generate batch print data:', error)
    return NextResponse.json(
      { error: 'Failed to generate batch print data' },
      { status: 500 }
    )
  }
}
