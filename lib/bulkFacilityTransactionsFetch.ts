/** まとめて入力・まとめて行入力用：取引 API をチャンク取得して論理一覧に結合 */

import { readJsonFromApi } from '@/lib/readJsonApiResponse'

export const BULK_TRANSACTIONS_CHUNK_LIMIT = 10

/** 継続取得の開始位置が「先頭の取引」（繰越のみの第1チャンクの直後）を表すカーソル */
export const BULK_TRANSACTIONS_CURSOR_SENTINEL_DATE = new Date(
  Date.UTC(1970, 0, 1, 0, 0, 0, 0)
).toISOString()
export const BULK_TRANSACTIONS_CURSOR_SENTINEL_ID = 0

export interface FacilityTransactionPayload {
  id: number
  transactionDate: string
  transactionType: string
  amount: number
  description: string | null
  payee: string | null
  reason: string | null
  balance: number
  facilityBalance: number
  residentId: number
  residentName: string
  isCarryOver?: boolean
}

type TransactionsChunkResponse = {
  transactions?: FacilityTransactionPayload[]
  hasMore?: boolean
}

export function buildTransactionsUrl(
  facilityId: number,
  year: number,
  month: number,
  parts: Record<string, string | number | undefined>
): string {
  const u = new URL(
    `/api/facilities/${facilityId}/transactions`,
    'http://local.invalid'
  )
  u.searchParams.set('year', String(year))
  u.searchParams.set('month', String(month))
  for (const [k, v] of Object.entries(parts)) {
    if (v === undefined || v === '') continue
    u.searchParams.set(k, String(v))
  }
  return `${u.pathname}${u.search}`
}

/** まとめて入力の prefetch 用など：チャンク1の相対パス */
export function getFacilityTransactionsChunk1Path(
  facilityId: number,
  year: number,
  month: number
): string {
  return buildTransactionsUrl(facilityId, year, month, {
    limit: BULK_TRANSACTIONS_CHUNK_LIMIT,
  })
}

/**
 * `/api/facilities/:id/transactions` をチャンク1→hasMore 時のみチャンク2 で取得してマージした配列を返す。
 */
export async function fetchMergedFacilityTransactions(
  facilityId: number,
  year: number,
  month: number,
  fetchOptions?: RequestInit
): Promise<FacilityTransactionPayload[]> {
  const firstUrl = getFacilityTransactionsChunk1Path(facilityId, year, month)

  const r1 = await fetch(firstUrl, fetchOptions)
  const d1 = await readJsonFromApi<TransactionsChunkResponse>(r1, '取引一覧(1/2)')
  let merged = [...(d1.transactions ?? [])]

  if (!d1.hasMore) {
    return merged
  }

  const realTxns = merged.filter((t) => !(t as { isCarryOver?: boolean }).isCarryOver)
  let afterDateStr: string
  let afterId: number

  const lastReal = realTxns[realTxns.length - 1]
  if (lastReal) {
    afterDateStr = lastReal.transactionDate
    afterId = lastReal.id
  } else {
    afterDateStr = BULK_TRANSACTIONS_CURSOR_SENTINEL_DATE
    afterId = BULK_TRANSACTIONS_CURSOR_SENTINEL_ID
  }

  const secondUrl = buildTransactionsUrl(facilityId, year, month, {
    resume: 1,
    afterTransactionDate: afterDateStr,
    afterTransactionId: afterId,
  })

  const r2 = await fetch(secondUrl, fetchOptions)
  const d2 = await readJsonFromApi<TransactionsChunkResponse>(r2, '取引一覧(2/2)')

  merged = merged.concat(d2.transactions ?? [])
  return merged
}
