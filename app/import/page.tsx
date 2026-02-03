'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MainLayout from '@/components/MainLayout'
import { invalidateMasterCache } from '@/lib/cache'

interface ImportResult {
  facilitiesCreated: number
  unitsCreated: number
  residentsCreated: number
  transactionsCreated: number
  errors: string[]
}

export default function ImportPage() {
  const router = useRouter()
  const [csvData, setCsvData] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const parseCSV = (csv: string) => {
    const lines = csv.trim().split('\n')
    if (lines.length < 2) {
      throw new Error('CSVデータが不正です。ヘッダー行とデータ行が必要です。')
    }

    const headers = lines[0].split(',').map(h => h.trim())
    
    // 必須項目の検索
    const facilityIndex = headers.findIndex(h => 
      h.includes('施設') || h.toLowerCase().includes('facility')
    )
    const unitIndex = headers.findIndex(h => 
      h.includes('ユニット') || h.toLowerCase().includes('unit')
    )
    const residentIndex = headers.findIndex(h => 
      h.includes('利用者') || h.includes('名前') || h.toLowerCase().includes('resident') || h.toLowerCase().includes('name')
    )
    const balanceIndex = headers.findIndex(h => 
      h.includes('残高') || h.includes('金額') || h.toLowerCase().includes('balance') || h.toLowerCase().includes('amount')
    )
    
    // オプション項目の検索
    const startDateIndex = headers.findIndex(h => 
      h.includes('入居日') || h.includes('開始日') || h.toLowerCase().includes('startdate') || h.toLowerCase().includes('start_date')
    )
    const endDateIndex = headers.findIndex(h => 
      h.includes('退居日') || h.includes('終了日') || h.toLowerCase().includes('enddate') || h.toLowerCase().includes('end_date')
    )
    const positionNameIndex = headers.findIndex(h => 
      h.includes('役職名') || h.toLowerCase().includes('positionname') || h.toLowerCase().includes('position_name')
    )
    const positionHolderNameIndex = headers.findIndex(h => 
      h.includes('役職者名') || h.includes('役職者') || h.toLowerCase().includes('positionholder') || h.toLowerCase().includes('position_holder')
    )
    const sortOrderIndex = headers.findIndex(h => 
      h.includes('並び順') || h.includes('順序') || h.toLowerCase().includes('sortorder') || h.toLowerCase().includes('sort_order')
    )

    if (facilityIndex === -1 || unitIndex === -1 || residentIndex === -1 || balanceIndex === -1) {
      throw new Error('CSVの列が見つかりません。施設名、ユニット名、利用者名、残高の列が必要です。')
    }

    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim())
      if (values.length > Math.max(facilityIndex, unitIndex, residentIndex, balanceIndex)) {
        const row: any = {
          facilityName: values[facilityIndex],
          unitName: values[unitIndex],
          residentName: values[residentIndex],
          initialBalance: parseFloat(values[balanceIndex]) || 0,
        }
        
        // オプション項目の追加
        if (startDateIndex !== -1 && values[startDateIndex]) {
          row.startDate = values[startDateIndex]
        }
        if (endDateIndex !== -1 && values[endDateIndex]) {
          row.endDate = values[endDateIndex]
        }
        if (positionNameIndex !== -1 && values[positionNameIndex]) {
          row.positionName = values[positionNameIndex]
        }
        if (positionHolderNameIndex !== -1 && values[positionHolderNameIndex]) {
          row.positionHolderName = values[positionHolderNameIndex]
        }
        if (sortOrderIndex !== -1 && values[sortOrderIndex]) {
          row.sortOrder = parseInt(values[sortOrderIndex]) || 0
        }
        
        rows.push(row)
      }
    }

    return rows
  }

  const handleImport = async () => {
    if (!csvData.trim()) {
      alert('CSVデータを入力してください')
      return
    }

    setIsImporting(true)
    setResult(null)

    try {
      const rows = parseCSV(csvData)
      
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })

      const data = await response.json()

      if (response.ok) {
        setResult(data.results)
        setCsvData('')
        
        // マスタデータのキャッシュを無効化（すべての施設）
        await invalidateMasterCache()
        
        // Next.jsのサーバーコンポーネントのキャッシュも無効化
        router.refresh()
        
        alert('インポートが完了しました')
      } else {
        alert(`インポートエラー: ${data.error}`)
      }
      } catch (error: any) {
        console.error('Import error:', error)
        alert(`エラー: ${error.message}`)
      } finally {
      setIsImporting(false)
    }
  }

  return (
    <MainLayout>
      <div>
        <h1 className="text-3xl font-bold mb-6">初期データインポート</h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">CSV形式</h2>
          <p className="text-gray-600 mb-4">
            CSVファイルは以下の形式である必要があります：
          </p>
          <div className="mb-4">
            <h3 className="font-semibold mb-2">必須項目：</h3>
            <ul className="list-disc list-inside text-sm text-gray-700 mb-4">
              <li>施設名（「施設」を含む列名）</li>
              <li>ユニット名（「ユニット」を含む列名）</li>
              <li>利用者名（「利用者」または「名前」を含む列名）</li>
              <li>残高（「残高」または「金額」を含む列名）</li>
            </ul>
            <h3 className="font-semibold mb-2">オプション項目：</h3>
            <ul className="list-disc list-inside text-sm text-gray-700 mb-4">
              <li>入居日（「入居日」または「開始日」を含む列名、形式: YYYY-MM-DD）</li>
              <li>退居日（「退居日」または「終了日」を含む列名、形式: YYYY-MM-DD）</li>
              <li>役職名（「役職名」を含む列名）</li>
              <li>役職者名（「役職者名」または「役職者」を含む列名）</li>
              <li>並び順（「並び順」または「順序」を含む列名、数値）</li>
            </ul>
          </div>
          <pre className="bg-gray-100 p-4 rounded mb-4 overflow-x-auto">
{`施設名,ユニット名,利用者名,残高,入居日,退居日,役職名,役職者名,並び順
施設A,ユニット1,利用者1,100000,2024-01-01,,施設長,山田太郎,1
施設A,ユニット1,利用者2,50000,2024-02-01,,施設長,山田太郎,1
施設B,ユニット2,利用者3,200000,2024-03-01,,副施設長,佐藤花子,2`}
          </pre>
          <p className="text-sm text-gray-500">
            ※ 必須項目の列名は「施設」「ユニット」「利用者」「残高」を含む必要があります<br/>
            ※ 日付は YYYY-MM-DD 形式で入力してください（例: 2024-01-01）<br/>
            ※ オプション項目は空欄でも構いません
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">CSVデータ入力</h2>
          <textarea
            value={csvData}
            onChange={(e) => setCsvData(e.target.value)}
            placeholder="CSVデータを貼り付けてください"
            className="w-full h-64 px-3 py-2 border rounded font-mono text-sm"
          />
          <button
            onClick={handleImport}
            disabled={isImporting}
            className="mt-4 px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
          >
            {isImporting ? 'インポート中...' : 'インポート実行'}
          </button>
        </div>

        {result && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">インポート結果</h2>
            <div className="space-y-2">
              <p>施設作成: {result.facilitiesCreated}件</p>
              <p>ユニット作成: {result.unitsCreated}件</p>
              <p>利用者作成: {result.residentsCreated}件</p>
              <p>取引作成: {result.transactionsCreated}件</p>
              {result.errors.length > 0 && (
                <div className="mt-4">
                  <p className="font-semibold text-red-600">エラー:</p>
                  <ul className="list-disc list-inside">
                    {result.errors.map((error, index) => (
                      <li key={index} className="text-red-600">{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}

