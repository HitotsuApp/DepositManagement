# メンテナンス機能 CSVインポート機能 実装計画

## 確認事項への回答

### 1. CSVで吐き出させるのはtransactionの認識ですが合ってますか？

**現在の実装状況**:
- 現在のCSV出力は**終了者情報のみ**を出力しています
  - 施設名、ユニット名、名前、終了日
- **Transactionデータは含まれていません**

**ご質問への回答**:
- TransactionデータもCSVに含めるべきか確認が必要です
- 現在の実装では終了者情報のみを出力していますが、Transactionデータも含めることで、より完全なアーカイブが可能になります

**提案**:
- **オプション1**: 終了者情報のみ（現在の実装）
- **オプション2**: 終了者情報 + Transactionデータ（推奨）
  - より完全なアーカイブが可能
  - 復元時にTransactionデータも復元できる

---

## インポート機能の実装計画

### 要件整理

1. **メンテナンス画面にインポートボタンを設置**
2. **押下時にファイル選択をさせる（CSVのみ許可）**
3. **CSV内容を取り込む**
4. **懸念事項**: CSVがtransactionだけだった場合の施設名・ユニット名が大丈夫か

---

## CSV形式の定義

### 形式1: 終了者情報のみ（現在の出力形式）
```
施設名,ユニット名,名前,終了日
施設A,ユニット1,利用者1,2024/1/31
施設A,ユニット1,利用者2,2024/2/28
```

### 形式2: 終了者情報 + Transactionデータ（推奨）
```
施設名,ユニット名,名前,終了日,取引日,取引種別,金額,摘要,支払先,理由
施設A,ユニット1,利用者1,2024/1/31,2024/1/1,in,10000,入金,,
施設A,ユニット1,利用者1,2024/1/31,2024/1/15,out,5000,出金,支払先A,
施設A,ユニット1,利用者2,2024/2/28,2024/2/1,in,20000,入金,,
```

### 形式3: Transactionデータのみ（懸念事項）
```
施設名,ユニット名,名前,取引日,取引種別,金額,摘要,支払先,理由
施設A,ユニット1,利用者1,2024/1/1,in,10000,入金,,
施設A,ユニット1,利用者1,2024/1/15,out,5000,出金,支払先A,
```

**懸念事項への対応**:
- Transactionデータのみの場合、**施設名・ユニット名・名前が必須**
- これらの情報がないと、どの利用者のTransactionか特定できない
- 既存の利用者とマッチングする必要がある

---

## 実装計画

### タスク1: CSV出力の拡張（オプション）

**ファイル**: `app/maintenance/page.tsx`

**変更内容**:
- 現在の出力（終了者情報のみ）を維持
- オプションでTransactionデータも含める形式を追加
- ユーザーが選択できるようにする（チェックボックスなど）

**実装内容**:
```typescript
const [includeTransactions, setIncludeTransactions] = useState(false)

const handleArchive = () => {
  // ... 既存のコード ...
  
  if (includeTransactions) {
    // Transactionデータも含める形式
    // 終了者のTransactionデータを取得してCSVに追加
  } else {
    // 現在の形式（終了者情報のみ）
  }
}
```

**注意点**:
- Transactionデータが大量になる可能性がある
- パフォーマンスに注意が必要

---

### タスク2: インポートボタンの追加

**ファイル**: `app/maintenance/page.tsx`

**変更内容**:
- アーカイブボタンと削除ボタンの横に「インポート」ボタンを追加
- ファイル選択ダイアログを開く

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
  handleImport(text)
}
```

---

### タスク3: CSV解析機能の実装

**ファイル**: `app/maintenance/page.tsx`

**機能**:
- CSV形式を自動判定（終了者情報のみ / 終了者情報+Transaction / Transactionのみ）
- ヘッダー行から列を特定
- データをパース

**実装コード**:
```typescript
interface ParsedCSVRow {
  type: 'resident' | 'transaction' | 'both'
  facilityName?: string
  unitName?: string
  residentName?: string
  endDate?: string
  transactionDate?: string
  transactionType?: string
  amount?: number
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
  
  // 列のインデックスを特定
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
    h.includes('金額') || h.includes('残高') || h.toLowerCase().includes('amount') || h.toLowerCase().includes('balance')
  )
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
  if (facilityIndex === -1 || unitIndex === -1 || residentNameIndex === -1) {
    throw new Error('CSVの列が見つかりません。施設名、ユニット名、名前の列が必要です。')
  }

  // 形式を判定
  const hasEndDate = endDateIndex !== -1
  const hasTransaction = transactionDateIndex !== -1 && transactionTypeIndex !== -1 && amountIndex !== -1
  const csvType = hasEndDate && hasTransaction ? 'both' : hasEndDate ? 'resident' : hasTransaction ? 'transaction' : 'resident'

  const rows: ParsedCSVRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    const row: ParsedCSVRow = {
      type: csvType,
      facilityName: values[facilityIndex],
      unitName: values[unitIndex],
      residentName: values[residentNameIndex],
    }

    if (endDateIndex !== -1 && values[endDateIndex]) {
      row.endDate = values[endDateIndex]
    }
    if (transactionDateIndex !== -1 && values[transactionDateIndex]) {
      row.transactionDate = values[transactionDateIndex]
    }
    if (transactionTypeIndex !== -1 && values[transactionTypeIndex]) {
      row.transactionType = values[transactionTypeIndex]
    }
    if (amountIndex !== -1 && values[amountIndex]) {
      row.amount = parseFloat(values[amountIndex]) || 0
    }
    if (descriptionIndex !== -1 && values[descriptionIndex]) {
      row.description = values[descriptionIndex]
    }
    if (payeeIndex !== -1 && values[payeeIndex]) {
      row.payee = values[payeeIndex]
    }
    if (reasonIndex !== -1 && values[reasonIndex]) {
      row.reason = values[reasonIndex]
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
- 既存データとのマッチング

**実装コード**:
```typescript
export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'

interface ImportRow {
  facilityName: string
  unitName: string
  residentName: string
  endDate?: string
  transactionDate?: string
  transactionType?: string
  amount?: number
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
      return NextResponse.json({ error: 'No data to import' }, { status: 400 })
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
    const parseDate = (dateString?: string, fieldName?: string): Date | null => {
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
        if (fieldName) {
          results.errors.push(`${fieldName}の形式が不正です: ${dateString}`)
        }
        return null
      }
      const date = new Date(normalized)
      if (isNaN(date.getTime())) {
        if (fieldName) {
          results.errors.push(`${fieldName}の日付が無効です: ${dateString}`)
        }
        return null
      }
      return date
    }

    // 終了者情報をグループ化（同じ利用者のTransactionをまとめる）
    const residentGroups = new Map<string, {
      facilityName: string
      unitName: string
      residentName: string
      endDate?: string
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
      if (row.transactionDate) {
        residentGroups.get(key)!.transactions.push(row)
      }
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
        if (!residentId) {
          let resident = await prisma.resident.findFirst({
            where: {
              facilityId,
              unitId,
              name: group.residentName,
            },
          })
          
          const endDate = parseDate(group.endDate, `利用者「${group.residentName}」の終了日`)
          
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
            if (endDate && !resident.endDate) {
              resident = await prisma.resident.update({
                where: { id: resident.id },
                data: { endDate },
              })
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
              amount: transactionRow.amount || 0,
            },
          })

          if (!existingTransaction) {
            await prisma.transaction.create({
              data: {
                residentId,
                transactionDate,
                transactionType: transactionRow.transactionType || 'in',
                amount: transactionRow.amount || 0,
                description: transactionRow.description || null,
                payee: transactionRow.payee || null,
                reason: transactionRow.reason || null,
              },
            })
            results.transactionsRestored++
          }
        }
      } catch (error: any) {
        results.errors.push(`行の処理エラー: ${error.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error: any) {
    console.error('Failed to import maintenance data:', error)
    return NextResponse.json(
      { error: 'Failed to import data', details: error.message },
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
    const rows = parseCSV(csvText)
    
    const response = await fetch('/api/maintenance/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    })

    const data = await response.json()

    if (response.ok) {
      alert(`インポートが完了しました。\n終了者: ${data.results.residentsRestored}件\n取引: ${data.results.transactionsRestored}件`)
      if (data.results.errors.length > 0) {
        console.error('インポートエラー:', data.results.errors)
      }
      // 終了者一覧を再取得
      fetchEndedResidents()
    } else {
      alert(`インポートエラー: ${data.error}`)
    }
  } catch (error: any) {
    console.error('Import error:', error)
    alert(`エラー: ${error.message}`)
  }
}
```

---

## 懸念事項への対応

### CSVがtransactionだけだった場合の施設名・ユニット名

**問題**:
- Transactionデータのみの場合、施設名・ユニット名・名前が必須
- これらの情報がないと、どの利用者のTransactionか特定できない

**対応策**:
1. **CSV形式の要件として明記**
   - Transactionデータを含む場合は、施設名・ユニット名・名前が必須
   - エラーメッセージで明確に伝える

2. **既存の利用者とマッチング**
   - 施設名・ユニット名・名前で既存の利用者を検索
   - 見つからない場合はエラーまたは新規作成（設定による）

3. **バリデーション**
   - CSV解析時に必須項目をチェック
   - 不足している場合はエラーを返す

---

## 実装順序

1. **タスク2**: インポートボタンの追加
2. **タスク3**: CSV解析機能の実装
3. **タスク4**: インポートAPIの実装
4. **タスク5**: フロントエンドのインポート処理
5. **タスク1**: CSV出力の拡張（オプション）

---

## 確認事項

1. **CSV出力について**
   - Transactionデータも含める形式に変更しますか？
   - それとも現在の形式（終了者情報のみ）を維持しますか？

2. **Transactionデータのみのインポート**
   - 施設名・ユニット名・名前が必須であることを明確にしますか？
   - 見つからない場合の動作（エラー / 新規作成）はどうしますか？

3. **既存データとの重複**
   - 既存のTransactionと重複する場合、スキップしますか？
   - それともエラーにしますか？

---

## 注意事項

1. **パフォーマンス**
   - Transactionデータが大量になる可能性がある
   - バッチ処理を検討する

2. **データ整合性**
   - 既存データとの整合性を保つ
   - トランザクション処理で安全に実行

3. **エラーハンドリング**
   - 詳細なエラーメッセージを返す
   - 部分的な成功も報告する
