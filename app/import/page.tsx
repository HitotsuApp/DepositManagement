'use client'

import { useState } from 'react'
import MainLayout from '@/components/MainLayout'

interface ImportResult {
  facilitiesCreated: number
  unitsCreated: number
  residentsCreated: number
  transactionsCreated: number
  errors: string[]
}

export default function ImportPage() {
  const [csvData, setCsvData] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const parseCSV = (csv: string) => {
    const lines = csv.trim().split('\n')
    if (lines.length < 2) {
      throw new Error('CSVデータが不正です。ヘッダー行とデータ行が必要です。')
    }

    const headers = lines[0].split(',').map(h => h.trim())
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

    if (facilityIndex === -1 || unitIndex === -1 || residentIndex === -1 || balanceIndex === -1) {
      throw new Error('CSVの列が見つかりません。施設名、ユニット名、利用者名、残高の列が必要です。')
    }

    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim())
      if (values.length > Math.max(facilityIndex, unitIndex, residentIndex, balanceIndex)) {
        rows.push({
          facilityName: values[facilityIndex],
          unitName: values[unitIndex],
          residentName: values[residentIndex],
          initialBalance: parseFloat(values[balanceIndex]) || 0,
        })
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
        alert('インポートが完了しました')
      } else {
        alert(`インポートエラー: ${data.error}`)
      }
    } catch (error: any) {
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
          <pre className="bg-gray-100 p-4 rounded mb-4">
{`施設名,ユニット名,利用者名,残高
施設A,ユニット1,利用者1,100000
施設A,ユニット1,利用者2,50000
施設B,ユニット2,利用者3,200000`}
          </pre>
          <p className="text-sm text-gray-500">
            ※ 列名は「施設」「ユニット」「利用者」「残高」を含む必要があります
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

