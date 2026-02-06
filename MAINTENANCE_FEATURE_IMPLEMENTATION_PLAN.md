# メンテナンス機能実装計画

## 概要
利用者のデータをアーカイブおよび削除するメンテナンス機能を実装します。
法人ダッシュボードを開いたときのみ、サイドバーの項目の一番下に「メンテナンス」を追加します。

## 要件整理

### 1. サイドバーへの追加
- **表示条件**: 法人ダッシュボードを開いたときのみ（`selectedFacilityId === null`）
- **位置**: サイドバーの項目の一番下
- **リンク先**: `/maintenance`
- **パスワード保護**: メンテナンス画面に入る前にパスワード入力（パスワード: `DD`）

### 2. メンテナンス画面
- **リスト**: 終了者一覧（名前 + 終了日）
- **ボタン**: 
  - アーカイブ(CSV)
  - 削除

### 3. アーカイブ機能
- **動作**: ボタンを押すと、保存のエクスプローラ（ファイル保存ダイアログ）が表示される
- **命名規約**: システム時間の年月日および時間 + CSVにする人数
  - 例: `20260206_143000_5.csv`
  - 形式: `YYYYMMDD_HHMMSS_N.csv`（Nは人数）

### 4. 削除機能
- **対象**: 終了者一覧のデータを削除
- **注意**: 返金処理済みなので、Transactionデータも削除する必要がある
- **確認**: 削除ボタンを押した時には、確認モーダルを表示
  - 確認文言: 「終了者のデータを削除します。アーカイブ（保存処理）は完了していますか？削除するには「DELETE」と入力してください。」
  - 入力欄: 「DELETE」と入力させる

## 技術仕様

### データ構造
- **終了者の定義**: `Resident`テーブルの`endDate`が設定されている利用者
- **削除対象**: 
  - `Transaction`テーブル（外部キー制約があるため先に削除）
  - `Resident`テーブル

### パスワード保護
- クライアントサイドでパスワードチェック（簡易的な保護）
- パスワード: `DD`
- セッションストレージまたはローカルストレージで認証状態を保持

## 実装タスク

### タスク1: サイドバーにメンテナンス項目を追加
**ファイル**: `components/Sidebar.tsx`

**変更内容**:
- `selectedFacilityId === null` の条件で、サイドバー最下部に「メンテナンス」リンクを追加
- リンク先: `/maintenance`
- スタイル: 既存のメニュー項目と同じスタイル

**実装コード**:
```typescript
{/* メンテナンス: 法人全体表示時のみ表示 */}
{selectedFacilityId === null && (
  <div className="pt-4 border-t border-gray-700">
    <Link
      href="/maintenance"
      className={`block px-4 py-2 rounded hover:bg-gray-700 ${
        isActive('/maintenance') ? 'bg-gray-700' : ''
      }`}
    >
      メンテナンス
    </Link>
  </div>
)}
```

---

### タスク2: パスワード保護コンポーネントの作成
**ファイル**: `app/maintenance/page.tsx`（新規作成）

**機能**:
- パスワード入力画面を表示
- パスワードが正しい場合のみ、メンテナンス画面を表示
- パスワード: `DD`
- 認証状態をセッションストレージに保存

**実装コード（パスワード保護部分）**:
```typescript
const [isAuthenticated, setIsAuthenticated] = useState(false)
const [password, setPassword] = useState('')

useEffect(() => {
  // セッションストレージから認証状態を確認
  const authStatus = sessionStorage.getItem('maintenance_auth')
  if (authStatus === 'authenticated') {
    setIsAuthenticated(true)
  }
}, [])

const handlePasswordSubmit = (e: React.FormEvent) => {
  e.preventDefault()
  if (password === 'DD') {
    setIsAuthenticated(true)
    sessionStorage.setItem('maintenance_auth', 'authenticated')
  } else {
    alert('パスワードが正しくありません')
    setPassword('')
  }
}

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
```

---

### タスク3: 終了者取得APIの作成
**ファイル**: `app/api/maintenance/residents/route.ts`（新規作成）

**機能**:
- `endDate`が設定されている`Resident`を取得
- 施設名・ユニット名も含めて返却
- 終了日順でソート

**実装コード**:
```typescript
export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const prisma = getPrisma()
  try {
    const residents = await prisma.resident.findMany({
      where: {
        endDate: {
          not: null,
        },
      },
      select: {
        id: true,
        name: true,
        facilityId: true,
        unitId: true,
        endDate: true,
        facility: {
          select: {
            id: true,
            name: true,
          },
        },
        unit: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        endDate: 'desc',
      },
    })

    return NextResponse.json(residents)
  } catch (error) {
    console.error('Failed to fetch ended residents:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ended residents' },
      { status: 500 }
    )
  }
}
```

---

### タスク4: メンテナンス画面のメイン実装
**ファイル**: `app/maintenance/page.tsx`（パスワード保護部分の後に追加）

**機能**:
- 終了者一覧を表示（名前 + 終了日）
- アーカイブボタン
- 削除ボタン
- 削除確認モーダル

**実装コード（メイン部分）**:
```typescript
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

const [residents, setResidents] = useState<EndedResident[]>([])
const [isLoading, setIsLoading] = useState(true)
const [showDeleteModal, setShowDeleteModal] = useState(false)
const [deleteConfirmText, setDeleteConfirmText] = useState('')

useEffect(() => {
  fetchEndedResidents()
}, [])

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

const handleArchive = () => {
  // CSV生成とダウンロード
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
  const headers = ['名前', '終了日', '施設名', 'ユニット名']
  
  // CSVデータ
  const csvRows = [
    headers.join(','),
    ...residents.map(r => [
      r.name,
      r.endDate ? new Date(r.endDate).toLocaleDateString('ja-JP') : '',
      r.facility?.name || '',
      r.unit?.name || '',
    ].join(','))
  ]
  
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
    if (!res.ok) throw new Error('Failed to delete residents')
    
    alert('終了者のデータを削除しました')
    setShowDeleteModal(false)
    setDeleteConfirmText('')
    fetchEndedResidents()
  } catch (error) {
    console.error('Failed to delete residents:', error)
    alert('削除に失敗しました')
  }
}

// レンダリング部分
return (
  <MainLayout>
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">メンテナンス</h1>
      
      <div className="mb-4 flex gap-4">
        <button
          onClick={handleArchive}
          disabled={residents.length === 0}
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          アーカイブ(CSV)
        </button>
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
                <th className="px-4 py-3 text-left">名前</th>
                <th className="px-4 py-3 text-left">終了日</th>
              </tr>
            </thead>
            <tbody>
              {residents.map(resident => (
                <tr key={resident.id} className="border-t">
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
```

---

### タスク5: 削除APIの実装
**ファイル**: `app/api/maintenance/residents/route.ts`（GETメソッドに追加）

**機能**:
- 終了者の`Transaction`を削除
- 終了者の`Resident`を削除
- トランザクション処理で安全に削除

**実装コード**:
```typescript
export async function DELETE(request: Request) {
  const prisma = getPrisma()
  try {
    // 終了者を取得
    const endedResidents = await prisma.resident.findMany({
      where: {
        endDate: {
          not: null,
        },
      },
      select: {
        id: true,
      },
    })

    const residentIds = endedResidents.map(r => r.id)

    if (residentIds.length === 0) {
      return NextResponse.json({ message: '削除対象の終了者がいません' })
    }

    // トランザクション処理で削除
    await prisma.$transaction(async (tx) => {
      // 1. 先にTransactionを削除（外部キー制約のため）
      await tx.transaction.deleteMany({
        where: {
          residentId: {
            in: residentIds,
          },
        },
      })

      // 2. Residentを削除
      await tx.resident.deleteMany({
        where: {
          id: {
            in: residentIds,
          },
        },
      })
    })

    return NextResponse.json({
      message: `${residentIds.length}件の終了者データを削除しました`,
      deletedCount: residentIds.length,
    })
  } catch (error) {
    console.error('Failed to delete ended residents:', error)
    return NextResponse.json(
      { error: 'Failed to delete ended residents' },
      { status: 500 }
    )
  }
}
```

---

### タスク6: アクセス制限の追加
**ファイル**: `app/maintenance/page.tsx`

**機能**:
- 法人ダッシュボードを開いていない場合（`selectedFacilityId !== null`）は、アクセスを拒否
- リダイレクトまたはエラーメッセージを表示

**実装コード**:
```typescript
const { selectedFacilityId } = useFacility()

useEffect(() => {
  // 法人ダッシュボードを開いていない場合はアクセス拒否
  if (selectedFacilityId !== null) {
    router.push('/')
  }
}, [selectedFacilityId, router])
```

---

## 実装順序

1. **タスク1**: サイドバーにメンテナンス項目を追加
2. **タスク3**: 終了者取得APIの作成
3. **タスク2**: パスワード保護コンポーネントの作成
4. **タスク4**: メンテナンス画面のメイン実装
5. **タスク5**: 削除APIの実装
6. **タスク6**: アクセス制限の追加

## 注意事項

1. **パスワード保護**: 現在の実装はクライアントサイドのみの保護です。本番環境では、サーバーサイドでの認証も検討してください。

2. **削除処理**: 
   - `Transaction`と`Resident`の削除はトランザクション処理で行う
   - 外部キー制約のため、`Transaction`を先に削除する必要がある

3. **CSVエクスポート**:
   - BOM（Byte Order Mark）を追加してExcelでの文字化けを防ぐ
   - ファイル名はシステム時間と人数を含む

4. **エラーハンドリング**:
   - API呼び出し時のエラー処理を適切に実装
   - ユーザーに分かりやすいエラーメッセージを表示

5. **キャッシュ無効化**:
   - 削除後は、関連するキャッシュを無効化する必要がある可能性がある
   - 必要に応じて`invalidateMasterCache`などを呼び出す

## テスト項目

1. サイドバーにメンテナンス項目が表示されるか（法人ダッシュボード時のみ）
2. パスワード認証が正しく動作するか
3. 終了者一覧が正しく表示されるか
4. CSVアーカイブが正しく動作するか（ファイル名、内容）
5. 削除確認モーダルが正しく表示されるか
6. 削除処理が正しく動作するか（Transactionも削除されるか）
7. アクセス制限が正しく動作するか（法人ダッシュボード以外からアクセスできないか）
