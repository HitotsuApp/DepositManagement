'use client'

export const runtime = 'edge';

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import MainLayout from '@/components/MainLayout'
import DateSelector from '@/components/DateSelector'
import Card from '@/components/Card'
import { useFacility } from '@/contexts/FacilityContext'

interface UnitSummary {
  id: number
  name: string
  totalAmount: number
}

interface ResidentSummary {
  id: number
  name: string
  balance: number
}

export default function FacilityDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
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
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchFacilityData()
    // URLパラメータのタイムスタンプを削除（クリーンなURLを保つ）
    const currentUrl = new URL(window.location.href)
    if (currentUrl.searchParams.has('_t')) {
      currentUrl.searchParams.delete('_t')
      window.history.replaceState({}, '', currentUrl.toString())
    }
  }, [facilityId, year, month, selectedUnitId])

  // ページがフォーカスされた時（戻るボタンで戻ってきた時など）に最新データを取得
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // ページが表示された時にキャッシュを無効化して再取得
        fetchFacilityData(true)
      }
    }

    const handleFocus = () => {
      // ウィンドウがフォーカスされた時にキャッシュを無効化して再取得
      fetchFacilityData(true)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [facilityId, year, month, selectedUnitId])

  const fetchFacilityData = async (skipCache = false) => {
    setIsLoading(true)
    try {
      const unitParam = selectedUnitId ? `&unitId=${selectedUnitId}` : ''
      // キャッシュを無効化するオプション
      const fetchOptions: RequestInit = skipCache ? { cache: 'no-store' } : {}
      
      const response = await fetch(
        `/api/facilities/${facilityId}?year=${year}&month=${month}${unitParam}`,
        fetchOptions
      )
      if (!response.ok) {
        throw new Error('Failed to fetch facility data')
      }
      const data = await response.json()
      setFacilityName(data.facilityName || '')
      setTotalAmount(data.totalAmount || 0)
      setUnits(data.units || [])
      setResidents(data.residents || [])
    } catch (error) {
      console.error('Failed to fetch facility data:', error)
      setFacilityName('')
      setTotalAmount(0)
      setUnits([])
      setResidents([])
    } finally {
      setIsLoading(false)
    }
  }

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

  // 選択された施設と異なる施設のページにアクセスした場合の警告
  const isMismatchedFacility = selectedFacilityId !== null && selectedFacilityId !== facilityId

  return (
    <MainLayout>
      <div>
        <h1 className="text-3xl font-bold mb-6">
          施設詳細: {isLoading ? '読み込み中...' : facilityName || '施設が見つかりません'}
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
            <div className="absolute top-4 right-4 flex gap-2">
              <button
                onClick={handleBulkInputClick}
                className="px-4 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 shadow-md hover:shadow-lg transition-shadow"
                title="まとめて入力"
              >
                📝 まとめて入力
              </button>
              <button
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
              ユニット名をクリックすると利用者が絞り込まれて表示されます
            </p>
          </div>
        </div>
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
        {residents.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
            {selectedUnitId ? 'このユニットに利用者が登録されていません' : '利用者が登録されていません'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {residents.map(resident => (
              <Card
                key={resident.id}
                title={resident.name}
                amount={resident.balance}
                onClick={() => handleResidentClick(resident.id)}
                className="bg-[#FFF0F0]"
              />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  )
}

