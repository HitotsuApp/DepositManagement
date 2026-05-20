'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'

/** `/api/facilities` と同等の一覧要素（サイドバー・施設選択などで共有） */
export interface FacilityListEntry {
  id: number
  name: string
  isActive: boolean
}

interface FacilityContextType {
  selectedFacilityId: number | null
  setSelectedFacilityId: (facilityId: number | null) => void
  clearSelection: () => void
  hasCompletedSelection: boolean
  markSelectionCompleted: () => void
  facilities: FacilityListEntry[]
  facilitiesLoading: boolean
  facilitiesError: string | null
  refreshFacilities: () => Promise<void>
}

const FacilityContext = createContext<FacilityContextType | undefined>(undefined)

const STORAGE_KEY = 'selectedFacilityId'
const SELECTION_COMPLETED_KEY = 'facilitySelectionCompleted'

export function FacilityProvider({ children }: { children: ReactNode }) {
  const [selectedFacilityId, setSelectedFacilityIdState] = useState<number | null>(null)
  const [hasCompletedSelection, setHasCompletedSelectionState] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  const [facilities, setFacilities] = useState<FacilityListEntry[]>([])
  const [facilitiesLoading, setFacilitiesLoading] = useState(true)
  const [facilitiesError, setFacilitiesError] = useState<string | null>(null)

  // クライアントサイドでのみlocalStorageから読み込む
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const completed = localStorage.getItem(SELECTION_COMPLETED_KEY) === 'true'

    if (stored) {
      const facilityId = parseInt(stored, 10)
      if (!isNaN(facilityId)) {
        setSelectedFacilityIdState(facilityId)
      }
    }
    setHasCompletedSelectionState(completed)
    setIsHydrated(true)
  }, [])

  const refreshFacilities = useCallback(async () => {
    setFacilitiesLoading(true)
    setFacilitiesError(null)
    try {
      const res = await fetch('/api/facilities', { cache: 'default' })
      const data = await res.json()
      if (!res.ok) {
        const msg =
          typeof data?.error === 'string' ? data.error : '施設一覧の取得に失敗しました'
        setFacilities([])
        setFacilitiesError(msg)
        return
      }
      if (!Array.isArray(data)) {
        console.error('FacilityProvider: /api/facilities did not return an array', data)
        setFacilities([])
        setFacilitiesError('施設一覧の形式が不正です')
        return
      }
      setFacilities(data as FacilityListEntry[])
    } catch (e) {
      console.error('Failed to fetch facilities:', e)
      setFacilities([])
      setFacilitiesError('施設一覧の取得に失敗しました')
    } finally {
      setFacilitiesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    void refreshFacilities()
  }, [isHydrated, refreshFacilities])

  const setSelectedFacilityId = (facilityId: number | null) => {
    setSelectedFacilityIdState(facilityId)
    if (facilityId !== null) {
      localStorage.setItem(STORAGE_KEY, facilityId.toString())
      localStorage.setItem(SELECTION_COMPLETED_KEY, 'true')
      setHasCompletedSelectionState(true)
    } else {
      localStorage.removeItem(STORAGE_KEY)
      // nullに設定しても選択完了フラグは残す（法人全体を表示する選択をしたことを記録）
    }
  }

  const clearSelection = () => {
    setSelectedFacilityIdState(null)
    localStorage.removeItem(STORAGE_KEY)
    localStorage.setItem(SELECTION_COMPLETED_KEY, 'true')
    setHasCompletedSelectionState(true)
  }

  const markSelectionCompleted = () => {
    localStorage.setItem(SELECTION_COMPLETED_KEY, 'true')
    setHasCompletedSelectionState(true)
  }

  return (
    <FacilityContext.Provider
      value={{
        selectedFacilityId,
        setSelectedFacilityId,
        clearSelection,
        hasCompletedSelection,
        markSelectionCompleted,
        facilities,
        facilitiesLoading,
        facilitiesError,
        refreshFacilities,
      }}
    >
      {children}
    </FacilityContext.Provider>
  )
}

export function useFacility() {
  const context = useContext(FacilityContext)
  if (context === undefined) {
    throw new Error('useFacility must be used within a FacilityProvider')
  }
  return context
}
