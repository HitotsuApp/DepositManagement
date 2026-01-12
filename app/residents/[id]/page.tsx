'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import MainLayout from '@/components/MainLayout'
import DateSelector from '@/components/DateSelector'
import Card from '@/components/Card'
import Modal from '@/components/Modal'
import Toast from '@/components/Toast'

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

export default function ResidentDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
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
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
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

  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth() + 1
  const isCurrentMonth = year === currentYear && month === currentMonth
  const isPastMonth = year < currentYear || (year === currentYear && month < currentMonth)

  useEffect(() => {
    fetchResidentData()
  }, [residentId, year, month])

  const fetchResidentData = async () => {
    try {
      const response = await fetch(
        `/api/residents/${residentId}?year=${year}&month=${month}`
      )
      const data = await response.json()
      setResidentName(data.residentName || '')
      setBalance(data.balance || 0)
      setTransactions(data.transactions || [])
    } catch (error) {
      console.error('Failed to fetch resident data:', error)
    }
  }

  const handleDateChange = (newYear: number, newMonth: number) => {
    setYear(newYear)
    setMonth(newMonth)
    setShowInOutForm(false)
    setShowCorrectForm(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // バリデーション
    if (!formData.transactionDate) {
      setToast({
        message: '対象日を入力してください',
        type: 'error',
        isVisible: true,
      })
      return
    }

    const amount = parseFloat(formData.amount)
    if (isNaN(amount) || amount < 1 || amount % 1 !== 0) {
      setToast({
        message: '金額は1円以上の整数を入力してください',
        type: 'error',
        isVisible: true,
      })
      return
    }

    if (showCorrectForm && !formData.reason) {
      setToast({
        message: '訂正入力の場合は理由を入力してください',
        type: 'error',
        isVisible: true,
      })
      return
    }

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
          ? (formData.transactionType === 'correct_in' ? '訂正入金' : '訂正出金')
          : (formData.transactionType === 'in' ? '入金' : '出金')
        
        setToast({
          message: `${transactionTypeLabel}を登録しました`,
          type: 'success',
          isVisible: true,
        })
        
        setFormData({
          transactionDate: '',
          transactionType: showCorrectForm ? 'correct_in' : 'in',
          amount: '',
          description: '',
          payee: '',
          reason: '',
        })
        setShowInOutForm(false)
        setShowCorrectForm(false)
        fetchResidentData()
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
  }

  const getTransactionTypeLabel = (type: string) => {
    switch (type) {
      case 'in': return '入金'
      case 'out': return '出金'
      case 'correct_in': return '訂正入金'
      case 'correct_out': return '訂正出金'
      default: return type
    }
  }

  return (
    <MainLayout>
      <div>
        <h1 className="text-3xl font-bold mb-6">利用者詳細: {residentName}</h1>
        
        <DateSelector year={year} month={month} onDateChange={handleDateChange} />

        {isPastMonth && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
            <span className="text-yellow-800">🔒 締め済み</span>
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
                  transactionType: 'correct_in',
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
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  対象日 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.transactionDate}
                  onChange={(e) => setFormData({ ...formData, transactionDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  max={isCurrentMonth ? new Date().toISOString().split('T')[0] : undefined}
                />
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
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2 text-gray-500">円</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">内容（備考）</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例: 預かり金、返金など"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">支払先</label>
                <input
                  type="text"
                  value={formData.payee}
                  onChange={(e) => setFormData({ ...formData, payee: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="支払先を入力"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`flex-1 px-4 py-2 rounded text-white ${
                    formData.transactionType === 'in'
                      ? 'bg-blue-500 hover:bg-blue-600'
                      : 'bg-red-500 hover:bg-red-600'
                  } disabled:bg-gray-400 disabled:cursor-not-allowed`}
                >
                  {isSubmitting ? '登録中...' : '登録'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowInOutForm(false)
                    setFormData({
                      transactionDate: '',
                      transactionType: 'in',
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

        {/* 訂正入力モーダル */}
        <Modal
          isOpen={showCorrectForm}
          onClose={() => {
            setShowCorrectForm(false)
            setFormData({
              transactionDate: '',
              transactionType: 'correct_in',
              amount: '',
              description: '',
              reason: '',
            })
          }}
          title="✏️ 訂正入力"
        >
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
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
                  <option value="correct_in">訂正入金</option>
                  <option value="correct_out">訂正出金</option>
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
                      transactionDate: '',
                      transactionType: 'correct_in',
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

        {/* トースト通知 */}
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={toast.isVisible}
          onClose={() => setToast({ ...toast, isVisible: false })}
        />

        <h2 className="text-xl font-semibold mb-4">明細</h2>
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
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      明細がありません
                    </td>
                  </tr>
                ) : (
                  transactions.map((transaction) => {
                    const isIn = transaction.transactionType === 'in' || transaction.transactionType === 'correct_in'
                    const isCorrect = transaction.transactionType === 'correct_in' || transaction.transactionType === 'correct_out'
                    
                    return (
                      <tr key={transaction.id} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          {new Date(transaction.transactionDate).toLocaleDateString('ja-JP', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            isIn
                              ? isCorrect
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-blue-100 text-blue-800'
                              : isCorrect
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-red-100 text-red-800'
                          }`}>
                            {getTransactionTypeLabel(transaction.transactionType)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{transaction.description || '-'}</td>
                        <td className="px-4 py-3 text-sm">{transaction.payee || '-'}</td>
                        <td className={`px-4 py-3 text-sm text-right font-medium ${
                          isIn ? 'text-blue-600' : 'text-red-600'
                        }`}>
                          {isIn ? '+' : '-'}
                          {new Intl.NumberFormat('ja-JP', {
                            style: 'currency',
                            currency: 'JPY',
                          }).format(transaction.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                          {new Intl.NumberFormat('ja-JP', {
                            style: 'currency',
                            currency: 'JPY',
                          }).format(transaction.balance)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

