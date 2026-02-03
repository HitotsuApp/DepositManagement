# API集計最適化計画

## 調査日: 2026年2月3日

## 調査結果サマリー

### 1. JavaScriptのループで計算している箇所

#### ① `app/api/dashboard/route.ts` (GET)
**行番号**: 49行目
**現状**:
```typescript
const facilitySummaries = facilities.map(facility => {
  const totalAmount = facility.residents.reduce((sum, resident) => {
    return sum + calculateBalanceUpToMonth(resident.transactions, year, month)
  }, 0)
  return { id: facility.id, name: facility.name, totalAmount }
})
```
**問題**: 各施設ごとに、全利用者の取引を取得してJavaScript側で残高計算
**最適化**: 生SQLを使用してDB側で一括集計

---

#### ② `app/api/facilities/[id]/route.ts` (GET)
**行番号**: 77行目、103行目
**現状**:
```typescript
// 77行目: ユニット別合計
const unitSummaries = facility.units.map(unit => {
  const unitResidents = facility.residents.filter(r => r.unitId === unit.id)
  const totalAmount = unitResidents.reduce((sum, resident) => {
    return sum + calculateBalanceUpToMonth(resident.transactions, year, month)
  }, 0)
  return { id: unit.id, name: unit.name, totalAmount }
})

// 103行目: 施設合計
const totalAmount = facility.residents.reduce((sum, resident) => {
  return sum + calculateBalanceUpToMonth(resident.transactions, year, month)
}, 0)
```
**問題**: ユニット別合計と施設合計をJavaScript側で計算
**最適化**: 生SQLを使用してDB側で一括集計

---

#### ③ `app/api/print/cash-verification/route.ts` (GET)
**行番号**: 68行目
**現状**:
```typescript
const facilityBalance = facilityDetail.residents.reduce((sum, resident) => {
  return sum + calculateBalanceUpToMonth(resident.transactions, Number(year), Number(month))
}, 0)
```
**問題**: 施設の預り金合計をJavaScript側で計算
**最適化**: 生SQLを使用してDB側で集計

---

### 2. キャッシュヘッダーの統一

#### 統一が必要なAPI
- `app/api/facilities/[id]/transactions/route.ts`: `s-maxage=2` → `s-maxage=5` に変更
- `app/api/units/route.ts`: `s-maxage=2` → `s-maxage=5` に変更
- `app/api/residents/route.ts`: `s-maxage=2` → `s-maxage=5` に変更

#### キャッシュヘッダーがないAPI
- `app/api/facilities/route.ts` (GET): 追加が必要

#### PDF生成用API（動的のためキャッシュ不要）
- `app/api/print/batch-print/route.ts`: `dynamic = 'force-dynamic'` のためキャッシュ不要
- `app/api/print/deposit-statement/route.ts`: `dynamic = 'force-dynamic'` のためキャッシュ不要
- `app/api/print/resident-statement/route.ts`: `dynamic = 'force-dynamic'` のためキャッシュ不要
- `app/api/print/cash-verification/route.ts`: `dynamic = 'force-dynamic'` のためキャッシュ不要

---

## 実装計画

### ステップ1: `app/api/dashboard/route.ts` の最適化

**変更内容**:
- 施設ごとの残高計算をDB側で一括集計
- 生SQLを使用して、全施設の残高を1回のクエリで取得

**実装コード**:
```typescript
// 全施設の残高をDB側で一括集計
const targetDate = new Date(year, month, 0, 23, 59, 59, 999)
const facilityBalancesRaw = await prisma.$queryRaw<Array<{
  facilityId: number
  balance: number | string
}>>`
  SELECT 
    r."facilityId",
    COALESCE(SUM(
      CASE 
        WHEN t."transactionType" IN ('in', 'past_correct_in') THEN t.amount
        WHEN t."transactionType" IN ('out', 'past_correct_out') THEN -t.amount
        ELSE 0
      END
    ), 0) as balance
  FROM "Resident" r
  LEFT JOIN "Transaction" t ON t."residentId" = r.id
  WHERE r."isActive" = true
    AND r."endDate" IS NULL
    AND (t."transactionDate" IS NULL OR t."transactionDate" <= ${targetDate})
    AND (t."transactionType" IS NULL OR t."transactionType" NOT IN ('correct_in', 'correct_out'))
    ${facilityId ? Prisma.sql`AND r."facilityId" = ${facilityId}` : Prisma.empty}
  GROUP BY r."facilityId"
`

const facilityBalancesMap = new Map<number, number>()
facilityBalancesRaw.forEach(row => {
  facilityBalancesMap.set(row.facilityId, Number(row.balance))
})

const facilitySummaries = facilities.map(facility => ({
  id: facility.id,
  name: facility.name,
  totalAmount: facilityBalancesMap.get(facility.id) || 0,
}))
```

---

### ステップ2: `app/api/facilities/[id]/route.ts` の最適化

**変更内容**:
- ユニット別合計と施設合計をDB側で一括集計
- 生SQLを使用して、ユニット別・施設別の残高を1回のクエリで取得

**実装コード**:
```typescript
const targetDate = new Date(year, month, 0, 23, 59, 59, 999)

// ユニット別・施設別の残高をDB側で一括集計
const balancesRaw = await prisma.$queryRaw<Array<{
  unitId: number | null
  facilityId: number
  balance: number | string
}>>`
  SELECT 
    r."unitId",
    r."facilityId",
    COALESCE(SUM(
      CASE 
        WHEN t."transactionType" IN ('in', 'past_correct_in') THEN t.amount
        WHEN t."transactionType" IN ('out', 'past_correct_out') THEN -t.amount
        ELSE 0
      END
    ), 0) as balance
  FROM "Resident" r
  LEFT JOIN "Transaction" t ON t."residentId" = r.id
  WHERE r."facilityId" = ${facilityId}
    AND r."isActive" = true
    AND r."endDate" IS NULL
    AND (t."transactionDate" IS NULL OR t."transactionDate" <= ${targetDate})
    AND (t."transactionType" IS NULL OR t."transactionType" NOT IN ('correct_in', 'correct_out'))
  GROUP BY r."unitId", r."facilityId"
`

// ユニット別合計を計算
const unitBalancesMap = new Map<number, number>()
let facilityTotal = 0
balancesRaw.forEach(row => {
  const balance = Number(row.balance)
  facilityTotal += balance
  if (row.unitId) {
    unitBalancesMap.set(row.unitId, (unitBalancesMap.get(row.unitId) || 0) + balance)
  }
})

const unitSummaries = facility.units.map(unit => ({
  id: unit.id,
  name: unit.name,
  totalAmount: unitBalancesMap.get(unit.id) || 0,
}))
```

---

### ステップ3: `app/api/print/cash-verification/route.ts` の最適化

**変更内容**:
- 施設の預り金合計をDB側で集計
- `include` で全取引を取得するのをやめ、集計クエリのみを使用

**実装コード**:
```typescript
const targetDate = new Date(Number(year), Number(month), 0, 23, 59, 59, 999)

// 施設の預り金合計をDB側で集計
const facilityBalanceRaw = await prisma.$queryRaw<Array<{
  balance: number | string
}>>`
  SELECT 
    COALESCE(SUM(
      CASE 
        WHEN t."transactionType" IN ('in', 'past_correct_in') THEN t.amount
        WHEN t."transactionType" IN ('out', 'past_correct_out') THEN -t.amount
        ELSE 0
      END
    ), 0) as balance
  FROM "Resident" r
  LEFT JOIN "Transaction" t ON t."residentId" = r.id
  WHERE r."facilityId" = ${Number(facilityId)}
    AND r."isActive" = true
    AND r."endDate" IS NULL
    AND (t."transactionDate" IS NULL OR t."transactionDate" <= ${targetDate})
    AND (t."transactionType" IS NULL OR t."transactionType" NOT IN ('correct_in', 'correct_out'))
`

const facilityBalance = Number(facilityBalanceRaw[0]?.balance || 0)
```

---

### ステップ4: キャッシュヘッダーの統一

**変更内容**:
- すべてのGET APIに `Cache-Control: public, s-maxage=5, stale-while-revalidate=55` を設定
- PDF生成用APIは `dynamic = 'force-dynamic'` のためキャッシュ不要

**対象ファイル**:
1. `app/api/facilities/route.ts` (GET) - 追加
2. `app/api/facilities/[id]/transactions/route.ts` (GET) - 変更（`s-maxage=2` → `s-maxage=5`）
3. `app/api/units/route.ts` (GET) - 変更（`s-maxage=2` → `s-maxage=5`）
4. `app/api/residents/route.ts` (GET) - 変更（`s-maxage=2` → `s-maxage=5`）

---

## 実装順序

1. **ステップ1**: `app/api/dashboard/route.ts` の最適化
2. **ステップ2**: `app/api/facilities/[id]/route.ts` の最適化
3. **ステップ3**: `app/api/print/cash-verification/route.ts` の最適化
4. **ステップ4**: キャッシュヘッダーの統一

---

## 期待される効果

### データ転送量
- **現状**: 数千件の取引データを転送
- **改善後**: 集計結果のみ（数件〜数十件）
- **削減率**: 90〜99%削減

### 処理時間
- **現状**: 数秒（数千件のデータをJavaScript側で処理）
- **改善後**: ミリ秒単位（DB側で集計）
- **短縮率**: 90〜99%短縮

---

## 注意点

1. **生SQLの型安全性**: 型定義を明示的に記述
2. **エラーハンドリング**: try-catchでエラー処理
3. **PostgreSQLのnumeric型**: `Number()` で変換が必要
4. **Prisma.sqlの使用**: 条件付きSQLには `Prisma.sql` を使用
