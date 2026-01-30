'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useFacility } from '@/contexts/FacilityContext'

interface Facility {
  id: number
  name: string
  isActive: boolean
}

export default function Sidebar() {
  const pathname = usePathname()
  const { selectedFacilityId } = useFacility()
  const [facilities, setFacilities] = useState<Facility[]>([])

  useEffect(() => {
    fetch('/api/facilities')
      .then(res => res.json())
      .then(data => {
        const activeFacilities = data.filter((f: Facility) => f.isActive)
        // 施設が選択されている場合、その施設のみを表示
        if (selectedFacilityId !== null) {
          const filtered = activeFacilities.filter((f: Facility) => f.id === selectedFacilityId)
          setFacilities(filtered)
        } else {
          setFacilities(activeFacilities)
        }
      })
      .catch(err => console.error('Failed to fetch facilities:', err))
  }, [selectedFacilityId])

  const isActive = (path: string) => pathname === path

  const selectedFacility = facilities.find(f => f.id === selectedFacilityId)

  return (
    <div className="text-white min-h-screen p-4" style={{ backgroundColor: 'rgba(62, 77, 101, 1)' }}>
      <h1 className="text-xl font-bold mb-6">預り金管理</h1>
      
      {/* 選択中の施設表示 */}
      {selectedFacilityId !== null && selectedFacility ? (
        <div className="mb-4 p-3 bg-blue-600 rounded-lg border-2 border-blue-400">
          <p className="text-xs text-blue-200 mb-1">選択中の施設</p>
          <p className="text-sm font-semibold text-white">{selectedFacility.name}</p>
        </div>
      ) : (
        <div className="mb-4 p-3 bg-gray-700 rounded-lg border border-gray-600">
          <p className="text-xs text-gray-400 mb-1">表示モード</p>
          <p className="text-sm font-semibold text-gray-300">法人全体</p>
        </div>
      )}
      
      <nav className="space-y-2">
        {/* 法人ダッシュボード: 法人全体表示時のみ表示 */}
        {selectedFacilityId === null && (
          <Link
            href="/"
            className={`block px-4 py-2 rounded hover:bg-gray-700 ${
              isActive('/') ? 'bg-gray-700' : ''
            }`}
          >
            法人ダッシュボード
          </Link>
        )}
        
        <div className="pt-4 border-t border-gray-700">
          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="text-sm font-semibold text-gray-400">施設一覧</h2>
            {selectedFacilityId !== null && (
              <Link
                href="/facility-select"
                className="text-xs text-blue-400 hover:text-blue-300"
                title="施設選択を変更"
              >
                変更
              </Link>
            )}
          </div>
          {facilities.length > 0 ? (
            facilities.map(facility => (
              <Link
                key={facility.id}
                href={`/facilities/${facility.id}`}
                className={`block px-4 py-2 rounded hover:bg-gray-700 ${
                  isActive(`/facilities/${facility.id}`) ? 'bg-gray-700' : ''
                } ${
                  facility.id === selectedFacilityId ? 'bg-blue-600 hover:bg-blue-700' : ''
                }`}
              >
                {facility.name}
              </Link>
            ))
          ) : selectedFacilityId !== null ? (
            <p className="px-4 py-2 text-sm text-gray-500">施設が見つかりません</p>
          ) : null}
        </div>

        <div className="pt-4 border-t border-gray-700">
          {/* 施設TOP: 施設選択時のみ表示 */}
          {selectedFacilityId !== null && (
            <Link
              href={`/facilities/${selectedFacilityId}`}
              className={`block px-4 py-2 rounded hover:bg-gray-700 ${
                isActive(`/facilities/${selectedFacilityId}`) ? 'bg-gray-700' : ''
              }`}
            >
              施設TOP
            </Link>
          )}
          <Link
            href="/facility-select"
            className={`block px-4 py-2 rounded hover:bg-gray-700 ${
              isActive('/facility-select') ? 'bg-gray-700' : ''
            }`}
          >
            施設選択
          </Link>
          <Link
            href="/print"
            className={`block px-4 py-2 rounded hover:bg-gray-700 ${
              isActive('/print') ? 'bg-gray-700' : ''
            }`}
          >
            まとめて印刷
          </Link>
          <Link
            href="/master"
            className={`block px-4 py-2 rounded hover:bg-gray-700 ${
              isActive('/master') ? 'bg-gray-700' : ''
            }`}
          >
            マスタ管理
          </Link>
          {/* データインポート: 法人全体表示時のみ表示 */}
          {selectedFacilityId === null && (
            <Link
              href="/import"
              className={`block px-4 py-2 rounded hover:bg-gray-700 ${
                isActive('/import') ? 'bg-gray-700' : ''
              }`}
            >
              データインポート
            </Link>
          )}
          <Link
            href="/cash-verification"
            className={`block px-4 py-2 rounded hover:bg-gray-700 ${
              isActive('/cash-verification') ? 'bg-gray-700' : ''
            }`}
          >
            現金確認
          </Link>
        </div>
      </nav>
    </div>
  )
}

