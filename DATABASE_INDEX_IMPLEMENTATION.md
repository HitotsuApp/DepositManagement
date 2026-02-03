# データベースインデックス実装ガイド

## 実装日: 2026年2月3日

## 追加したインデックス

### 1. Transactionテーブル

#### ① `residentId` と `transactionDate` の複合インデックス
```prisma
@@index([residentId, transactionDate])
```
**効果**: 利用者別の取引を日付でフィルタリングするクエリを高速化

#### ② `transactionDate` の単一インデックス
```prisma
@@index([transactionDate])
```
**効果**: 日付範囲でのフィルタリングを高速化（前月残高計算など）

### 2. Residentテーブル

#### ③ `facilityId`, `isActive`, `endDate` の複合インデックス
```prisma
@@index([facilityId, isActive, endDate])
```
**効果**: 施設別のアクティブな利用者を取得するクエリを高速化

### 3. Unitテーブル

#### ④ `facilityId`, `isActive` の複合インデックス
```prisma
@@index([facilityId, isActive])
```
**効果**: 施設別のアクティブなユニットを取得するクエリを高速化

---

## Neon DBへの反映手順

### 方法1: Prisma Migrateを使用（推奨）

マイグレーションファイルを生成して適用します。

```bash
# マイグレーションファイルを生成
npx prisma migrate dev --name add_performance_indexes

# これにより以下が実行されます：
# 1. マイグレーションファイルが生成される（prisma/migrations/YYYYMMDDHHMMSS_add_performance_indexes/migration.sql）
# 2. データベースにマイグレーションが適用される
# 3. Prisma Clientが再生成される
```

### 方法2: Prisma DB Pushを使用（開発環境向け）

マイグレーションファイルを生成せずに、直接データベースに反映します。

```bash
# スキーマの変更を直接データベースに反映
npx prisma db push

# 注意: 本番環境では推奨されません
# マイグレーション履歴が残らないため
```

### 方法3: 手動でSQLを実行（上級者向け）

マイグレーションファイルを確認してから、手動でSQLを実行することもできます。

```bash
# マイグレーションファイルを生成（適用はしない）
npx prisma migrate dev --create-only --name add_performance_indexes

# 生成されたSQLファイルを確認
cat prisma/migrations/*/migration.sql

# 問題がなければ、マイグレーションを適用
npx prisma migrate deploy
```

---

## マイグレーション後の確認

### 1. インデックスが正しく作成されたか確認

```bash
# Prisma Studioで確認
npx prisma studio

# または、直接SQLで確認（PostgreSQL）
# psql $DATABASE_URL
# \d "Transaction"
# \d "Resident"
# \d "Unit"
```

### 2. パフォーマンスの改善を確認

- まとめて入力画面の読み込み時間を計測
- 施設詳細画面の読み込み時間を計測
- ダッシュボード画面の読み込み時間を計測

---

## 注意事項

### 1. インデックス作成時のロック

- 大規模なテーブルの場合、インデックス作成時にテーブルロックが発生する可能性がある
- 本番環境では、メンテナンス時間帯に実行することを推奨

### 2. ストレージ使用量

- インデックスは追加のストレージを消費する
- ただし、提案するインデックスは必要最小限であり、ストレージへの影響は限定的

### 3. 書き込みパフォーマンス

- インデックスはINSERT/UPDATE/DELETE時に更新されるため、書き込みパフォーマンスに若干の影響がある
- ただし、読み取りの頻度が高いため、このトレードオフは許容範囲内

---

## ロールバック方法

もし問題が発生した場合は、以下の手順でロールバックできます。

```bash
# 最後のマイグレーションをロールバック
npx prisma migrate resolve --rolled-back <migration_name>

# または、手動でインデックスを削除
# DROP INDEX IF EXISTS "Transaction_residentId_transactionDate_idx";
# DROP INDEX IF EXISTS "Transaction_transactionDate_idx";
# DROP INDEX IF EXISTS "Resident_facilityId_isActive_endDate_idx";
# DROP INDEX IF EXISTS "Unit_facilityId_isActive_idx";
```

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

## 次のステップ

1. マイグレーションを実行してインデックスを追加
2. パフォーマンスの改善を確認
3. 必要に応じて、追加のインデックスを検討（`transactionType`など）
