'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import MainLayout from '@/components/MainLayout'
import Modal from '@/components/Modal'

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

export default function MasterPage() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as 'facility' | 'unit' | 'resident' | null
  const [activeTab, setActiveTab] = useState<'facility' | 'unit' | 'resident'>(
    tabParam && ['facility', 'unit', 'resident'].includes(tabParam) ? tabParam : 'facility'
  )
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [residents, setResidents] = useState<Resident[]>([])
  
  // 施設マスタ用の状態
  const [showFacilityModal, setShowFacilityModal] = useState(false)
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null)
  const [facilityForm, setFacilityForm] = useState({ name: '', positionName: '', positionHolderName: '', sortOrder: 0 })
  const [showFacilityDeactivateConfirm, setShowFacilityDeactivateConfirm] = useState<number | null>(null)

  // ユニットマスタ用の状態
  const [showUnitModal, setShowUnitModal] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)
  const [unitForm, setUnitForm] = useState({ facilityId: 0, name: '' })
  const [showUnitDeactivateConfirm, setShowUnitDeactivateConfirm] = useState<number | null>(null)

  // 利用者マスタ用の状態
  const [showResidentModal, setShowResidentModal] = useState(false)
  const [editingResident, setEditingResident] = useState<Resident | null>(null)
  const [residentForm, setResidentForm] = useState({ facilityId: 0, unitId: 0, name: '', startDate: '', endDate: '' })
  const [showResidentDeactivateConfirm, setShowResidentDeactivateConfirm] = useState<number | null>(null)
  const [availableUnits, setAvailableUnits] = useState<Unit[]>([])

  useEffect(() => {
    // URLパラメータからタブを設定
    const tabParam = searchParams.get('tab') as 'facility' | 'unit' | 'resident' | null
    if (tabParam && ['facility', 'unit', 'resident'].includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [searchParams])

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
  }, [activeTab])

  const fetchFacilities = async () => {
    try {
      const res = await fetch('/api/facilities?includeInactive=true')
      const data = await res.json()
      setFacilities(data)
    } catch (error) {
      console.error('Failed to fetch facilities:', error)
      alert('施設データの取得に失敗しました')
    }
  }

  const fetchUnits = async () => {
    try {
      const res = await fetch('/api/units?includeInactive=true')
      const data = await res.json()
      setUnits(data)
    } catch (error) {
      console.error('Failed to fetch units:', error)
      alert('ユニットデータの取得に失敗しました')
    }
  }

  const fetchResidents = async () => {
    try {
      const res = await fetch('/api/residents?includeInactive=true')
      const data = await res.json()
      setResidents(data)
    } catch (error) {
      console.error('Failed to fetch residents:', error)
      alert('利用者データの取得に失敗しました')
    }
  }

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
          throw new Error('更新に失敗しました')
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
          throw new Error('追加に失敗しました')
        }
        alert('施設を追加しました')
      }
      setShowFacilityModal(false)
      fetchFacilities()
    } catch (error: any) {
      console.error('Failed to save facility:', error)
      alert(error.message || '保存に失敗しました')
    }
  }

  const handleDeactivateFacility = async (facilityId: number) => {
    try {
      const res = await fetch(`/api/facilities/${facilityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      })
      if (!res.ok) {
        throw new Error('無効化に失敗しました')
      }
      alert('施設を無効化しました')
      setShowFacilityDeactivateConfirm(null)
      fetchFacilities()
    } catch (error: any) {
      console.error('Failed to deactivate facility:', error)
      alert(error.message || '無効化に失敗しました')
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
    } catch (error: any) {
      console.error('Failed to reorder facility:', error)
      alert(error.message || '順序変更に失敗しました')
    }
  }

  // ユニットマスタの関数
  const handleAddUnit = () => {
    setEditingUnit(null)
    setUnitForm({ facilityId: facilities.length > 0 ? facilities[0].id : 0, name: '' })
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
      fetchUnits()
    } catch (error: any) {
      console.error('Failed to save unit:', error)
      alert(error.message || '保存に失敗しました')
    }
  }

  const handleDeactivateUnit = async (unitId: number) => {
    try {
      const res = await fetch(`/api/units/${unitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      })
      if (!res.ok) {
        throw new Error('無効化に失敗しました')
      }
      alert('ユニットを無効化しました')
      setShowUnitDeactivateConfirm(null)
      fetchUnits()
    } catch (error: any) {
      console.error('Failed to deactivate unit:', error)
      alert(error.message || '無効化に失敗しました')
    }
  }

  // 利用者マスタの関数
  const handleAddResident = () => {
    setEditingResident(null)
    setResidentForm({ 
      facilityId: facilities.length > 0 ? facilities[0].id : 0, 
      unitId: 0, 
      name: '', 
      startDate: '', 
      endDate: '' 
    })
    setShowResidentModal(true)
    if (facilities.length > 0) {
      loadUnitsForFacility(facilities[0].id)
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

  const handleSaveResident = async (e: React.FormEvent) => {
    e.preventDefault()
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
      fetchResidents()
    } catch (error: any) {
      console.error('Failed to save resident:', error)
      alert(error.message || '保存に失敗しました')
    }
  }

  const handleDeactivateResident = async (residentId: number) => {
    try {
      const res = await fetch(`/api/residents/${residentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      })
      if (!res.ok) {
        throw new Error('無効化に失敗しました')
      }
      alert('利用者を無効化しました')
      setShowResidentDeactivateConfirm(null)
      fetchResidents()
    } catch (error: any) {
      console.error('Failed to deactivate resident:', error)
      alert(error.message || '無効化に失敗しました')
    }
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
            <button
              onClick={handleAddFacility}
              className="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              施設を追加
            </button>
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
                  {facilities.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        施設が登録されていません
                      </td>
                    </tr>
                  ) : (
                    facilities.map((facility, index) => (
                      <tr key={facility.id} className="border-t">
                        <td className="px-4 py-3">{facility.name}</td>
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
                            className="text-blue-500 hover:underline mr-4"
                          >
                            編集
                          </button>
                          {facility.isActive && (
                            <button
                              onClick={() => setShowFacilityDeactivateConfirm(facility.id)}
                              className="text-orange-500 hover:underline"
                            >
                              無効化
                            </button>
                          )}
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

            {/* 無効化確認モーダル */}
            <Modal
              isOpen={showFacilityDeactivateConfirm !== null}
              onClose={() => setShowFacilityDeactivateConfirm(null)}
              title="施設の無効化確認"
            >
              <div className="space-y-4">
                <p className="text-gray-700">
                  この施設を無効化しますか？無効化後もデータは保持されますが、一覧からは非表示になります。
                </p>
                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => {
                      if (showFacilityDeactivateConfirm !== null) {
                        handleDeactivateFacility(showFacilityDeactivateConfirm)
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
                  >
                    無効化する
                  </button>
                  <button
                    onClick={() => setShowFacilityDeactivateConfirm(null)}
                    className="flex-1 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
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
                  {units.length === 0 ? (
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
                            className="text-blue-500 hover:underline mr-4"
                          >
                            編集
                          </button>
                          {unit.isActive && (
                            <button
                              onClick={() => setShowUnitDeactivateConfirm(unit.id)}
                              className="text-orange-500 hover:underline"
                            >
                              無効化
                            </button>
                          )}
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
                    >
                      <option value={0}>施設を選択</option>
                      {facilities.filter(f => f.isActive).map(facility => (
                        <option key={facility.id} value={facility.id}>
                          {facility.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">ユニット名 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
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

            {/* ユニット無効化確認モーダル */}
            <Modal
              isOpen={showUnitDeactivateConfirm !== null}
              onClose={() => setShowUnitDeactivateConfirm(null)}
              title="ユニットの無効化確認"
            >
              <div className="space-y-4">
                <p className="text-gray-700">
                  このユニットを無効化しますか？無効化後もデータは保持されますが、一覧からは非表示になります。
                </p>
                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => {
                      if (showUnitDeactivateConfirm !== null) {
                        handleDeactivateUnit(showUnitDeactivateConfirm)
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
                  >
                    無効化する
                  </button>
                  <button
                    onClick={() => setShowUnitDeactivateConfirm(null)}
                    className="flex-1 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
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
                  {residents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        利用者が登録されていません
                      </td>
                    </tr>
                  ) : (
                    residents.map(resident => (
                      <tr key={resident.id} className="border-t">
                        <td className="px-4 py-3">{resident.facility?.name || `施設ID: ${resident.facilityId}`}</td>
                        <td className="px-4 py-3">{resident.unit?.name || `ユニットID: ${resident.unitId}`}</td>
                        <td className="px-4 py-3">{resident.name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-sm ${
                            resident.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {resident.isActive ? '有効' : '無効'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleEditResident(resident)}
                            className="text-blue-500 hover:underline mr-4"
                          >
                            編集
                          </button>
                          {resident.isActive && (
                            <button
                              onClick={() => setShowResidentDeactivateConfirm(resident.id)}
                              className="text-orange-500 hover:underline"
                            >
                              無効化
                            </button>
                          )}
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
              onClose={() => setShowResidentModal(false)}
              title={editingResident ? '利用者を編集' : '利用者を追加'}
            >
              <form onSubmit={handleSaveResident}>
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
                    >
                      <option value={0}>施設を選択</option>
                      {facilities.filter(f => f.isActive).map(facility => (
                        <option key={facility.id} value={facility.id}>
                          {facility.name}
                        </option>
                      ))}
                    </select>
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
                      type="submit"
                      className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                      disabled={availableUnits.length === 0 && residentForm.facilityId > 0}
                    >
                      {editingResident ? '更新' : '追加'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResidentModal(false)}
                      className="flex-1 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              </form>
            </Modal>

            {/* 利用者無効化確認モーダル */}
            <Modal
              isOpen={showResidentDeactivateConfirm !== null}
              onClose={() => setShowResidentDeactivateConfirm(null)}
              title="利用者の無効化確認"
            >
              <div className="space-y-4">
                <p className="text-gray-700">
                  この利用者を無効化しますか？無効化後もデータは保持されますが、一覧からは非表示になります。
                </p>
                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => {
                      if (showResidentDeactivateConfirm !== null) {
                        handleDeactivateResident(showResidentDeactivateConfirm)
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
                  >
                    無効化する
                  </button>
                  <button
                    onClick={() => setShowResidentDeactivateConfirm(null)}
                    className="flex-1 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </Modal>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

