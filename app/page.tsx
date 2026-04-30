'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/MainLayout'
import DateSelector from '@/components/DateSelector'
import Card from '@/components/Card'
import { useFacility } from '@/contexts/FacilityContext'

interface FacilitySummary {
  id: number
  name: string
  totalAmount: number
}

export default function DashboardPage() {
  const router = useRouter()
  const { selectedFacilityId, hasCompletedSelection } = useFacility()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [totalAmount, setTotalAmount] = useState(0)
  const [facilities, setFacilities] = useState<FacilitySummary[]>([])
  const [isChecking, setIsChecking] = useState(true)

  // 施設選択状態のチェック（初回レンダリング時のみ）
  useEffect(() => {
    // クライアントサイドでのみチェック（SSR回避）
    const timer = setTimeout(() => {
      setIsChecking(false)
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // 初回アクセス時（施設選択が完了していない場合）のみ、施設選択ページにリダイレクト
  useEffect(() => {
    if (!isChecking && !hasCompletedSelection) {
      // ただし、施設選択ページ自体にはリダイレクトしない（無限ループ防止）
      if (window.location.pathname !== '/facility-select') {
        router.push('/facility-select')
      }
    }
    // 施設が選択されている場合は施設TOP画面にリダイレクト
    if (!isChecking && hasCompletedSelection && selectedFacilityId !== null) {
      const currentPath = window.location.pathname
      if (currentPath === '/' || currentPath === '/dashboard') {
        const d = new Date()
        const y = d.getFullYear()
        const m = d.getMonth() + 1
        router.push(`/facilities/${selectedFacilityId}?year=${y}&month=${m}&_t=${Date.now()}`)
      }
    }
  }, [isChecking, hasCompletedSelection, selectedFacilityId, router])

  const dashboardSilentAtRef = useRef(0)

  const fetchDashboardData = useCallback(async (skipCache = false) => {
    try {
      const url = selectedFacilityId
        ? `/api/dashboard?year=${year}&month=${month}&facilityId=${selectedFacilityId}`
        : `/api/dashboard?year=${year}&month=${month}`
      const fetchOptions: RequestInit = skipCache ? { cache: 'no-store' } : {}
      const response = await fetch(url, fetchOptions)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      if (data.error) {
        console.error('Failed to fetch dashboard data:', data.error)
        setTotalAmount(0)
        setFacilities([])
        return
      }
      setTotalAmount(data.totalAmount || 0)
      setFacilities(Array.isArray(data.facilities) ? data.facilities : [])
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
      setTotalAmount(0)
      setFacilities([])
    }
  }, [year, month, selectedFacilityId])

  useEffect(() => {
    if (!isChecking && hasCompletedSelection) {
      fetchDashboardData()
    }
  }, [year, month, isChecking, hasCompletedSelection, selectedFacilityId, fetchDashboardData])

  useEffect(() => {
    if (isChecking || !hasCompletedSelection) return

    const run = () => {
      const now = Date.now()
      if (now - dashboardSilentAtRef.current < 250) return
      dashboardSilentAtRef.current = now
      fetchDashboardData(true)
    }
    const onPopState = () => run()
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) run()
    }
    window.addEventListener('popstate', onPopState)
    window.addEventListener('pageshow', onPageShow as EventListener)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('pageshow', onPageShow as EventListener)
    }
  }, [isChecking, hasCompletedSelection, fetchDashboardData])

  const handleDateChange = (newYear: number, newMonth: number) => {
    setYear(newYear)
    setMonth(newMonth)
  }

  const handleFacilityClick = (facilityId: number) => {
    router.push(
      `/facilities/${facilityId}?year=${year}&month=${month}&_t=${Date.now()}`
    )
  }

  const handlePrintClick = (facilityId: number) => {
    router.push(
      `/print/preview?facilityId=${facilityId}&year=${year}&month=${month}&type=facility`
    )
  }

  const handleBulkInputClick = (facilityId: number) => {
    router.push(`/facilities/${facilityId}/bulk-input?year=${year}&month=${month}`)
  }

  // ローディング中または施設選択が完了していない場合は何も表示しない（リダイレクト待ち）
  if (isChecking || !hasCompletedSelection) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </div>
    )
  }

  const selectedFacilityName = facilities.find(f => f.id === selectedFacilityId)?.name

  return (
    <MainLayout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">法人ダッシュボード</h1>
          {selectedFacilityId !== null && selectedFacilityName && (
            <div className="px-4 py-2 bg-blue-100 border-2 border-blue-300 rounded-lg">
              <p className="text-sm text-blue-800">
                表示中: <span className="font-semibold">{selectedFacilityName}</span>
              </p>
            </div>
          )}
        </div>
        
        <DateSelector year={year} month={month} onDateChange={handleDateChange} />

        <div className="mb-8">
          <div className="relative">
            <Card
              title={selectedFacilityId !== null ? `${selectedFacilityName}の預り金合計` : '法人全体の預り金合計'}
              amount={totalAmount}
              className="bg-blue-50 border-2 border-blue-200"
            />
            {selectedFacilityId !== null && (
              <button
                onClick={() => handlePrintClick(selectedFacilityId)}
                className="absolute top-4 right-4 px-4 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600 shadow-md hover:shadow-lg transition-shadow"
                title="預り金明細書を印刷"
              >
                🖨️ 印刷
              </button>
            )}
          </div>
        </div>

        {selectedFacilityId === null ? (
          <>
            <h2 className="text-xl font-semibold mb-4">各施設の合計金額</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {facilities.map(facility => (
                <div key={facility.id} className="relative">
                  <Card
                    title={facility.name}
                    amount={facility.totalAmount}
                    onClick={() => handleFacilityClick(facility.id)}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleBulkInputClick(facility.id)
                    }}
                    className="absolute top-2 right-2 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 shadow-md hover:shadow-lg transition-shadow z-10"
                    title="まとめて入力"
                  >
                    📝
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : facilities.length > 0 ? (
          <>
            <div className="mb-4">
              <p className="text-gray-600 mb-4">
                選択された施設の情報を表示しています。
                <button
                  onClick={() => router.push('/facility-select')}
                  className="ml-2 text-blue-600 hover:underline font-semibold"
                >
                  施設選択を変更
                </button>
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {facilities.map(facility => (
                <div key={facility.id} className="relative">
                  <Card
                    title={facility.name}
                    amount={facility.totalAmount}
                    onClick={() => handleFacilityClick(facility.id)}
                    className={facility.id === selectedFacilityId ? 'ring-2 ring-blue-500' : ''}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleBulkInputClick(facility.id)
                    }}
                    className="absolute top-2 right-2 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 shadow-md hover:shadow-lg transition-shadow z-10"
                    title="まとめて入力"
                  >
                    📝
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
            <p>施設データが見つかりません</p>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

