'use client'

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import MainLayout from '@/components/MainLayout'
import Toast from '@/components/Toast'
import FormattedAmountInput from '@/components/FormattedAmountInput'
import { useFacility } from '@/contexts/FacilityContext'
import { isValidDate } from '@/lib/validation'
import { validateTransactionCreateBody } from '@/lib/transactionCreateValidation'
import { invalidateTransactionCache, invalidateTransactionCacheForResidents } from '@/lib/cache'
import { getResidentDisplayName } from '@/lib/displayName'
import { halfWidthToFullWidthFormText } from '@/lib/japaneseWidth'
import {
  defaultInOutDateForNewRow,
  defaultPastCorrectDateForFacilityMonth,
  getInOutDateRange,
  getTransactionTypeLabel,
} from '@/lib/bulkInputPageUtils'
import { BUSINESS_TIME_ZONE, formatJapanCalendarDate, getZonedCalendarParts } from '@/lib/calendarDate'

interface Transaction {
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

type Resident = {
  id: number
  name: string
  displayNamePrefix?: string | null
  namePrefixDisplayOption?: string | null
  unitId: number | null
  unit: { id: number; name: string } | null
}

type DraftRow = {
  id: string
  residentId: string
  transactionDate: string
  transactionType: string
  amount: string
  description: string
  payee: string
  reason: string
  residentSearchQuery: string
  selectedUnitId: number | null
}

const MAX_BATCH = 100

function newDraftId(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function emptyDraftForView(
  isPastMonth: boolean,
  facilityYear: number,
  facilityMonth: number
): DraftRow {
  if (isPastMonth) {
    return {
      id: newDraftId(),
      residentId: '',
      transactionDate: defaultPastCorrectDateForFacilityMonth(facilityYear, facilityMonth),
      transactionType: 'past_correct_in',
      amount: '',
      description: '',
      payee: '',
      reason: '',
      residentSearchQuery: '',
      selectedUnitId: null,
    }
  }
  return {
    id: newDraftId(),
    residentId: '',
    transactionDate: defaultInOutDateForNewRow(),
    transactionType: 'in',
    amount: '',
    description: '',
    payee: '',
    reason: '',
    residentSearchQuery: '',
    selectedUnitId: null,
  }
}

function filterResidents(
  residents: Resident[],
  query: string,
  unitId: number | null
): Resident[] {
  let list = residents
  if (unitId !== null) list = list.filter((r) => r.unitId === unitId)
  if (query) list = list.filter((r) => r.name.includes(query))
  return list
}

/** canCorrect と同じ行のみコピー元にする（区分は in/out のみ想定） */
function normalizeCopiedTransactionType(type: string): string {
  if (type === 'correct_in') return 'in'
  if (type === 'correct_out') return 'out'
  return type
}

export default function BulkRowInputPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { selectedFacilityId } = useFacility()
  const facilityId = Number(params.id)

  const jpNow = getZonedCalendarParts(new Date(), BUSINESS_TIME_ZONE)
  const year =
    Number(searchParams.get('year')) || jpNow.year
  const month =
    Number(searchParams.get('month')) || jpNow.month

  const [facilityName, setFacilityName] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [residents, setResidents] = useState<Resident[]>([])
  const [units, setUnits] = useState<{ id: number; name: string }[]>([])
  const [draftRows, setDraftRows] = useState<DraftRow[]>([])
  const [toast, setToast] = useState<{
    message: string
    type: 'success' | 'error' | 'info'
    isVisible: boolean
  }>({ message: '', type: 'info', isVisible: false })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const { year: currentYear, month: currentMonth } = getZonedCalendarParts(
    new Date(),
    BUSINESS_TIME_ZONE
  )
  const isCurrentMonth = year === currentYear && month === currentMonth
  const isPastMonth = year < currentYear || (year === currentYear && month < currentMonth)
  const allowNewDrafts = isCurrentMonth || isPastMonth
  const inOutDateRange = getInOutDateRange()

  const isMismatchedFacility =
    selectedFacilityId !== null && selectedFacilityId !== facilityId

  const fetchBulkData = useCallback(
    async (skipCache = false) => {
      setIsLoading(true)
      const fetchOptions: RequestInit = skipCache ? { cache: 'no-store' } : {}
      try {
        const facilityResponse = await fetch(
          `/api/facilities/${facilityId}`,
          fetchOptions
        )
        const facilityData = await facilityResponse.json()
        setFacilityName(facilityData.name || '')

        const residentsResponse = await fetch(
          `/api/residents?facilityId=${facilityId}`,
          fetchOptions
        )
        const residentsData = await residentsResponse.json()
        setResidents(
          residentsData.map(
            (r: {
              id: number
              name: string
              displayNamePrefix?: string | null
              namePrefixDisplayOption?: string | null
              unitId: number | null
              unit: { id: number; name: string } | null
            }) => ({
              id: r.id,
              name: r.name,
              displayNamePrefix: r.displayNamePrefix,
              namePrefixDisplayOption: r.namePrefixDisplayOption,
              unitId: r.unitId,
              unit: r.unit,
            })
          )
        )

        const unitsResponse = await fetch(
          `/api/units?facilityId=${facilityId}`,
          fetchOptions
        )
        const unitsData = await unitsResponse.json()
        setUnits(
          unitsData
            .map((u: { id: number; name: string }) => ({ id: u.id, name: u.name }))
            .sort((a: { name: string }, b: { name: string }) =>
              a.name.localeCompare(b.name)
            )
        )

        const transactionsResponse = await fetch(
          `/api/facilities/${facilityId}/transactions?year=${year}&month=${month}`,
          fetchOptions
        )
        const transactionsData = await transactionsResponse.json()
        setTransactions(transactionsData.transactions || [])
      } catch (e) {
        console.error(e)
        setToast({
          message: 'データの取得に失敗しました',
          type: 'error',
          isVisible: true,
        })
      } finally {
        setIsLoading(false)
      }
    },
    [facilityId, year, month]
  )

  useEffect(() => {
    fetchBulkData()
  }, [fetchBulkData])

  const patchDraft = useCallback((id: string, partial: Partial<DraftRow>) => {
    setDraftRows((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...partial } : r))
    )
  }, [])

  const addDraftRow = useCallback(() => {
    setDraftRows((rows) => [...rows, emptyDraftForView(isPastMonth, year, month)])
  }, [isPastMonth, year, month])

  const removeDraftRow = useCallback((id: string) => {
    setDraftRows((rows) => rows.filter((r) => r.id !== id))
  }, [])

  const copyFullFromTransaction = useCallback((transaction: Transaction) => {
    if (transaction.isCarryOver) return
    if (transaction.transactionType !== 'in' && transaction.transactionType !== 'out') {
      return
    }

    const dateStr = formatJapanCalendarDate(new Date(transaction.transactionDate))
    const newRow: DraftRow = {
      id: newDraftId(),
      residentId: String(transaction.residentId),
      transactionDate: dateStr,
      transactionType: normalizeCopiedTransactionType(transaction.transactionType),
      amount: String(transaction.amount),
      description: transaction.description || '',
      payee: transaction.payee || '',
      reason: transaction.reason || '',
      // コピー後は一覧で利用者は選ばれたまま、絞り込みは全ユニット・検索空欄（変更しやすくする）
      residentSearchQuery: '',
      selectedUnitId: null,
    }

    setDraftRows((rows) => [...rows, newRow])
  }, [])

  const handleCorrectTransaction = useCallback(
    async (transactionId: number) => {
      if (
        !confirm(
          'この取引を訂正としてマークしますか？\n訂正後、この取引は計算から除外され、印刷にも含まれません。'
        )
      ) {
        return
      }
      try {
        const response = await fetch(`/api/transactions/${transactionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
        })
        const data = await response.json()
        if (response.ok) {
          await invalidateTransactionCache(facilityId, undefined, year, month)
          await fetchBulkData(true)
          router.refresh()
          setToast({
            message: '取引を訂正としてマークしました',
            type: 'success',
            isVisible: true,
          })
        } else {
          setToast({
            message: data.error || '訂正の処理に失敗しました',
            type: 'error',
            isVisible: true,
          })
        }
      } catch (e) {
        console.error(e)
        setToast({
          message: '訂正の処理に失敗しました',
          type: 'error',
          isVisible: true,
        })
      }
    },
    [facilityId, year, month, fetchBulkData, router]
  )

  const validateDraftRow = useCallback(
    (d: DraftRow, indexOneBased: number): string | null => {
      if (!d.residentId) {
        return `${indexOneBased}行目: 利用者を選択してください`
      }
      if (!d.transactionDate) {
        return `${indexOneBased}行目: 対象日を入力してください`
      }
      if (!isValidDate(d.transactionDate)) {
        return `${indexOneBased}行目: 無効な日付形式です`
      }
      if (isCurrentMonth && (d.transactionType === 'in' || d.transactionType === 'out')) {
        const td = d.transactionDate
        if (td < inOutDateRange.min || td > inOutDateRange.max) {
          const currentDay = getZonedCalendarParts(new Date(), BUSINESS_TIME_ZONE).day
          return `${indexOneBased}行目: ${currentDay <= 10 ? '対象日は先月1日から今月末日までの日付を入力してください' : '対象日は今月1日から今日までの日付を入力してください'}`
        }
      }
      const amt = Number(d.amount.replace(/,/g, ''))
      if (Number.isNaN(amt) || amt < 1 || amt % 1 !== 0) {
        return `${indexOneBased}行目: 金額は1円以上の整数を入力してください`
      }
      if (
        (d.transactionType === 'past_correct_in' ||
          d.transactionType === 'past_correct_out') &&
        !d.reason.trim()
      ) {
        return `${indexOneBased}行目: 過去訂正の理由を入力してください`
      }
      const body = {
        residentId: Number(d.residentId),
        transactionDate: d.transactionDate,
        transactionType: d.transactionType,
        amount: amt,
        description: d.description,
        payee: d.payee,
        reason: d.reason,
      }
      const v = validateTransactionCreateBody(body as Record<string, unknown>)
      if (!v.ok) {
        let msg = v.error
        if (msg === 'Reason is required for past correction transactions') {
          msg = '過去訂正の理由を入力してください'
        } else if (msg === 'Missing required fields') {
          msg = '必須項目が不足しています'
        }
        return `${indexOneBased}行目: ${msg}`
      }
      return null
    },
    [isCurrentMonth, inOutDateRange]
  )

  const handleRegisterAll = useCallback(async () => {
    if (draftRows.length === 0) return
    if (draftRows.length > MAX_BATCH) {
      setToast({
        message: `一度に登録できるのは${MAX_BATCH}件までです`,
        type: 'error',
        isVisible: true,
      })
      return
    }

    for (let i = 0; i < draftRows.length; i++) {
      const err = validateDraftRow(draftRows[i], i + 1)
      if (err) {
        setToast({ message: err, type: 'error', isVisible: true })
        return
      }
    }

    setIsSubmitting(true)
    try {
      const items = draftRows.map((d) => ({
        residentId: Number(d.residentId),
        transactionDate: d.transactionDate,
        transactionType: d.transactionType,
        amount: Number(d.amount.replace(/,/g, '')),
        description: d.description || '',
        payee: d.payee || '',
        reason: d.reason || '',
      }))

      const response = await fetch('/api/transactions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const batchData = await response.json()

      if (response.ok) {
        setToast({
          message: `${items.length}件の取引を登録しました`,
          type: 'success',
          isVisible: true,
        })
        setDraftRows([])
        await invalidateTransactionCacheForResidents(
          facilityId,
          items.map((t) => t.residentId),
          year,
          month
        )
        await fetchBulkData(true)
        router.refresh()
      } else {
        const errIndex =
          typeof batchData.index === 'number' ? batchData.index + 1 : null
        setToast({
          message:
            errIndex !== null
              ? `${errIndex}行目: ${batchData.error || '登録に失敗しました'}`
              : batchData.error || '登録に失敗しました',
          type: 'error',
          isVisible: true,
        })
      }
    } catch (e) {
      console.error(e)
      setToast({
        message: '登録に失敗しました',
        type: 'error',
        isVisible: true,
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [draftRows, validateDraftRow, facilityId, year, month, fetchBulkData, router])

  return (
    <MainLayout>
      <div>
        <div className="flex items-center gap-4 mb-6">
          <button
            type="button"
            onClick={() => {
              const timestamp = Date.now()
              router.push(
                `/facilities/${facilityId}?year=${year}&month=${month}&_t=${timestamp}`
              )
            }}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
            title="施設詳細に戻る"
          >
            ← 戻る
          </button>
          <h1 className="text-3xl font-bold">
            行でまとめて入力:{' '}
            {isLoading ? '読み込み中...' : facilityName || '施設が見つかりません'}
          </h1>
        </div>

        {isMismatchedFacility && (
          <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
            <p className="text-yellow-800">
              ⚠️ 現在選択されている施設と異なる施設のページを表示しています。
              <button
                type="button"
                onClick={() => router.push('/facility-select')}
                className="ml-2 text-blue-600 hover:underline font-semibold"
              >
                施設選択を変更
              </button>
            </p>
          </div>
        )}

        <div className="mb-4 p-4 bg-gray-100 rounded">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <span className="text-xl font-semibold">
              {year}年{month}月
            </span>
            <span className="text-sm text-gray-500">
              （月の移動はできません。前の月については10日まではこの画面で入力可能です。）
            </span>
          </div>
        </div>

        {isPastMonth && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
            <span className="text-yellow-800">
              🔒 締め済み　※次の月の１０日までは次の月の入金・出金で入力してください。
            </span>
          </div>
        )}

        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={() => setToast((t) => ({ ...t, isVisible: false }))}
        />

        <h2 className="text-xl font-semibold mb-4">明細</h2>
        {isLoading ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
            読み込み中...
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="w-[6.5rem] px-2 py-2 text-left text-xs font-semibold whitespace-nowrap">
                      日付
                    </th>
                    <th className="min-w-[14rem] px-2 py-2 text-left text-sm font-semibold">
                      利用者名
                    </th>
                    <th className="w-[5.5rem] px-1 py-2 text-left text-xs font-semibold whitespace-nowrap">
                      区分
                    </th>
                    <th className="min-w-[7rem] px-2 py-2 text-left text-sm font-semibold">
                      摘要
                    </th>
                    <th className="min-w-[6rem] px-2 py-2 text-left text-sm font-semibold">
                      支払先
                    </th>
                    <th className="w-[7rem] px-2 py-2 text-right text-sm font-semibold">
                      金額
                    </th>
                    <th className="px-2 py-2 text-right text-sm font-semibold">個人残高</th>
                    <th className="px-2 py-2 text-right text-sm font-semibold">施設残高</th>
                    <th className="w-[6.5rem] min-w-[6.5rem] px-1 py-2 text-center text-xs font-semibold">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 && draftRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                        明細がありません
                      </td>
                    </tr>
                  ) : null}

                  {transactions.map((transaction) => {
                    const isCarryOver = transaction.isCarryOver === true
                    const isIn =
                      transaction.transactionType === 'in' ||
                      transaction.transactionType === 'correct_in' ||
                      transaction.transactionType === 'past_correct_in'
                    const isCorrect =
                      transaction.transactionType === 'correct_in' ||
                      transaction.transactionType === 'correct_out'
                    const isPastCorrect =
                      transaction.transactionType === 'past_correct_in' ||
                      transaction.transactionType === 'past_correct_out'
                    const canCorrect =
                      !isCarryOver &&
                      !isCorrect &&
                      !isPastCorrect &&
                      isCurrentMonth

                    return (
                      <tr
                        key={
                          isCarryOver ? `carryover-${year}-${month}` : transaction.id
                        }
                        className={`border-t hover:bg-gray-50 ${isCorrect ? 'opacity-60' : ''} ${isCarryOver ? 'bg-slate-50/80' : ''}`}
                      >
                        <td
                          className={`px-2 py-2 text-xs tabular-nums whitespace-nowrap ${isCorrect ? 'line-through' : ''}`}
                        >
                          {new Date(transaction.transactionDate).toLocaleDateString(
                            'ja-JP',
                            {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                            }
                          )}
                        </td>
                        <td
                          className={`px-2 py-2 text-sm ${isCorrect ? 'line-through' : ''}`}
                        >
                          {isCarryOver ? '—' : transaction.residentName}
                        </td>
                        <td
                          className={`px-1 py-2 ${isCorrect ? 'line-through' : ''}`}
                        >
                          {isCarryOver ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight bg-slate-200 text-slate-800 max-w-full">
                              前月より繰越
                            </span>
                          ) : (
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight ${
                                isIn
                                  ? isCorrect
                                    ? 'bg-orange-100 text-orange-800'
                                    : isPastCorrect
                                      ? 'bg-purple-100 text-purple-800'
                                      : 'bg-blue-100 text-blue-800'
                                  : isCorrect
                                    ? 'bg-orange-100 text-orange-800'
                                    : isPastCorrect
                                      ? 'bg-purple-100 text-purple-800'
                                      : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {getTransactionTypeLabel(transaction.transactionType)}
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-2 py-2 text-sm ${isCorrect ? 'line-through' : ''}`}
                        >
                          {isCarryOver ? '-' : transaction.description || '-'}
                        </td>
                        <td
                          className={`px-2 py-2 text-sm ${isCorrect ? 'line-through' : ''}`}
                        >
                          {isCarryOver ? '-' : transaction.payee || '-'}
                        </td>
                        <td
                          className={`px-2 py-2 text-sm text-right font-medium ${
                            isCarryOver ? 'text-gray-600' : isIn ? 'text-blue-600' : 'text-red-600'
                          } ${isCorrect ? 'line-through' : ''}`}
                        >
                          {isCarryOver ? (
                            'ー'
                          ) : (
                            <>
                              {isIn ? '+' : '-'}
                              {new Intl.NumberFormat('ja-JP', {
                                style: 'currency',
                                currency: 'JPY',
                              }).format(transaction.amount)}
                            </>
                          )}
                        </td>
                        <td
                          className={`px-2 py-2 text-sm text-right font-semibold text-gray-900 ${isCorrect ? 'line-through' : ''}`}
                        >
                          {isCarryOver
                            ? 'ー'
                            : new Intl.NumberFormat('ja-JP', {
                                style: 'currency',
                                currency: 'JPY',
                              }).format(transaction.balance)}
                        </td>
                        <td
                          className={`px-2 py-2 text-sm text-right font-semibold text-gray-900 ${isCorrect ? 'line-through' : ''}`}
                        >
                          {new Intl.NumberFormat('ja-JP', {
                            style: 'currency',
                            currency: 'JPY',
                          }).format(transaction.facilityBalance)}
                        </td>
                        <td className="px-1 py-2 text-center">
                          {canCorrect && (
                            <div className="flex gap-0.5 justify-center flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleCorrectTransaction(transaction.id)}
                                className="px-2 py-0.5 bg-orange-500 text-white text-[10px] rounded hover:bg-orange-600 shadow-sm transition-shadow"
                                title="この取引を訂正としてマーク"
                              >
                                ✏️ 訂正
                              </button>
                              <button
                                type="button"
                                onClick={() => copyFullFromTransaction(transaction)}
                                className="px-1.5 py-0.5 bg-gray-500 text-white text-[10px] rounded hover:bg-gray-600 shadow-sm transition-shadow"
                                title="この行の内容をすべてコピーして新規行を追加"
                              >
                                コピー
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}

                  {draftRows.map((d) => {
                    const fr = filterResidents(
                      residents,
                      d.residentSearchQuery,
                      d.selectedUnitId
                    )
                    const isIn =
                      d.transactionType === 'in' ||
                      d.transactionType === 'past_correct_in'
                    const showReason =
                      d.transactionType === 'past_correct_in' ||
                      d.transactionType === 'past_correct_out'

                    return (
                      <tr key={d.id} className="border-t bg-indigo-50/50">
                        <td className="px-1 py-1 align-top">
                          <input
                            type="date"
                            value={d.transactionDate}
                            onChange={(e) =>
                              patchDraft(d.id, { transactionDate: e.target.value })
                            }
                            min={
                              isCurrentMonth &&
                              (d.transactionType === 'in' || d.transactionType === 'out')
                                ? inOutDateRange.min
                                : undefined
                            }
                            max={
                              isCurrentMonth &&
                              (d.transactionType === 'in' || d.transactionType === 'out')
                                ? inOutDateRange.max
                                : undefined
                            }
                            className="w-full min-w-[5.5rem] px-1 py-1 border rounded text-xs"
                          />
                        </td>
                        <td className="px-1 py-1 align-top">
                          <div className="space-y-1">
                            <div className="flex gap-1">
                              <select
                                value={d.selectedUnitId ?? ''}
                                onChange={(e) =>
                                  patchDraft(d.id, {
                                    selectedUnitId: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                    residentId: '',
                                  })
                                }
                                className="w-1/2 min-w-0 px-1 py-0.5 border rounded text-[10px]"
                              >
                                <option value="">全ユニット</option>
                                {units.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                maxLength={30}
                                value={d.residentSearchQuery}
                                onChange={(e) =>
                                  patchDraft(d.id, { residentSearchQuery: e.target.value })
                                }
                                placeholder="検索"
                                className="w-1/2 min-w-0 px-1 py-0.5 border rounded text-[10px]"
                              />
                            </div>
                            <select
                              value={d.residentId}
                              onChange={(e) =>
                                patchDraft(d.id, { residentId: e.target.value })
                              }
                              className="w-full px-1 py-1 border rounded text-xs"
                            >
                              <option value="">選択</option>
                              {fr.map((resident) => (
                                <option key={resident.id} value={resident.id}>
                                  {getResidentDisplayName(resident, 'screen')}{' '}
                                  {resident.unit ? `(${resident.unit.name})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="px-1 py-1 align-top">
                          <select
                            value={d.transactionType}
                            onChange={(e) =>
                              patchDraft(d.id, {
                                transactionType: e.target.value,
                                reason:
                                  e.target.value === 'past_correct_in' ||
                                  e.target.value === 'past_correct_out'
                                    ? d.reason
                                    : '',
                              })
                            }
                            className="w-full max-w-[5.25rem] px-0.5 py-1 border rounded text-[10px]"
                          >
                            {isPastMonth ? (
                              <>
                                <option value="past_correct_in">過去訂正入金</option>
                                <option value="past_correct_out">過去訂正出金</option>
                              </>
                            ) : (
                              <>
                                <option value="in">入金</option>
                                <option value="out">出金</option>
                              </>
                            )}
                          </select>
                        </td>
                        <td className="px-1 py-1 align-top">
                          <input
                            type="text"
                            lang="ja"
                            maxLength={100}
                            value={d.description}
                            onChange={(e) =>
                              patchDraft(d.id, { description: e.target.value })
                            }
                            onFocus={() =>
                              patchDraft(d.id, {
                                description: halfWidthToFullWidthFormText(d.description),
                              })
                            }
                            className="w-full px-1 py-1 border rounded text-xs"
                          />
                          {showReason && (
                            <input
                              type="text"
                              lang="ja"
                              maxLength={100}
                              value={d.reason}
                              onChange={(e) =>
                                patchDraft(d.id, { reason: e.target.value })
                              }
                              placeholder="訂正理由 *"
                              className="w-full mt-1 px-1 py-0.5 border rounded text-[10px]"
                            />
                          )}
                        </td>
                        <td className="px-1 py-1 align-top">
                          <input
                            type="text"
                            lang="ja"
                            maxLength={30}
                            value={d.payee}
                            onChange={(e) => patchDraft(d.id, { payee: e.target.value })}
                            onFocus={() =>
                              patchDraft(d.id, {
                                payee: halfWidthToFullWidthFormText(d.payee),
                              })
                            }
                            className="w-full px-1 py-1 border rounded text-xs"
                          />
                        </td>
                        <td className="px-1 py-1 align-top">
                          <div
                            className={
                              isIn ? 'text-blue-700' : 'text-red-700'
                            }
                          >
                            <FormattedAmountInput
                              value={d.amount}
                              onChange={(next) => patchDraft(d.id, { amount: next })}
                              focusRingClassName="focus:ring-indigo-500"
                              placeholder="0"
                            />
                          </div>
                        </td>
                        <td className="px-2 py-2 text-sm text-right text-gray-400">—</td>
                        <td className="px-2 py-2 text-sm text-right text-gray-400">—</td>
                        <td className="px-1 py-1 text-center align-top">
                          <button
                            type="button"
                            onClick={() => removeDraftRow(d.id)}
                            className="px-1.5 py-0.5 bg-gray-200 text-gray-800 text-[10px] rounded hover:bg-gray-300"
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    )
                  })}

                  {allowNewDrafts && (
                    <tr className="border-t bg-gray-50">
                      <td colSpan={9} className="px-2 py-2">
                        <button
                          type="button"
                          onClick={addDraftRow}
                          className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
                        >
                          ＋ 行を追加
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {draftRows.length > 0 && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleRegisterAll}
              className="px-6 py-2 bg-indigo-600 text-white font-medium rounded hover:bg-indigo-700 disabled:opacity-50 shadow-md"
            >
              {isSubmitting
                ? '登録中...'
                : `登録（${draftRows.length}件）`}
            </button>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
