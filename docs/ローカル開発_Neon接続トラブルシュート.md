# ローカル開発で Neon 接続が不安定なとき

## ログに出ていたものの意味

| ログ例 | 意味 |
|--------|------|
| `NeonDbError: fetch failed` / `UND_ERR_CONNECT_TIMEOUT` | Neon への HTTP（`neon()`）が **接続確立でタイムアウト**。DB がスリープ中・ネットワーク・地理的レイテンシが重なると起きやすい。 |
| `ErrorEvent` + Prisma `WebSocket` | `@prisma/adapter-neon` の **プーラー経由 WebSocket** が同様にタイムアウト／切断されたとき。 |
| `GET ... 500 in ~10000ms` | 多くは上記が **約 10 秒**で切れている。 |

`zsh: command not found: compdef` は **OpenClaw 等のシェル補完**の問題で、このアプリとは無関係です（zsh で `compinit` 前に `compdef` が呼ばれているなど）。

## コード側の対策（本リポジトリ）

- **`lib/withTransientDbRetries.ts`**  
  接続系の一時エラーのときだけ **数回リトライ**（Neon のウェイク待ち）。
- **`lib/neonHttpSql.ts`**  
  `next dev` では **`neon()` を `globalThis` に保持**し、並列コンパイルで何本もクライアントを作らないようにしている。  
  Cloudflare Pages（`CF_PAGES=1`）では従来どおり **Isolate ごとに新規**。
- **`lib/prisma.ts`**  
  `Pool` に `connectionTimeoutMillis: 60000` を指定（スリープ直後のつながり待ちで落ちにくくする試み）。

## 運用・環境でできること

1. **Neon プロジェクトのリージョン**  
   開発マシンから遠い（例: DB が `ap-southeast-1` で開発者が日本）と、冷たい状態＋レイテンシでタイムアウトしやすい。可能なら **近いリージョン**のプロジェクト／ブランチを使う。
2. **コンピュートがスリープしないプラン／最小スケール**  
   無料枠ではスリープが強いほど「初回だけ 10 秒」が増えやすい。
3. **同時に叩くタブやリクエストを減らす**  
   `next dev` で初回コンパイルが重なると、複数 API が同時に Neon に刺さり、タイムアウトが重なりやすい。
4. **`.env` の `DATABASE_URL`**  
   Neon ダッシュボードの **Pooler 用**（`-pooler` ホスト）を使うのは README の通り。接続文字列が古い／誤っていると別のエラーになる。

それでも頻発する場合は、一時的に **Neon の SQL Editor や `psql`** で接続できるか確認し、ネットワーク・ファイアウォール・VPN を切り分けるとよいです。
