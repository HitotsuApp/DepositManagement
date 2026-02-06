'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/MainLayout'
import Modal from '@/components/Modal'
import { useFacility } from '@/contexts/FacilityContext'

interface EndedResident {
  id: number
  name: string
  facilityId: number
  unitId: number
  endDate: string
  facility?: {
    id: number
    name: string
  }
  unit?: {
    id: number
    name: string
  }
}

interface Transaction {
  id: number
  transactionDate: string
  transactionType: string
  amount: number
  description?: string | null
  payee?: string | null
  reason?: string | null
}

interface ParsedCSVRow {
  facilityName: string
  unitName: string
  residentName: string
  endDate: string
  transactionDate: string
  transactionType: string
  amount: number
  description?: string
  payee?: string
  reason?: string
}

export default function MaintenancePage() {
  const router = useRouter()
  const { selectedFacilityId } = useFacility()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [residents, setResidents] = useState<EndedResident[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // アクセス制限: 法人ダッシュボードを開いていない場合はアクセス拒否
  useEffect(() => {
    if (selectedFacilityId !== null) {
      router.push('/')
    }
  }, [selectedFacilityId, router])

  // セッションストレージから認証状態を確認
  useEffect(() => {
    const authStatus = sessionStorage.getItem('maintenance_auth')
    if (authStatus === 'authenticated') {
      setIsAuthenticated(true)
      fetchEndedResidents()
    }
  }, [])

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === 'DD') {
      setIsAuthenticated(true)
      sessionStorage.setItem('maintenance_auth', 'authenticated')
      fetchEndedResidents()
    } else {
      alert('パスワードが正しくありません')
      setPassword('')
    }
  }

  const fetchEndedResidents = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/maintenance/residents')
      if (!res.ok) throw new Error('Failed to fetch residents')
      const data = await res.json()
      setResidents(data)
    } catch (error) {
      console.error('Failed to fetch ended residents:', error)
      alert('終了者の取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleArchive = async () => {
    try {
      setIsLoading(true)
      
      // 終了者のTransactionデータを取得
      const residentsWithTransactions = await Promise.all(
        residents.map(async (resident) => {
          try {
            const res = await fetch(`/api/residents/${resident.id}`)
            if (!res.ok) {
              console.error(`Failed to fetch transactions for resident ${resident.id}`)
              return { ...resident, transactions: [] }
            }
            const data = await res.json()
            return {
              ...resident,
              transactions: data.transactions || [],
            }
          } catch (error) {
            console.error(`Error fetching transactions for resident ${resident.id}:`, error)
            return { ...resident, transactions: [] }
          }
        })
      )

      // CSV生成
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const hours = String(now.getHours()).padStart(2, '0')
      const minutes = String(now.getMinutes()).padStart(2, '0')
      const seconds = String(now.getSeconds()).padStart(2, '0')
      const count = residents.length
      const filename = `${year}${month}${day}_${hours}${minutes}${seconds}_${count}.csv`

      // CSVヘッダー
      const headers = ['施設名', 'ユニット名', '名前', '終了日', '取引日', '取引種別', '金額', '摘要', '支払先', '理由']
      
      // CSVデータ
      const csvRows: string[] = [headers.join(',')]
      
      // 日付をYYYY-MM-DD形式にフォーマットする関数
      const formatDate = (date: Date | string | null | undefined): string => {
        if (!date) return ''
        const d = typeof date === 'string' ? new Date(date) : date
        if (isNaN(d.getTime())) return ''
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      for (const resident of residentsWithTransactions) {
        const endDateStr = formatDate(resident.endDate ? new Date(resident.endDate) : null)
        
        // Transactionデータがある場合
        if (resident.transactions && resident.transactions.length > 0) {
          for (const transaction of resident.transactions) {
            const transactionDateStr = formatDate(
              transaction.transactionDate ? new Date(transaction.transactionDate) : null
            )
            
            csvRows.push([
              resident.facility?.name || '',
              resident.unit?.name || '',
              resident.name,
              endDateStr,
              transactionDateStr,
              transaction.transactionType || '',
              String(transaction.amount || 0),
              transaction.description || '',
              transaction.payee || '',
              transaction.reason || '',
            ].join(','))
          }
        } else {
          // Transactionデータがない場合でも終了者情報は出力
          csvRows.push([
            resident.facility?.name || '',
            resident.unit?.name || '',
            resident.name,
            endDateStr,
            '', // 取引日
            '', // 取引種別
            '', // 金額
            '', // 摘要
            '', // 支払先
            '', // 理由
          ].join(','))
        }
      }
      
      const csvContent = csvRows.join('\n')
      
      // BOMを追加（Excelで文字化けを防ぐ）
      const BOM = '\uFEFF'
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to archive:', error)
      alert('アーカイブの作成に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const parseCSV = (csvText: string): ParsedCSVRow[] => {
    const lines = csvText.trim().split('\n')
    if (lines.length < 2) {
      throw new Error('CSVデータが不正です。ヘッダー行とデータ行が必要です。')
    }

    const headers = lines[0].split(',').map(h => h.trim())
    
    // 必須項目の列インデックスを特定
    const facilityIndex = headers.findIndex(h => 
      h.includes('施設') || h.toLowerCase().includes('facility')
    )
    const unitIndex = headers.findIndex(h => 
      h.includes('ユニット') || h.toLowerCase().includes('unit')
    )
    const residentNameIndex = headers.findIndex(h => 
      h.includes('名前') || h.includes('利用者') || h.toLowerCase().includes('name') || h.toLowerCase().includes('resident')
    )
    const endDateIndex = headers.findIndex(h => 
      h.includes('終了日') || h.toLowerCase().includes('enddate') || h.toLowerCase().includes('end_date')
    )
    const transactionDateIndex = headers.findIndex(h => 
      h.includes('取引日') || h.includes('日付') || h.toLowerCase().includes('transactiondate') || h.toLowerCase().includes('date')
    )
    const transactionTypeIndex = headers.findIndex(h => 
      h.includes('取引種別') || h.includes('種別') || h.toLowerCase().includes('type') || h.toLowerCase().includes('transactiontype')
    )
    const amountIndex = headers.findIndex(h => 
      h.includes('金額') || h.toLowerCase().includes('amount')
    )
    
    // オプション項目
    const descriptionIndex = headers.findIndex(h => 
      h.includes('摘要') || h.includes('説明') || h.toLowerCase().includes('description')
    )
    const payeeIndex = headers.findIndex(h => 
      h.includes('支払先') || h.toLowerCase().includes('payee')
    )
    const reasonIndex = headers.findIndex(h => 
      h.includes('理由') || h.toLowerCase().includes('reason')
    )

    // 必須項目のチェック
    const missingFields: string[] = []
    if (facilityIndex === -1) missingFields.push('施設名')
    if (unitIndex === -1) missingFields.push('ユニット名')
    if (residentNameIndex === -1) missingFields.push('名前')
    if (endDateIndex === -1) missingFields.push('終了日')
    if (transactionDateIndex === -1) missingFields.push('取引日')
    if (transactionTypeIndex === -1) missingFields.push('取引種別')
    if (amountIndex === -1) missingFields.push('金額')

    if (missingFields.length > 0) {
      throw new Error(`形式が合っていません。以下の列が見つかりません: ${missingFields.join(', ')}`)
    }

    const rows: ParsedCSVRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim())
      
      // 必須項目の値が空でないかチェック
      const facilityName = values[facilityIndex] || ''
      const unitName = values[unitIndex] || ''
      const residentName = values[residentNameIndex] || ''
      const endDate = values[endDateIndex] || ''
      const transactionDate = values[transactionDateIndex] || ''
      const transactionType = values[transactionTypeIndex] || ''
      const amountStr = values[amountIndex] || ''

      // 必須項目のバリデーション
      if (!facilityName || !unitName || !residentName || !endDate || !transactionDate || !transactionType || !amountStr) {
        throw new Error(`形式が合っていません。行${i + 1}で必須項目が不足しています。`)
      }

      const amount = parseFloat(amountStr)
      if (isNaN(amount)) {
        throw new Error(`形式が合っていません。行${i + 1}の金額が数値ではありません: ${amountStr}`)
      }

      const row: ParsedCSVRow = {
        facilityName,
        unitName,
        residentName,
        endDate,
        transactionDate,
        transactionType,
        amount,
        description: descriptionIndex !== -1 ? values[descriptionIndex] : undefined,
        payee: payeeIndex !== -1 ? values[payeeIndex] : undefined,
        reason: reasonIndex !== -1 ? values[reasonIndex] : undefined,
      }

      rows.push(row)
    }

    return rows
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // CSVファイルのみ許可
    if (!file.name.endsWith('.csv')) {
      alert('CSVファイルのみ選択できます')
      e.target.value = ''
      return
    }
    
    try {
      // ファイルを読み込む
      const text = await file.text()
      await handleImport(text)
    } catch (error) {
      console.error('File read error:', error)
      alert('ファイルの読み込みに失敗しました')
    } finally {
      // ファイル選択をリセット
      e.target.value = ''
    }
  }

  const handleImport = async (csvText: string) => {
    try {
      setIsLoading(true)
      const rows = parseCSV(csvText)
      
      const response = await fetch('/api/maintenance/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })

      const data = await response.json()

      if (response.ok) {
        alert(`インポートが完了しました。\n終了者: ${data.results.residentsRestored}件\n取引: ${data.results.transactionsRestored}件`)
        // 終了者一覧を再取得
        fetchEndedResidents()
      } else {
        // エラーメッセージを表示
        let errorMessage = `インポートエラー: ${data.error}`
        if (data.details && Array.isArray(data.details)) {
          errorMessage += '\n\n詳細:\n' + data.details.slice(0, 10).join('\n')
          if (data.details.length > 10) {
            errorMessage += `\n...他${data.details.length - 10}件のエラー`
          }
        }
        alert(errorMessage)
      }
    } catch (error: any) {
      console.error('Import error:', error)
      alert(`エラー: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (deleteConfirmText !== 'DELETE') {
      alert('「DELETE」と正確に入力してください')
      return
    }

    try {
      const res = await fetch('/api/maintenance/residents', {
        method: 'DELETE',
      })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to delete residents')
      }
      
      const result = await res.json()
      alert(result.message || '終了者のデータを削除しました')
      setShowDeleteModal(false)
      setDeleteConfirmText('')
      fetchEndedResidents()
    } catch (error) {
      console.error('Failed to delete residents:', error)
      alert(error instanceof Error ? error.message : '削除に失敗しました')
    }
  }

  // パスワード認証画面
  if (!isAuthenticated) {
    return (
      <MainLayout>
        <div className="max-w-md mx-auto mt-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h1 className="text-2xl font-bold mb-4">メンテナンス画面</h1>
            <p className="mb-4 text-gray-600">パスワードを入力してください</p>
            <form onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded mb-4"
                placeholder="パスワード"
                autoFocus
              />
              <button
                type="submit"
                className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600"
              >
                認証
              </button>
            </form>
          </div>
        </div>
      </MainLayout>
    )
  }

  // メンテナンス画面
  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">メンテナンス</h1>
        
        <div className="mb-4 flex gap-4">
          <button
            onClick={handleArchive}
            disabled={residents.length === 0 || isLoading}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            アーカイブ(CSV)
          </button>
          <button
            onClick={handleImportClick}
            disabled={isLoading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            インポート
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => setShowDeleteModal(true)}
            disabled={residents.length === 0}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            削除
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-8">読み込み中...</div>
        ) : residents.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
            終了者がいません
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left">施設名</th>
                  <th className="px-4 py-3 text-left">ユニット名</th>
                  <th className="px-4 py-3 text-left">名前</th>
                  <th className="px-4 py-3 text-left">終了日</th>
                </tr>
              </thead>
              <tbody>
                {residents.map(resident => (
                  <tr key={resident.id} className="border-t">
                    <td className="px-4 py-3">{resident.facility?.name || '-'}</td>
                    <td className="px-4 py-3">{resident.unit?.name || '-'}</td>
                    <td className="px-4 py-3">{resident.name}</td>
                    <td className="px-4 py-3">
                      {resident.endDate
                        ? new Date(resident.endDate).toLocaleDateString('ja-JP')
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 削除確認モーダル */}
        {showDeleteModal && (
          <Modal
            isOpen={showDeleteModal}
            onClose={() => {
              setShowDeleteModal(false)
              setDeleteConfirmText('')
            }}
            title="削除確認"
          >
            <div className="space-y-4">
              <p className="text-gray-700">
                終了者のデータを削除します。アーカイブ（保存処理）は完了していますか？削除するには「DELETE」と入力してください。
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded"
                placeholder="DELETE"
                autoFocus
              />
              <div className="flex gap-4 justify-end">
                <button
                  onClick={() => {
                    setShowDeleteModal(false)
                    setDeleteConfirmText('')
                  }}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  削除
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </MainLayout>
  )
}
