'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useFacility } from '@/contexts/FacilityContext'
import { getResidentDisplayName } from '@/lib/displayName'
import MainLayout from '@/components/MainLayout'

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

const UNITS_PER_PRINT_PAGE = 3

export default function WhiteboardPage() {
  const router = useRouter()
  const { selectedFacilityId, hasCompletedSelection } = useFacility()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [printFacilityId, setPrintFacilityId] = useState<number | ''>('')

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
  const printFacility = facilities.find(f => f.id === printFacilityId) ?? null

  const handleRefresh = () => {
    setLoading(true)
    fetch('/api/whiteboard')
      .then(r => r.json())
      .then(data => {
        setFacilities(data)
        setUpdatedAt(new Date())
      })
      .catch(() => setError('更新に失敗しました'))
      .finally(() => setLoading(false))
  }

  return (
    <MainLayout>
      {/* 画面表示コンテンツ */}
      <div className="whiteboard-screen-content">
        {/* ヘッダー */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">所属一覧（ホワイトボード）</h1>
            <p className="text-sm text-gray-500 mt-1">
              法人全体の施設・ユニット・利用者の所属一覧ボード
              {updatedAt && (
                <span className="ml-2 text-gray-400">
                  更新: {updatedAt.toLocaleTimeString('ja-JP')}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* 印刷施設選択＋ボタン */}
            <div className="flex items-center gap-2">
              <select
                value={printFacilityId}
                onChange={e =>
                  setPrintFacilityId(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
              >
                <option value="">印刷する施設を選択</option>
                {facilities.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => window.print()}
                disabled={!printFacility}
                className="flex items-center gap-1 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                🖨️ 印刷
              </button>
            </div>
            {/* 利用者総数 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-center">
              <p className="text-xs text-blue-500 font-medium">利用者総数</p>
              <p className="text-xl font-bold text-blue-700">
                {loading ? '...' : `${totalAll}名`}
              </p>
            </div>
            <button
              onClick={handleRefresh}
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
            {facilities.map(facility => (
              <FacilityBoard key={facility.id} facility={facility} />
            ))}
          </div>
        )}
      </div>

      {/* 印刷コンテンツ（画面では非表示、印刷時のみ表示） */}
      <div className="whiteboard-print-content">
        {printFacility && <PrintLayout facility={printFacility} />}
      </div>
    </MainLayout>
  )
}

/** 列幅（画面・印刷共通）: 全角8文字相当 */
const COL_STYLE: React.CSSProperties = {
  width: '8em',
  minWidth: '8em',
  maxWidth: '8em',
  wordBreak: 'break-all',
}

/** 施設ボード（画面表示用） */
function FacilityBoard({ facility }: { facility: Facility }) {
  const maxRows = Math.max(...facility.units.map(u => u.residents.length), 0)

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden border-2 border-black">
      {/* 施設ヘッダー */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-700 text-white">
        <Link
          href={`/facilities/${facility.id}`}
          className="font-bold text-lg hover:text-blue-300 transition-colors"
        >
          {facility.name}
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-300">{facility.units.length}ユニット</span>
          <span className="bg-blue-500 text-white text-sm font-bold px-3 py-1 rounded-full">
            {facility.totalResidents}名
          </span>
        </div>
      </div>

      {facility.units.length === 0 ? (
        <div className="p-4 text-gray-400 text-sm text-center">
          ユニットが登録されていません
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                {facility.units.map(unit => (
                  <th
                    key={unit.id}
                    className="border border-black px-2 py-2 text-sm font-semibold text-gray-700 bg-gray-100 text-center"
                    style={COL_STYLE}
                  >
                    <div>{unit.name}</div>
                    <div className="text-xs font-normal text-gray-500 mt-0.5">
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
                    className="border border-black py-4 text-center text-gray-400 text-sm"
                  >
                    利用者が登録されていません
                  </td>
                </tr>
              ) : (
                Array.from({ length: maxRows }, (_, rowIdx) => (
                  <tr key={rowIdx}>
                    {facility.units.map(unit => {
                      const resident = unit.residents[rowIdx]
                      return (
                        <td
                          key={unit.id}
                          className="border border-black px-2 py-1.5 text-sm text-center"
                          style={COL_STYLE}
                        >
                          {resident ? (
                            <span className="text-gray-800">
                              {getResidentDisplayName(resident, 'screen')}
                            </span>
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

/** 印刷用レイアウト（最大3ユニット/ページ、横向き） */
function PrintLayout({ facility }: { facility: Facility }) {
  const units = facility.units
  const groups: Unit[][] = []
  for (let i = 0; i < units.length; i += UNITS_PER_PRINT_PAGE) {
    groups.push(units.slice(i, i + UNITS_PER_PRINT_PAGE))
  }
  if (groups.length === 0) groups.push([])

  return (
    <>
      {groups.map((group, groupIdx) => {
        const maxRows = Math.max(...group.map(u => u.residents.length), 0)
        const isLast = groupIdx === groups.length - 1

        return (
          <div key={groupIdx} className={isLast ? '' : 'print-page-break'}>
            {/* 印刷ヘッダー */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid black',
                marginBottom: '8px',
                paddingBottom: '4px',
              }}
            >
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>
                {facility.name}
              </h2>
              <span style={{ fontSize: '12px', color: '#555' }}>
                利用者数: {facility.totalResidents}名
                {groups.length > 1 && `　(${groupIdx + 1} / ${groups.length} ページ)`}
              </span>
            </div>

            <table
              style={{
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
                width: '100%',
              }}
            >
              <thead>
                <tr>
                  {group.map(unit => (
                    <th
                      key={unit.id}
                      style={{
                        border: '1px solid black',
                        padding: '4px 6px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        backgroundColor: '#e5e7eb',
                        textAlign: 'center',
                      }}
                    >
                      <div>{unit.name}</div>
                      <div style={{ fontSize: '10px', fontWeight: 'normal' }}>
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
                      colSpan={group.length}
                      style={{
                        border: '1px solid black',
                        padding: '8px',
                        textAlign: 'center',
                        fontSize: '12px',
                        color: '#888',
                      }}
                    >
                      利用者が登録されていません
                    </td>
                  </tr>
                ) : (
                  Array.from({ length: maxRows }, (_, rowIdx) => (
                    <tr key={rowIdx}>
                      {group.map(unit => {
                        const resident = unit.residents[rowIdx]
                        return (
                          <td
                            key={unit.id}
                            style={{
                              border: '1px solid black',
                              padding: '3px 6px',
                              fontSize: '12px',
                              textAlign: 'center',
                              wordBreak: 'break-all',
                            }}
                          >
                            {resident ? getResidentDisplayName(resident, 'print') : ''}
                          </td>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )
      })}
    </>
  )
}
