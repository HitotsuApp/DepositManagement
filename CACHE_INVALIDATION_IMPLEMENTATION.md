# キャッシュ無効化の実装

## 実装日: 2026年2月3日

## 目的

データ更新（POST/PUT/DELETE）後に、関連する画面のキャッシュを無効化し、常に最新のデータが表示されるようにする。

## 実装内容

### 1. キャッシュ無効化ユーティリティ関数の作成

**ファイル**: `lib/cache.ts`

以下のユーティリティ関数を実装：

- `invalidateCache(paths: string[])`: 指定されたAPIパスのキャッシュを無効化
- `invalidateTransactionCache(...)`: 取引関連のデータ更新後に呼び出す
- `invalidateMasterCache(facilityId?)`: マスタデータ更新後に呼び出す

**実装の詳細**:
- ブラウザのキャッシュを無効化するために、各パスに対してHEADリクエストを送信
- `Cache-Control: no-store` ヘッダーを使用してキャッシュを無効化
- エラーは無視して続行（キャッシュ無効化は失敗しても続行）

### 2. まとめて入力画面（`app/facilities/[id]/bulk-input/page.tsx`）

**変更内容**:
- 取引作成（POST `/api/transactions`）後に `invalidateTransactionCache()` を呼び出し
- 取引訂正（PATCH `/api/transactions/[id]`）後に `invalidateTransactionCache()` を呼び出し
- `router.refresh()` でNext.jsのサーバーコンポーネントのキャッシュも無効化

**無効化されるキャッシュ**:
- `/api/facilities/[id]` - 施設詳細
- `/api/facilities/[id]/transactions` - まとめて入力画面
- `/api/dashboard` - ダッシュボード

### 3. 利用者詳細画面（`app/residents/[id]/page.tsx`）

**変更内容**:
- 取引作成（POST `/api/transactions`）後に `invalidateTransactionCache()` を呼び出し
- 取引訂正（PATCH `/api/transactions/[id]`）後に `invalidateTransactionCache()` を呼び出し
- `router.refresh()` でNext.jsのサーバーコンポーネントのキャッシュも無効化

**無効化されるキャッシュ**:
- `/api/residents/[id]` - 利用者詳細
- `/api/facilities/[id]` - 施設詳細（利用者が所属する施設）
- `/api/dashboard` - ダッシュボード

### 4. マスタ画面（`app/master/page.tsx`）

**変更内容**:
- 施設の作成・更新（POST/PUT `/api/facilities`）後に `invalidateMasterCache()` を呼び出し
- ユニットの作成・更新（POST/PUT `/api/units`）後に `invalidateMasterCache()` を呼び出し
- 利用者の作成・更新（POST/PUT `/api/residents`）後に `invalidateMasterCache()` を呼び出し
- 利用者の終了（PUT `/api/residents/[id]`）後に `invalidateMasterCache()` を呼び出し
- 施設の順序変更（POST `/api/facilities/reorder`）後に `invalidateMasterCache()` を呼び出し
- `router.refresh()` でNext.jsのサーバーコンポーネントのキャッシュも無効化

**無効化されるキャッシュ**:
- `/api/facilities` - 施設一覧
- `/api/facilities/[id]` - 施設詳細（該当施設）
- `/api/units` - ユニット一覧
- `/api/residents` - 利用者一覧

### 5. インポート画面（`app/import/page.tsx`）

**変更内容**:
- 一括インポート（POST `/api/import`）後に `invalidateMasterCache()` を呼び出し
- `router.refresh()` でNext.jsのサーバーコンポーネントのキャッシュも無効化

**無効化されるキャッシュ**:
- `/api/facilities` - 施設一覧
- `/api/units` - ユニット一覧
- `/api/residents` - 利用者一覧

## 動作の流れ

### 取引作成時の例

1. **まとめて入力画面で取引を作成**
   - POST `/api/transactions` を呼び出し
   - 成功後、`fetchBulkData(true)` で現在の画面のデータを再取得
   - `invalidateTransactionCache(facilityId, undefined, year, month)` で関連画面のキャッシュを無効化
   - `router.refresh()` でNext.jsのサーバーコンポーネントのキャッシュも無効化

2. **施設詳細画面に戻る**
   - ページフォーカス時に `fetchFacilityData(true)` でキャッシュを無効化して再取得
   - 最新のデータが表示される

3. **ダッシュボード画面に移動**
   - ページフォーカス時に `fetchDashboardData(true)` でキャッシュを無効化して再取得
   - 最新のデータが表示される

### マスタデータ更新時の例

1. **マスタ画面で施設を更新**
   - PUT `/api/facilities/[id]` を呼び出し
   - 成功後、`invalidateMasterCache(facilityId)` で関連するマスタデータのキャッシュを無効化
   - `router.refresh()` でNext.jsのサーバーコンポーネントのキャッシュも無効化
   - `fetchFacilities()` で現在の画面のデータを再取得

2. **他の画面で施設一覧を表示**
   - キャッシュが無効化されているため、最新データが取得される

## API側の設定

GETリクエストの `Cache-Control` は現状維持：

- **更新頻度が高いAPI**: `Cache-Control: public, s-maxage=1, stale-while-revalidate=59`
  - `/api/facilities/[id]`
  - `/api/dashboard`
  - `/api/facilities/[id]/transactions`
  - `/api/residents/[id]`

- **マスタ系API**: `Cache-Control: public, s-maxage=5, stale-while-revalidate=55`
  - `/api/facilities`
  - `/api/units`
  - `/api/residents`

フロントエンド側からの `cache: 'no-store'` オプションを使用したリクエストは、この設定を優先してキャッシュを無視します。

## 期待される効果

1. **データの不整合の解消**: データ更新後に、関連するすべての画面で最新データが表示される
2. **ユーザー体験の向上**: 古いデータが表示されることによる混乱を防止
3. **パフォーマンスの維持**: エッジキャッシュは活用しつつ、必要な時のみ無効化

## 注意点

- `router.refresh()` はNext.jsのサーバーコンポーネントの再レンダリングをトリガーしますが、クライアントコンポーネントの状態には影響しません
- キャッシュ無効化は非同期で実行されるため、エラーが発生しても処理は続行されます
- マスタデータの更新は、関連するすべての画面に影響する可能性があるため、広範囲にキャッシュを無効化します

## 変更ファイル一覧

1. `lib/cache.ts` - 新規作成
2. `app/facilities/[id]/bulk-input/page.tsx`
3. `app/residents/[id]/page.tsx`
4. `app/master/page.tsx`
5. `app/import/page.tsx`
