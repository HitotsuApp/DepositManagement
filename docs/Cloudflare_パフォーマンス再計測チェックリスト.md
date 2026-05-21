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
| フェーズ 4 | **Sidebar**: `/print` 配下では先読み抑制・`requestIdleCallback` で待機。現金確認先読みは `GET /api/facilities/[id]?year=…&month=…` に集約。**施設詳細**: まとめて入力のホバー先読みは idle 後に実行し、`Promise.all` で API 並列数を抑制。 |

### 記録テンプレート（行を複製して日付単位で追記）

| 記録日時 (JST など) | 操作手順概要 | URL / 名前 | outcome (200 / 503 等) | cpuTime メモ | exceededCpu メモ |
|---------------------|----------------|-------------|-------------------------|----------------|------------------|
| （例） | 同一施設・同一月・プレビュー | `/api/print/deposit-statement` | | | |

**備考**: 同一 Isolate で Sidebar などと重なると **cpu が合算**されやすいため、ログ上では「単体 API」のcpuより **操作単位での再現**が重要です。
