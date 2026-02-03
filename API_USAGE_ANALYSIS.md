# API使用状況と期間絞り込みの可否分析

## 調査日: 2026年2月3日

## 各APIの使用状況と期間絞り込みの可否

---

### ① `app/api/facilities/[id]/route.ts` (GET)

**使用箇所**:
- `app/facilities/[id]/page.tsx` の56行目
- 施設詳細画面で使用
- `year` と `month` パラメータを必ず指定

**使用内容**:
- `facilityName`: 施設名を表示
- `totalAmount`: 施設合計残高（指定年月までの累積残高）
- `units`: ユニット別合計（各ユニットの指定年月までの累積残高）
- `residents`: 利用者別残高（各利用者の指定年月までの累積残高）

**残高計算ロジック**:
```typescript
calculateBalanceUpToMonth(resident.transactions, year, month)
```

**`calculateBalanceUpToMonth` の動作**:
- 関数内で `targetDate = new Date(year, month, 0, 23, 59, 59, 999)` を計算
- 82行目で `if (transactionDate <= targetDate)` という条件でフィルタリング
- **つまり、指定年月までの取引のみを処理している**

**結論**: ✅ **期間絞り込み可能**
- DBから取得する取引は、指定年月の最終日（`targetDate`）までの取引のみで十分
- 全取引を取得する必要はない
- `where: { transactionDate: { lte: targetDate } }` で絞り込み可能

---

### ② `app/api/dashboard/route.ts` (GET)

**使用箇所**:
- `app/page.tsx` の54-55行目
- ダッシュボード画面で使用
- `year` と `month` パラメータを必ず指定

**使用内容**:
- `totalAmount`: 全施設の合計残高（指定年月までの累積残高）
- `facilities`: 施設別合計（各施設の指定年月までの累積残高）

**残高計算ロジック**:
```typescript
calculateBalanceUpToMonth(resident.transactions, year, month)
```

**結論**: ✅ **期間絞り込み可能**
- ①と同様に、指定年月の最終日までの取引のみで十分
- `where: { transactionDate: { lte: targetDate } }` で絞り込み可能

---

### ③ `app/api/residents/[id]/route.ts` (GET)

**使用箇所**:
- `app/residents/[id]/page.tsx` の118行目
- 利用者詳細画面で使用
- `year` と `month` パラメータを必ず指定

**使用内容**:
- `residentName`: 利用者名を表示
- `facilityId`: 施設IDを表示
- `balance`: 指定年月までの累積残高
- `transactions`: **当月の取引一覧（各取引に累積残高を含む）**

**重要なポイント**:
```typescript
// 53-54行目: 指定年月までの累積残高を計算
const balance = calculateBalanceUpToMonth(resident.transactions, year, month)

// 56-63行目: 全取引から累積残高を計算し、当月の取引のみをフィルタリング
const allTransactionsWithBalance = calculateBalance(resident.transactions)
const transactionsWithBalance = allTransactionsWithBalance.filter(t => {
  const transactionDate = new Date(t.transactionDate)
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59, 999)
  return transactionDate >= startDate && transactionDate <= endDate
})
```

**`calculateBalance` の動作**:
- 全取引を受け取り、**最初から順番に累積残高を計算**
- 各取引に `balance` フィールドを追加
- **累積計算のため、過去の取引も必要**

**問題点**:
- `calculateBalance` は累積残高を計算するため、**過去の取引も必要**
- しかし、画面表示では当月の取引のみを表示
- つまり、**残高計算には過去の取引が必要だが、画面表示には当月の取引のみが必要**

**結論**: ⚠️ **部分的な期間絞り込み可能**
- **残高計算用**: 指定年月の最終日までの取引が必要（`calculateBalanceUpToMonth` 用）
- **画面表示用**: 当月の取引のみが必要（`calculateBalance` + フィルタリング用）

**最適化案**:
1. **案1**: 指定年月の最終日までの取引を取得し、JavaScriptで当月の取引のみをフィルタリング
   - メリット: 実装が簡単
   - デメリット: 当月の取引のみを表示する場合、過去の取引も取得する必要がある

2. **案2**: 2回のクエリに分ける
   - 残高計算用: 指定年月の最終日までの取引（最小限のフィールド）
   - 画面表示用: 当月の取引のみ（全フィールド）
   - メリット: データ転送量を最小化
   - デメリット: 2回のクエリが必要

3. **案3**: 指定年月の最終日までの取引を取得し、JavaScriptで処理
   - 残高計算: `calculateBalanceUpToMonth` で指定年月までの累積残高を計算
   - 画面表示: `calculateBalance` で全取引から累積残高を計算し、当月の取引のみをフィルタリング
   - メリット: 1回のクエリで済む
   - デメリット: 過去の取引も取得する必要がある（ただし、指定年月までなので問題ない）

**推奨**: **案3**（指定年月の最終日までの取引を取得）
- `calculateBalance` は累積残高を計算するため、過去の取引が必要
- ただし、指定年月の最終日までの取引があれば、当月の取引の累積残高も正しく計算できる
- 全取引を取得する必要はない

---

## まとめ

| API | 使用箇所 | 期間絞り込み可否 | 備考 |
|-----|---------|----------------|------|
| ① `app/api/facilities/[id]/route.ts` | 施設詳細画面 | ✅ **可能** | 指定年月の最終日までの取引のみで十分 |
| ② `app/api/dashboard/route.ts` | ダッシュボード画面 | ✅ **可能** | 指定年月の最終日までの取引のみで十分 |
| ③ `app/api/residents/[id]/route.ts` | 利用者詳細画面 | ⚠️ **部分的に可能** | 指定年月の最終日までの取引が必要（累積残高計算のため） |

---

## 実装時の注意点

### ①と②について
- `calculateBalanceUpToMonth` は指定年月の最終日までの取引のみを処理するため、期間絞り込みで問題ない
- `where: { transactionDate: { lte: new Date(year, month, 0, 23, 59, 59, 999) } }` で絞り込み可能

### ③について
- `calculateBalance` は累積残高を計算するため、過去の取引も必要
- ただし、指定年月の最終日までの取引があれば、当月の取引の累積残高も正しく計算できる
- 全取引を取得する必要はない
- `where: { transactionDate: { lte: new Date(year, month, 0, 23, 59, 59, 999) } }` で絞り込み可能

---

## 結論

**①②③すべて期間絞り込み可能**

- ①と②: 指定年月の最終日までの取引のみで十分
- ③: 指定年月の最終日までの取引が必要（累積残高計算のため）

**ただし、③は全取引を取得する必要はない**。指定年月の最終日までの取引があれば、当月の取引の累積残高も正しく計算できる。
