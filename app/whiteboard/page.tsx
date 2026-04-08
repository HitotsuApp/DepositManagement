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
  isRecentAdmission: boolean
  isRecentDischarge: boolean
}

interface Unit {
  id: number
  name: string
  capacity: number | null
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

/** 列幅：全角10文字相当（画面・印刷共通） */
const COL_WIDTH = '10em'

export default function WhiteboardPage() {
  const router = useRouter()
  const { selectedFacilityId, hasCompletedSelection } = useFacility()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [printFacilityId, setPrintFacilityId] = useState<number | ''>('')

  // 印刷時の白紙ページ防止：bodyにクラスを付与
  useEffect(() => {
    document.body.classList.add('whiteboard-page')
    return () => document.body.classList.remove('whiteboard-page')
  }, [])

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
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
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
            <p className="text-xs text-yellow-600 mt-1">
              🟡 薄黄色：過去1ヶ月以内に入居または退居した利用者
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

/** 施設ボード（画面表示用） */
function FacilityBoard({ facility }: { facility: Facility }) {
  // 各ユニットの行数は「入居者数」と「定員数」の大きい方
  const maxRows = Math.max(
    ...facility.units.map(u =>
      u.capacity != null ? Math.max(u.residents.length, u.capacity) : u.residents.length
    ),
    0
  )

  return (
    /* overflow-x-auto で横スクロール。内側は fit-content でユニット数に応じた幅 */
    <div className="overflow-x-auto">
      <div
        className="bg-white rounded-xl shadow-sm border-2 border-black"
        style={{ width: 'fit-content', minWidth: 'max-content' }}
      >
        {/* 施設ヘッダー */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-700 text-white rounded-t-xl">
          <Link
            href={`/facilities/${facility.id}`}
            className="font-semibold text-sm hover:text-blue-300 transition-colors"
          >
            {facility.name}
          </Link>
          <div className="flex items-center gap-2 ml-4">
            <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {facility.totalResidents}名
            </span>
          </div>
        </div>

        {facility.units.length === 0 ? (
          <div className="p-4 text-gray-400 text-sm text-center">
            ユニットが登録されていません
          </div>
        ) : (
          <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                {facility.units.map(unit => (
                  <th
                    key={unit.id}
                    className="border border-black px-2 py-2 text-sm font-semibold text-gray-700 bg-gray-100 text-center"
                    style={{ width: COL_WIDTH, minWidth: COL_WIDTH, maxWidth: COL_WIDTH }}
                  >
                    <div>{unit.name}</div>
                    <div className="text-xs font-normal text-gray-500 mt-0.5">
                      {unit.residents.filter(r => !r.isRecentDischarge).length}名
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
                      const highlighted =
                        resident && (resident.isRecentAdmission || resident.isRecentDischarge)
                      // 定員設定あり、かつ利用者がいない行 = 空床
                      const isEmptyBed =
                        !resident && unit.capacity != null && rowIdx < unit.capacity
                      return (
                        <td
                          key={unit.id}
                          className="border border-black px-1 py-1.5 text-sm text-center"
                          style={{
                            width: COL_WIDTH,
                            minWidth: COL_WIDTH,
                            maxWidth: COL_WIDTH,
                            wordBreak: 'break-all',
                            backgroundColor: isEmptyBed
                              ? '#fce7f3'
                              : highlighted
                              ? '#fde68a'
                              : undefined,
                          }}
                        >
                          {resident ? (
                            <span
                              className={
                                resident.isRecentDischarge
                                  ? 'text-gray-400 line-through'
                                  : 'text-gray-800'
                              }
                            >
                              {getResidentDisplayName(resident, 'screen')}
                            </span>
                          ) : isEmptyBed ? (
                            <span className="text-pink-300 text-xs">空床</span>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/** 印刷用レイアウト（最大3ユニット/ページ、横向きA4、表のみ） */
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
        const maxRows = Math.max(
          ...group.map(u =>
            u.capacity != null ? Math.max(u.residents.length, u.capacity) : u.residents.length
          ),
          0
        )
        const isLast = groupIdx === groups.length - 1

        return (
          <div
            key={groupIdx}
            style={{
              // A4横 印刷エリア高さ: 210mm - 上下余白2cm = 190mm
              height: '190mm',
              overflow: 'hidden',
              pageBreakAfter: isLast ? 'avoid' : 'always',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <table
              style={{
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
                width: `calc(${group.length} * ${COL_WIDTH})`,
                height: '100%',
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
                        fontSize: '11pt',
                        fontWeight: 'bold',
                        backgroundColor: '#e5e7eb',
                        textAlign: 'center',
                        width: COL_WIDTH,
                        minWidth: COL_WIDTH,
                        maxWidth: COL_WIDTH,
                      }}
                    >
                      {unit.name}（{unit.residents.filter(r => !r.isRecentDischarge).length}名）
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
                        fontSize: '10pt',
                        color: '#888',
                      }}
                    >
                      利用者が登録されていません
                    </td>
                  </tr>
                ) : (
                  Array.from({ length: maxRows }, (_, rowIdx) => (
                    <tr key={rowIdx} style={{ height: `${Math.floor(100 / maxRows)}%` }}>
                      {group.map(unit => {
                        const resident = unit.residents[rowIdx]
                        const highlighted =
                          resident &&
                          (resident.isRecentAdmission || resident.isRecentDischarge)
                        const isEmptyBed =
                          !resident && unit.capacity != null && rowIdx < unit.capacity
                        return (
                          <td
                            key={unit.id}
                            style={{
                              border: '1px solid black',
                              padding: '2px 6px',
                              fontSize: '11pt',
                              textAlign: 'center',
                              wordBreak: 'break-all',
                              width: COL_WIDTH,
                              minWidth: COL_WIDTH,
                              maxWidth: COL_WIDTH,
                              backgroundColor: isEmptyBed
                                ? '#fce7f3'
                                : highlighted
                                ? '#fde68a'
                                : undefined,
                              textDecoration:
                                resident?.isRecentDischarge ? 'line-through' : undefined,
                              color: resident?.isRecentDischarge ? '#9ca3af' : undefined,
                            }}
                          >
                            {resident
                              ? getResidentDisplayName(resident, 'print')
                              : isEmptyBed
                              ? '空床'
                              : ''}
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
