# メンテナンス機能 CSVインポート機能 実装計画（確定版）

## 要件確定

### 1. CSV出力
- **形式**: オプション2（終了者情報 + Transactionデータ）
- **内容**: 施設名、ユニット名、名前、終了日、取引日、取引種別、金額、摘要、支払先、理由

### 2. CSVインポート
- **受け付ける形式**: オプション2の形式のみ（終了者情報 + Transactionデータ）
- **必須項目**: 施設名、ユニット名、名前、終了日、取引日、取引種別、金額
- **バリデーション**: 必須項目が不足している場合は「形式が合っていません」というエラーでインポートを拒否
- **完全復旧**: 施設名・ユニット名・名前が全て揃っている場合のみ復旧可能

### 3. 既存データとの重複
- **重複チェック**: 既存のTransactionと重複する場合はエラーとしてインポートを拒否
- **重複判定**: 利用者ID、取引日、取引種別、金額が全て一致する場合

---

## 実装計画

### タスク1: CSV出力の拡張（終了者情報 + Transactionデータ）

**ファイル**: `app/maintenance/page.tsx`

**変更内容**:
- 現在の出力（終了者情報のみ）を変更
- 終了者情報 + Transactionデータを含む形式に変更
- 終了者のTransactionデータを取得してCSVに含める

**CSV形式**:
```
施設名,ユニット名,名前,終了日,取引日,取引種別,金額,摘要,支払先,理由
施設A,ユニット1,利用者1,2024/1/31,2024/1/1,in,10000,入金,,
施設A,ユニット1,利用者1,2024/1/31,2024/1/15,out,5000,出金,支払先A,
施設A,ユニット1,利用者2,2024/2/28,2024/2/1,in,20000,入金,,
```

**実装コード**:
```typescript
const handleArchive = async () => {
  try {
    // 終了者のTransactionデータを取得
    const residentsWithTransactions = await Promise.all(
      residents.map(async (resident) => {
        const res = await fetch(`/api/residents/${resident.id}`)
        if (!res.ok) throw new Error('Failed to fetch resident transactions')
        const data = await res.json()
        return {
          ...resident,
          transactions: data.transactions || [],
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
    
    for (const resident of residentsWithTransactions) {
      const endDateStr = resident.endDate
        ? new Date(resident.endDate).toLocaleDateString('ja-JP')
        : ''
      
      // Transactionデータがある場合
      if (resident.transactions && resident.transactions.length > 0) {
        for (const transaction of resident.transactions) {
          const transactionDateStr = transaction.transactionDate
            ? new Date(transaction.transactionDate).toLocaleDateString('ja-JP')
            : ''
          
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
  }
}
```

**注意点**:
- 終了者のTransactionデータを取得する必要がある
- 大量のTransactionデータがある場合、パフォーマンスに注意
- Transactionデータがない終了者も含める（終了者情報のみの行）

---

### タスク2: インポートボタンの追加

**ファイル**: `app/maintenance/page.tsx`

**変更内容**:
- アーカイブボタンと削除ボタンの横に「インポート」ボタンを追加
- ファイル選択ダイアログを開く
- CSVファイルのみ許可

**実装コード**:
```typescript
const fileInputRef = useRef<HTMLInputElement>(null)

const handleImportClick = () => {
  fileInputRef.current?.click()
}

const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return
  
  // CSVファイルのみ許可
  if (!file.name.endsWith('.csv')) {
    alert('CSVファイルのみ選択できます')
    return
  }
  
  // ファイルを読み込む
  const text = await file.text()
  await handleImport(text)
  
  // ファイル選択をリセット
  e.target.value = ''
}
```

**UI変更**:
```typescript
<div className="mb-4 flex gap-4">
  <button
    onClick={handleArchive}
    disabled={residents.length === 0}
    className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
  >
    アーカイブ(CSV)
  </button>
  <button
    onClick={handleImportClick}
    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
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
```

---

### タスク3: CSV解析機能の実装

**ファイル**: `app/maintenance/page.tsx`

**機能**:
- CSV形式をバリデーション（必須項目のチェック）
- 必須項目が不足している場合はエラーを返す
- データをパース

**必須項目**:
- 施設名
- ユニット名
- 名前
- 終了日
- 取引日
- 取引種別
- 金額

**実装コード**:
```typescript
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
```

---

### タスク4: インポートAPIの実装

**ファイル**: `app/api/maintenance/import/route.ts`（新規作成）

**機能**:
- CSVデータを受け取る
- 終了者情報の復元
- Transactionデータの復元
- 既存データとの重複チェック（重複する場合はエラー）

**実装コード**:
```typescript
export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'

interface ImportRow {
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

export async function POST(request: Request) {
  const prisma = getPrisma()
  try {
    const body = await request.json()
    const rows: ImportRow[] = body.rows || []

    if (rows.length === 0) {
      return NextResponse.json({ error: 'インポートするデータがありません' }, { status: 400 })
    }

    const results = {
      residentsRestored: 0,
      transactionsRestored: 0,
      errors: [] as string[],
    }

    // 施設・ユニット・利用者のマップを作成
    const facilityMap = new Map<string, number>()
    const unitMap = new Map<string, number>()
    const residentMap = new Map<string, number>()

    // 日付文字列をDateオブジェクトに変換するヘルパー関数
    const parseDate = (dateString: string, fieldName: string): Date | null => {
      if (!dateString || dateString.trim() === '') {
        return null
      }
      // 複数の日付形式に対応
      // YYYY-MM-DD, YYYY/MM/DD, YYYY年MM月DD日
      const normalized = dateString.trim()
        .replace(/\//g, '-')
        .replace(/年/g, '-')
        .replace(/月/g, '-')
        .replace(/日/g, '')
      
      const datePattern = /^\d{4}-\d{2}-\d{2}$/
      if (!datePattern.test(normalized)) {
        results.errors.push(`${fieldName}の形式が不正です: ${dateString} (YYYY-MM-DD形式で入力してください)`)
        return null
      }
      const date = new Date(normalized)
      if (isNaN(date.getTime())) {
        results.errors.push(`${fieldName}の日付が無効です: ${dateString}`)
        return null
      }
      return date
    }

    // 終了者情報をグループ化（同じ利用者のTransactionをまとめる）
    const residentGroups = new Map<string, {
      facilityName: string
      unitName: string
      residentName: string
      endDate: string
      transactions: ImportRow[]
    }>()

    for (const row of rows) {
      const key = `${row.facilityName}-${row.unitName}-${row.residentName}`
      if (!residentGroups.has(key)) {
        residentGroups.set(key, {
          facilityName: row.facilityName,
          unitName: row.unitName,
          residentName: row.residentName,
          endDate: row.endDate,
          transactions: [],
        })
      }
      residentGroups.get(key)!.transactions.push(row)
    }

    // 終了者情報とTransactionデータを復元
    for (const [key, group] of residentGroups) {
      try {
        // 施設の取得または作成
        let facilityId = facilityMap.get(group.facilityName)
        if (!facilityId) {
          let facility = await prisma.facility.findFirst({
            where: { name: group.facilityName, isActive: true },
          })
          if (!facility) {
            facility = await prisma.facility.create({
              data: {
                name: group.facilityName,
                isActive: true,
              },
            })
          }
          facilityId = facility.id
          facilityMap.set(group.facilityName, facilityId)
        }

        // ユニットの取得または作成
        const unitKey = `${facilityId}-${group.unitName}`
        let unitId = unitMap.get(unitKey)
        if (!unitId) {
          let unit = await prisma.unit.findFirst({
            where: {
              facilityId,
              name: group.unitName,
              isActive: true,
            },
          })
          if (!unit) {
            unit = await prisma.unit.create({
              data: {
                facilityId,
                name: group.unitName,
                isActive: true,
              },
            })
          }
          unitId = unit.id
          unitMap.set(unitKey, unitId)
        }

        // 利用者の取得または作成
        const residentKey = `${facilityId}-${unitId}-${group.residentName}`
        let residentId = residentMap.get(residentKey)
        
        const endDate = parseDate(group.endDate, `利用者「${group.residentName}」の終了日`)
        if (!endDate) {
          results.errors.push(`利用者「${group.residentName}」の終了日が不正です`)
          continue
        }
        
        if (!residentId) {
          let resident = await prisma.resident.findFirst({
            where: {
              facilityId,
              unitId,
              name: group.residentName,
            },
          })
          
          if (!resident) {
            // 新規作成
            resident = await prisma.resident.create({
              data: {
                facilityId,
                unitId,
                name: group.residentName,
                endDate,
                isActive: false, // 終了者として復元
              },
            })
            results.residentsRestored++
          } else {
            // 既存の利用者を更新
            if (!resident.endDate) {
              resident = await prisma.resident.update({
                where: { id: resident.id },
                data: { endDate },
              })
            } else if (resident.endDate.getTime() !== endDate.getTime()) {
              // 終了日が異なる場合はエラー
              results.errors.push(`利用者「${group.residentName}」の終了日が既存データと異なります`)
              continue
            }
          }
          residentId = resident.id
          residentMap.set(residentKey, residentId)
        }

        // Transactionデータの復元
        for (const transactionRow of group.transactions) {
          const transactionDate = parseDate(transactionRow.transactionDate, '取引日')
          if (!transactionDate) {
            continue
          }

          // 既存のTransactionがあるか確認（重複チェック）
          const existingTransaction = await prisma.transaction.findFirst({
            where: {
              residentId,
              transactionDate,
              transactionType: transactionRow.transactionType,
              amount: transactionRow.amount,
            },
          })

          if (existingTransaction) {
            results.errors.push(
              `利用者「${group.residentName}」の取引が既に存在します: ${transactionDate.toLocaleDateString('ja-JP')} ${transactionRow.transactionType} ${transactionRow.amount}円`
            )
            continue
          }

          await prisma.transaction.create({
            data: {
              residentId,
              transactionDate,
              transactionType: transactionRow.transactionType,
              amount: transactionRow.amount,
              description: transactionRow.description || null,
              payee: transactionRow.payee || null,
              reason: transactionRow.reason || null,
            },
          })
          results.transactionsRestored++
        }
      } catch (error: any) {
        results.errors.push(`行の処理エラー: ${error.message}`)
      }
    }

    // エラーがある場合はエラーを返す
    if (results.errors.length > 0) {
      return NextResponse.json(
        { 
          error: 'インポートエラーが発生しました',
          details: results.errors,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error: any) {
    console.error('Failed to import maintenance data:', error)
    return NextResponse.json(
      { error: 'インポートに失敗しました', details: error.message },
      { status: 500 }
    )
  }
}
```

---

### タスク5: フロントエンドのインポート処理

**ファイル**: `app/maintenance/page.tsx`

**実装コード**:
```typescript
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
```

---

## 実装順序

1. **タスク1**: CSV出力の拡張（終了者情報 + Transactionデータ）
2. **タスク2**: インポートボタンの追加
3. **タスク3**: CSV解析機能の実装
4. **タスク4**: インポートAPIの実装
5. **タスク5**: フロントエンドのインポート処理

---

## 注意事項

1. **パフォーマンス**
   - Transactionデータが大量になる可能性がある
   - 終了者のTransactionデータを取得する際に、効率的なクエリを使用する

2. **データ整合性**
   - 既存データとの整合性を保つ
   - トランザクション処理で安全に実行

3. **エラーハンドリング**
   - 詳細なエラーメッセージを返す
   - 必須項目が不足している場合は明確にエラーを表示

4. **重複チェック**
   - 既存のTransactionと重複する場合はエラーとして拒否
   - 重複判定は利用者ID、取引日、取引種別、金額で行う

5. **日付形式**
   - 複数の日付形式に対応（YYYY-MM-DD, YYYY/MM/DD, YYYY年MM月DD日）
   - 日付のパースエラーは明確に表示
