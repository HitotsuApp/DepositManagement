'use client'

export const runtime = 'edge';

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation'
import DateSelector from '@/components/DateSelector'
import Card from '@/components/Card'
import { useFacility } from '@/contexts/FacilityContext'
import { getFacilityTransactionsChunk1Path } from '@/lib/bulkFacilityTransactionsFetch'
import { getResidentDisplayName } from '@/lib/displayName'

interface UnitSummary {
  id: number
  name: string
  totalAmount: number
}

interface ResidentSummary {
  id: number
  name: string
  displayNamePrefix?: string | null
  namePrefixDisplayOption?: string | null
  balance: number
}

export default function FacilityDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { selectedFacilityId } = useFacility()
  const facilityId = Number(params.id)

  const [year, setYear] = useState(() => {
    const y = searchParams.get('year')
    return y ? Number(y) : new Date().getFullYear()
  })
  const [month, setMonth] = useState(() => {
    const m = searchParams.get('month')
    return m ? Number(m) : new Date().getMonth() + 1
  })

  const [facilityName, setFacilityName] = useState('')
  const [totalAmount, setTotalAmount] = useState(0)
  const [units, setUnits] = useState<UnitSummary[]>([])
  const [residents, setResidents] = useState<ResidentSummary[]>([])
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null)
  const [isSummaryLoading, setIsSummaryLoading] = useState(true)
  const [isResidentsLoading, setIsResidentsLoading] = useState(false)

  const silentRefetchAtRef = useRef(0)
  const residentsAbortRef = useRef<AbortController | null>(null)
  const selectedUnitIdRef = useRef<number | null>(null)
  selectedUnitIdRef.current = selectedUnitId
  const queryKeyForEffect = searchParams.toString()

  const bulkPrefetchGuardRef = useRef<string | null>(null)

  const prefetchBulkInputOnHover = useCallback(() => {
    const key = `${facilityId}-${year}-${month}`
    if (bulkPrefetchGuardRef.current === key) return
    bulkPrefetchGuardRef.current = key
    const noop = (): null => null
    void (async () => {
      try {
        await fetch(`/api/facilities/${facilityId}`).catch(noop)
        await fetch(`/api/residents?facilityId=${facilityId}`).catch(noop)
        await fetch(`/api/units?facilityId=${facilityId}`).catch(noop)
        await fetch(getFacilityTransactionsChunk1Path(facilityId, year, month)).catch(noop)
      } catch {
        /* ignore */
      }
    })()
  }, [facilityId, year, month])

  /** ユニット・施設集約のみ取得 */
  const fetchFacilitySummary = useCallback(
    async (skipCache = false, showLoading = true) => {
      if (showLoading) setIsSummaryLoading(true)
      try {
        const fetchOptions: RequestInit = skipCache ? { cache: 'no-store' } : {}

        const response = await fetch(
          `/api/facilities/${facilityId}?year=${year}&month=${month}`,
          fetchOptions
        )
        if (!response.ok) {
          let bodySnippet = ''
          try {
            const t = await response.clone().text()
            bodySnippet = t.slice(0, 400)
          } catch {
            /* ignore */
          }
          console.error(
            `Failed to fetch facility summary: HTTP ${response.status}`,
            bodySnippet
          )
          throw new Error(`Failed to fetch facility data (${response.status})`)
        }
        const data = await response.json()
        setFacilityName(data.facilityName || '')
        setTotalAmount(data.totalAmount || 0)
        setUnits(data.units || [])
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Failed to fetch facility data:', error)
        }
        setFacilityName('')
        setTotalAmount(0)
        setUnits([])
        setResidents([])
      } finally {
        if (showLoading) setIsSummaryLoading(false)
      }
    },
    [facilityId, year, month]
  )

  const fetchResidentsForUnit = useCallback(
    async (unitId: number, opts: { skipCache?: boolean; signal?: AbortSignal }) => {
      setIsResidentsLoading(true)
      const fetchOptions: RequestInit = opts.skipCache ? { cache: 'no-store' } : {}
      if (opts.signal) fetchOptions.signal = opts.signal

      try {
        const url = `/api/facilities/${facilityId}/resident-summaries?year=${year}&month=${month}&unitId=${unitId}`
        const response = await fetch(url, fetchOptions)
        if (!response.ok) {
          let bodySnippet = ''
          try {
            const t = await response.clone().text()
            bodySnippet = t.slice(0, 400)
          } catch {
            /* ignore */
          }
          console.error(
            `Failed to fetch resident summaries: HTTP ${response.status}`,
            bodySnippet
          )
          throw new Error(`Failed to fetch residents (${response.status})`)
        }
        const data = await response.json()
        setResidents(Array.isArray(data.residents) ? data.residents : [])
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        console.error('Failed to fetch resident summaries:', error)
        setResidents([])
      } finally {
        setIsResidentsLoading(false)
      }
    },
    [facilityId, year, month]
  )

  useEffect(() => {
    setSelectedUnitId(null)
  }, [facilityId])

  useEffect(() => {
    const hasTimestamp = searchParams.has('_t')
    const shouldSkipCache =
      hasTimestamp ||
      !searchParams.get('year') ||
      !searchParams.get('month')

    if (hasTimestamp) {
      const p = new URLSearchParams(searchParams.toString())
      p.delete('_t')
      const qs = p.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }

    void fetchFacilitySummary(shouldSkipCache, true)
  }, [
    facilityId,
    year,
    month,
    queryKeyForEffect,
    pathname,
    router,
    fetchFacilitySummary,
  ])

  useEffect(() => {
    residentsAbortRef.current?.abort()

    if (selectedUnitId == null) {
      setResidents([])
      setIsResidentsLoading(false)
      return
    }

    const ac = new AbortController()
    residentsAbortRef.current = ac
    void fetchResidentsForUnit(selectedUnitId, {
      skipCache: false,
      signal: ac.signal,
    })

    return () => {
      ac.abort()
    }
  }, [selectedUnitId, fetchResidentsForUnit])

  useEffect(() => {
    const runSilent = () => {
      const now = Date.now()
      if (now - silentRefetchAtRef.current < 250) return
      silentRefetchAtRef.current = now
      void (async () => {
        await fetchFacilitySummary(true, false)
        const uid = selectedUnitIdRef.current
        if (uid != null) {
          await fetchResidentsForUnit(uid, { skipCache: true })
        }
      })()
    }
    const onPopState = () => runSilent()
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) runSilent()
    }
    window.addEventListener('popstate', onPopState)
    window.addEventListener('pageshow', onPageShow as EventListener)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('pageshow', onPageShow as EventListener)
    }
  }, [fetchFacilitySummary, fetchResidentsForUnit])

  const handleDateChange = (newYear: number, newMonth: number) => {
    setYear(newYear)
    setMonth(newMonth)
    setSelectedUnitId(null)
  }

  const handleUnitClick = (unitId: number) => {
    setSelectedUnitId(unitId === selectedUnitId ? null : unitId)
  }

  const handleResidentClick = (residentId: number) => {
    router.push(`/residents/${residentId}?year=${year}&month=${month}`)
  }

  const handlePrintClick = () => {
    router.push(
      `/print/preview?facilityId=${facilityId}&year=${year}&month=${month}&type=facility`
    )
  }

  const handleBulkInputClick = () => {
    router.push(`/facilities/${facilityId}/bulk-input?year=${year}&month=${month}`)
  }

  const handleBulkRowInputClick = () => {
    router.push(`/facilities/${facilityId}/bulk-row-input?year=${year}&month=${month}`)
  }

  const isMismatchedFacility = selectedFacilityId !== null && selectedFacilityId !== facilityId

  return (
    <div>
        <h1 className="text-3xl font-bold mb-6">
          施設詳細: {isSummaryLoading ? '読み込み中...' : facilityName || '施設が見つかりません'}
        </h1>

        {isMismatchedFacility && (
          <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
            <p className="text-yellow-800">
              ⚠️ 現在選択されている施設と異なる施設のページを表示しています。
              <button
                onClick={() => router.push('/facility-select')}
                className="ml-2 text-blue-600 hover:underline font-semibold"
              >
                施設選択を変更
              </button>
            </p>
          </div>
        )}

        <DateSelector year={year} month={month} onDateChange={handleDateChange} />

        <div className="mb-8">
          <div className="relative">
            <Card
              title="施設合計"
              amount={totalAmount}
              className="bg-green-50 border-2 border-green-200"
            />
            <div className="absolute top-4 right-4 flex flex-row items-start gap-2">
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleBulkInputClick}
                  onMouseEnter={prefetchBulkInputOnHover}
                  className="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 shadow-md hover:shadow-lg transition-shadow whitespace-nowrap"
                  title="モーダルフォームで入出金をまとめて入力"
                >
                  📝 フォームでまとめて入力
                </button>
                <button
                  type="button"
                  onClick={handleBulkRowInputClick}
                  onMouseEnter={prefetchBulkInputOnHover}
                  className="px-4 py-2 bg-indigo-500 text-white text-sm rounded hover:bg-indigo-600 shadow-md hover:shadow-lg transition-shadow whitespace-nowrap"
                  title="明細を行単位でインライン入力"
                >
                  📋 行でまとめて入力
                </button>
              </div>
              <button
                type="button"
                onClick={handlePrintClick}
                className="px-4 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 shadow-md hover:shadow-lg transition-shadow"
                title="預り金明細書を印刷"
              >
                🖨️ 印刷
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">ユニット別合計</h2>
            <p className="text-sm text-gray-600 mt-1">
              ユニットを選択すると、そのユニットの利用者一覧と残高が表示されます。
            </p>
          </div>
        </div>
        {isSummaryLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-lg shadow-md p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {units.map(unit => (
              <Card
                key={unit.id}
                title={unit.name}
                amount={unit.totalAmount}
                onClick={() => handleUnitClick(unit.id)}
                className={`bg-[#EFF6FF] ${selectedUnitId === unit.id ? 'ring-2 ring-blue-500' : ''}`}
              />
            ))}
          </div>
        )}

        {selectedUnitId && (
          <div className="mb-4">
            <button
              onClick={() => setSelectedUnitId(null)}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
            >
              絞り込み解除
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">
              利用者別残高
              {selectedUnitId && (
                <span className="text-sm font-normal text-gray-600 ml-2">
                  （{units.find(u => u.id === selectedUnitId)?.name || '選択中のユニット'}で絞り込み中）
                </span>
              )}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              利用者名をクリックすると、各利用者の預り金の入力画面に移動します。
            </p>
          </div>
          <button
            onClick={() => router.push('/master?tab=resident')}
            className="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 shadow-md hover:shadow-lg transition-shadow"
            title="利用者マスタで編集"
          >
            ✏️ 利用者を編集
          </button>
        </div>

        {!selectedUnitId ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
            上記のユニット名をクリックすると、選択したユニットの利用者別残高を表示します。
          </div>
        ) : isResidentsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white rounded-lg shadow-md p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : residents.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
            このユニットに利用者が登録されていません
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {residents.map(resident => (
              <Card
                key={resident.id}
                title={getResidentDisplayName(resident, 'screen')}
                amount={resident.balance}
                onClick={() => handleResidentClick(resident.id)}
                className="bg-[#FFF0F0]"
              />
            ))}
          </div>
        )}
      </div>
  )
}
