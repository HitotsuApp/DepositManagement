'use client'

import { useState } from 'react'
import MainLayout from '@/components/MainLayout'
import DateSelector from '@/components/DateSelector'

export default function PrintPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [printUnit, setPrintUnit] = useState<'corporation' | 'facility' | 'unit' | 'resident'>('facility')
  const [includeDetails, setIncludeDetails] = useState(true)
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null)

  const handleDateChange = (newYear: number, newMonth: number) => {
    setYear(newYear)
    setMonth(newMonth)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <MainLayout>
      <div>
        <h1 className="text-3xl font-bold mb-6">まとめて印刷</h1>
        
        <DateSelector year={year} month={month} onDateChange={handleDateChange} />

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">印刷設定</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">印刷単位</label>
              <select
                value={printUnit}
                onChange={(e) => setPrintUnit(e.target.value as any)}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="corporation">法人</option>
                <option value="facility">施設</option>
                <option value="unit">ユニット</option>
                <option value="resident">利用者</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeDetails}
                  onChange={(e) => setIncludeDetails(e.target.checked)}
                />
                <span>明細を含む</span>
              </label>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handlePrint}
                className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                印刷
              </button>
              <button
                className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                PDF出力
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 print:block">
          <h2 className="text-xl font-semibold mb-4">印刷プレビュー</h2>
          <p className="text-gray-600">
            対象年月: {year}-{String(month).padStart(2, '0')}
          </p>
          <p className="text-gray-600">
            印刷単位: {
              printUnit === 'corporation' ? '法人' :
              printUnit === 'facility' ? '施設' :
              printUnit === 'unit' ? 'ユニット' : '利用者'
            }
          </p>
          {/* ここに実際の印刷データを表示 */}
        </div>
      </div>
    </MainLayout>
  )
}

