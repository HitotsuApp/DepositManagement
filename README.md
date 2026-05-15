# 預り金管理Webアプリ

介護法人向けの預り金管理システムです。

## 技術スタック

- Next.js 14 (App Router)
- TypeScript
- Prisma (SQLite)
- Tailwind CSS

## セットアップ

1. 依存関係のインストール
```bash
npm install
```

2. 環境変数の設定

`.env`ファイルをプロジェクトのルートディレクトリに作成し、以下の内容を記述してください：

```
DATABASE_URL="file:./prisma/dev.db"
```

**作成方法（3つの方法から選べます）：**

**方法1: ターミナルで作成**
```bash
echo 'DATABASE_URL="file:./prisma/dev.db"' > .env
```

**方法2: .env.exampleをコピー**
```bash
cp .env.example .env
```

**方法3: 手動で作成**
- プロジェクトルートに`.env`という名前のファイルを新規作成
- 上記の内容をコピー&ペーストして保存

3. データベースの初期化
```bash
npx prisma generate
npx prisma db push
```

4. 開発サーバーの起動
```bash
npm run dev
```

ブラウザで http://localhost:3000 にアクセスしてください。

## 初期データのインポート

1. ExcelからCSV形式でデータをエクスポート
   - 列: 施設名, ユニット名, 利用者名, 残高
2. サイドバーから「データインポート」を選択
3. CSVデータを貼り付けてインポート実行

## 機能

### D01: 法人ダッシュボード
- 法人全体の預り金合計表示
- 各施設の合計金額をカード表示
- 施設へのリンク

### F01: 施設詳細画面
- 施設合計カード
- ユニット別合計カード
- 利用者別残高カード
- ユニットで絞り込み可能

### U01: 利用者詳細画面
- 利用者名と現在残高
- 明細テーブル
- 入金・出金機能（当月のみ）
- 訂正入力機能（過去月のみ）

### P01: まとめて印刷画面
- 対象年月選択
- 印刷単位選択
- 明細含む/含まない選択

### M01: マスタ管理画面
- 施設マスタ
- ユニットマスタ
- 利用者マスタ

## データベース

SQLiteを使用しています。データベースファイルは `prisma/dev.db` に作成されます。

Prisma Studioでデータを確認できます：
```bash
npm run db:studio
```

## 本番（Neon / Edge）で Prisma とキャッシュを運用するとき

### `DATABASE_URL`

- Vercel の Edge / Cloudflare Workers + `@prisma/adapter-neon` を使う場合は、Neon が案内する **サーバレス用プーラーの接続文字列**（ホスト名に `-pooler` が含まれる形式）を設定してください。Direct 接続だけにすると、長寿命 Connection の失敗率が上がりやすいです。
- **Cloudflare Pages**（`CF_PAGES=1`）では、ランタイム制限により **Prisma を `globalThis` シングルトンにできません**。コード側で自動的にリクエストごとに Client を作成します。**Vercel Edge ではシングルトン再利用が可能**であり、両者で挙動が異なる点に注意してください。
- 接続トラブルの切り分けで、一時的に **リクエストごとに Client を作り直す**（他ホスト向け強制・ロールバック）には、環境変数に次を設定します（通常は未設定でよい）。
  - `PRISMA_NEW_CLIENT_EACH_REQUEST=true`

### マスタ系 GET の HTTP キャッシュとデプロイ確認

- `/api/facilities`・`/api/units`・`/api/residents` の GET は、`Cache-Control` に `s-maxage` と `stale-while-revalidate` を付けています。CDN 上で最大数分、古い一覧が返り得るため、マスタ更新直後は最大その程度の遅れになり得ます。
- デプロイまたは設定変更後は、**デプロイ先のサーバログ**（例: Cloudflare Observability／Vercel Function ログ）の **エラー率** と **Neon のクエリ・アラート**、必要なら体感で施設選択・まとめて入力のレイテンシを確認し、`s-maxage` の数値チューニングは [`app/api/facilities/route.ts`](app/api/facilities/route.ts) 等で行います。
- 画面間で施設名を共有するなどの **クライアント側キャッシュ**は別タスクで検討可能です（HTTP だけでは URL が違うと別キャッシュになるため）。

