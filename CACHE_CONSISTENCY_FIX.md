# キャッシュ不整合の修正

## 修正日: 2026年2月3日

## 問題

APIにキャッシュを導入した結果、施設詳細画面→まとめて入力（または利用者明細）でデータを更新して施設詳細画面に戻った時に古いデータが表示される「キャッシュの不整合」が発生していました。

## 修正内容

### 1. API側の調整（Cache-Controlの変更）

更新頻度が高く、常に最新であるべきAPI（残高計算や入出金関連）について、`s-maxage`（エッジキャッシュ）を短くし、ブラウザ側での強固なキャッシュを避ける設定に変更しました。

**変更前**: `Cache-Control: public, s-maxage=5, stale-while-revalidate=55`
**変更後**: `Cache-Control: public, s-maxage=1, stale-while-revalidate=59`

**対象API**:
- `/api/facilities/[id]` - 施設詳細（残高計算含む）
- `/api/dashboard` - ダッシュボード
- `/api/facilities/[id]/transactions` - まとめて入力画面
- `/api/residents/[id]` - 利用者詳細

**マスタ系API（変更なし）**:
- `/api/facilities` - 施設一覧（更新頻度が低いため現状維持）
- `/api/units` - ユニット一覧（更新頻度が低いため現状維持）
- `/api/residents` - 利用者一覧（更新頻度が低いため現状維持）
- `/api/units/[id]` - ユニット詳細（更新頻度が低いため現状維持）

### 2. フロントエンド側の調整

#### 2.1 施設詳細画面（`app/facilities/[id]/page.tsx`）

- **ページフォーカス時の再取得**: ページがフォーカスされた時（戻るボタンで戻ってきた時など）に、キャッシュを無効化して最新データを取得する処理を追加
- **`fetchFacilityData`関数の拡張**: `skipCache`パラメータを追加し、`cache: 'no-store'`オプションでキャッシュを無効化できるように変更
- **URLパラメータのクリーンアップ**: タイムスタンプパラメータ（`_t`）を自動的に削除してURLをクリーンに保つ

**実装コード**:
```typescript
// ページがフォーカスされた時に最新データを取得
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      fetchFacilityData(true) // キャッシュを無効化して再取得
    }
  }

  const handleFocus = () => {
    fetchFacilityData(true) // キャッシュを無効化して再取得
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('focus', handleFocus)

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('focus', handleFocus)
  }
}, [facilityId, year, month, selectedUnitId])
```

#### 2.2 ダッシュボード画面（`app/page.tsx`）

- **ページフォーカス時の再取得**: 施設詳細画面と同様に、ページフォーカス時にキャッシュを無効化して最新データを取得する処理を追加
- **`fetchDashboardData`関数の拡張**: `skipCache`パラメータを追加

#### 2.3 まとめて入力画面（`app/facilities/[id]/bulk-input/page.tsx`）

- **戻るボタンの改善**: 施設詳細画面に戻る際に、タイムスタンプパラメータ（`_t`）を追加してキャッシュを無効化

**実装コード**:
```typescript
<button
  onClick={() => {
    // キャッシュを無効化するためにタイムスタンプを追加
    const timestamp = Date.now()
    router.push(`/facilities/${facilityId}?year=${year}&month=${month}&_t=${timestamp}`)
  }}
>
  ← 戻る
</button>
```

### 3. 動作の流れ

1. **まとめて入力画面で取引を登録**
   - データを再取得（`skipCache=true`）
   - 「登録しました」メッセージを表示

2. **「戻る」ボタンをクリック**
   - URLにタイムスタンプパラメータ（`_t`）を追加
   - 施設詳細画面に遷移

3. **施設詳細画面でデータ取得**
   - URLパラメータの`_t`を検出して削除（URLをクリーンに保つ）
   - ページフォーカスイベントでキャッシュを無効化して再取得
   - 最新のデータが表示される

4. **ページフォーカス時の自動更新**
   - ブラウザのタブを切り替えて戻ってきた時
   - ウィンドウがフォーカスされた時
   - 上記のタイミングで自動的に最新データを取得

## 期待される効果

1. **キャッシュの不整合の解消**: データ更新後に画面を戻っても、常に最新のデータが表示される
2. **パフォーマンスの維持**: エッジキャッシュは1秒だけ保持し、常に裏で最新を取りに行くため、パフォーマンスへの影響は最小限
3. **ユーザー体験の向上**: 古いデータが表示されることによる混乱を防止

## 注意点

- マスタ系API（施設一覧、ユニット一覧、利用者一覧）は更新頻度が低いため、現状のキャッシュ設定（`s-maxage=5`）を維持
- タイムスタンプパラメータ（`_t`）は自動的に削除されるため、URLが汚れることはない
- ページフォーカス時の再取得は、パフォーマンスへの影響を最小限に抑えるため、必要な時のみ実行される

## 変更ファイル一覧

### API側
1. `app/api/facilities/[id]/route.ts`
2. `app/api/dashboard/route.ts`
3. `app/api/facilities/[id]/transactions/route.ts`
4. `app/api/residents/[id]/route.ts`

### フロントエンド側
1. `app/facilities/[id]/page.tsx`
2. `app/page.tsx`
3. `app/facilities/[id]/bulk-input/page.tsx`
