'use client'

export const runtime = 'edge';

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import MainLayout from '@/components/MainLayout'
import Modal from '@/components/Modal'
import Toast from '@/components/Toast'
import { useFacility } from '@/contexts/FacilityContext'
import { isValidDate } from '@/lib/validation'
import { invalidateTransactionCache } from '@/lib/cache'
import { getResidentDisplayName } from '@/lib/displayName'

interface Transaction {
  id: number
  transactionDate: string
  transactionType: string
  amount: number
  description: string | null
  payee: string | null
  reason: string | null
  balance: number
  residentId: number
  residentName: string
}

interface TransactionFormData {
  residentId: string
  transactionDate: string
  transactionType: string
  amount: string
  description: string
  payee: string
  reason: string
}

interface PendingTransaction {
  id: string // 一時的なID
  residentId: number
  residentName: string
  transactionDate: string
  transactionType: string
  amount: number
  description: string
  payee: string
  reason: string
}

export default function BulkInputPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { selectedFacilityId } = useFacility()
  const facilityId = Number(params.id)
  
  const [year, setYear] = useState(() => {
    const y = searchParams.get('year')
    return y ? Number(y) : new Date().getFullYear()
  })
  const [month, setMonth] = useState(() => {
    const m = searchParams.get('month')
    return m ? Number(m) : new Date().getMonth() + 1
  })
  
  const [facilityName, setFacilityName] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [residents, setResidents] = useState<{
    id: number
    name: string
    displayNamePrefix?: string | null
    namePrefixDisplayOption?: string | null
    unitId: number | null
    unit: { id: number; name: string } | null
  }[]>([])
  const [units, setUnits] = useState<{ id: number; name: string }[]>([])
  const [showInOutForm, setShowInOutForm] = useState(false)
  const [showCorrectForm, setShowCorrectForm] = useState(false)
  const [formData, setFormData] = useState<TransactionFormData>({
    residentId: '',
    transactionDate: '',
    transactionType: 'in',
    amount: '',
    description: '',
    payee: '',
    reason: '',
  })
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; isVisible: boolean }>({
    message: '',
    type: 'info',
    isVisible: false,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [residentSearchQuery, setResidentSearchQuery] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null)
  const [correctResidentSearchQuery, setCorrectResidentSearchQuery] = useState('')
  const [selectedCorrectUnitId, setSelectedCorrectUnitId] = useState<number | null>(null)
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([])
  const [editingPendingId, setEditingPendingId] = useState<string | null>(null)

  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth() + 1
  const currentDay = currentDate.getDate()
  const isCurrentMonth = year === currentYear && month === currentMonth
  const isPastMonth = year < currentYear || (year === currentYear && month < currentMonth)
  
  // 入金・出金モーダルの日付入力範囲を計算
  // 10日までは先月1日〜今月末日まで、11日以降は今月1日〜今日まで
  const getInOutDateRange = () => {
    if (currentDay <= 10) {
      // 10日以前の場合：先月1日〜今月末日まで
      const previousMonthFirstDay = new Date(currentYear, currentMonth - 2, 1)
      const currentMonthLastDay = new Date(currentYear, currentMonth, 0)
      return {
        min: previousMonthFirstDay.toISOString().split('T')[0],
        max: currentMonthLastDay.toISOString().split('T')[0],
      }
    } else {
      // 11日以降の場合：今月1日〜今日まで
      const currentMonthFirstDay = new Date(currentYear, currentMonth - 1, 1)
      return {
        min: currentMonthFirstDay.toISOString().split('T')[0],
        max: currentDate.toISOString().split('T')[0],
      }
    }
  }
  
  const inOutDateRange = getInOutDateRange()

  useEffect(() => {
    fetchBulkData()
  }, [facilityId, year, month])

  const fetchBulkData = async (skipCache = false) => {
    setIsLoading(true)
    console.log('🚀 [パフォーマンス計測] まとめて入力画面のデータ取得を開始')
    console.time('📊 まとめて入力画面 - データ取得全体')
    try {
      // キャッシュを無効化するオプション
      const fetchOptions: RequestInit = skipCache ? { cache: 'no-store' } : {}

      // 施設情報を取得
      console.log('🏢 [パフォーマンス計測] 施設情報取得を開始')
      console.time('🏢 施設情報取得')
      const facilityResponse = await fetch(`/api/facilities/${facilityId}`, fetchOptions)
      const facilityData = await facilityResponse.json()
      console.timeEnd('🏢 施設情報取得')
      setFacilityName(facilityData.name || '')

      // 施設内の全利用者を取得
      console.log('👥 [パフォーマンス計測] 利用者一覧取得を開始')
      console.time('👥 利用者一覧取得')
      const residentsResponse = await fetch(`/api/residents?facilityId=${facilityId}`, fetchOptions)
      const residentsData = await residentsResponse.json()
      console.timeEnd('👥 利用者一覧取得')
      setResidents(residentsData.map((r: {
        id: number
        name: string
        displayNamePrefix?: string | null
        namePrefixDisplayOption?: string | null
        unitId: number | null
        unit: { id: number; name: string } | null
      }) => ({
        id: r.id,
        name: r.name,
        displayNamePrefix: r.displayNamePrefix,
        namePrefixDisplayOption: r.namePrefixDisplayOption,
        unitId: r.unitId,
        unit: r.unit,
      })))

      // 施設内の全ユニットを取得
      console.log('🏠 [パフォーマンス計測] ユニット一覧取得を開始')
      console.time('🏠 ユニット一覧取得')
      const unitsResponse = await fetch(`/api/units?facilityId=${facilityId}`, fetchOptions)
      const unitsData = await unitsResponse.json()
      console.timeEnd('🏠 ユニット一覧取得')
      setUnits(unitsData.map((u: { id: number; name: string }) => ({
        id: u.id,
        name: u.name,
      })).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)))

      // 施設内の全利用者の取引を取得（最も重い処理）
      console.log('💰 [パフォーマンス計測] 取引一覧取得を開始（最重要）')
      console.time('💰 取引一覧取得（最重要）')
      const transactionsResponse = await fetch(
        `/api/facilities/${facilityId}/transactions?year=${year}&month=${month}`,
        fetchOptions
      )
      const transactionsData = await transactionsResponse.json()
      console.timeEnd('💰 取引一覧取得（最重要）')
      setTransactions(transactionsData.transactions || [])
      
      console.log('✅ [パフォーマンス計測] すべてのデータ取得が完了')
    } catch (error) {
      console.error('❌ [パフォーマンス計測] データ取得エラー:', error)
      setToast({
        message: 'データの取得に失敗しました',
        type: 'error',
        isVisible: true,
      })
    } finally {
      console.timeEnd('📊 まとめて入力画面 - データ取得全体')
      setIsLoading(false)
    }
  }

  // フォームのバリデーション
  const validateForm = (): boolean => {
    if (!formData.residentId) {
      setToast({
        message: '利用者を選択してください',
        type: 'error',
        isVisible: true,
      })
      return false
    }

    if (!formData.transactionDate) {
      setToast({
        message: '対象日を入力してください',
        type: 'error',
        isVisible: true,
      })
      return false
    }

    // 日付の妥当性チェック
    if (!isValidDate(formData.transactionDate)) {
      setToast({
        message: '無効な日付形式です',
        type: 'error',
        isVisible: true,
      })
      return false
    }

    // 入金・出金の場合、対象日が許可された範囲内かチェック
    if (isCurrentMonth && showInOutForm) {
      const transactionDate = new Date(formData.transactionDate)
      const transactionDateStr = transactionDate.toISOString().split('T')[0]
      
      // 10日までは先月1日〜今月末日まで、11日以降は今月1日〜今日まで
      if (transactionDateStr < inOutDateRange.min || transactionDateStr > inOutDateRange.max) {
        if (currentDay <= 10) {
          setToast({
            message: '対象日は先月1日から今月末日までの日付を入力してください',
            type: 'error',
            isVisible: true,
          })
        } else {
          setToast({
            message: '対象日は今月1日から今日までの日付を入力してください',
            type: 'error',
            isVisible: true,
          })
        }
        return false
      }
    }

    const amount = parseFloat(formData.amount)
    if (isNaN(amount) || amount < 1 || amount % 1 !== 0) {
      setToast({
        message: '金額は1円以上の整数を入力してください',
        type: 'error',
        isVisible: true,
      })
      return false
    }

    if (showCorrectForm && !formData.reason) {
      setToast({
        message: '過去訂正入力の場合は理由を入力してください',
        type: 'error',
        isVisible: true,
      })
      return false
    }

    // 過去訂正入力の場合、対象日が過去月であることを確認（今月の日付は許可しない）
    if (showCorrectForm) {
      const transactionDate = new Date(formData.transactionDate)
      const transactionYear = transactionDate.getFullYear()
      const transactionMonth = transactionDate.getMonth() + 1
      
      // 今月または未来の月の場合はエラー
      if (transactionYear > currentYear || (transactionYear === currentYear && transactionMonth >= currentMonth)) {
        setToast({
          message: '過去訂正入力は過去の月の日付のみ入力できます',
          type: 'error',
          isVisible: true,
        })
        return false
      }
    }

    return true
  }

  // 次の入力ボタンの処理
  const handleAddNext = () => {
    if (!validateForm()) {
      return
    }

    const selectedResident = residents.find(r => r.id === Number(formData.residentId))
    if (!selectedResident) {
      return
    }

    const amount = parseFloat(formData.amount)
    const newPending: PendingTransaction = {
      id: editingPendingId || `pending-${Date.now()}-${Math.random()}`,
      residentId: Number(formData.residentId),
      residentName: getResidentDisplayName(selectedResident, 'screen'),
      transactionDate: formData.transactionDate,
      transactionType: formData.transactionType,
      amount: amount,
      description: formData.description,
      payee: formData.payee,
      reason: formData.reason,
    }

    // 編集モードの場合は既にカードが削除されているので、新規追加として扱う
    setPendingTransactions(prev => [...prev, newPending])
    
    // 編集モードを解除
    if (editingPendingId) {
      setEditingPendingId(null)
    }

    // フォームをリセット
    setFormData({
      residentId: '',
      transactionDate: new Date().toISOString().split('T')[0],
      transactionType: formData.transactionType, // 区分は維持
      amount: '',
      description: '',
      payee: '',
      reason: '',
    })
    setResidentSearchQuery('')
    setSelectedUnitId(null)
  }

  // 一括登録の処理
  const handleBulkSubmit = async () => {
    if (pendingTransactions.length === 0) {
      // フォームに入力がある場合は単一登録
      if (!validateForm()) {
        return
      }

      const amount = parseFloat(formData.amount)
      setIsSubmitting(true)
      
      try {
        const { residentId: _, amount: __, ...restFormData } = formData
        const response = await fetch(`/api/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...restFormData,
            residentId: Number(formData.residentId),
            amount: amount,
          }),
        })

        const data = await response.json()

        if (response.ok) {
          const transactionTypeLabel = showCorrectForm 
            ? (formData.transactionType === 'past_correct_in' ? '過去訂正入金' : '過去訂正出金')
            : (formData.transactionType === 'in' ? '入金' : '出金')
          
          setShowInOutForm(false)
          setShowCorrectForm(false)
          setFormData({
            residentId: '',
            transactionDate: '',
            transactionType: showCorrectForm ? 'past_correct_in' : 'in',
            amount: '',
            description: '',
            payee: '',
            reason: '',
          })
          
          await invalidateTransactionCache(facilityId, undefined, year, month)
          await fetchBulkData(true)
          router.refresh()
          
          setToast({
            message: `${transactionTypeLabel}を登録しました`,
            type: 'success',
            isVisible: true,
          })
        } else {
          setToast({
            message: data.error || '登録に失敗しました',
            type: 'error',
            isVisible: true,
          })
        }
      } catch (error) {
        console.error('Failed to create transaction:', error)
        setToast({
          message: '登録に失敗しました',
          type: 'error',
          isVisible: true,
        })
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    // 複数件の一括登録
    setIsSubmitting(true)
    
    try {
      // フォームに入力がある場合はそれも追加
      const transactionsToSubmit = [...pendingTransactions]
      if (formData.residentId && formData.transactionDate && formData.amount) {
        if (validateForm()) {
          const selectedResident = residents.find(r => r.id === Number(formData.residentId))
          if (selectedResident) {
            const amount = parseFloat(formData.amount)
            transactionsToSubmit.push({
              id: `pending-${Date.now()}-${Math.random()}`,
              residentId: Number(formData.residentId),
              residentName: getResidentDisplayName(selectedResident, 'screen'),
              transactionDate: formData.transactionDate,
              transactionType: formData.transactionType,
              amount: amount,
              description: formData.description,
              payee: formData.payee,
              reason: formData.reason,
            })
          }
        }
      }

      // すべての取引を順次登録
      const results = await Promise.allSettled(
        transactionsToSubmit.map(t => 
          fetch(`/api/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              residentId: t.residentId,
              transactionDate: t.transactionDate,
              transactionType: t.transactionType,
              amount: t.amount,
              description: t.description || '',
              payee: t.payee || '',
              reason: t.reason || '',
            }),
          })
        )
      )

      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok))
      
      if (failed.length === 0) {
        setToast({
          message: `${transactionsToSubmit.length}件の取引を登録しました`,
          type: 'success',
          isVisible: true,
        })
        
        setShowInOutForm(false)
        setShowCorrectForm(false)
        setPendingTransactions([])
        setFormData({
          residentId: '',
          transactionDate: '',
          transactionType: showCorrectForm ? 'past_correct_in' : 'in',
          amount: '',
          description: '',
          payee: '',
          reason: '',
        })
        
        await invalidateTransactionCache(facilityId, undefined, year, month)
        await fetchBulkData(true)
        router.refresh()
      } else {
        setToast({
          message: `${failed.length}件の登録に失敗しました`,
          type: 'error',
          isVisible: true,
        })
      }
    } catch (error) {
      console.error('Failed to create transactions:', error)
      setToast({
        message: '登録に失敗しました',
        type: 'error',
        isVisible: true,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // カードの編集
  const handleEditPending = (id: string) => {
    const pending = pendingTransactions.find(t => t.id === id)
    if (!pending) return

    // 編集モードに入る際に、カードを一時的に削除（重複を防ぐため）
    setPendingTransactions(prev => prev.filter(t => t.id !== id))
    setEditingPendingId(id)
    setFormData({
      residentId: String(pending.residentId),
      transactionDate: pending.transactionDate,
      transactionType: pending.transactionType,
      amount: String(pending.amount),
      description: pending.description,
      payee: pending.payee,
      reason: pending.reason,
    })
    
    // 該当する利用者を検索
    const resident = residents.find(r => r.id === pending.residentId)
    if (resident) {
      setResidentSearchQuery(getResidentDisplayName(resident, 'screen'))
      if (resident.unitId) {
        setSelectedUnitId(resident.unitId)
      }
    }
  }

  // カードの削除
  const handleDeletePending = (id: string) => {
    setPendingTransactions(prev => prev.filter(t => t.id !== id))
    if (editingPendingId === id) {
      setEditingPendingId(null)
      setFormData({
        residentId: '',
        transactionDate: new Date().toISOString().split('T')[0],
        transactionType: formData.transactionType,
        amount: '',
        description: '',
        payee: '',
        reason: '',
      })
    }
  }

  const handleFormSubmit = async () => {
    await handleBulkSubmit()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleFormSubmit()
  }

  const getTransactionTypeLabel = (type: string) => {
    switch (type) {
      case 'in': return '入金'
      case 'out': return '出金'
      case 'correct_in': return '訂正入金'
      case 'correct_out': return '訂正出金'
      case 'past_correct_in': return '過去訂正入金'
      case 'past_correct_out': return '過去訂正出金'
      default: return type
    }
  }

  const handleCorrectTransaction = async (transactionId: number) => {
    // 確認ダイアログ
    if (!confirm('この取引を訂正としてマークしますか？\n訂正後、この取引は計算から除外され、印刷にも含まれません。')) {
      return
    }

    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (response.ok) {
        // 関連する画面のキャッシュを無効化（施設詳細、ダッシュボードなど）
        // データ再取得の前にキャッシュを無効化することで、確実に最新データを取得
        await invalidateTransactionCache(facilityId, undefined, year, month)
        
        // データを再取得（キャッシュを無効化して最新データを取得）
        await fetchBulkData(true)
        
        // Next.jsのサーバーコンポーネントのキャッシュも無効化
        router.refresh()
        
        setToast({
          message: '取引を訂正としてマークしました',
          type: 'success',
          isVisible: true,
        })
      } else {
        setToast({
          message: data.error || '訂正の処理に失敗しました',
          type: 'error',
          isVisible: true,
        })
      }
    } catch (error) {
      console.error('Failed to correct transaction:', error)
      setToast({
        message: '訂正の処理に失敗しました',
        type: 'error',
        isVisible: true,
      })
    }
  }

  // 選択された施設と異なる施設のページにアクセスした場合の警告
  const isMismatchedFacility = selectedFacilityId !== null && selectedFacilityId !== facilityId

  return (
    <MainLayout>
      <div>
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => {
              // キャッシュを無効化するためにタイムスタンプを追加
              const timestamp = Date.now()
              router.push(`/facilities/${facilityId}?year=${year}&month=${month}&_t=${timestamp}`)
            }}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
            title="施設詳細に戻る"
          >
            ← 戻る
          </button>
          <h1 className="text-3xl font-bold">まとめて入力: {isLoading ? '読み込み中...' : facilityName || '施設が見つかりません'}</h1>
        </div>
        
        {isMismatchedFacility && (
          <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
            <p className="text-yellow-800">
              ⚠️ 現在選択されている施設と異なる施設のページを表示しています。
              <button
                onClick={() => router.push('/facility-select')}
                className="ml-2 text-blue-600 hover:underline font-semibold"
              >
                施設選択を変更
              </button>
            </p>
          </div>
        )}
        
        {/* 日付表示（無効化） */}
        <div className="mb-4 p-4 bg-gray-100 rounded">
          <div className="flex items-center justify-center gap-4">
            <span className="text-xl font-semibold">
              {year}年{month}月
            </span>
            <span className="text-sm text-gray-500">（月の移動はできません。前の月については10日まではこの画面で入力可能です。）</span>
          </div>
        </div>

        {isPastMonth && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
            <span className="text-yellow-800">🔒 締め済み　※次の月の１０日までは次の月の入金・出金で入力してください。</span>
          </div>
        )}

        {isCurrentMonth && (
          <div className="mb-6 flex gap-4">
            <button
              onClick={() => {
                setShowInOutForm(true)
                setShowCorrectForm(false)
                setFormData({
                  residentId: '',
                  transactionDate: new Date().toISOString().split('T')[0],
                  transactionType: 'in',
                  amount: '',
                  description: '',
                  payee: '',
                  reason: '',
                })
              }}
              className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 shadow-md hover:shadow-lg transition-shadow"
            >
              💰 入金
            </button>
            <button
              onClick={() => {
                setShowInOutForm(true)
                setShowCorrectForm(false)
                setFormData({
                  residentId: '',
                  transactionDate: new Date().toISOString().split('T')[0],
                  transactionType: 'out',
                  amount: '',
                  description: '',
                  payee: '',
                  reason: '',
                })
              }}
              className="px-6 py-2 bg-red-500 text-white rounded hover:bg-red-600 shadow-md hover:shadow-lg transition-shadow"
            >
              💸 出金
            </button>
          </div>
        )}

        {isPastMonth && (
          <div className="mb-6">
            <button
              onClick={() => {
                setShowCorrectForm(true)
                setShowInOutForm(false)
                const today = new Date()
                const lastDayOfMonth = new Date(year, month, 0)
                const defaultDate = today > lastDayOfMonth ? lastDayOfMonth.toISOString().split('T')[0] : today.toISOString().split('T')[0]
                setFormData({
                  residentId: '',
                  transactionDate: defaultDate,
                  transactionType: 'past_correct_in',
                  amount: '',
                  description: '',
                  payee: '',
                  reason: '',
                })
              }}
              className="px-6 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 shadow-md hover:shadow-lg transition-shadow"
            >
              ✏️ 訂正入力
            </button>
          </div>
        )}

        {/* トースト通知 */}
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={() => setToast({ ...toast, isVisible: false })}
        />

        {/* 明細テーブル */}
        <h2 className="text-xl font-semibold mb-4">明細</h2>
        {isLoading ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
            読み込み中...
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold">日付</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">利用者名</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">区分</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">摘要</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">支払先</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">金額</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">残高</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        明細がありません
                      </td>
                    </tr>
                  ) : (
                    transactions.map((transaction) => {
                      const isIn = transaction.transactionType === 'in' || transaction.transactionType === 'correct_in' || transaction.transactionType === 'past_correct_in'
                      const isCorrect = transaction.transactionType === 'correct_in' || transaction.transactionType === 'correct_out'
                      const isPastCorrect = transaction.transactionType === 'past_correct_in' || transaction.transactionType === 'past_correct_out'
                      const canCorrect = !isCorrect && !isPastCorrect && isCurrentMonth
                      
                      return (
                        <tr 
                          key={transaction.id} 
                          className={`border-t hover:bg-gray-50 ${isCorrect ? 'opacity-60' : ''}`}
                        >
                          <td className={`px-4 py-3 text-sm ${isCorrect ? 'line-through' : ''}`}>
                            {new Date(transaction.transactionDate).toLocaleDateString('ja-JP', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                            })}
                          </td>
                          <td className={`px-4 py-3 text-sm ${isCorrect ? 'line-through' : ''}`}>
                            {transaction.residentName}
                          </td>
                          <td className={`px-4 py-3 text-sm ${isCorrect ? 'line-through' : ''}`}>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              isIn
                                ? isCorrect
                                  ? 'bg-orange-100 text-orange-800'
                                  : isPastCorrect
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-blue-100 text-blue-800'
                                : isCorrect
                                  ? 'bg-orange-100 text-orange-800'
                                  : isPastCorrect
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-red-100 text-red-800'
                            }`}>
                              {getTransactionTypeLabel(transaction.transactionType)}
                            </span>
                          </td>
                          <td className={`px-4 py-3 text-sm ${isCorrect ? 'line-through' : ''}`}>
                            {transaction.description || '-'}
                          </td>
                          <td className={`px-4 py-3 text-sm ${isCorrect ? 'line-through' : ''}`}>
                            {transaction.payee || '-'}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right font-medium ${
                            isIn ? 'text-blue-600' : 'text-red-600'
                          } ${isCorrect ? 'line-through' : ''}`}>
                            {isIn ? '+' : '-'}
                            {new Intl.NumberFormat('ja-JP', {
                              style: 'currency',
                              currency: 'JPY',
                            }).format(transaction.amount)}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right font-semibold text-gray-900 ${isCorrect ? 'line-through' : ''}`}>
                            {new Intl.NumberFormat('ja-JP', {
                              style: 'currency',
                              currency: 'JPY',
                            }).format(transaction.balance)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {canCorrect && (
                              <button
                                onClick={() => handleCorrectTransaction(transaction.id)}
                                className="px-3 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 shadow-md hover:shadow-lg transition-shadow"
                                title="この取引を訂正としてマーク"
                              >
                                ✏️ 訂正
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 入金・出金モーダル */}
        <Modal
          isOpen={showInOutForm}
          onClose={() => {
            setShowInOutForm(false)
            setPendingTransactions([])
            setEditingPendingId(null)
            setResidentSearchQuery('')
            setSelectedUnitId(null)
            setFormData({
              residentId: '',
              transactionDate: '',
              transactionType: 'in',
              amount: '',
              description: '',
              payee: '',
              reason: '',
            })
          }}
          title={formData.transactionType === 'in' ? '💰 入金登録' : '💸 出金登録'}
        >
          <form onSubmit={(e) => { e.preventDefault(); }}>
            <div className="space-y-2.5">
              <div>
                <label className="block text-sm font-medium mb-0.5">
                  利用者 <span className="text-red-500">*</span>
                </label>
                <div className="space-y-1.5">
                  {/* ユニット絞り込みと検索を横並び */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium mb-0.5 text-gray-600">ユニットで絞り込み</label>
                      <select
                        value={selectedUnitId || ''}
                        onChange={(e) => setSelectedUnitId(e.target.value ? Number(e.target.value) : null)}
                        className="w-full px-2 py-1.5 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="">すべてのユニット</option>
                        {units.map(unit => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-0.5 text-gray-600">利用者名で検索</label>
                      <input
                        type="text"
                        maxLength={30}
                        value={residentSearchQuery}
                        onChange={(e) => setResidentSearchQuery(e.target.value)}
                        placeholder="利用者名で検索..."
                        className="w-full px-2 py-1.5 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  </div>
                  {(() => {
                    let filteredResidents = residents
                    if (selectedUnitId !== null) {
                      filteredResidents = filteredResidents.filter(r => r.unitId === selectedUnitId)
                    }
                    if (residentSearchQuery) {
                      filteredResidents = filteredResidents.filter(r => r.name.includes(residentSearchQuery))
                    }
                    return filteredResidents.length
                  })() !== residents.length && (
                    <p className="text-xs text-gray-500">
                      {(() => {
                        let filteredResidents = residents
                        if (selectedUnitId !== null) {
                          filteredResidents = filteredResidents.filter(r => r.unitId === selectedUnitId)
                        }
                        if (residentSearchQuery) {
                          filteredResidents = filteredResidents.filter(r => r.name.includes(residentSearchQuery))
                        }
                        return filteredResidents.length
                      })()}件が見つかりました
                    </p>
                  )}
                  <div>
                    <select
                      required
                      value={formData.residentId}
                      onChange={(e) => setFormData({ ...formData, residentId: e.target.value })}
                      className="w-full px-2 py-1.5 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="">選択してください</option>
                      {(() => {
                        let filteredResidents = residents
                        // ユニットで絞り込み
                        if (selectedUnitId !== null) {
                          filteredResidents = filteredResidents.filter(r => r.unitId === selectedUnitId)
                        }
                        // 名前で絞り込み
                        if (residentSearchQuery) {
                          filteredResidents = filteredResidents.filter(r => r.name.includes(residentSearchQuery))
                        }
                        return filteredResidents
                      })().map(resident => (
                        <option key={resident.id} value={resident.id}>
                          {getResidentDisplayName(resident, 'screen')} {resident.unit ? `(${resident.unit.name})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-0.5">
                  区分 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.transactionType}
                  onChange={(e) => setFormData({ ...formData, transactionType: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="in">入金</option>
                  <option value="out">出金</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-0.5">
                  対象日 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.transactionDate}
                  onChange={(e) => setFormData({ ...formData, transactionDate: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  min={isCurrentMonth ? inOutDateRange.min : undefined}
                  max={isCurrentMonth ? inOutDateRange.max : undefined}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-0.5">
                  金額 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="1"
                    step="1"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-2 py-1.5 pr-8 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="0"
                  />
                  <span className="absolute right-2 top-1.5 text-gray-500 text-sm">円</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-0.5">内容（備考）</label>
                <input
                  type="text"
                  maxLength={100}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="例: 預り金、返金など"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-0.5">支払先</label>
                <input
                  type="text"
                  maxLength={30}
                  value={formData.payee}
                  onChange={(e) => setFormData({ ...formData, payee: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="支払先を入力"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={handleFormSubmit}
                  disabled={isSubmitting}
                  className={`flex-1 px-3 py-1.5 rounded text-white text-sm ${
                    formData.transactionType === 'in'
                      ? 'bg-blue-500 hover:bg-blue-600'
                      : 'bg-red-500 hover:bg-red-600'
                  } disabled:bg-gray-400 disabled:cursor-not-allowed`}
                >
                  {isSubmitting ? '登録中...' : pendingTransactions.length > 0 ? `登録 (${pendingTransactions.length + (formData.residentId ? 1 : 0)}件)` : '登録'}
                </button>
                <button
                  type="button"
                  onClick={handleAddNext}
                  disabled={isSubmitting}
                  className="flex-1 px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                >
                  {editingPendingId ? '更新' : '次の入力'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowInOutForm(false)
                    setPendingTransactions([])
                    setEditingPendingId(null)
                    setFormData({
                      residentId: '',
                      transactionDate: '',
                      transactionType: 'in',
                      amount: '',
                      description: '',
                      payee: '',
                      reason: '',
                    })
                    setResidentSearchQuery('')
                    setSelectedUnitId(null)
                  }}
                  className="flex-1 px-3 py-1.5 bg-gray-300 rounded hover:bg-gray-400 text-sm"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </form>

          {/* 入力済みカード一覧 */}
          {pendingTransactions.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm font-semibold mb-2 text-gray-700">
                入力済み ({pendingTransactions.length}件)
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {pendingTransactions.map((pending) => {
                  const isIn = pending.transactionType === 'in'
                  return (
                    <div
                      key={pending.id}
                      className="bg-gray-50 border border-gray-200 rounded p-2 flex justify-between items-center"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-sm text-gray-900">{pending.residentName}</div>
                        <div className="text-xs text-gray-600 flex gap-3 mt-0.5">
                          <span>{new Date(pending.transactionDate).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })}</span>
                          <span>{isIn ? '入金' : '出金'}</span>
                          <span className={`font-medium ${isIn ? 'text-blue-600' : 'text-red-600'}`}>
                            {isIn ? '+' : '-'}¥{new Intl.NumberFormat('ja-JP').format(pending.amount)}
                          </span>
                        </div>
                        {(pending.description || pending.payee) && (
                          <div className="text-xs text-gray-500 mt-1">
                            {pending.description && <span>{pending.description}</span>}
                            {pending.description && pending.payee && <span className="mx-1">/</span>}
                            {pending.payee && <span>支払先: {pending.payee}</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditPending(pending.id)}
                          className="px-2 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600"
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePending(pending.id)}
                          className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Modal>

        {/* 訂正入力モーダル */}
        <Modal
          isOpen={showCorrectForm}
          onClose={() => {
            setShowCorrectForm(false)
            setCorrectResidentSearchQuery('')
            setSelectedCorrectUnitId(null)
            setFormData({
              residentId: '',
              transactionDate: '',
              transactionType: 'past_correct_in',
              amount: '',
              description: '',
              payee: '',
              reason: '',
            })
          }}
          title="✏️ 訂正入力"
        >
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  利用者 <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-600">ユニットで絞り込み</label>
                      <select
                        value={selectedCorrectUnitId || ''}
                        onChange={(e) => setSelectedCorrectUnitId(e.target.value ? Number(e.target.value) : null)}
                        className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                      >
                        <option value="">すべてのユニット</option>
                        {units.map(unit => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-600">利用者名で検索</label>
                      <input
                        type="text"
                        maxLength={30}
                        value={correctResidentSearchQuery}
                        onChange={(e) => setCorrectResidentSearchQuery(e.target.value)}
                        placeholder="利用者名で検索..."
                        className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                      />
                    </div>
                    {(() => {
                      let filteredResidents = residents
                      if (selectedCorrectUnitId !== null) {
                        filteredResidents = filteredResidents.filter(r => r.unitId === selectedCorrectUnitId)
                      }
                      if (correctResidentSearchQuery) {
                        filteredResidents = filteredResidents.filter(r => r.name.includes(correctResidentSearchQuery))
                      }
                      return filteredResidents.length
                    })() !== residents.length && (
                      <p className="text-xs text-gray-500">
                        {(() => {
                          let filteredResidents = residents
                          if (selectedCorrectUnitId !== null) {
                            filteredResidents = filteredResidents.filter(r => r.unitId === selectedCorrectUnitId)
                          }
                          if (correctResidentSearchQuery) {
                            filteredResidents = filteredResidents.filter(r => r.name.includes(correctResidentSearchQuery))
                          }
                          return filteredResidents.length
                        })()}件が見つかりました
                      </p>
                    )}
                  </div>
                  <div>
                    <select
                      required
                      value={formData.residentId}
                      onChange={(e) => setFormData({ ...formData, residentId: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="">選択してください</option>
                      {(() => {
                        let filteredResidents = residents
                        // ユニットで絞り込み
                        if (selectedCorrectUnitId !== null) {
                          filteredResidents = filteredResidents.filter(r => r.unitId === selectedCorrectUnitId)
                        }
                        // 名前で絞り込み
                        if (correctResidentSearchQuery) {
                          filteredResidents = filteredResidents.filter(r => r.name.includes(correctResidentSearchQuery))
                        }
                        return filteredResidents
                      })().map(resident => (
                        <option key={resident.id} value={resident.id}>
                          {getResidentDisplayName(resident, 'screen')} {resident.unit ? `(${resident.unit.name})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  対象日 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.transactionDate}
                  onChange={(e) => setFormData({ ...formData, transactionDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  訂正対象の取引が発生した日付を入力してください
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  区分 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.transactionType}
                  onChange={(e) => setFormData({ ...formData, transactionType: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="past_correct_in">過去訂正入金</option>
                  <option value="past_correct_out">過去訂正出金</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  金額 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="1"
                    step="1"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2 text-gray-500">円</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  理由 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="訂正の理由を入力してください"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">内容（備考）</label>
                <input
                  type="text"
                  maxLength={100}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="補足情報があれば入力"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">支払先</label>
                <input
                  type="text"
                  maxLength={30}
                  value={formData.payee}
                  onChange={(e) => setFormData({ ...formData, payee: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="支払先を入力"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? '登録中...' : '登録'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCorrectForm(false)
                    setFormData({
                      residentId: '',
                      transactionDate: '',
                      transactionType: 'past_correct_in',
                      amount: '',
                      description: '',
                      payee: '',
                      reason: '',
                    })
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </form>
        </Modal>
      </div>
    </MainLayout>
  )
}
