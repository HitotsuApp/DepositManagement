'use client'

import type { FrequentDescription } from '@/lib/bulkInputTransactionFilters'

export type BulkInputTransactionFiltersToolbarProps = {
  frequentDescriptions: FrequentDescription[]
  exactDescription: string
  onExactDescriptionChange: (next: string) => void
  keyword: string
  onKeywordChange: (next: string) => void
  /** 現在のフィルタ結果の件数（繰越行を含む） */
  displayCount: number
  /** フィルタ前の当月明細の件数 */
  totalCount: number
}

export function BulkInputTransactionFiltersToolbar({
  frequentDescriptions,
  exactDescription,
  onExactDescriptionChange,
  keyword,
  onKeywordChange,
  displayCount,
  totalCount,
}: BulkInputTransactionFiltersToolbarProps) {
  return (
    <div className="mb-0 border-b border-gray-200 px-3 py-3 flex flex-wrap items-end gap-x-5 gap-y-2 bg-gray-50 text-sm">
      <div className="min-w-[12rem] flex-1 max-w-xs">
        <label className="mb-1 block text-xs font-medium text-gray-600">
          摘要（同月に2件以上あるものから選択）
        </label>
        <select
          value={exactDescription}
          onChange={(e) => onExactDescriptionChange(e.target.value)}
          className="w-full rounded border px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
        >
          <option value="">すべて表示</option>
          {frequentDescriptions.map(({ description, count }) => (
            <option key={description} value={description}>
              {description.length > 60 ? `${description.slice(0, 60)}…` : description}（{count}件）
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[14rem] flex-1 max-w-md">
        <label className="mb-1 block text-xs font-medium text-gray-600">
          キーワード（摘要・利用者名・支払先・理由のいずれかに部分一致）
        </label>
        <input
          type="search"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          maxLength={80}
          placeholder="例: 田中、レクリエーション"
          lang="ja"
          className="w-full rounded border px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
        />
      </div>
      <p className="text-xs tabular-nums text-gray-600 pb-1.5 whitespace-nowrap" aria-live="polite">
        表示中 {displayCount} / {totalCount} 件
      </p>
    </div>
  )
}
