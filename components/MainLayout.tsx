'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Sidebar from './Sidebar'

const SIDEBAR_WIDTH_STORAGE_KEY = 'sidebarWidth'
const DEFAULT_SIDEBAR_WIDTH = 256 // w-64 = 256px
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 500

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  // localStorageから幅を読み込む
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    if (stored) {
      const width = parseInt(stored, 10)
      if (!isNaN(width) && width >= MIN_SIDEBAR_WIDTH && width <= MAX_SIDEBAR_WIDTH) {
        setSidebarWidth(width)
      }
    }
  }, [])

  // 幅をlocalStorageに保存
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, sidebarWidth.toString())
  }, [sidebarWidth])

  // マウスダウン時の処理
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  // マウスムーブ時の処理
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (sidebarRef.current) {
        const newWidth = e.clientX
        if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
          setSidebarWidth(newWidth)
        }
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  return (
    <div className="flex min-h-screen">
      <div 
        ref={sidebarRef}
        className="no-print-sidebar relative"
        style={{ width: `${sidebarWidth}px`, minWidth: `${MIN_SIDEBAR_WIDTH}px`, maxWidth: `${MAX_SIDEBAR_WIDTH}px` }}
      >
        <Sidebar />
        {/* リサイズハンドル */}
        <div
          className="resize-handle absolute top-0 right-0 w-1 h-full z-10 transition-colors"
          onMouseDown={handleMouseDown}
          style={{ 
            backgroundColor: isResizing ? 'rgba(59, 130, 246, 0.8)' : 'transparent',
            cursor: 'col-resize'
          }}
        />
      </div>
      <main className="flex-1 p-8 bg-gray-50">
        {children}
      </main>
    </div>
  )
}

