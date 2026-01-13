'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFacility } from '@/contexts/FacilityContext'

interface Facility {
  id: number
  name: string
  isActive: boolean
}

export default function FacilitySelectPage() {
  const router = useRouter()
  const { selectedFacilityId, setSelectedFacilityId, clearSelection } = useFacility()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchFacilities()
  }, [])

  const fetchFacilities = async () => {
    try {
      const response = await fetch('/api/facilities')
      const data = await response.json()
      setFacilities(data.filter((f: Facility) => f.isActive))
    } catch (error) {
      console.error('Failed to fetch facilities:', error)
      alert('施設データの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectFacility = (facilityId: number) => {
    setSelectedFacilityId(facilityId)
    const currentDate = new Date()
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1
    router.push(`/facilities/${facilityId}?year=${year}&month=${month}`)
  }

  const handleSelectAll = () => {
    clearSelection()
    router.push('/')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">預り金管理システム</h1>
          <p className="text-lg text-gray-600">施設を選択してください</p>
          {selectedFacilityId !== null && (
            <div className="mt-4 inline-block px-4 py-2 bg-blue-100 border-2 border-blue-300 rounded-lg">
              <p className="text-sm text-blue-800">
                現在選択中: <span className="font-semibold">{facilities.find(f => f.id === selectedFacilityId)?.name || '読み込み中...'}</span>
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <button
            onClick={handleSelectAll}
            className="w-full p-6 text-left border-2 border-blue-500 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">法人全体を表示</h3>
                <p className="text-sm text-gray-600 mt-1">すべての施設の情報を表示します</p>
              </div>
              <svg
                className="w-6 h-6 text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </button>
        </div>

        {facilities.length > 0 ? (
          <>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">施設一覧</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {facilities.map(facility => {
                const isSelected = facility.id === selectedFacilityId
                return (
                  <button
                    key={facility.id}
                    onClick={() => handleSelectFacility(facility.id)}
                    className={`bg-white rounded-lg shadow-md p-6 text-left hover:shadow-lg transition-shadow border-2 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-transparent hover:border-blue-500'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{facility.name}</h3>
                      {isSelected && (
                        <span className="px-2 py-1 text-xs bg-blue-500 text-white rounded-full">
                          選択中
                        </span>
                      )}
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <span>{isSelected ? '再選択する' : '選択する'}</span>
                      <svg
                        className="w-4 h-4 ml-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <p className="text-gray-600">施設が登録されていません</p>
          </div>
        )}
      </div>
    </div>
  )
}
