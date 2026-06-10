/** まとめて入力・まとめて行入力用：取引 API をチャンク取得して論理一覧に結合 */

import { readJsonFromApi } from '@/lib/readJsonApiResponse'

/** チャンク1の既定サイズ（resume は同じ論理 limit でページング） */
export const BULK_TRANSACTIONS_CHUNK_LIMIT = 40

/** resume ページング無限ループ防止 */
export const BULK_RESUME_MAX_PAGES = 500

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

export type AppendRemainingTransactionOptions = RequestInit & {
  /** フェーズ4: resume チャンクごとの部分マージ結果（チャンク1先表示用） */
  onMergedUpdate?: (merged: FacilityTransactionPayload[]) => void
}

export function buildTransactionsUrl(
  facilityId: number,
  year: number,
  month: number,
  parts: Record<string, string | number | undefined>
): string {
  const u = new URL(`/api/facilities/${facilityId}/transactions`, 'http://local.invalid')
  u.searchParams.set('year', String(year))
  u.searchParams.set('month', String(month))
  for (const [k, v] of Object.entries(parts)) {
    if (v === undefined || v === '') continue
    u.searchParams.set(k, String(v))
  }
  return `${u.pathname}${u.search}`
}

/** GET /api/facilities/[id]/bulk-input-bootstrap（Phase2）の相対パス */
export function getBulkInputBootstrapPath(
  facilityId: number,
  year: number,
  month: number
): string {
  const q = new URLSearchParams({
    year: String(year),
    month: String(month),
  })
  return `/api/facilities/${facilityId}/bulk-input-bootstrap?${q}`
}

/** まとめて入力の prefetch 用：チャンク1の相対パス（bootstrap 不使用時フォールバック） */
export function getFacilityTransactionsChunk1Path(
  facilityId: number,
  year: number,
  month: number
): string {
  return buildTransactionsUrl(facilityId, year, month, {
    limit: BULK_TRANSACTIONS_CHUNK_LIMIT,
  })
}

export type AppendRemainingFacilityTransactionsResult = {
  transactions: FacilityTransactionPayload[]
  /** false のときは BULK_RESUME_MAX_PAGES 到達などで末尾が未ロード */
  fullyLoaded: boolean
}

/** チャンク1済み状態から resume をループ結合する */
export async function appendRemainingFacilityTransactions(
  mergedInitial: FacilityTransactionPayload[],
  initialHasMore: boolean,
  facilityId: number,
  year: number,
  month: number,
  options?: AppendRemainingTransactionOptions
): Promise<AppendRemainingFacilityTransactionsResult> {
  const limit = BULK_TRANSACTIONS_CHUNK_LIMIT
  let merged = [...mergedInitial]
  let hasMore = initialHasMore
  let page = 0

  while (hasMore && page < BULK_RESUME_MAX_PAGES) {
    page++
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

    const url = buildTransactionsUrl(facilityId, year, month, {
      resume: 1,
      limit,
      afterTransactionDate: afterDateStr,
      afterTransactionId: afterId,
    })

    const { onMergedUpdate: _, ...fetchRest } = (options ??
      {}) as AppendRemainingTransactionOptions
    void _

    const r = await fetch(url, fetchRest)
    const label = `取引一覧(resume/${page})`
    const d = await readJsonFromApi<TransactionsChunkResponse>(r, label)
    merged = merged.concat(d.transactions ?? [])
    options?.onMergedUpdate?.(merged)
    hasMore = !!d.hasMore
  }

  if (hasMore) {
    console.error(
      `appendRemainingFacilityTransactions: exceeded BULK_RESUME_MAX_PAGES (${BULK_RESUME_MAX_PAGES}) facilityId=${facilityId} ${year}-${month}`
    )
  }

  return { transactions: merged, fullyLoaded: !hasMore }
}

/**
 * `/api/facilities/:id/transactions` をチャンク1→resume をループで結合して返す。
 */
export async function fetchMergedFacilityTransactions(
  facilityId: number,
  year: number,
  month: number,
  fetchOptions?: AppendRemainingTransactionOptions
): Promise<FacilityTransactionPayload[]> {
  const firstUrl = getFacilityTransactionsChunk1Path(facilityId, year, month)

  const r1 = await fetch(firstUrl, fetchOptions)
  const d1 = await readJsonFromApi<TransactionsChunkResponse>(r1, '取引一覧(1)')
  let merged = [...(d1.transactions ?? [])]

  const result = await appendRemainingFacilityTransactions(
    merged,
    !!d1.hasMore,
    facilityId,
    year,
    month,
    fetchOptions
  )
  return result.transactions
}
