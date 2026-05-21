# Cloudflare（Pages/Workers）ログによる再計測チェックリスト

本番デプロイ後、以下を **Cloudflare の該当 Worker**（例: `pages-worker--…-production`）のログで確認する。

## 期待する改善（今回の変更に対応）

1. **印刷プレビュー**
   - `/print/preview` で **同秒に `/api/facilities` が連打されない**こと（Sidebar は `FacilityProvider` 初回1回＋マスタ更新後 `refreshFacilities`）。
   - `/api/print/deposit-statement`（または利用する印刷 API）の **exceededCpu（503）発生が減る**こと（完全ゼロはデータ量・同時リクエスト次第）。

2. **施設詳細のサマリ**
   - `GET /api/facilities/[id]?year=…&month=…` の **wallTime が短くなる／cpuTime が Prisma 時より軽くなる**こと（Neon HTTP 経由の `lib/facilityUnitBalancesSql.ts`）。

3. **利用者一覧（施設スコープ）**
   - `GET /api/residents?facilityId=…` の **wallTime/cpuTime 改善**（`lib/residentsFacilityListSql.ts`）。

## 計測時の注意

- ログ上 **同一 Isolate** だと、印刷 API と Sidebar 等の **cpuTime が合算**されやすい。改善前後で **同じ操作手順**（施設選択 → 詳細 → 印刷プレビュー）で比較する。
- Neon DB 側の負荷・プランが変わると wallTime も変動する。

## 完了の記録

再計測日時と、上記の代表 URL の **wallTime / cpuTime / outcome** をメモしておく。

---

## cpuTime / exceededCpu 記録用（CPU 削減施策デプロイ後）

以下は **実装済み変更** を前提にデプロイ前後で同じ操作手順（例: 施設選択 → まとめて印刷または本部報告の印刷 → `/print/preview` でプレビュー）から Cloudflare Workers ログへ記載するための項目です。**本番環境ログ** で各リクエストの `cpuMs`／`ExceededCpu`/`503` を確認してください（ダッシュボードの表記はプランにより異なる場合があります）。

### フェーズごとの論理変更メモ（比較の文脈用）

| フェーズ | 内容 |
|---------|------|
| フェーズ 1・2 | 印刷ホットパス（`/api/print/deposit-statement`・`/api/print/batch-print`）を **Prisma 非依存・raw JSON 応答**。`transformToPrintData` / まとめて印刷は **ブラウザ（プレビュー）側**で実行。 |
| フェーズ 3 | **`fetchOpeningBalancesAndTransactionsInRangeByResidentChunks`**: 利用者 ID チャンクあたり **Neon 往復を 2→1（UNION で繰越集計 + 当月取引）**。`resident-statement` / `family-resident-statement` / `loadResidentsForDepositPrint` もこの経路で取得。 |
| フェーズ 4 | **Sidebar**: `/print` 配下では先読み抑制・`requestIdleCallback` で待機。現金確認先読みは `GET /api/facilities/[id]?year=…&month=…` に集約。**施設詳細**: まとめて入力のホバー先読みは idle 後に **`GET …/bulk-input-bootstrap` を1本**に集約。 |
| **まとめて入力 Phase1** | **`GET …/transactions?resume=1`** に `LIMIT` と `hasMore` を付け、レスポンス行数をチャンク1と同規模に。クライアントでは **`appendRemainingFacilityTransactions`** でループ。**既定 `limit=40`**（`BULK_TRANSACTIONS_CHUNK_LIMIT`）。 |
| **まとめて入力 Phase2・3** | **`GET …/bulk-input-bootstrap`**: Neon で施設名・利用者（`fetchResidentsByFacilityId`）・ユニット（`lib/unitsFacilityListSql.ts`）・取引チャンク1を並列。**まとめて入力初回は Prisma 不要**。残トランザクションは従来の **`/transactions`** resume を複数回。 |
| **登録 wallTime** | **まとめて入力／行入力では登録後の `invalidateCache` 連打を廃止**（`fetchBulkData` + `router.refresh` のみ）。**`POST /api/transactions`**・**`POST /api/transactions/batch`**・**`PATCH /api/transactions/[id]`** を **Neon HTTP**（`lib/transactionWriteSql.ts`）に変更し、Prisma WebSocket 接続待ちを避ける。 |
| **Prisma 残存 3 GET** | **`GET …/resident-summaries`**（`lib/residentSummariesSql.ts`）・**`GET /api/dashboard`**（`lib/dashboardFacilityBalancesSql.ts`）・**`GET /api/facilities`**（`lib/facilitiesListSql.ts`／Facility 全列）を **Neon HTTP** に統一。施設詳細のユニット切替・トップ／マスタでの Prisma GET wallTime を抑える。 |

### まとめて入力で注目するログ URL

| 用途 | URL 例 |
|------|--------|
| 初回統合応答（Isolate 削減） | `/api/facilities/[id]/bulk-input-bootstrap?year=&month=` |
| チャンク1 | `/api/facilities/[id]/transactions?year=&month=&limit=40` |
| resume（小ピーク複数） | `/api/facilities/[id]/transactions?resume=1&limit=40&afterTransactionDate=&afterTransactionId=` |

### 取引登録（wallTime 再計測）

登録後に **`GET …/api/dashboard?…&_invalidate=` がまとめて入力行から出ていないこと**、および **`POST …/api/transactions` の wallTime が Prisma 時の数十秒級でないこと**を確認する。

| 用途 | URL 例 |
|------|--------|
| 単件登録 | `POST /api/transactions` |
| まとめて行入力・一括 | `POST /api/transactions/batch` |
| 訂正マーク | `PATCH /api/transactions/{id}` |

### Prisma 残存 3 API（resident-summaries / dashboard / facilities GET）

**デプロイ前後**：同一施設・同一 `year`/`month` で **施設合計・ユニット合計・各ユニットの利用者並び／残高**・**ダッシュボード合計**・**施設一覧並び**のハードコピーを比較（計画書 T1–T9）。**Neon が冷え直後**も1回ログに残すと解釈しやすい。

| 用途 | URL 例 |
|------|--------|
| 施設詳細・ユニット利用者一覧 | `/api/facilities/{id}/resident-summaries?year=&month=&unitId=` |
| トップ／選択後ダッシュボード | `/api/dashboard?year=&month=` および `facilityId=` あり |
| 施設一覧（Sidebar／マスタ） | `/api/facilities`、必要なら `?includeInactive=true` |

**手動回帰（概要）**：T1 施設詳細サマリ一致 / T2 ユニット A→B→A で並び・残高一致 / T3 空ユニット / T4 不正 unitId 404 / T5 ダッシュボード合計 / T6 施設一覧並び / T7 マスタ施設タブ / T8 利用者詳細から登録後 dashboard 更新 / T9 Cloudflare wallTime が冷え以外で ~30s から改善。

### 記録テンプレート（行を複製して日付単位で追記）

| 記録日時 (JST など) | 操作手順概要 | URL / 名前 | outcome (200 / 503 等) | cpuTime メモ | exceededCpu メモ |
|---------------------|----------------|-------------|-------------------------|----------------|------------------|
| （例） | 同一施設・同一月・プレビュー | `/api/print/deposit-statement` | | | |
| （例） | フォームでまとめて入力へ遷移 | `/api/facilities/{id}/bulk-input-bootstrap` | | | |
| （例） | 取引が多い月の resume 1 回 | `/api/facilities/{id}/transactions?resume=1` | | | |
| （例） | まとめて入力で単件登録 | `POST /api/transactions` | | | |
| （例） | まとめて入力で一括登録 | `POST /api/transactions/batch` | | | |
| （例） | まとめて入力で訂正マーク | `PATCH /api/transactions/{id}` | | | |
| （例） | 施設詳細でユニット切替 1回 | `/api/facilities/{id}/resident-summaries` | | | |
| （例） | トップでダッシュボード読み込み | `GET /api/dashboard` | | | |
| （例） | Sidebar 初期の施設一覧 | `GET /api/facilities` | | | |

**備考**: 同一 Isolate で Sidebar などと重なると **cpu が合算**されやすいため、ログ上では「単体 API」のcpuより **操作単位での再現**が重要です。
