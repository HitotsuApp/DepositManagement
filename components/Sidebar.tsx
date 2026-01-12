'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

interface Facility {
  id: number
  name: string
  isActive: boolean
}

export default function Sidebar() {
  const pathname = usePathname()
  const [facilities, setFacilities] = useState<Facility[]>([])

  useEffect(() => {
    fetch('/api/facilities')
      .then(res => res.json())
      .then(data => setFacilities(data.filter((f: Facility) => f.isActive)))
      .catch(err => console.error('Failed to fetch facilities:', err))
  }, [])

  const isActive = (path: string) => pathname === path

  return (
    <div className="w-64 text-white min-h-screen p-4" style={{ backgroundColor: 'rgba(62, 77, 101, 1)' }}>
      <h1 className="text-xl font-bold mb-6">預かり金管理</h1>
      
      <nav className="space-y-2">
        <Link
          href="/"
          className={`block px-4 py-2 rounded hover:bg-gray-700 ${
            isActive('/') ? 'bg-gray-700' : ''
          }`}
        >
          法人ダッシュボード
        </Link>
        
        <div className="pt-4 border-t border-gray-700">
          <h2 className="px-4 py-2 text-sm font-semibold text-gray-400">施設一覧</h2>
          {facilities.map(facility => (
            <Link
              key={facility.id}
              href={`/facilities/${facility.id}`}
              className={`block px-4 py-2 rounded hover:bg-gray-700 ${
                isActive(`/facilities/${facility.id}`) ? 'bg-gray-700' : ''
              }`}
            >
              {facility.name}
            </Link>
          ))}
        </div>

        <div className="pt-4 border-t border-gray-700">
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
          <Link
            href="/import"
            className={`block px-4 py-2 rounded hover:bg-gray-700 ${
              isActive('/import') ? 'bg-gray-700' : ''
            }`}
          >
            データインポート
          </Link>
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

