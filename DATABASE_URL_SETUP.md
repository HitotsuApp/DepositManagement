# DATABASE_URL設定ガイド

## 問題

Prismaマイグレーション実行時に以下のエラーが発生しました：

```
Error validating datasource `db`: the URL must start with the protocol `postgresql://` or `postgres://`.
```

## 原因

`.env`ファイルの`DATABASE_URL`がSQLite形式（`file:./prisma/dev.db`）になっているためです。

## 解決方法

### 1. Neon DBを使用する場合

`.env`ファイルを以下のように修正してください：

```env
# SQLite（開発用）をコメントアウト
#DATABASE_URL="file:./prisma/dev.db"

# Neon DB（PostgreSQL）のURLを有効化
DATABASE_URL="postgresql://neondb_owner:npg_My8hZBcuq2IO@ep-winter-breeze-a4w1uj78-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

### 2. SQLiteを引き続き使用する場合

`prisma/schema.prisma`の`datasource`をSQLiteに変更する必要があります：

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

ただし、**SQLiteでは複合インデックス（`@@index([facilityId, isActive, endDate])`など）の一部がサポートされていない可能性があります**。

## 推奨

**Neon DB（PostgreSQL）を使用することを推奨します**。理由：

1. 追加したインデックスがすべてサポートされる
2. 本番環境と同じデータベースを使用できる
3. パフォーマンスが向上する

## 次のステップ

1. `.env`ファイルでPostgreSQLのURLを有効化
2. マイグレーションを再実行：
   ```bash
   npx prisma migrate dev --name add_performance_indexes
   ```
