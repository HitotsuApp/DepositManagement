/**
 * `/api/facilities/[id]/transactions` と bulk-input-bootstrap が共有する
 * 「チャンク1 joined 結果 → API 応答ペイロード」組み立て。
 */

import type { FacilityTransactionPayload } from '@/lib/bulkFacilityTransactionsFetch'
import { getResidentDisplayName } from '@/lib/displayName'
import type {
  ChunkScalarsRow,
  TransactionWithBalanceLedgerRow,
} from '@/lib/facilityBulkTransactionsLedgerSql'

export function mapFacilityLedgerBalancedRowsToBulkPayload(
  rows: TransactionWithBalanceLedgerRow[]
): FacilityTransactionPayload[] {
  return rows.map((t) => {
    let txIso: string
    if (t.transactionDate instanceof Date) txIso = t.transactionDate.toISOString()
    else {
      const p = new Date(t.transactionDate)
      txIso = Number.isNaN(p.getTime())
        ? String(t.transactionDate)
        : p.toISOString()
    }

    return {
      id: t.id,
      transactionDate: txIso,
      transactionType: t.transactionType,
      amount: t.amount,
      description: t.description,
      payee: t.payee,
      reason: t.reason,
      balance: Number(t.balance),
      facilityBalance: Number(t.facility_balance),
      residentId: t.residentId,
      residentName: getResidentDisplayName(
        {
          name: t.residentName,
          displayNamePrefix: t.res_dsp_prefix ?? null,
          namePrefixDisplayOption: t.res_dsp_opt ?? null,
        },
        'screen'
      ),
    }
  })
}

/** joinedRows が空でも呼び出せる（クエリ異常検知）。先頭スカラー行が必須。 */
export function assembleFacilityTransactionsChunk1FromJoinedRows(
  joinedRows: ChunkScalarsRow[],
  limitLogical: number,
  year: number,
  month: number
): { transactions: FacilityTransactionPayload[]; hasMore: boolean } {
  if (joinedRows.length === 0) {
    throw new Error('assembleFacilityTransactionsChunk1FromJoinedRows: empty joinedRows')
  }
  const sample = joinedRows[0]
  const facilityOpeningTotal = Number(sample.opening_total)
  const totalTxnInMonth = Number(sample.month_txn_total)
  const carryoverSlots = facilityOpeningTotal !== 0 ? 1 : 0
  const effectiveTxnLimit = Math.max(0, limitLogical - carryoverSlots)

  const txnPayloadRows: TransactionWithBalanceLedgerRow[] = joinedRows
    .filter((r): r is ChunkScalarsRow & { id: number } => r.id != null)
    .map(({ opening_total: _o, month_txn_total: _m, ...row }) => row)

  let payload = mapFacilityLedgerBalancedRowsToBulkPayload(txnPayloadRows)

  if (facilityOpeningTotal !== 0) {
    const previousMonthEnd = new Date(year, month - 1, 0, 23, 59, 59, 999)
    payload = [
      {
        id: -1,
        transactionDate: previousMonthEnd.toISOString(),
        transactionType: 'carryover_facility',
        amount: 0,
        description: null,
        payee: null,
        reason: null,
        balance: 0,
        facilityBalance: facilityOpeningTotal,
        residentId: -1,
        residentName: '',
        isCarryOver: true,
      },
      ...payload,
    ]
  }

  const hasMore = totalTxnInMonth > effectiveTxnLimit
  return { transactions: payload, hasMore }
}
