# API最適化分析結果

## 調査日: 2026年2月3日

## 概要
プロジェクト内の全API（app/api/*/route.ts）について、`include` の使用状況を調査し、`select` への書き換えによる最適化の余地を分析しました。

---

## 1. `include` を使用しているAPIファイル一覧

### 優先度：高（最適化の効果が大きい）

#### 【ファイル名】: `app/api/facilities/[id]/route.ts` (GET)
- **行番号**: 31-51行目
- **現在の取得内容**: 
  ```typescript
  include: {
    units: { where: { isActive: true } },
    residents: {
      where: { isActive: true, endDate: null },
      include: {
        transactions: { orderBy: { transactionDate: 'asc' } }
      }
    }
  }
  ```
- **フロントエンドでの使用状況**:
  - `facilityName` (facility.name) ✓
  - `totalAmount` (計算値) ✓
  - `units` → `id`, `name` のみ使用
  - `residents` → `id`, `name`, `balance` (計算値) のみ使用
  - `transactions` → 残高計算に使用（全フィールド必要）
- **提案**: 
  - `units`: `select: { id: true, name: true }` に変更可能
  - `residents`: `select: { id: true, name: true, transactions: { select: { ... } } }` に変更可能
  - `transactions`: 残高計算に必要な全フィールドを `select` で指定
- **確認事項**: 
  - `units` の `facilityId`, `isActive`, `createdAt`, `updatedAt` は使用していないため削除可能
  - `residents` の `facilityId`, `unitId`, `startDate`, `endDate`, `isActive`, `createdAt`, `updatedAt` は使用していないため削除可能
  - `transactions` は残高計算に全フィールドが必要（`id`, `transactionDate`, `transactionType`, `amount` は必須）

---

#### 【ファイル名】: `app/api/dashboard/route.ts` (GET)
- **行番号**: 22-33行目
- **現在の取得内容**: 
  ```typescript
  include: {
    residents: {
      where: { isActive: true, endDate: null },
      include: {
        transactions: { orderBy: { transactionDate: 'asc' } }
      }
    }
  }
  ```
- **フロントエンドでの使用状況**:
  - `id`, `name`, `totalAmount` (計算値) のみ使用
  - `residents` と `transactions` は残高計算にのみ使用
- **提案**: 
  - `facility`: `select: { id: true, name: true }` に変更可能
  - `residents`: `select: { id: true, transactions: { select: { ... } } }` に変更可能
  - `transactions`: 残高計算に必要なフィールドのみ（`transactionDate`, `transactionType`, `amount`）
- **確認事項**: 
  - `facility` の `positionName`, `positionHolderName`, `sortOrder`, `isActive`, `createdAt`, `updatedAt` は使用していないため削除可能
  - `residents` の `facilityId`, `unitId`, `name`, `startDate`, `endDate`, `isActive`, `createdAt`, `updatedAt` は使用していないため削除可能（残高計算にのみ使用）
  - `transactions` の `id`, `description`, `payee`, `reason`, `createdAt` は使用していないため削除可能

---

### 優先度：中（最適化の効果が中程度）

#### 【ファイル名】: `app/api/residents/[id]/route.ts` (GET)
- **行番号**: 27-30行目
- **現在の取得内容**: 
  ```typescript
  include: {
    transactions: { orderBy: { transactionDate: 'asc' } }
  }
  ```
- **フロントエンドでの使用状況**:
  - `residentName` (resident.name) ✓
  - `facilityId` (resident.facilityId) ✓
  - `balance` (計算値) ✓
  - `transactions`: 全フィールドを使用（`id`, `transactionDate`, `transactionType`, `amount`, `description`, `payee`, `reason`, `balance`）
- **提案**: 
  - `resident`: `select: { id: true, name: true, facilityId: true }` に変更可能
  - `transactions`: 全フィールドが必要だが、`select` で明示的に指定
- **確認事項**: 
  - `resident` の `unitId`, `startDate`, `endDate`, `isActive`, `createdAt`, `updatedAt` は使用していないため削除可能
  - `transactions` は全フィールドが必要（画面表示で使用）

---

#### 【ファイル名】: `app/api/units/[id]/route.ts` (GET)
- **行番号**: 22-24行目
- **現在の取得内容**: 
  ```typescript
  include: {
    facility: true
  }
  ```
- **フロントエンドでの使用状況**: 確認が必要（マスタ画面で使用されている可能性）
- **提案**: 
  - `unit`: 使用されているフィールドのみ `select` で指定
  - `facility`: 使用されているフィールドのみ `select` で指定
- **確認事項**: 
  - このAPIはフロントエンドのどこで使用されていますか？
  - `unit` のどのフィールドが必要ですか？（`id`, `name`, `facilityId` など）
  - `facility` のどのフィールドが必要ですか？（`id`, `name` など）

---

#### 【ファイル名】: `app/api/units/route.ts` (POST)
- **行番号**: 91-93行目
- **現在の取得内容**: 
  ```typescript
  include: {
    facility: true
  }
  ```
- **フロントエンドでの使用状況**: 確認が必要（作成後のレスポンスで使用）
- **提案**: 
  - `unit`: 使用されているフィールドのみ `select` で指定
  - `facility`: 使用されているフィールドのみ `select` で指定
- **確認事項**: 
  - 作成後のレスポンスで `facility` のどのフィールドを使用していますか？
  - 使用していない場合は `include` を削除可能

---

### 優先度：低（PDF生成用で全フィールドが必要な可能性が高い）

#### 【ファイル名】: `app/api/print/batch-print/route.ts` (GET)
- **行番号**: 26-42行目, 64-72行目
- **現在の取得内容**: 
  ```typescript
  include: {
    units: { where: { isActive: true } },
    residents: {
      where: { isActive: true, endDate: null },
      include: {
        transactions: { orderBy: { transactionDate: 'asc' } },
        unit: true
      }
    }
  }
  ```
- **使用目的**: PDF生成（`transformToPrintData`, `transformToResidentPrintData`）
- **提案**: 
  - PDF生成用のため、多くのフィールドが必要な可能性が高い
  - `transform.ts` を確認して、実際に使用されているフィールドのみを `select` で指定
- **確認事項**: 
  - `transformToPrintData` と `transformToResidentPrintData` で使用されているフィールドを確認
  - 使用されていないフィールドがあれば削除可能

---

#### 【ファイル名】: `app/api/print/cash-verification/route.ts` (GET)
- **行番号**: 45-57行目
- **現在の取得内容**: 
  ```typescript
  include: {
    residents: {
      where: { isActive: true, endDate: null },
      include: {
        transactions: { orderBy: { transactionDate: 'asc' } }
      }
    }
  }
  ```
- **使用目的**: 残高計算のみ（`calculateBalanceUpToMonth`）
- **提案**: 
  - `facility`: `select: { id: true, name: true }` に変更可能
  - `residents`: 残高計算に必要なフィールドのみ
  - `transactions`: 残高計算に必要なフィールドのみ（`transactionDate`, `transactionType`, `amount`）
- **確認事項**: 
  - `facility` の `positionName`, `positionHolderName`, `sortOrder`, `isActive`, `createdAt`, `updatedAt` は使用していないため削除可能
  - `residents` の `facilityId`, `unitId`, `name`, `startDate`, `endDate`, `isActive`, `createdAt`, `updatedAt` は使用していないため削除可能
  - `transactions` の `id`, `description`, `payee`, `reason`, `createdAt` は使用していないため削除可能

---

#### 【ファイル名】: `app/api/print/deposit-statement/route.ts` (GET)
- **行番号**: 26-42行目
- **現在の取得内容**: 
  ```typescript
  include: {
    units: { where: { isActive: true } },
    residents: {
      where: { isActive: true, ...(unitId ? { unitId: Number(unitId) } : {}) },
      include: {
        transactions: { orderBy: { transactionDate: 'asc' } },
        unit: true
      }
    }
  }
  ```
- **使用目的**: PDF生成（`transformToPrintData`）
- **提案**: 
  - PDF生成用のため、多くのフィールドが必要な可能性が高い
  - `transform.ts` を確認して、実際に使用されているフィールドのみを `select` で指定
- **確認事項**: 
  - `transformToPrintData` で使用されているフィールドを確認
  - 使用されていないフィールドがあれば削除可能

---

#### 【ファイル名】: `app/api/print/resident-statement/route.ts` (GET)
- **行番号**: 25-31行目
- **現在の取得内容**: 
  ```typescript
  include: {
    transactions: { orderBy: { transactionDate: 'asc' } },
    facility: true,
    unit: true
  }
  ```
- **使用目的**: PDF生成（`transformToResidentPrintData`）
- **提案**: 
  - PDF生成用のため、多くのフィールドが必要な可能性が高い
  - `transform.ts` を確認して、実際に使用されているフィールドのみを `select` で指定
- **確認事項**: 
  - `transformToResidentPrintData` で使用されているフィールドを確認
  - `facility` の `positionName`, `positionHolderName` は使用されているが、他のフィールドは確認が必要
  - `unit` の `name` は使用されているが、他のフィールドは確認が必要
  - `transactions` は全フィールドが必要な可能性が高い

---

## 2. 既に `select` を使用しているAPI（参考）

以下のAPIは既に `select` を使用しており、最適化済みです：

- `app/api/facilities/[id]/transactions/route.ts` (GET) - 既に `select` を使用
- `app/api/units/route.ts` (GET) - 既に `select` を使用
- `app/api/residents/route.ts` (GET) - 既に `select` を使用

---

## 3. 最適化の優先順位

1. **最優先**: `app/api/facilities/[id]/route.ts` (GET) - 施設詳細画面で頻繁に使用される
2. **高**: `app/api/dashboard/route.ts` (GET) - ダッシュボードで頻繁に使用される
3. **中**: `app/api/residents/[id]/route.ts` (GET) - 利用者詳細画面で使用される
4. **中**: `app/api/print/cash-verification/route.ts` (GET) - 残高計算のみで最適化しやすい
5. **低**: PDF生成用API - 多くのフィールドが必要な可能性が高いが、確認後に最適化可能

---

## 4. 次のステップ

1. ユーザーに各APIの確認事項について回答を求める
2. 回答に基づいて、合意が得られたAPIから順に `select` への書き換えを実施
3. `getPrisma()` の使用確認（既に使用されているか確認）
4. キャッシュヘッダーの追加（`Cache-Control: public, s-maxage=5, stale-while-revalidate=55`）
