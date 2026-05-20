'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DateSelector from '@/components/DateSelector'
import { useFacility } from '@/contexts/FacilityContext'

export default function PrintPage() {
  const { selectedFacilityId } = useFacility()
  const router = useRouter()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [familyStartDate, setFamilyStartDate] = useState(() => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [familyEndDate, setFamilyEndDate] = useState(() => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [hasEditedFamilyRange, setHasEditedFamilyRange] = useState(false)

  const handleDateChange = (newYear: number, newMonth: number) => {
    setYear(newYear)
    setMonth(newMonth)
  }

  useEffect(() => {
    if (hasEditedFamilyRange) return

    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0)

    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`

    setFamilyStartDate(startStr)
    setFamilyEndDate(endStr)
  }, [year, month, hasEditedFamilyRange])

  const handleFacilityPrint = () => {
    if (!selectedFacilityId) {
      alert('施設が選択されていません')
      return
    }
    // プレビューページに遷移してから印刷
    router.push(`/print/preview?facilityId=${selectedFacilityId}&year=${year}&month=${month}&type=facility`)
  }

  const buildFamilyPreviewPath = (familyPaper: 'a4' | 'a5') => {
    return `/print/preview?facilityId=${selectedFacilityId}&startDate=${familyStartDate}&endDate=${familyEndDate}&type=family&familyPaper=${familyPaper}`
  }

  const handleFamilyPrintNavigate = (familyPaper: 'a4' | 'a5') => {
    if (!selectedFacilityId) {
      alert('施設が選択されていません')
      return
    }
    const startMs = new Date(`${familyStartDate}T00:00:00`).getTime()
    const endMs = new Date(`${familyEndDate}T00:00:00`).getTime()
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || startMs > endMs) {
      alert('期間の指定が正しくありません（開始日 <= 終了日）')
      return
    }
    router.push(buildFamilyPreviewPath(familyPaper))
  }

  return (
    <div>
        <h1 className="text-3xl font-bold mb-6">まとめて印刷</h1>
        
        {selectedFacilityId === null && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800">
              ※ 施設を選択してください
            </p>
          </div>
        )}

        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">本部報告（ユニット合計＋出納帳）</h2>

            <DateSelector year={year} month={month} onDateChange={handleDateChange} />

            <div className="space-y-4">
              <p className="text-gray-600">
                対象年月: {year}年{month}月
              </p>
              {selectedFacilityId !== null && (
                <p className="text-sm text-blue-600">
                  ※ 施設詳細画面「施設合計」カードと同じレイアウトで印刷します
                </p>
              )}

              <div>
                <button
                  onClick={handleFacilityPrint}
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

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">家族向け印刷（預り金明細書入居者分）</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <label className="block">
                <div className="text-sm text-gray-600 mb-1">開始日</div>
                <input
                  type="date"
                  value={familyStartDate}
                  onChange={(e) => {
                    setHasEditedFamilyRange(true)
                    setFamilyStartDate(e.target.value)
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </label>
              <label className="block">
                <div className="text-sm text-gray-600 mb-1">終了日</div>
                <input
                  type="date"
                  value={familyEndDate}
                  onChange={(e) => {
                    setHasEditedFamilyRange(true)
                    setFamilyEndDate(e.target.value)
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </label>
            </div>

            <div className="space-y-4">
              {selectedFacilityId !== null && (
                <p className="text-sm text-blue-600">
                  ※ 指定期間の利用者ごとの明細と、指定日の時点残金を出力します
                </p>
              )}

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-stretch gap-3">
                  <button
                    type="button"
                    onClick={() => handleFamilyPrintNavigate('a4')}
                    disabled={selectedFacilityId === null}
                    className={`inline-flex min-h-10 items-center justify-center rounded px-6 ${
                      selectedFacilityId === null
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                  >
                    A4縦印刷
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFamilyPrintNavigate('a5')}
                    disabled={selectedFacilityId === null}
                    className={`inline-flex min-h-10 items-center justify-center rounded px-6 ${
                      selectedFacilityId === null
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    A5横印刷
                  </button>
                </div>
                <p className="text-sm text-gray-600 max-w-xl leading-relaxed">
                  ※ A5横印刷の場合は明細が10行程度しか入りません。
                  <br />
                  収まらない場合はA4縦印刷をお勧めします。
                </p>
              </div>
            </div>
          </div>
        </div>
    </div>
  )
}

