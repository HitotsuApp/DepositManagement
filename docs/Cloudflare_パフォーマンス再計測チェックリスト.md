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
