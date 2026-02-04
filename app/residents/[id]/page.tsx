'use client'

export const runtime = 'edge';

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import MainLayout from '@/components/MainLayout'
import DateSelector from '@/components/DateSelector'
import Card from '@/components/Card'
import Modal from '@/components/Modal'
import Toast from '@/components/Toast'
import { useFacility } from '@/contexts/FacilityContext'
import { isValidDate } from '@/lib/validation'
import { invalidateTransactionCache } from '@/lib/cache'

interface Transaction {
  id: number
  transactionDate: string
  transactionType: string
  amount: number
  description: string | null
  payee: string | null
  reason: string | null
  balance: number
}

interface TransactionFormData {
  transactionDate: string
  transactionType: string
  amount: string
  description: string
  payee: string
  reason: string
}

interface PendingTransaction {
  id: string // 一時的なID
  transactionDate: string
  transactionType: string
  amount: number
  description: string
  payee: string
  reason: string
}

export default function ResidentDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { selectedFacilityId } = useFacility()
  const residentId = Number(params.id)
  
  const [year, setYear] = useState(() => {
    const y = searchParams.get('year')
    return y ? Number(y) : new Date().getFullYear()
  })
  const [month, setMonth] = useState(() => {
    const m = searchParams.get('month')
    return m ? Number(m) : new Date().getMonth() + 1
  })
  
  const [residentName, setResidentName] = useState('')
  const [residentFacilityId, setResidentFacilityId] = useState<number | null>(null)
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [residents, setResidents] = useState<{ id: number; name: string }[]>([])
  const [prevResidentId, setPrevResidentId] = useState<number | null>(null)
  const [nextResidentId, setNextResidentId] = useState<number | null>(null)
  const [showInOutForm, setShowInOutForm] = useState(false)
  const [showCorrectForm, setShowCorrectForm] = useState(false)
  const [formData, setFormData] = useState<TransactionFormData>({
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
    fetchResidentData()
  }, [residentId, year, month])

  useEffect(() => {
    if (residentFacilityId) {
      fetchResidentsList()
    }
  }, [residentFacilityId, residentId])

  const fetchResidentData = async (skipCache = false) => {
    setIsLoading(true)
    try {
      // キャッシュを無効化するオプション
      const fetchOptions: RequestInit = skipCache ? { cache: 'no-store' } : {}
      
      const response = await fetch(
        `/api/residents/${residentId}?year=${year}&month=${month}`,
        fetchOptions
      )
      const data = await response.json()
      setResidentName(data.residentName || '')
      setResidentFacilityId(data.facilityId || null)
      setBalance(data.balance || 0)
      setTransactions(data.transactions || [])
    } catch (error) {
      console.error('Failed to fetch resident data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchResidentsList = async () => {
    try {
      const response = await fetch(
        `/api/residents?facilityId=${residentFacilityId}`
      )
      const data = await response.json()
      const sortedResidents = data.map((r: { id: number; name: string }) => ({
        id: r.id,
        name: r.name,
      }))
      setResidents(sortedResidents)
      
      // 前後の利用者IDを計算
      const currentIndex = sortedResidents.findIndex((r: { id: number }) => r.id === residentId)
      if (currentIndex > 0) {
        setPrevResidentId(sortedResidents[currentIndex - 1].id)
      } else {
        setPrevResidentId(null)
      }
      if (currentIndex < sortedResidents.length - 1 && currentIndex >= 0) {
        setNextResidentId(sortedResidents[currentIndex + 1].id)
      } else {
        setNextResidentId(null)
      }
    } catch (error) {
      console.error('Failed to fetch residents list:', error)
    }
  }

  const handleResidentChange = (newResidentId: number) => {
    router.push(`/residents/${newResidentId}?year=${year}&month=${month}`)
  }

  const handleDateChange = (newYear: number, newMonth: number) => {
    setYear(newYear)
    setMonth(newMonth)
    setShowInOutForm(false)
    setShowCorrectForm(false)
  }

  // フォームのバリデーション
  const validateForm = (): boolean => {
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

    const amount = parseFloat(formData.amount)
    const newPending: PendingTransaction = {
      id: editingPendingId || `pending-${Date.now()}-${Math.random()}`,
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
      transactionDate: new Date().toISOString().split('T')[0],
      transactionType: formData.transactionType, // 区分は維持
      amount: '',
      description: '',
      payee: '',
      reason: '',
    })
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
        const response = await fetch(`/api/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            residentId,
            ...formData,
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
            transactionDate: '',
            transactionType: showCorrectForm ? 'past_correct_in' : 'in',
            amount: '',
            description: '',
            payee: '',
            reason: '',
          })
          
          await invalidateTransactionCache(residentFacilityId || undefined, residentId, year, month)
          await fetchResidentData(true)
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
      if (formData.transactionDate && formData.amount) {
        if (validateForm()) {
          const amount = parseFloat(formData.amount)
          transactionsToSubmit.push({
            id: `pending-${Date.now()}-${Math.random()}`,
            transactionDate: formData.transactionDate,
            transactionType: formData.transactionType,
            amount: amount,
            description: formData.description,
            payee: formData.payee,
            reason: formData.reason,
          })
        }
      }

      // すべての取引を順次登録
      const results = await Promise.allSettled(
        transactionsToSubmit.map(t => 
          fetch(`/api/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              residentId,
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
        setEditingPendingId(null)
        setFormData({
          transactionDate: '',
          transactionType: showCorrectForm ? 'past_correct_in' : 'in',
          amount: '',
          description: '',
          payee: '',
          reason: '',
        })
        
        await invalidateTransactionCache(residentFacilityId || undefined, residentId, year, month)
        await fetchResidentData(true)
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
      transactionDate: pending.transactionDate,
      transactionType: pending.transactionType,
      amount: String(pending.amount),
      description: pending.description,
      payee: pending.payee,
      reason: pending.reason,
    })
  }

  // カードの削除
  const handleDeletePending = (id: string) => {
    setPendingTransactions(prev => prev.filter(t => t.id !== id))
    if (editingPendingId === id) {
      setEditingPendingId(null)
      setFormData({
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
        await invalidateTransactionCache(residentFacilityId || undefined, residentId, year, month)
        
        // データを再取得（キャッシュを無効化して最新データを取得）
        await fetchResidentData(true)
        
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

  return (
    <MainLayout>
      <div>
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => prevResidentId && handleResidentChange(prevResidentId)}
            disabled={!prevResidentId}
            className={`px-4 py-2 rounded ${
              prevResidentId
                ? 'bg-gray-200 hover:bg-gray-300'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
            title={prevResidentId ? '前の利用者' : '前の利用者なし'}
          >
            ◀
          </button>
          <h1 className="text-3xl font-bold">利用者詳細: {residentName}</h1>
          <button
            onClick={() => nextResidentId && handleResidentChange(nextResidentId)}
            disabled={!nextResidentId}
            className={`px-4 py-2 rounded ${
              nextResidentId
                ? 'bg-gray-200 hover:bg-gray-300'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
            title={nextResidentId ? '次の利用者' : '次の利用者なし'}
          >
            ▶
          </button>
        </div>
        
        {/* 選択された施設と異なる施設の利用者のページにアクセスした場合の警告 */}
        {selectedFacilityId !== null && residentFacilityId !== null && selectedFacilityId !== residentFacilityId && (
          <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
            <p className="text-yellow-800">
              ⚠️ 現在選択されている施設と異なる施設の利用者のページを表示しています。
              <button
                onClick={() => router.push('/facility-select')}
                className="ml-2 text-blue-600 hover:underline font-semibold"
              >
                施設選択を変更
              </button>
            </p>
          </div>
        )}
        
        <DateSelector year={year} month={month} onDateChange={handleDateChange} />

        {isPastMonth && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
            <span className="text-yellow-800">🔒 締め済み　※次の月の１０日までは次の月の入金・出金で入力してください。</span>
          </div>
        )}

        <div className="mb-8 flex items-center justify-between">
          <Card
            title="現在残高"
            amount={balance}
            className="bg-purple-50 border-2 border-purple-200"
          />
          <button
            onClick={() => {
              router.push(
                `/print/preview?residentId=${residentId}&year=${year}&month=${month}&type=resident`
              )
            }}
            className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600 shadow-md hover:shadow-lg transition-shadow"
            title="預り金明細書を印刷"
          >
            🖨️ 印刷
          </button>
        </div>

        {isCurrentMonth && (
          <div className="mb-6 flex gap-4">
            <button
              onClick={() => {
                setShowInOutForm(true)
                setShowCorrectForm(false)
                setFormData({
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

        {/* 入金・出金モーダル */}
        <Modal
          isOpen={showInOutForm}
          onClose={() => {
            setShowInOutForm(false)
            setPendingTransactions([])
            setEditingPendingId(null)
            setFormData({
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
                  {isSubmitting ? '登録中...' : pendingTransactions.length > 0 ? `登録 (${pendingTransactions.length + (formData.transactionDate && formData.amount ? 1 : 0)}件)` : '登録'}
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
                      transactionDate: '',
                      transactionType: 'in',
                      amount: '',
                      description: '',
                      payee: '',
                      reason: '',
                    })
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
                        <div className="text-xs text-gray-600 flex gap-3">
                          <span>{new Date(pending.transactionDate).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })}</span>
                          <span>{isIn ? '入金' : '出金'}</span>
                          <span className={`font-medium ${isIn ? 'text-blue-600' : 'text-red-600'}`}>
                            {isIn ? '+' : '-'}¥{new Intl.NumberFormat('ja-JP').format(pending.amount)}
                          </span>
                        </div>
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
            setPendingTransactions([])
            setEditingPendingId(null)
            setFormData({
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
          <form onSubmit={(e) => { e.preventDefault(); handleFormSubmit(); }}>
            <div className="space-y-2.5">
              <div>
                <label className="block text-sm font-medium mb-0.5">
                  対象日 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.transactionDate}
                  onChange={(e) => setFormData({ ...formData, transactionDate: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                />
                <p className="text-xs text-gray-500 mt-0.5">
                  訂正対象の取引が発生した日付を入力してください
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-0.5">
                  区分 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.transactionType}
                  onChange={(e) => setFormData({ ...formData, transactionType: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                >
                  <option value="past_correct_in">過去訂正入金</option>
                  <option value="past_correct_out">過去訂正出金</option>
                </select>
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
                    className="w-full px-2 py-1.5 pr-8 border rounded focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                    placeholder="0"
                  />
                  <span className="absolute right-2 top-1.5 text-gray-500 text-sm">円</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-0.5">
                  理由 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                  placeholder="訂正の理由を入力してください"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-0.5">内容（備考）</label>
                <input
                  type="text"
                  maxLength={100}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                  placeholder="補足情報があれば入力"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-0.5">支払先</label>
                <input
                  type="text"
                  maxLength={30}
                  value={formData.payee}
                  onChange={(e) => setFormData({ ...formData, payee: e.target.value })}
                  className="w-full px-2 py-1.5 border rounded focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                  placeholder="支払先を入力"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-3 py-1.5 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                >
                  {isSubmitting ? '登録中...' : pendingTransactions.length > 0 ? `登録 (${pendingTransactions.length + (formData.transactionDate && formData.amount ? 1 : 0)}件)` : '登録'}
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
                    setShowCorrectForm(false)
                    setPendingTransactions([])
                    setEditingPendingId(null)
                    setFormData({
                      transactionDate: '',
                      transactionType: 'past_correct_in',
                      amount: '',
                      description: '',
                      payee: '',
                      reason: '',
                    })
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
                  const isIn = pending.transactionType === 'past_correct_in'
                  return (
                    <div
                      key={pending.id}
                      className="bg-gray-50 border border-gray-200 rounded p-2 flex justify-between items-center"
                    >
                      <div className="flex-1">
                        <div className="text-xs text-gray-600 flex gap-3">
                          <span>{new Date(pending.transactionDate).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })}</span>
                          <span>{isIn ? '過去訂正入金' : '過去訂正出金'}</span>
                          <span className={`font-medium ${isIn ? 'text-blue-600' : 'text-red-600'}`}>
                            {isIn ? '+' : '-'}¥{new Intl.NumberFormat('ja-JP').format(pending.amount)}
                          </span>
                        </div>
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

        {/* トースト通知 */}
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={() => setToast({ ...toast, isVisible: false })}
        />

        <h2 className="text-xl font-semibold mb-4">明細</h2>
        {isLoading ? (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-8">
              <div className="animate-pulse space-y-4">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="flex gap-4">
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                    <div className="h-4 bg-gray-200 rounded w-20"></div>
                    <div className="h-4 bg-gray-200 rounded flex-1"></div>
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                    <div className="h-4 bg-gray-200 rounded w-32"></div>
                    <div className="h-4 bg-gray-200 rounded w-32"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold">日付</th>
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
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
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
      </div>
    </MainLayout>
  )
}

