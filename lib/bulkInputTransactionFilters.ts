/** まとめて入力の明細テーブル：摘要候補の集計・表示用フィルタ（クライアントのみ） */

export type BulkFilterableTransaction = {
  description: string | null | undefined
  isCarryOver?: boolean | undefined
  residentName?: string | undefined
  payee?: string | null | undefined
  reason?: string | null | undefined
}

export type FrequentDescription = {
  /** trim 済み摘要（リスト表示・完全一致に使用） */
  description: string
  count: number
}

/** 繰越行以外で、摘要が空でなく、頻度 minCount 以上の摘要を収集して返す（訂正行も通常と同様にカウント） */
export function getFrequentDescriptions<T extends BulkFilterableTransaction>(
  transactions: T[],
  opts?: { minCount?: number }
): FrequentDescription[] {
  const minCount = opts?.minCount ?? 2
  const counts = new Map<string, number>()

  for (const t of transactions) {
    if (t.isCarryOver === true) continue
    const d = typeof t.description === 'string' ? t.description.trim() : ''
    if (!d) continue
    counts.set(d, (counts.get(d) ?? 0) + 1)
  }

  const out: FrequentDescription[] = []
  for (const [description, count] of counts.entries()) {
    if (count >= minCount) {
      out.push({ description, count })
    }
  }

  out.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.description.localeCompare(b.description, 'ja')
  })
  return out
}

function rowMatchesKeyword(row: BulkFilterableTransaction, keywordTrimmed: string): boolean {
  if (!keywordTrimmed) return true
  const desc = typeof row.description === 'string' ? row.description.trim() : ''
  if (desc.includes(keywordTrimmed)) return true
  const rn = typeof row.residentName === 'string' ? row.residentName : ''
  if (rn.includes(keywordTrimmed)) return true
  const py = typeof row.payee === 'string' ? row.payee.trim() : ''
  if (py.includes(keywordTrimmed)) return true
  const rs = typeof row.reason === 'string' ? row.reason.trim() : ''
  if (rs.includes(keywordTrimmed)) return true
  return false
}

export type FilterBulkInputTransactionsOptions = {
  /** trim 済み摘要との完全一致で絞る（null で未指定） */
  exactDescription: string | null
  /** 摘要・利用者名・支払先・理由への部分一致（trim 済み） */
  keyword: string
  /** 繰越行を結果の先頭に常に含める（フィルタが有効なとき） */
  alwaysIncludeCarryOver: boolean
}

/** フィルタ未指定時は transactions をそのまま返す */
export function filterBulkInputTransactions<T extends BulkFilterableTransaction>(
  transactions: T[],
  options: FilterBulkInputTransactionsOptions
): T[] {
  const rawExact = options.exactDescription != null ? options.exactDescription.trim() : ''
  const exactApplied = rawExact.length > 0
  const kw = typeof options.keyword === 'string' ? options.keyword.trim() : ''
  const keywordApplied = kw.length > 0

  if (!exactApplied && !keywordApplied) {
    return transactions
  }

  const carry = transactions.filter((t) => t.isCarryOver === true)
  const others = transactions.filter((t) => t.isCarryOver !== true)

  let filtered = others

  if (exactApplied) {
    filtered = filtered.filter((t) => {
      const d = typeof t.description === 'string' ? t.description.trim() : ''
      return d === rawExact
    })
  }

  if (keywordApplied) {
    filtered = filtered.filter((t) => rowMatchesKeyword(t, kw))
  }

  if (options.alwaysIncludeCarryOver && carry.length > 0) {
    return [...carry, ...filtered]
  }

  return filtered
}
