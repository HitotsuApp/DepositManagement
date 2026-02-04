"use client";

import { Suspense } from "react";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import MainLayout from '@/components/MainLayout'
import Modal from '@/components/Modal'
import { useFacility } from '@/contexts/FacilityContext'
import { invalidateMasterCache } from '@/lib/cache'

interface Facility {
  id: number
  name: string
  positionName?: string | null
  positionHolderName?: string | null
  sortOrder: number
  isActive: boolean
}

interface Unit {
  id: number
  facilityId: number
  name: string
  isActive: boolean
  facility?: {
    id: number
    name: string
  }
}

interface Resident {
  id: number
  facilityId: number
  unitId: number
  name: string
  isActive: boolean
  facility?: {
    id: number
    name: string
  }
  unit?: {
    id: number
    name: string
  }
  startDate?: string | null
  endDate?: string | null
}

// 1. ロジック本体（ここで hooks を使う）
function MasterContent() {
  const searchParams = useSearchParams();
  const router = useRouter()
  const { selectedFacilityId } = useFacility()
  
  // すべてのuseStateを条件分岐の前に配置
  const [isMounted, setIsMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [residents, setResidents] = useState<Resident[]>([])
  
  // 施設マスタ用の状態
  const [showFacilityModal, setShowFacilityModal] = useState(false)
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null)
  const [facilityForm, setFacilityForm] = useState({ name: '', positionName: '', positionHolderName: '', sortOrder: 0 })

  // ユニットマスタ用の状態
  const [showUnitModal, setShowUnitModal] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)
  const [unitForm, setUnitForm] = useState({ facilityId: 0, name: '' })

  // 利用者マスタ用の状態
  const [showResidentModal, setShowResidentModal] = useState(false)
  const [editingResident, setEditingResident] = useState<Resident | null>(null)
  const [residentForm, setResidentForm] = useState({ facilityId: 0, unitId: 0, name: '', startDate: '', endDate: '' })
  const [showResidentEndConfirm, setShowResidentEndConfirm] = useState<number | null>(null)
  const [availableUnits, setAvailableUnits] = useState<Unit[]>([])
  const [isSubmittingResident, setIsSubmittingResident] = useState(false)
  
  const tabParam = searchParams.get('tab') as 'facility' | 'unit' | 'resident' | null
  const [activeTab, setActiveTab] = useState<'facility' | 'unit' | 'resident'>(
    tabParam && ['facility', 'unit', 'resident'].includes(tabParam) ? tabParam : 'facility'
  )

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    // URLパラメータからタブを設定（現在の値と異なる場合のみ更新）
    const tabParam = searchParams.get('tab') as 'facility' | 'unit' | 'resident' | null
    if (tabParam && ['facility', 'unit', 'resident'].includes(tabParam)) {
      setActiveTab(prevTab => {
        // 現在の値と異なる場合のみ更新
        if (tabParam !== prevTab) {
          return tabParam
        }
        return prevTab
      })
    }
  }, [searchParams])

  // fetch関数をuseCallbackでメモ化して無限ループを防ぐ
  const fetchFacilities = useCallback(async () => {
    setIsLoading(true)
    try {
      // 施設マスタタブでは全施設を表示（選択された施設はハイライト）
      // 他のタブでは選択された施設のみを取得（ドロップダウン用）
      const url = activeTab === 'facility'
        ? '/api/facilities?includeInactive=true'
        : selectedFacilityId
        ? `/api/facilities?includeInactive=true&facilityId=${selectedFacilityId}`
        : '/api/facilities?includeInactive=true'
      const res = await fetch(url)
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      // エラーオブジェクトの場合は空配列を設定
      if (data.error || !Array.isArray(data)) {
        console.error('Failed to fetch facilities:', data.error || 'Invalid response format')
        setFacilities([])
        return
      }
      // 配列であることを確認
      const facilitiesArray = Array.isArray(data) ? data : []
      setFacilities(facilitiesArray)
    } catch (error) {
      console.error('Failed to fetch facilities:', error)
      setFacilities([])
      alert('施設データの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [activeTab, selectedFacilityId])

  const fetchUnits = useCallback(async () => {
    setIsLoading(true)
    try {
      // 選択された施設がある場合、その施設のユニットのみを取得
      const url = selectedFacilityId
        ? `/api/units?includeInactive=true&facilityId=${selectedFacilityId}`
        : '/api/units?includeInactive=true'
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      // エラーオブジェクトの場合は空配列を設定
      if (data.error || !Array.isArray(data)) {
        console.error('Failed to fetch units:', data.error || 'Invalid response format')
        setUnits([])
        return
      }
      setUnits(data)
    } catch (error) {
      console.error('Failed to fetch units:', error)
      setUnits([])
      alert('ユニットデータの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [selectedFacilityId])

  const fetchResidents = useCallback(async () => {
    setIsLoading(true)
    try {
      // 選択された施設がある場合、その施設の利用者のみを取得
      // includeInactive=trueで全利用者を取得し、endDateでフィルタリング
      const url = selectedFacilityId
        ? `/api/residents?includeInactive=true&facilityId=${selectedFacilityId}`
        : '/api/residents?includeInactive=true'
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      // エラーオブジェクトの場合は空配列を設定
      if (data.error || !Array.isArray(data)) {
        console.error('Failed to fetch residents:', data.error || 'Invalid response format')
        setResidents([])
        return
      }
      setResidents(data)
    } catch (error) {
      console.error('Failed to fetch residents:', error)
      setResidents([])
      alert('利用者データの取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [selectedFacilityId])

  useEffect(() => {
    if (activeTab === 'facility') {
      fetchFacilities()
    } else if (activeTab === 'unit') {
      fetchFacilities() // ユニットマスタでも施設リストが必要
      fetchUnits()
    } else {
      fetchFacilities() // 利用者マスタでも施設リストが必要
      fetchResidents()
    }
  }, [activeTab, fetchFacilities, fetchUnits, fetchResidents])

  // 施設マスタの関数
  const handleAddFacility = () => {
    setEditingFacility(null)
    // 新しい施設は最後に追加されるように、最大のsortOrder + 1を設定
    const maxSortOrder = facilities.length > 0 
      ? Math.max(...facilities.map(f => f.sortOrder)) 
      : -1
    setFacilityForm({ name: '', positionName: '', positionHolderName: '', sortOrder: maxSortOrder + 1 })
    setShowFacilityModal(true)
  }

  const handleEditFacility = (facility: Facility) => {
    setEditingFacility(facility)
    setFacilityForm({ 
      name: facility.name, 
      positionName: facility.positionName || '', 
      positionHolderName: facility.positionHolderName || '', 
      sortOrder: facility.sortOrder 
    })
    setShowFacilityModal(true)
  }

  const handleSaveFacility = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingFacility) {
        // 編集
        const res = await fetch(`/api/facilities/${editingFacility.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(facilityForm),
        })
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: '更新に失敗しました' }))
          throw new Error(errorData.error || '更新に失敗しました')
        }
        alert('施設を更新しました')
      } else {
        // 追加
        const res = await fetch('/api/facilities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(facilityForm),
        })
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: '追加に失敗しました' }))
          throw new Error(errorData.error || '追加に失敗しました')
        }
        alert('施設を追加しました')
      }
      setShowFacilityModal(false)
      
      // マスタデータのキャッシュを無効化
      await invalidateMasterCache(editingFacility?.id || undefined)
      
      // Next.jsのサーバーコンポーネントのキャッシュも無効化
      router.refresh()
      
      fetchFacilities()
    } catch (error: any) {
      console.error('Failed to save facility:', error)
      alert(error.message || '保存に失敗しました')
    }
  }


  const handleReorderFacility = async (facilityId: number, direction: 'up' | 'down') => {
    try {
      const res = await fetch('/api/facilities/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facilityId, direction }),
      })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || '順序変更に失敗しました')
      }
      const updatedFacilities = await res.json()
      setFacilities(updatedFacilities)
      
      // マスタデータのキャッシュを無効化
      await invalidateMasterCache(facilityId)
      
      // Next.jsのサーバーコンポーネントのキャッシュも無効化
      router.refresh()
    } catch (error: any) {
      console.error('Failed to reorder facility:', error)
      alert(error.message || '順序変更に失敗しました')
    }
  }

  // ユニットマスタの関数
  const handleAddUnit = () => {
    setEditingUnit(null)
    // 選択された施設がある場合はそれをデフォルトで選択
    const defaultFacilityId = selectedFacilityId || (facilities.length > 0 ? facilities[0].id : 0)
    setUnitForm({ facilityId: defaultFacilityId, name: '' })
    setShowUnitModal(true)
  }

  const handleEditUnit = (unit: Unit) => {
    setEditingUnit(unit)
    setUnitForm({ facilityId: unit.facilityId, name: unit.name })
    setShowUnitModal(true)
  }

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // バリデーション
    if (!unitForm.facilityId || unitForm.facilityId === 0) {
      alert('施設を選択してください')
      return
    }
    
    if (!unitForm.name || unitForm.name.trim() === '') {
      alert('ユニット名を入力してください')
      return
    }

    try {
      if (editingUnit) {
        const res = await fetch(`/api/units/${editingUnit.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(unitForm),
        })
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || '更新に失敗しました')
        }
        alert('ユニットを更新しました')
      } else {
        const res = await fetch('/api/units', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(unitForm),
        })
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || '追加に失敗しました')
        }
        alert('ユニットを追加しました')
      }
      setShowUnitModal(false)
      
      // マスタデータのキャッシュを無効化
      await invalidateMasterCache(unitForm.facilityId)
      
      // Next.jsのサーバーコンポーネントのキャッシュも無効化
      router.refresh()
      
      fetchUnits()
    } catch (error: any) {
      console.error('Failed to save unit:', error)
      alert(error.message || '保存に失敗しました')
    }
  }

  // 利用者マスタの関数
  const handleAddResident = () => {
    setEditingResident(null)
    // 選択された施設がある場合はそれをデフォルトで選択
    const defaultFacilityId = selectedFacilityId || (facilities.length > 0 ? facilities[0].id : 0)
    setResidentForm({ 
      facilityId: defaultFacilityId, 
      unitId: 0, 
      name: '', 
      startDate: '', 
      endDate: '' 
    })
    setShowResidentModal(true)
    if (defaultFacilityId > 0) {
      loadUnitsForFacility(defaultFacilityId)
    }
  }

  const handleEditResident = (resident: Resident) => {
    setEditingResident(resident)
    setResidentForm({ 
      facilityId: resident.facilityId, 
      unitId: resident.unitId, 
      name: resident.name,
      startDate: resident.startDate ? resident.startDate.split('T')[0] : '',
      endDate: resident.endDate ? resident.endDate.split('T')[0] : '',
    })
    setShowResidentModal(true)
    loadUnitsForFacility(resident.facilityId)
  }

  const loadUnitsForFacility = async (facilityId: number) => {
    try {
      const res = await fetch('/api/units?includeInactive=true')
      const allUnits = await res.json()
      const filteredUnits = allUnits.filter((u: Unit) => u.facilityId === facilityId && u.isActive)
      setAvailableUnits(filteredUnits)
      if (filteredUnits.length > 0 && !editingResident) {
        setResidentForm(prev => ({ ...prev, unitId: filteredUnits[0].id }))
      }
    } catch (error) {
      console.error('Failed to load units:', error)
    }
  }

  const handleSaveResident = async () => {
    if (isSubmittingResident) return
    setIsSubmittingResident(true)
    try {
      if (editingResident) {
        const res = await fetch(`/api/residents/${editingResident.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...residentForm,
            startDate: residentForm.startDate || null,
            endDate: residentForm.endDate || null,
          }),
        })
        if (!res.ok) {
          throw new Error('更新に失敗しました')
        }
        alert('利用者を更新しました')
      } else {
        const res = await fetch('/api/residents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...residentForm,
            startDate: residentForm.startDate || null,
            endDate: residentForm.endDate || null,
          }),
        })
        if (!res.ok) {
          throw new Error('追加に失敗しました')
        }
        alert('利用者を追加しました')
      }
      setShowResidentModal(false)
      
      // マスタデータのキャッシュを無効化
      await invalidateMasterCache(residentForm.facilityId)
      
      // Next.jsのサーバーコンポーネントのキャッシュも無効化
      router.refresh()
      
      fetchResidents()
    } catch (error: any) {
      console.error('Failed to save resident:', error)
      alert(error.message || '保存に失敗しました')
    } finally {
      setIsSubmittingResident(false)
    }
  }

  const handleEndResident = async (residentId: number) => {
    try {
      // 今日の日付を設定
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch(`/api/residents/${residentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facilityId: residents.find(r => r.id === residentId)?.facilityId || 0,
          unitId: residents.find(r => r.id === residentId)?.unitId || 0,
          name: residents.find(r => r.id === residentId)?.name || '',
          startDate: residents.find(r => r.id === residentId)?.startDate || null,
          endDate: today,
        }),
      })
      if (!res.ok) {
        throw new Error('終了処理に失敗しました')
      }
      alert('利用者を終了しました')
      setShowResidentEndConfirm(null)
      
      // マスタデータのキャッシュを無効化
      const endedResident = residents.find(r => r.id === residentId)
      await invalidateMasterCache(endedResident?.facilityId)
      
      // Next.jsのサーバーコンポーネントのキャッシュも無効化
      router.refresh()
      
      fetchResidents()
    } catch (error: any) {
      console.error('Failed to end resident:', error)
      alert(error.message || '終了処理に失敗しました')
    }
  }

  if (!isMounted) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="text-xl mb-4">読み込み中...</div>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div>
        <h1 className="text-3xl font-bold mb-6">マスタ管理</h1>

        <div className="mb-6">
          <div className="flex gap-2 border-b">
            <button
              onClick={() => setActiveTab('facility')}
              className={`px-4 py-2 ${
                activeTab === 'facility' ? 'border-b-2 border-blue-500' : ''
              }`}
            >
              施設マスタ
            </button>
            <button
              onClick={() => setActiveTab('unit')}
              className={`px-4 py-2 ${
                activeTab === 'unit' ? 'border-b-2 border-blue-500' : ''
              }`}
            >
              ユニットマスタ
            </button>
            <button
              onClick={() => setActiveTab('resident')}
              className={`px-4 py-2 ${
                activeTab === 'resident' ? 'border-b-2 border-blue-500' : ''
              }`}
            >
              利用者マスタ
            </button>
          </div>
        </div>

        {activeTab === 'facility' && (
          <div>
            <div className="mb-4 flex items-start gap-4">
              <button
                onClick={handleAddFacility}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                施設を追加
              </button>
              <div className="text-sm text-gray-600 mt-2">
                <p>・預り金明細書に記載される施設名および役職、役職者の名前を登録してください。</p>
                <p>・役職者の名前が変わった際は施設を追加ではなく編集にて修正してください。</p>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left">施設名</th>
                    <th className="px-4 py-3 text-left">役職名</th>
                    <th className="px-4 py-3 text-left">役職者の名前</th>
                    <th className="px-4 py-3 text-left">表示順</th>
                    <th className="px-4 py-3 text-left">状態</th>
                    <th className="px-4 py-3 text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8">
                        <div className="animate-pulse space-y-2">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="flex gap-4">
                              <div className="h-4 bg-gray-200 rounded w-32"></div>
                              <div className="h-4 bg-gray-200 rounded w-24"></div>
                              <div className="h-4 bg-gray-200 rounded w-32"></div>
                              <div className="h-4 bg-gray-200 rounded w-16"></div>
                              <div className="h-4 bg-gray-200 rounded w-16"></div>
                              <div className="h-4 bg-gray-200 rounded w-24"></div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : facilities.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        施設が登録されていません
                      </td>
                    </tr>
                  ) : (
                    facilities.map((facility, index) => (
                      <tr
                        key={facility.id}
                        className={`border-t ${
                          facility.id === selectedFacilityId ? 'bg-blue-50' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          {facility.name}
                          {facility.id === selectedFacilityId && (
                            <span className="ml-2 text-xs text-blue-600 font-semibold">(選択中)</span>
                          )}
                        </td>
                        <td className="px-4 py-3">{facility.positionName || '-'}</td>
                        <td className="px-4 py-3">{facility.positionHolderName || '-'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span>{facility.sortOrder}</span>
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => handleReorderFacility(facility.id, 'up')}
                                disabled={index === 0}
                                className={`px-2 py-1 text-xs rounded ${
                                  index === 0
                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                                }`}
                                title="上に移動"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => handleReorderFacility(facility.id, 'down')}
                                disabled={index === facilities.length - 1}
                                className={`px-2 py-1 text-xs rounded ${
                                  index === facilities.length - 1
                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                                }`}
                                title="下に移動"
                              >
                                ↓
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-sm ${
                            facility.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {facility.isActive ? '有効' : '無効'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleEditFacility(facility)}
                            className="text-blue-500 hover:underline"
                          >
                            編集
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 施設追加・編集モーダル */}
            <Modal
              isOpen={showFacilityModal}
              onClose={() => setShowFacilityModal(false)}
              title={editingFacility ? '施設を編集' : '施設を追加'}
            >
              <form onSubmit={handleSaveFacility}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">施設名 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      maxLength={30}
                      value={facilityForm.name}
                      onChange={(e) => setFacilityForm({ ...facilityForm, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded"
                      placeholder="施設名を入力"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">役職名</label>
                    <input
                      type="text"
                      maxLength={30}
                      value={facilityForm.positionName}
                      onChange={(e) => setFacilityForm({ ...facilityForm, positionName: e.target.value })}
                      className="w-full px-3 py-2 border rounded"
                      placeholder="役職名を入力"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">役職者の名前</label>
                    <input
                      type="text"
                      maxLength={30}
                      value={facilityForm.positionHolderName}
                      onChange={(e) => setFacilityForm({ ...facilityForm, positionHolderName: e.target.value })}
                      className="w-full px-3 py-2 border rounded"
                      placeholder="役職者の名前を入力"
                    />
                  </div>
                  <div className="flex gap-4 pt-4">
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      {editingFacility ? '更新' : '追加'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFacilityModal(false)}
                      className="flex-1 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              </form>
            </Modal>

          </div>
        )}

        {activeTab === 'unit' && (
          <div>
            <button
              onClick={handleAddUnit}
              className="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              ユニットを追加
            </button>
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left">施設</th>
                    <th className="px-4 py-3 text-left">ユニット名</th>
                    <th className="px-4 py-3 text-left">状態</th>
                    <th className="px-4 py-3 text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8">
                        <div className="animate-pulse space-y-2">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="flex gap-4">
                              <div className="h-4 bg-gray-200 rounded w-32"></div>
                              <div className="h-4 bg-gray-200 rounded w-32"></div>
                              <div className="h-4 bg-gray-200 rounded w-16"></div>
                              <div className="h-4 bg-gray-200 rounded w-24"></div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : units.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        ユニットが登録されていません
                      </td>
                    </tr>
                  ) : (
                    units.map(unit => (
                      <tr key={unit.id} className="border-t">
                        <td className="px-4 py-3">{unit.facility?.name || `施設ID: ${unit.facilityId}`}</td>
                        <td className="px-4 py-3">{unit.name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-sm ${
                            unit.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {unit.isActive ? '有効' : '無効'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleEditUnit(unit)}
                            className="text-blue-500 hover:underline"
                          >
                            編集
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* ユニット追加・編集モーダル */}
            <Modal
              isOpen={showUnitModal}
              onClose={() => setShowUnitModal(false)}
              title={editingUnit ? 'ユニットを編集' : 'ユニットを追加'}
            >
              <form onSubmit={handleSaveUnit}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">施設 <span className="text-red-500">*</span></label>
                    <select
                      required
                      value={unitForm.facilityId}
                      onChange={(e) => setUnitForm({ ...unitForm, facilityId: Number(e.target.value) })}
                      className="w-full px-3 py-2 border rounded"
                      disabled={selectedFacilityId !== null}
                    >
                      <option value={0}>施設を選択</option>
                      {facilities.filter(f => f.isActive).map(facility => (
                        <option key={facility.id} value={facility.id}>
                          {facility.name}
                        </option>
                      ))}
                    </select>
                    {selectedFacilityId !== null && (
                      <p className="text-xs text-gray-500 mt-1">
                        施設は選択中の施設に固定されています
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">ユニット名 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      maxLength={30}
                      value={unitForm.name}
                      onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded"
                      placeholder="ユニット名を入力"
                    />
                  </div>
                  <div className="flex gap-4 pt-4">
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      {editingUnit ? '更新' : '追加'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowUnitModal(false)}
                      className="flex-1 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              </form>
            </Modal>
          </div>
        )}

        {activeTab === 'resident' && (
          <div>
            <button
              onClick={handleAddResident}
              className="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              利用者を追加
            </button>
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left">施設</th>
                    <th className="px-4 py-3 text-left">ユニット</th>
                    <th className="px-4 py-3 text-left">利用者名</th>
                    <th className="px-4 py-3 text-left">状態</th>
                    <th className="px-4 py-3 text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8">
                        <div className="animate-pulse space-y-2">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="flex gap-4">
                              <div className="h-4 bg-gray-200 rounded w-32"></div>
                              <div className="h-4 bg-gray-200 rounded w-24"></div>
                              <div className="h-4 bg-gray-200 rounded w-24"></div>
                              <div className="h-4 bg-gray-200 rounded w-24"></div>
                              <div className="h-4 bg-gray-200 rounded w-24"></div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : residents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        利用者が登録されていません
                      </td>
                    </tr>
                  ) : (
                    residents
                      .filter(resident => !resident.endDate) // 終了日が設定されていない利用者のみ表示
                      .map(resident => (
                      <tr key={resident.id} className="border-t">
                        <td className="px-4 py-3">{resident.facility?.name || `施設ID: ${resident.facilityId}`}</td>
                        <td className="px-4 py-3">{resident.unit?.name || `ユニットID: ${resident.unitId}`}</td>
                        <td className="px-4 py-3">{resident.name}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 rounded text-sm bg-green-100 text-green-800">
                            利用中
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleEditResident(resident)}
                            className="text-blue-500 hover:underline mr-4"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => setShowResidentEndConfirm(resident.id)}
                            className="text-red-500 hover:underline"
                          >
                            終了
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 利用者追加・編集モーダル */}
            <Modal
              isOpen={showResidentModal}
              onClose={() => {
                if (!isSubmittingResident) {
                  setShowResidentModal(false)
                }
              }}
              title={editingResident ? '利用者を編集' : '利用者を追加'}
            >
              <form onSubmit={(e) => { e.preventDefault(); }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">施設 <span className="text-red-500">*</span></label>
                    <select
                      required
                      value={residentForm.facilityId}
                      onChange={(e) => {
                        const facilityId = Number(e.target.value)
                        setResidentForm({ ...residentForm, facilityId, unitId: 0 })
                        loadUnitsForFacility(facilityId)
                      }}
                      className="w-full px-3 py-2 border rounded"
                      disabled={selectedFacilityId !== null}
                    >
                      <option value={0}>施設を選択</option>
                      {facilities.filter(f => f.isActive).map(facility => (
                        <option key={facility.id} value={facility.id}>
                          {facility.name}
                        </option>
                      ))}
                    </select>
                    {selectedFacilityId !== null && (
                      <p className="text-xs text-gray-500 mt-1">
                        施設は選択中の施設に固定されています
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">ユニット <span className="text-red-500">*</span></label>
                    <select
                      required
                      value={residentForm.unitId}
                      onChange={(e) => setResidentForm({ ...residentForm, unitId: Number(e.target.value) })}
                      className="w-full px-3 py-2 border rounded"
                      disabled={availableUnits.length === 0}
                    >
                      <option value={0}>ユニットを選択</option>
                      {availableUnits.map(unit => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                    </select>
                    {availableUnits.length === 0 && residentForm.facilityId > 0 && (
                      <p className="text-sm text-gray-500 mt-1">この施設にユニットが登録されていません</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">利用者名 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      maxLength={30}
                      value={residentForm.name}
                      onChange={(e) => setResidentForm({ ...residentForm, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded"
                      placeholder="利用者名を入力"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">開始日</label>
                    <input
                      type="date"
                      value={residentForm.startDate}
                      onChange={(e) => setResidentForm({ ...residentForm, startDate: e.target.value })}
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">終了日</label>
                    <input
                      type="date"
                      value={residentForm.endDate}
                      onChange={(e) => setResidentForm({ ...residentForm, endDate: e.target.value })}
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                  <div className="flex gap-4 pt-4">
                    <button
                      type="button"
                      onClick={handleSaveResident}
                      className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      disabled={isSubmittingResident || (availableUnits.length === 0 && residentForm.facilityId > 0)}
                    >
                      {isSubmittingResident ? '追加中...' : (editingResident ? '更新' : '追加')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isSubmittingResident) {
                          setShowResidentModal(false)
                        }
                      }}
                      className="flex-1 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400 disabled:bg-gray-200 disabled:cursor-not-allowed"
                      disabled={isSubmittingResident}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              </form>
            </Modal>

            {/* 利用者終了確認モーダル */}
            <Modal
              isOpen={showResidentEndConfirm !== null}
              onClose={() => setShowResidentEndConfirm(null)}
              title="利用者の終了確認"
            >
              <div className="space-y-4">
                <p className="text-gray-700">
                  この利用者を終了しますか？終了後もデータは保持されますが、通常の利用者一覧からは非表示になり、利用終了者一覧に表示されます。
                </p>
                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => {
                      if (showResidentEndConfirm !== null) {
                        handleEndResident(showResidentEndConfirm)
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    終了する
                  </button>
                  <button
                    onClick={() => setShowResidentEndConfirm(null)}
                    className="flex-1 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </Modal>

            {/* 利用終了者一覧 */}
            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-4">利用終了者一覧</h2>
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left">施設</th>
                      <th className="px-4 py-3 text-left">ユニット</th>
                      <th className="px-4 py-3 text-left">利用者名</th>
                      <th className="px-4 py-3 text-left">開始日</th>
                      <th className="px-4 py-3 text-left">終了日</th>
                      <th className="px-4 py-3 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {residents.filter(resident => resident.endDate).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                          利用終了者がいません
                        </td>
                      </tr>
                    ) : (
                      residents
                        .filter(resident => resident.endDate) // 終了日が設定されている利用者のみ表示
                        .map(resident => (
                        <tr key={resident.id} className="border-t">
                          <td className="px-4 py-3">{resident.facility?.name || `施設ID: ${resident.facilityId}`}</td>
                          <td className="px-4 py-3">{resident.unit?.name || `ユニットID: ${resident.unitId}`}</td>
                          <td className="px-4 py-3">{resident.name}</td>
                          <td className="px-4 py-3">
                            {resident.startDate 
                              ? new Date(resident.startDate).toLocaleDateString('ja-JP')
                              : '-'}
                          </td>
                          <td className="px-4 py-3">
                            {resident.endDate 
                              ? new Date(resident.endDate).toLocaleDateString('ja-JP')
                              : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleEditResident(resident)}
                              className="text-blue-500 hover:underline"
                            >
                              編集
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

// 2. ページのエントリポイント（ここにはロジックを書かない）
export default function MasterPage() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <MasterContent />
    </Suspense>
  )
}
