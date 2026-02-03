# まとめて入力画面の最適化計画

## 調査日: 2026年2月3日

## 現状の問題点

### `app/api/facilities/[id]/transactions/route.ts`

**74-95行目**: 前月までの全取引を取得
```typescript
const residentsForBalance = await prisma.resident.findMany({
  where: {
    facilityId,
    isActive: true,
  },
  select: {
    id: true,
    transactions: {
      where: {
        transactionDate: {
          lte: previousMonthEndDate,
        },
      },
      select: {
        transactionDate: true,
        transactionType: true,
        amount: true,
      },
      orderBy: { transactionDate: 'asc' },
    },
  },
})
```

**105-120行目**: JavaScript側で残高計算
```typescript
const previousBalances = new Map<number, number>()
residentsForBalance.forEach(resident => {
  let balance = 0
  resident.transactions.forEach(transaction => {
    if (transaction.transactionType === 'in') {
      balance += transaction.amount
    } else if (transaction.transactionType === 'out') {
      balance -= transaction.amount
    } else if (transaction.transactionType === 'past_correct_in') {
      balance += transaction.amount
    } else if (transaction.transactionType === 'past_correct_out') {
      balance -= transaction.amount
    }
    // correct_in と correct_out は計算しない（打ち消し処理）
  })
  previousBalances.set(resident.id, balance)
})
```

**問題**:
- 前月までの全取引を取得してCloudflareへ転送
- JavaScript側で数千件のデータを処理
- 数秒かかる処理

---

## 改善計画

### 目標
1. 過去の全明細（transactions）を `findMany` で取得するのをやめる
2. DB側で合計金額（前月繰越分）を算出
3. Cloudflareへのデータ転送量を削減
4. 処理時間を数秒からミリ秒単位まで高速化
5. 過去の取引が修正された場合でも、常に最新の正しい残高が得られる

---

## 実装方針

### 残高計算のロジック

**含める取引タイプ**:
- `in`: 入金
- `out`: 出金
- `past_correct_in`: 過去訂正入金
- `past_correct_out`: 過去訂正出金

**除外する取引タイプ**:
- `correct_in`: 訂正入金（打ち消し処理）
- `correct_out`: 訂正出金（打ち消し処理）

**計算式**:
```
残高 = SUM(
  CASE 
    WHEN transactionType IN ('in', 'past_correct_in') THEN amount
    WHEN transactionType IN ('out', 'past_correct_out') THEN -amount
    ELSE 0
  END
)
WHERE transactionDate <= previousMonthEndDate
  AND transactionType NOT IN ('correct_in', 'correct_out')
```

---

## 実装ステップ

### ステップ1: 生SQLを使用した一括集計の実装

**ファイル**: `app/api/facilities/[id]/transactions/route.ts`

**変更内容**:
1. `residentsForBalance` の取得を削除
2. 生SQLを使用して前月までの残高を一括集計
3. 結果を `Map<residentId, balance>` に変換

**実装コード**:
```typescript
// 前月までの残高をDB側で一括集計
const previousBalancesRaw = await prisma.$queryRaw<Array<{
  residentId: number
  balance: number
}>>`
  SELECT 
    "residentId",
    COALESCE(SUM(
      CASE 
        WHEN "transactionType" IN ('in', 'past_correct_in') THEN amount
        WHEN "transactionType" IN ('out', 'past_correct_out') THEN -amount
        ELSE 0
      END
    ), 0) as balance
  FROM "Transaction"
  WHERE "transactionDate" <= ${previousMonthEndDate}
    AND "transactionType" NOT IN ('correct_in', 'correct_out')
    AND "residentId" IN (
      SELECT id FROM "Resident"
      WHERE "facilityId" = ${facilityId}
        AND "isActive" = true
    )
  GROUP BY "residentId"
`

// Mapに変換
const previousBalances = new Map<number, number>()
previousBalancesRaw.forEach(row => {
  previousBalances.set(row.residentId, Number(row.balance))
})
```

**効果**:
- 数千件のデータ転送を削減
- DB側で集計されるため、処理時間が大幅に短縮
- 1回のクエリで全利用者の残高を取得

---

### ステップ2: エラーハンドリングと型安全性の確保

**実装内容**:
1. 生SQLの型定義を明示的に記述
2. エラーハンドリングを追加
3. テストケースの作成

**型定義**:
```typescript
interface PreviousBalanceRow {
  residentId: number
  balance: number | string // PostgreSQLのSUMは数値または文字列を返す可能性がある
}
```

**エラーハンドリング**:
```typescript
try {
  const previousBalancesRaw = await prisma.$queryRaw<PreviousBalanceRow[]>(...)
  // 処理
} catch (error) {
  console.error('Failed to calculate previous balances:', error)
  // フォールバック: 既存の方法に戻すか、エラーを返す
}
```

---

### ステップ3: パフォーマンス測定

**測定項目**:
1. クエリ実行時間
2. データ転送量
3. メモリ使用量

**測定方法**:
```typescript
console.time('previous-balance-aggregate')
const previousBalancesRaw = await prisma.$queryRaw<PreviousBalanceRow[]>(...)
console.timeEnd('previous-balance-aggregate')
```

---

### ステップ4: テストと検証

**テストケース**:
1. 正常系: 前月までの取引がある場合
2. 正常系: 前月までの取引がない場合（新規利用者）
3. 正常系: `correct_in`/`correct_out` がある場合（除外されることを確認）
4. 正常系: `past_correct_in`/`past_correct_out` がある場合（含まれることを確認）
5. 異常系: SQLエラーの場合

**検証方法**:
- 既存のJavaScript実装と結果を比較
- 実際のデータで動作確認

---

## 実装時の注意点

### 1. 型安全性
- 生SQLを使用するため、型定義を明示的に記述
- PostgreSQLの `SUM` は `numeric` 型を返すため、`Number()` で変換が必要

### 2. 日付の扱い
- `previousMonthEndDate` をSQLに渡す際、適切にエスケープする
- Prismaの `$queryRaw` はパラメータ化クエリを使用するため、SQLインジェクション対策は不要

### 3. パフォーマンス
- インデックスが適切に設定されていることを確認
- `transactionDate` と `residentId` にインデックスがあると効果的

### 4. 互換性
- 既存のコードとの互換性を保つ
- エラー時は既存の方法にフォールバックするか、明確なエラーメッセージを返す

---

## 期待される効果

### データ転送量
- **現状**: 数千件の取引データを転送
- **改善後**: 利用者数分の残高データのみ（数件〜数十件）
- **削減率**: 90〜99%削減

### 処理時間
- **現状**: 数秒（数千件のデータをJavaScript側で処理）
- **改善後**: ミリ秒単位（DB側で集計）
- **短縮率**: 90〜99%短縮

### メモリ使用量
- **現状**: 数千件の取引データをメモリに保持
- **改善後**: 利用者数分の残高データのみ
- **削減率**: 90〜99%削減

---

## 実装順序

1. **ステップ1**: 生SQLを使用した一括集計の実装
2. **ステップ2**: エラーハンドリングと型安全性の確保
3. **ステップ3**: パフォーマンス測定
4. **ステップ4**: テストと検証

---

## リスクと対策

### リスク1: 生SQLの型安全性が低下
**対策**: 型定義を明示的に記述し、テストを十分に行う

### リスク2: SQLエラーが発生する可能性
**対策**: エラーハンドリングを追加し、フォールバック処理を実装

### リスク3: パフォーマンスが期待通りでない
**対策**: インデックスを確認し、必要に応じて追加

### リスク4: 既存のコードとの互換性
**対策**: 既存のコードとの互換性を保ち、段階的に移行

---

## 次のステップ

1. 実装を開始する
2. パフォーマンスを測定する
3. テストを実施する
4. 本番環境にデプロイする
