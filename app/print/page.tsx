'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/MainLayout'
import DateSelector from '@/components/DateSelector'
import { useFacility } from '@/contexts/FacilityContext'

export default function PrintPage() {
  const { selectedFacilityId } = useFacility()
  const router = useRouter()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)

  const handleDateChange = (newYear: number, newMonth: number) => {
    setYear(newYear)
    setMonth(newMonth)
  }

  const handlePrint = () => {
    if (!selectedFacilityId) {
      alert('施設が選択されていません')
      return
    }
    // プレビューページに遷移してから印刷
    router.push(`/print/preview?facilityId=${selectedFacilityId}&year=${year}&month=${month}&type=batch`)
  }

  const handlePreview = () => {
    if (!selectedFacilityId) {
      alert('施設が選択されていません')
      return
    }
    // プレビューページに遷移
    router.push(`/print/preview?facilityId=${selectedFacilityId}&year=${year}&month=${month}&type=batch`)
  }

  return (
    <MainLayout>
      <div>
        <h1 className="text-3xl font-bold mb-6">まとめて印刷</h1>
        
        <DateSelector year={year} month={month} onDateChange={handleDateChange} />

        {selectedFacilityId === null && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800">
              ※ 施設を選択してください
            </p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">印刷</h2>
          
          <div className="space-y-4">
            <p className="text-gray-600">
              対象年月: {year}年{month}月
            </p>
            {selectedFacilityId !== null && (
              <p className="text-sm text-blue-600">
                ※ 選択された施設の預り金合計と全利用者の明細書をまとめて印刷します
              </p>
            )}

            <div className="flex gap-4">
              <button
                onClick={handlePreview}
                disabled={selectedFacilityId === null}
                className={`px-6 py-2 rounded ${
                  selectedFacilityId === null
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-500 text-white hover:bg-green-600'
                }`}
              >
                PDF出力（プレビュー）
              </button>
              <button
                onClick={handlePrint}
                disabled={selectedFacilityId === null}
                className={`px-6 py-2 rounded ${
                  selectedFacilityId === null
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                印刷
              </button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

