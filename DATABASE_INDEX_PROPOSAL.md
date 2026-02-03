# データベースインデックス追加提案

## 調査日: 2026年2月3日

## 現状のクエリパターン分析

### Transactionテーブルのクエリパターン

1. **利用者別の取引を日付でフィルタリング**
   - パターン: `WHERE residentId = ? AND transactionDate <= ?`
   - 使用箇所: 利用者詳細画面、まとめて入力画面
   - 頻度: 高

2. **施設内の全利用者の取引を日付でフィルタリング**
   - パターン: `JOIN Resident ON Transaction.residentId = Resident.id WHERE Resident.facilityId = ? AND transactionDate <= ?`
   - 使用箇所: 施設詳細画面、ダッシュボード、現金確認PDF
   - 頻度: 高

3. **取引タイプでのフィルタリング**
   - パターン: `WHERE transactionType NOT IN ('correct_in', 'correct_out')`
   - 使用箇所: 残高計算クエリ
   - 頻度: 高

### Residentテーブルのクエリパターン

1. **施設別のアクティブな利用者を取得**
   - パターン: `WHERE facilityId = ? AND isActive = true AND endDate IS NULL`
   - 使用箇所: 施設詳細画面、まとめて入力画面、ダッシュボード
   - 頻度: 高

2. **施設別の利用者一覧**
   - パターン: `WHERE facilityId = ?`
   - 使用箇所: マスタ画面、まとめて入力画面
   - 頻度: 中

### Unitテーブルのクエリパターン

1. **施設別のアクティブなユニットを取得**
   - パターン: `WHERE facilityId = ? AND isActive = true`
   - 使用箇所: 施設詳細画面、まとめて入力画面
   - 頻度: 高

---

## 提案するインデックス

### 1. Transactionテーブル

#### ① `residentId` と `transactionDate` の複合インデックス（最優先）
```prisma
@@index([residentId, transactionDate])
```
**理由**:
- 利用者別の取引を日付でフィルタリングするクエリが頻繁に実行される
- 利用者詳細画面、まとめて入力画面で使用
- 複合インデックスにより、`residentId`でのフィルタリングと`transactionDate`でのソートが高速化される

#### ② `transactionDate` の単一インデックス
```prisma
@@index([transactionDate])
```
**理由**:
- 日付範囲でのフィルタリングが頻繁に実行される
- 前月残高計算などで`transactionDate <= ?`の条件が使用される
- 複合インデックス①と組み合わせて、様々なクエリパターンに対応

#### ③ `transactionType` の単一インデックス（検討）
```prisma
@@index([transactionType])
```
**理由**:
- `transactionType NOT IN ('correct_in', 'correct_out')`の条件が頻繁に使用される
- ただし、カーディナリティが低い（値の種類が少ない）ため、効果は限定的な可能性がある
- **推奨度: 低**（まずは①と②を追加して効果を確認）

### 2. Residentテーブル

#### ④ `facilityId`, `isActive`, `endDate` の複合インデックス（最優先）
```prisma
@@index([facilityId, isActive, endDate])
```
**理由**:
- 施設別のアクティブな利用者を取得するクエリが頻繁に実行される
- `WHERE facilityId = ? AND isActive = true AND endDate IS NULL`のパターンが多い
- 複合インデックスにより、この条件での検索が高速化される

#### ⑤ `facilityId` の単一インデックス（既存の可能性あり）
```prisma
@@index([facilityId])
```
**理由**:
- 施設別の利用者一覧を取得するクエリが実行される
- ただし、④の複合インデックスがあれば、この単一インデックスは不要な可能性がある
- **推奨度: 低**（④を追加して効果を確認）

### 3. Unitテーブル

#### ⑥ `facilityId`, `isActive` の複合インデックス
```prisma
@@index([facilityId, isActive])
```
**理由**:
- 施設別のアクティブなユニットを取得するクエリが頻繁に実行される
- `WHERE facilityId = ? AND isActive = true`のパターンが多い

### 4. Facilityテーブル

#### ⑦ `isActive`, `sortOrder` の複合インデックス（検討）
```prisma
@@index([isActive, sortOrder])
```
**理由**:
- `WHERE isActive = true ORDER BY sortOrder`のパターンが使用される
- ただし、施設数が少ない場合は効果が限定的な可能性がある
- **推奨度: 低**（まずは他のインデックスを追加して効果を確認）

---

## 実装優先順位

### 最優先（即座に追加すべき）
1. Transaction: `@@index([residentId, transactionDate])`
2. Resident: `@@index([facilityId, isActive, endDate])`
3. Unit: `@@index([facilityId, isActive])`

### 優先度: 高
4. Transaction: `@@index([transactionDate])`

### 優先度: 中（効果を確認してから追加）
5. Transaction: `@@index([transactionType])` - カーディナリティが低いため効果は限定的

### 優先度: 低（施設数が少ない場合は不要）
6. Facility: `@@index([isActive, sortOrder])`

---

## 期待される効果

### パフォーマンス向上が見込まれるクエリ

1. **利用者別の取引取得**
   - 現状: 全取引をスキャンしてフィルタリング
   - 改善後: インデックスを使用して高速検索
   - **期待される改善**: 90〜99%の高速化

2. **施設別の残高集計**
   - 現状: JOIN + 全取引をスキャン
   - 改善後: インデックスを使用して高速JOIN
   - **期待される改善**: 70〜90%の高速化

3. **施設別のアクティブな利用者取得**
   - 現状: 全利用者をスキャンしてフィルタリング
   - 改善後: インデックスを使用して高速検索
   - **期待される改善**: 80〜95%の高速化

---

## 注意点

1. **インデックスのメンテナンスコスト**
   - インデックスは書き込み時に更新されるため、INSERT/UPDATE/DELETEのパフォーマンスに若干の影響がある
   - ただし、読み取りの頻度が高いため、このトレードオフは許容範囲内

2. **ストレージ使用量**
   - インデックスは追加のストレージを消費する
   - ただし、提案するインデックスは必要最小限であり、ストレージへの影響は限定的

3. **既存のインデックス**
   - Prismaは外部キー（`residentId`など）に自動的にインデックスを追加する可能性がある
   - 既存のインデックスと重複しないように確認が必要
