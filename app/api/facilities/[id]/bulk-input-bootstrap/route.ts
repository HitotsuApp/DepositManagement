export const runtime = 'edge'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { validateId } from '@/lib/validation'
import { neonHttpSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'
import {
  assembleFacilityTransactionsChunk1FromJoinedRows,
} from '@/lib/buildFacilityBulkTransactionsPayload'
import { BULK_TRANSACTIONS_CHUNK_LIMIT } from '@/lib/bulkFacilityTransactionsFetch'
import { sqlFacilityTransactionsFirstChunkJoined } from '@/lib/facilityBulkTransactionsLedgerSql'
import type { BulkInputBootstrapJson } from '@/lib/bulkInputBootstrapWire'
import { fetchResidentsByFacilityId } from '@/lib/residentsFacilityListSql'
import { fetchActiveUnitsMinimalByFacilityId } from '@/lib/unitsFacilityListSql'

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
    const year = Number(searchParams.get('year')) || new Date().getFullYear()
    const month = Number(searchParams.get('month')) || new Date().getMonth() + 1

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)
    const previousMonthEndDate = new Date(year, month - 1, 0, 23, 59, 59, 999)

    const sql = neonHttpSql()

    const [probeRows, residents, units, joinedRows] = await Promise.all([
      withTransientDbRetries(`bulkBootstrap.probe(${facilityId})`, async () => {
        return (await sql`SELECT id, name FROM "Facility" WHERE id = ${facilityId} LIMIT 1`) as {
          id: number
          name: string | null
        }[]
      }),
      fetchResidentsByFacilityId(facilityId, false),
      fetchActiveUnitsMinimalByFacilityId(facilityId),
      withTransientDbRetries(`bulkBootstrap.txChunk1(${facilityId})`, async () =>
        sqlFacilityTransactionsFirstChunkJoined(
          sql,
          facilityId,
          startDate,
          endDate,
          previousMonthEndDate,
          BULK_TRANSACTIONS_CHUNK_LIMIT
        )
      ),
    ])

    const facilityRow = probeRows[0]
    if (!facilityRow) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    const { transactions, hasMore } = assembleFacilityTransactionsChunk1FromJoinedRows(
      joinedRows,
      BULK_TRANSACTIONS_CHUNK_LIMIT,
      year,
      month
    )

    const body: BulkInputBootstrapJson = {
      facilityName: String(facilityRow.name ?? ''),
      residents,
      units,
      transactions,
      transactionsHasMore: hasMore,
    }

    const response = NextResponse.json(body)
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.error('bulk-input-bootstrap failed:', error)
    return NextResponse.json({ error: 'Failed to load bulk-input bootstrap' }, { status: 500 })
  }
}
