# wallTime 削減（Prisma GET → Neon HTTP）検証チェックリスト

本番またはステージングでデプロイ後、**変更前スクショ／JSON と突き合わせ**しつつ確認する。Cloudflare での **wallTime** 記録は [Cloudflare_パフォーマンス再計測チェックリスト](./Cloudflare_パフォーマンス再計測チェックリスト.md) に追記する。

---

## PR1: `GET /api/residents/[id]?year=&month=`（`lib/residentDetailSql.ts`）

| ID | 確認内容 |
|----|----------|
| R1 | 利用者詳細: **対象月の明細並び・各行 balance・画面上部の残高**が変更前と一致する |
| R2 | **前月より繰越**（仮想行・`id: -1` 相当／金額・符号・行の有無）が変更前と一致する |
| R3 | 訂正区分: **`correct_in` / `correct_out` が残高に反映されない**・**`past_correct_*` は反映される**ことを既知データで確認 |
| R4 | `/print/preview` で同一利用者・同一 `year`/`month` の明細プレビューが変更前と一致する |
| R5 | 取引を登録・訂正したあとに明細が更新される（`invalidateCache` や再 fetch の経路含む） |
| R6 | Cloudflare Logs: **`GET /api/residents/{id}?year=&month=`** の wallTime。**DB 冷え直後** 1 回と **通常時** 1 回をメモ |

**URL 例**: `/api/residents/8?year=2026&month=5`（適宜 ID と年月を置換）

---

## PR2: マスタ系 GET

| 対象 | 確認ポイント |
|------|----------------|
| `GET /api/units`（全域・施設別・`includeInactive`） | 並び (`displaySortOrder` NULLS LAST, `id`)、レスポンス形（施設別時は **`facility` キー無し**、全域時は **`facility: { id, name }`**） |
| `GET /api/residents`（**`facilityId` なし**） | Prisma と同様の **facility / unit ネスト**・並び・日付フィールドが ISO 文字列であること |

---

## PR3: 施設マスタ・預り金明細印刷データ

| 対象 | 確認ポイント |
|------|----------------|
| `GET /api/facilities/[id]`（**`year`/`month` 無し**） | 一覧 API の `GET /api/facilities` 行と同じフィールドセット・値が一致すること（単体取得） |
| `GET /api/print/resident-statement` | PDF プレビュー／印刷結果の **施設名・ユニット名・お知らせ・繰越・当月明細**が変更前と一致すること |

---

## PR4（任意・本実装では据え置き）

| API | 方針 |
|-----|------|
| `GET /api/print/family-resident-statement` | **Prisma のまま**。ログで wallTime が依然ボトルネックな場合に別 PR で設計する |
| `GET /api/print/cash-verification` | 同上。**`facility.findUnique`** および `$queryRaw` の混在があるため変更は PR3 の対象外とした |
