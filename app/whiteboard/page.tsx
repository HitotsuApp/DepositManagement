'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useFacility } from '@/contexts/FacilityContext'
import { getResidentDisplayName } from '@/lib/displayName'

interface Resident {
  id: number
  name: string
  nameFurigana: string | null
  displayNamePrefix: string | null
  namePrefixDisplayOption: string | null
  displaySortOrder: number | null
  unitId: number
}

interface Unit {
  id: number
  name: string
  displaySortOrder: number | null
  residents: Resident[]
}

interface Facility {
  id: number
  name: string
  residentDisplaySortMode: string | null
  units: Unit[]
  totalResidents: number
}

export default function WhiteboardPage() {
  const router = useRouter()
  const { selectedFacilityId, hasCompletedSelection } = useFacility()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  // 施設が選択されている場合はリダイレクト
  useEffect(() => {
    if (!hasCompletedSelection) {
      router.push('/facility-select')
      return
    }
    if (selectedFacilityId !== null) {
      router.push(`/facilities/${selectedFacilityId}`)
    }
  }, [selectedFacilityId, hasCompletedSelection, router])

  useEffect(() => {
    if (selectedFacilityId !== null || !hasCompletedSelection) return

    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch('/api/whiteboard')
        if (!res.ok) throw new Error('データの取得に失敗しました')
        const data: Facility[] = await res.json()
        setFacilities(data)
        setUpdatedAt(new Date())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'エラーが発生しました')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [selectedFacilityId, hasCompletedSelection])

  if (selectedFacilityId !== null || !hasCompletedSelection) return null

  const totalAll = facilities.reduce((sum, f) => sum + f.totalResidents, 0)

  return (
    <div className="p-4 md:p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">所属一覧（ホワイトボード）</h1>
          <p className="text-sm text-gray-500 mt-1">
            法人全体の施設・ユニット・利用者の所属一覧
            {updatedAt && (
              <span className="ml-2 text-gray-400">
                更新: {updatedAt.toLocaleTimeString('ja-JP')}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-center">
            <p className="text-xs text-blue-500 font-medium">利用者総数</p>
            <p className="text-xl font-bold text-blue-700">{loading ? '...' : `${totalAll}名`}</p>
          </div>
          <button
            onClick={() => {
              setLoading(true)
              fetch('/api/whiteboard')
                .then(r => r.json())
                .then(data => {
                  setFacilities(data)
                  setUpdatedAt(new Date())
                })
                .catch(() => setError('更新に失敗しました'))
                .finally(() => setLoading(false))
            }}
            className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 text-gray-600 text-sm"
            title="更新"
          >
            ↻ 更新
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-400 text-lg">読み込み中...</div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-4">
          {error}
        </div>
      )}

      {!loading && !error && facilities.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          表示できる施設がありません
        </div>
      )}

      {!loading && !error && facilities.length > 0 && (
        <div className="space-y-6">
          {facilities.map((facility) => (
            <FacilityBoard key={facility.id} facility={facility} />
          ))}
        </div>
      )}
    </div>
  )
}

function FacilityBoard({ facility }: { facility: Facility }) {
  const maxRows = Math.max(...facility.units.map(u => u.residents.length), 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* 施設ヘッダー */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-700 text-white">
        <div className="flex items-center gap-3">
          <Link
            href={`/facilities/${facility.id}`}
            className="font-bold text-lg hover:text-blue-300 transition-colors"
          >
            {facility.name}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300">
            {facility.units.length}ユニット
          </span>
          <span className="bg-blue-500 text-white text-sm font-bold px-3 py-1 rounded-full">
            {facility.totalResidents}名
          </span>
        </div>
      </div>

      {/* ユニット・利用者グリッド */}
      {facility.units.length === 0 ? (
        <div className="p-4 text-gray-400 text-sm text-center">ユニットが登録されていません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {facility.units.map((unit) => (
                  <th
                    key={unit.id}
                    className="border-r border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-50 text-center whitespace-nowrap min-w-[120px]"
                    style={{ borderRight: '1px solid #e5e7eb' }}
                  >
                    <div>{unit.name}</div>
                    <div className="text-xs font-normal text-gray-400 mt-0.5">
                      {unit.residents.length}名
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {maxRows === 0 ? (
                <tr>
                  <td
                    colSpan={facility.units.length}
                    className="py-4 text-center text-gray-400 text-sm"
                  >
                    利用者が登録されていません
                  </td>
                </tr>
              ) : (
                Array.from({ length: maxRows }, (_, rowIdx) => (
                  <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    {facility.units.map((unit) => {
                      const resident = unit.residents[rowIdx]
                      return (
                        <td
                          key={unit.id}
                          className="border-r border-b border-gray-100 px-3 py-2 text-sm"
                          style={{ borderRight: '1px solid #e5e7eb', minWidth: '120px' }}
                        >
                          {resident ? (
                            <Link
                              href={`/residents/${resident.id}`}
                              className="text-gray-800 hover:text-blue-600 hover:underline transition-colors block"
                            >
                              {getResidentDisplayName(resident, 'screen')}
                            </Link>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
