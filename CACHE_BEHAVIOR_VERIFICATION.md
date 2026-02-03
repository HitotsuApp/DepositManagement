# キャッシュ動作の確認

## 確認日: 2026年2月3日

## ルール

1. **APIでテーブルに書き込み（POST/PUT/DELETE/PATCH）する時**: 他の画面を含めてキャッシュを消す
2. **テーブルを見に行くだけの処理（GET）**: キャッシュを残す

## 実装状況の確認

### ✅ 書き込み処理（POST/PUT/DELETE/PATCH）後のキャッシュ無効化

#### 1. まとめて入力画面 (`app/facilities/[id]/bulk-input/page.tsx`)

**取引作成（POST `/api/transactions`）**:
```typescript
// 305行目: キャッシュ無効化を実行
await invalidateTransactionCache(facilityId, undefined, year, month)
```
- ✅ **実装済み**: 関連する画面（施設詳細、ダッシュボード）のキャッシュを無効化

**取引訂正（PATCH `/api/transactions/[id]`）**:
```typescript
// 371行目: キャッシュ無効化を実行
await invalidateTransactionCache(facilityId, undefined, year, month)
```
- ✅ **実装済み**: 関連する画面のキャッシュを無効化

#### 2. 利用者詳細画面 (`app/residents/[id]/page.tsx`)

**取引作成（POST `/api/transactions`）**:
```typescript
// 290行目: キャッシュ無効化を実行
await invalidateTransactionCache(residentFacilityId || undefined, residentId, year, month)
```
- ✅ **実装済み**: 関連する画面（施設詳細、ダッシュボード、利用者詳細）のキャッシュを無効化

**取引訂正（PATCH `/api/transactions/[id]`）**:
```typescript
// 356行目: キャッシュ無効化を実行
await invalidateTransactionCache(residentFacilityId || undefined, residentId, year, month)
```
- ✅ **実装済み**: 関連する画面のキャッシュを無効化

#### 3. マスタ画面 (`app/master/page.tsx`)

**施設の作成・更新（POST/PUT `/api/facilities`）**:
```typescript
// 250行目: キャッシュ無効化を実行
await invalidateMasterCache(editingFacility?.id || undefined)
```
- ✅ **実装済み**: マスタデータ（施設一覧、ユニット一覧、利用者一覧）のキャッシュを無効化

**施設の順序変更（POST `/api/facilities/reorder`）**:
```typescript
// 278行目: キャッシュ無効化を実行
await invalidateMasterCache(facilityId)
```
- ✅ **実装済み**: マスタデータのキャッシュを無効化

**ユニットの作成・更新（POST/PUT `/api/units`）**:
```typescript
// 344行目: キャッシュ無効化を実行
await invalidateMasterCache(unitForm.facilityId)
```
- ✅ **実装済み**: マスタデータのキャッシュを無効化

**利用者の作成・更新（POST/PUT `/api/residents`）**:
```typescript
// 437行目: キャッシュ無効化を実行
await invalidateMasterCache(residentForm.facilityId)
```
- ✅ **実装済み**: マスタデータのキャッシュを無効化

**利用者の終了（PUT `/api/residents/[id]`）**:
```typescript
// 474行目: キャッシュ無効化を実行
await invalidateMasterCache(endedResident?.facilityId)
```
- ✅ **実装済み**: マスタデータのキャッシュを無効化

#### 4. インポート画面 (`app/import/page.tsx`)

**一括インポート（POST `/api/import`）**:
```typescript
// 125行目: キャッシュ無効化を実行
await invalidateMasterCache()
```
- ✅ **実装済み**: すべてのマスタデータのキャッシュを無効化

---

### ✅ 読み取り処理（GET）でのキャッシュ

#### 1. 施設詳細画面 (`app/facilities/[id]/page.tsx`)

**通常のデータ取得**:
```typescript
// 80行目: 通常のfetch（キャッシュ有効）
const response = await fetch(
  `/api/facilities/${facilityId}?year=${year}&month=${month}${unitParam}`,
  fetchOptions  // skipCache=falseの場合は空オブジェクト
)
```
- ✅ **キャッシュ有効**: 通常のGETリクエストではキャッシュを使用

**ページフォーカス時の再取得**:
```typescript
// 62行目: ページフォーカス時のみキャッシュを無効化
fetchFacilityData(true)  // skipCache=true
```
- ✅ **例外**: ページフォーカス時のみキャッシュを無効化（ユーザーが戻ってきた時に最新データを表示）

#### 2. まとめて入力画面 (`app/facilities/[id]/bulk-input/page.tsx`)

**通常のデータ取得**:
```typescript
// 119行目: 通常のfetch（キャッシュ有効）
const fetchOptions: RequestInit = skipCache ? { cache: 'no-store' } : {}
```
- ✅ **キャッシュ有効**: `skipCache=false`の場合はキャッシュを使用

**データ更新後の再取得**:
```typescript
// 308行目: データ更新後はキャッシュを無効化
await fetchBulkData(true)  // skipCache=true
```
- ✅ **例外**: データ更新後の再取得時のみキャッシュを無効化

#### 3. ダッシュボード画面 (`app/page.tsx`)

**通常のデータ取得**:
```typescript
// 57行目: 通常のfetch（キャッシュ有効）
const fetchOptions: RequestInit = skipCache ? { cache: 'no-store' } : {}
const response = await fetch(url, fetchOptions)
```
- ✅ **キャッシュ有効**: 通常のGETリクエストではキャッシュを使用

**ページフォーカス時の再取得**:
```typescript
// ページフォーカス時のみキャッシュを無効化
fetchDashboardData(true)  // skipCache=true
```
- ✅ **例外**: ページフォーカス時のみキャッシュを無効化

#### 4. 利用者詳細画面 (`app/residents/[id]/page.tsx`)

**通常のデータ取得**:
```typescript
// 118行目: 通常のfetch（キャッシュ有効）
const fetchOptions: RequestInit = skipCache ? { cache: 'no-store' } : {}
```
- ✅ **キャッシュ有効**: 通常のGETリクエストではキャッシュを使用

**データ更新後の再取得**:
```typescript
// データ更新後はキャッシュを無効化
await fetchResidentData(true)  // skipCache=true
```
- ✅ **例外**: データ更新後の再取得時のみキャッシュを無効化

---

## 結論

### ✅ ルール1: APIでテーブルに書き込みに行く時は他の画面を含めキャッシュを消す

**実装状況**: ✅ **完全に実装済み**

すべての書き込み処理（POST/PUT/DELETE/PATCH）の後に、適切なキャッシュ無効化関数を呼び出しています：
- 取引関連: `invalidateTransactionCache()` - 施設詳細、ダッシュボード、利用者詳細のキャッシュを無効化
- マスタ関連: `invalidateMasterCache()` - 施設一覧、ユニット一覧、利用者一覧のキャッシュを無効化

### ✅ ルール2: テーブルを見に行くだけの処理はキャッシュを残す

**実装状況**: ✅ **完全に実装済み**

すべての読み取り処理（GET）では、通常はキャッシュを使用しています。例外として、以下の場合のみキャッシュを無効化します：
- ページフォーカス時（ユーザーが戻ってきた時に最新データを表示）
- データ更新後の再取得時（書き込み処理の一部として）

---

## まとめ

**現在の実装は、ユーザーの認識通りに動作しています。**

- ✅ 書き込み処理（POST/PUT/DELETE/PATCH）: 他の画面を含めてキャッシュを無効化
- ✅ 読み取り処理（GET）: キャッシュを残す（ページフォーカス時やデータ更新後の再取得時のみ例外）
