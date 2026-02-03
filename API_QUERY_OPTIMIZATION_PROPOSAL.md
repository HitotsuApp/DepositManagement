# APIクエリ最適化提案

## 調査日: 2026年2月3日

## 概要
`select` への書き換え以外に、`where` での期間絞り込みやDB側での集計（`_sum`等）を使ってさらに軽くできる箇所を調査しました。

## 最適化項目一覧

### 優先度：高（すぐに実施推奨）
- **①** `app/api/facilities/[id]/route.ts` (GET) - 期間絞り込みの最適化
- **②** `app/api/dashboard/route.ts` (GET) - 期間絞り込みの最適化
- **③** `app/api/residents/[id]/route.ts` (GET) - 期間絞り込みの最適化

### 優先度：中（検討推奨）
- **④** `app/api/facilities/[id]/transactions/route.ts` - 前月までの残高計算の最適化（生SQL使用）

### 優先度：低（将来の検討）
- **⑤** `app/api/facilities/[id]/route.ts` - 施設/ユニット別合計の最適化（生SQL使用）
- **⑥** `Transaction` テーブル - インデックスの追加

---

## 1. 期間絞り込みの最適化（優先度：高）

### 【問題点】
全取引を取得してから、JavaScriptで期間フィルタリングや残高計算を行っている箇所があります。

### 【最適化可能なAPI】

#### ① `app/api/facilities/[id]/route.ts` (GET)
**現状**:
- 全取引を取得（期間絞り込みなし）
- JavaScriptで `calculateBalanceUpToMonth` を実行

**提案**:
```typescript
// 指定年月までの取引のみを取得
transactions: {
  where: {
    transactionDate: {
      lte: new Date(year, month, 0, 23, 59, 59, 999) // 指定年月の最終日まで
    }
  },
  select: { ... },
  orderBy: { transactionDate: 'asc' },
}
```

**効果**: 
- データベースから取得する取引データ量が大幅に削減
- 特に過去データが多い場合に効果が大きい

**注意点**:
- `calculateBalanceUpToMonth` は指定年月までの累積残高を計算するため、期間絞り込みで問題ない

---

#### ② `app/api/dashboard/route.ts` (GET)
**現状**:
- 全取引を取得（期間絞り込みなし）
- JavaScriptで `calculateBalanceUpToMonth` を実行

**提案**:
```typescript
transactions: {
  where: {
    transactionDate: {
      lte: new Date(year, month, 0, 23, 59, 59, 999) // 指定年月の最終日まで
    }
  },
  select: { ... },
  orderBy: { transactionDate: 'asc' },
}
```

**効果**: 
- ダッシュボードは全施設のデータを取得するため、効果が大きい
- データベースからの転送量が大幅に削減

---

#### ③ `app/api/residents/[id]/route.ts` (GET)
**現状**:
- 全取引を取得（期間絞り込みなし）
- JavaScriptで `filterTransactionsByMonth` を実行して当月の取引のみをフィルタリング

**提案**:
```typescript
// 指定年月までの取引を取得（残高計算用）
transactions: {
  where: {
    transactionDate: {
      lte: new Date(year, month, 0, 23, 59, 59, 999) // 指定年月の最終日まで
    }
  },
  select: { ... },
  orderBy: { transactionDate: 'asc' },
}
```

**効果**: 
- 利用者詳細画面でのデータ取得量が削減
- ただし、画面表示では当月の取引のみを表示するため、別途当月の取引のみを取得するクエリも必要

**より良い提案**:
```typescript
// 残高計算用：指定年月までの全取引
transactionsForBalance: {
  where: {
    transactionDate: {
      lte: new Date(year, month, 0, 23, 59, 59, 999)
    }
  },
  select: { id, transactionDate, transactionType, amount },
  orderBy: { transactionDate: 'asc' },
},
// 画面表示用：当月の取引のみ
transactionsForDisplay: {
  where: {
    transactionDate: {
      gte: new Date(year, month - 1, 1),
      lte: new Date(year, month, 0, 23, 59, 59, 999)
    }
  },
  select: { ...全フィールド },
  orderBy: { transactionDate: 'asc' },
}
```

**注意点**:
- Prismaでは同じリレーションを2回取得できないため、別のアプローチが必要
- 2回のクエリに分けるか、1回のクエリで取得してからJavaScriptで分けるかの選択が必要

---

## 2. DB側での集計の最適化（優先度：中〜低）

### 【問題点】
残高計算は複雑なロジック（`transactionType` による条件分岐、`correct_in`/`correct_out` の除外など）があるため、完全なDB側集計は難しい。

### 【検討事項】

#### ④ 前月までの残高計算の最適化 (`app/api/facilities/[id]/transactions/route.ts`)
**現状**:
- 前月までの全取引を取得してから、JavaScriptで残高を計算

**提案**:
Prismaの `aggregate` を使用して、条件付きSUMを試みる：

```typescript
// 入金の合計
const incomeSum = await prisma.transaction.aggregate({
  where: {
    residentId: residentId,
    transactionDate: { lte: previousMonthEndDate },
    transactionType: { in: ['in', 'past_correct_in'] }
  },
  _sum: { amount: true }
})

// 出金の合計
const expenseSum = await prisma.transaction.aggregate({
  where: {
    residentId: residentId,
    transactionDate: { lte: previousMonthEndDate },
    transactionType: { in: ['out', 'past_correct_out'] }
  },
  _sum: { amount: true }
})

const balance = (incomeSum._sum.amount || 0) - (expenseSum._sum.amount || 0)
```

**効果**: 
- データベース側で集計されるため、転送量が削減
- ただし、各利用者ごとに2回のクエリが必要（N+2問題）

**より良い提案**:
```typescript
// 生SQLを使用して一括集計
const balances = await prisma.$queryRaw<Array<{residentId: number, balance: number}>>`
  SELECT 
    "residentId",
    SUM(
      CASE 
        WHEN "transactionType" IN ('in', 'past_correct_in') THEN amount
        WHEN "transactionType" IN ('out', 'past_correct_out') THEN -amount
        ELSE 0
      END
    ) as balance
  FROM "Transaction"
  WHERE "transactionDate" <= ${previousMonthEndDate}
    AND "transactionType" NOT IN ('correct_in', 'correct_out')
  GROUP BY "residentId"
`
```

**効果**: 
- 1回のクエリで全利用者の前月残高を取得可能
- データベース側で集計されるため、転送量が大幅に削減

**注意点**:
- 生SQLを使用するため、型安全性が低下
- Prismaのマイグレーションでスキーマが変更された場合、SQLも修正が必要

---

#### ⑤ 施設/ユニット別合計の最適化 (`app/api/facilities/[id]/route.ts`)
**現状**:
- 全取引を取得してから、JavaScriptで `reduce` を使用して合計を計算

**提案**:
生SQLを使用して一括集計：

```typescript
const unitSummaries = await prisma.$queryRaw<Array<{
  unitId: number,
  unitName: string,
  totalAmount: number
}>>`
  SELECT 
    u.id as "unitId",
    u.name as "unitName",
    COALESCE(SUM(
      CASE 
        WHEN t."transactionType" IN ('in', 'past_correct_in') THEN t.amount
        WHEN t."transactionType" IN ('out', 'past_correct_out') THEN -t.amount
        ELSE 0
      END
    ), 0) as "totalAmount"
  FROM "Unit" u
  LEFT JOIN "Resident" r ON r."unitId" = u.id
  LEFT JOIN "Transaction" t ON t."residentId" = r.id
  WHERE u."facilityId" = ${facilityId}
    AND u."isActive" = true
    AND r."isActive" = true
    AND r."endDate" IS NULL
    AND (t."transactionDate" IS NULL OR t."transactionDate" <= ${targetDate})
    AND (t."transactionType" IS NULL OR t."transactionType" NOT IN ('correct_in', 'correct_out'))
  GROUP BY u.id, u.name
  ORDER BY u.name
`
```

**効果**: 
- 1回のクエリで全ユニットの合計を取得可能
- データベース側で集計されるため、転送量が大幅に削減

**注意点**:
- 生SQLを使用するため、型安全性が低下
- 複雑なクエリになるため、メンテナンス性が低下

---

## 3. その他の最適化（優先度：低）

### ⑥ インデックスの追加
**提案**:
`Transaction` テーブルに以下のインデックスを追加：

```prisma
model Transaction {
  // ...
  @@index([residentId, transactionDate])
  @@index([transactionDate, transactionType])
}
```

**効果**: 
- 期間絞り込みや残高計算のクエリが高速化
- 特に過去データが多い場合に効果が大きい

---

## 4. 最適化の優先順位

### 優先度：高（すぐに実施推奨）
- **①** `app/api/facilities/[id]/route.ts` (GET) - 期間絞り込み
- **②** `app/api/dashboard/route.ts` (GET) - 期間絞り込み
- **③** `app/api/residents/[id]/route.ts` (GET) - 期間絞り込み

**理由**: 
- 実装が比較的簡単
- 効果が大きい（特に過去データが多い場合）
- リスクが低い

### 優先度：中（検討推奨）
- **④** 前月までの残高計算の最適化 (`app/api/facilities/[id]/transactions/route.ts`)
  - 生SQLを使用した一括集計

**理由**: 
- 効果が大きいが、生SQLを使用するため型安全性が低下
- メンテナンス性を考慮する必要がある

### 優先度：低（将来の検討）
- **⑤** 施設/ユニット別合計の最適化 (`app/api/facilities/[id]/route.ts`)
- **⑥** インデックスの追加

**理由**: 
- 効果はあるが、実装コストとメンテナンスコストを考慮する必要がある

---

## 5. 実装時の注意点

1. **期間絞り込みの実装**:
   - `calculateBalanceUpToMonth` は指定年月までの累積残高を計算するため、期間絞り込みで問題ない
   - ただし、画面表示で当月の取引のみを表示する場合は、別途当月の取引のみを取得する必要がある

2. **生SQLの使用**:
   - 型安全性が低下するため、型定義を明示的に記述する
   - テストを十分に行う
   - ドキュメントにSQLの意図を記載する

3. **パフォーマンステスト**:
   - 最適化前後のパフォーマンスを測定する
   - 特に過去データが多い場合の効果を確認する

---

## 6. 期待される効果

### 期間絞り込みの最適化
- **データ転送量**: 50〜90%削減（過去データの量による）
- **メモリ使用量**: 50〜90%削減
- **クエリ実行時間**: 10〜30%短縮（インデックスがある場合）

### DB側での集計の最適化
- **データ転送量**: 80〜95%削減
- **クエリ実行時間**: 30〜60%短縮
- **メモリ使用量**: 80〜95%削減

---

## 7. 実装しない方が良い理由（参考）

### 残高計算を完全にDB側で行わない理由
1. **複雑なロジック**: 
   - `correct_in`/`correct_out` の除外
   - `past_correct_in`/`past_correct_out` の含める
   - 日付順のソートと累積計算
   
2. **メンテナンス性**:
   - ロジックが変更された場合、SQLも修正が必要
   - バグが発生した場合のデバッグが困難

3. **型安全性**:
   - 生SQLを使用すると型安全性が低下

**結論**: 残高計算は現在のJavaScript実装を維持し、期間絞り込みのみを最適化するのが現実的。
