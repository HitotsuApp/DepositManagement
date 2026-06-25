# 公開空床 API × WordPress 連携仕様

預り金管理システムの空床数を、ホームページ（WordPress）の `vacantroom.html` 相当ページへ自動反映するための仕様書です。  
委託先（WordPress 開発）・社内（預り金管理）双方の参照用です。

---

## 1. 概要

| 項目 | 内容 |
|------|------|
| 目的 | HP に「施設名 ◯室 空き」を掲載（手入力を廃止） |
| データ源 | 預り金管理の施設マスタ（ユニット定員 + 在籍利用者数） |
| 更新頻度 | **1日1回**（目安: 朝 9:00 JST）。WordPress cron が API を呼ぶ |
| 個人情報 | **返却しない**（施設名・空床数・更新日時のみ） |
| HTML テンプレート | ローカル `vacantroom.html`（リポジトリ非公開） |
| WordPress 固定設定 | `docs/vacancy-hp-facility-config.json` |

---

## 2. 預り金管理側 API

### エンドポイント

```
GET /api/public/vacancy
```

### 認証

| 方式 | 値 |
|------|-----|
| 推奨 | `Authorization: Bearer {VACANCY_API_KEY}` |
| 代替 | `X-API-Key: {VACANCY_API_KEY}` |

キー未設定・不一致 → `401 Unauthorized`  
環境変数 `VACANCY_API_KEY` 未設定 → `503`

**他 API との違い**

- `/api/public/vacancy` のみ **Google ログイン不要**（middleware で除外）
- 他の `/api/*` は従来どおり **ログイン必須**
- レート制限: **10 回/分/IP**（一般 API の 150 回/分より厳しい）

### レスポンス（JSON / UTF-8）

```json
{
  "updatedAt": "2026-06-23T00:00:05.123Z",
  "updateDateLabel": "６月２３日",
  "facilities": [
    { "id": 10, "name": "特別養護老人ホーム　オ・サーバaioi", "vacancy": 2 },
    { "id": 6, "name": "特別養護老人ホーム　自由の杜", "vacancy": 1 },
    { "id": 1, "name": "ケアハウスあいおい苑", "vacancy": 0 }
  ]
}
```

| フィールド | 説明 |
|------------|------|
| `updatedAt` | 集計実行時刻（ISO 8601 / UTC） |
| `updateDateLabel` | JST の更新日ラベル（全角数字。「６月２３日」形式）。**HP タイトルにそのまま使用可** |
| `facilities[].id` | 預り金管理の施設 ID（**WordPress 側のキー**） |
| `facilities[].name` | 施設マスタの名称（**HP のリンクテキストにそのまま使用可**） |
| `facilities[].vacancy` | 施設合計の空床数（整数） |

### 空床数の計算（所属一覧ボードと同一）

- 対象: `isActive = true` の施設・ユニット
- 定員: ユニットの `capacity` が設定されているもののみ
- 在籍者: `isActive = true` かつ `endDate IS NULL`
- 除外: 名前が「空床」または数字のみの仮想利用者
- 式: `max(0, 定員 − 実利用者数)` をユニットごとに合算

### キャッシュ（預り金管理側）

- `Cache-Control: public, s-maxage=86400`（24時間）

### 環境変数（Cloudflare Pages）

```
VACANCY_API_KEY=（十分長いランダム文字列）
```

---

## 3. WordPress 側の処理

### 3.1 毎朝 cron（9:00 JST 目安）

1. `GET https://{預り金管理ドメイン}/api/public/vacancy` を **サーバー PHP から** 1 回実行
2. API キーをヘッダーに付与
3. 成功時: JSON 全体を transient（例: `facility_vacancy_cache`）に **24 時間**保存
4. **`facilities` を `id` をキーにした連想配列に変換**して保存すると参照が容易

```php
// 例
$byId = [];
foreach ($data['facilities'] as $f) {
  $byId[(int) $f['id']] = $f;
}
```

5. **タイトル日付**は `updateDateLabel` を保存（cron 成功時のみ更新）

### 3.2 ページ表示

- ショートコード（例: `[vacant_room_info]`）が transient + 固定設定（`vacancy-hp-facility-config.json` 相当）を読み、HTML を出力
- 各施設行: **固定設定の `facilityId`** で API データを引く

```php
// 例
$id = 10;
$name = $byId[$id]['name'];      // API から施設名
$vacancy = $byId[$id]['vacancy']; // API から空床数
$url = $hpConfig[$id]['url'];     // WordPress 固定設定
$location = $hpConfig[$id]['location'];
```

### 3.3 プレースホルダー（`vacantroom.html`）

| プレースホルダー | 置換元 |
|------------------|--------|
| `{{UPDATE_DATE}}` | API `updateDateLabel` |
| `{{FACILITY_NAME:10}}` | API `facilities` の `id=10` の `name` |
| `{{ROOM_COUNT:10}}` | 同上の `vacancy` から生成（後述） |

**タイトル例（自動生成後）**

```html
<h1>【６月２３日更新】ひとつの会 施設空き情報のご案内【毎日９時更新】</h1>
```

### 3.4 空き数の表示文言

| vacancy | 表示 |
|---------|------|
| `> 0` | `{N}室 空き` |
| `= 0` | `空き無し` |

### 3.5 空きあり / 空き無し セクションの振り分け（自動）

**静的 HTML の並びは参考のみ。** 実装時は `vacancy` に応じてリストを組み替える。

| vacancy | 掲載セクション |
|---------|----------------|
| `> 0` | 🟢 空きあり |
| `= 0` | 🔴 空き無し（待機・ご相談受付中） |

### 3.6 区分ごとの「空きあり」が 0 件のとき

区分内に `vacancy > 0` の施設が 1 件もない場合:

```html
<li style="...">現在、空き室はございません</li>
```

---

## 4. 施設マスタ（預り金管理・確定）

| facilityId | 施設名（API `name` として返る） | HP 掲載 |
|------------|----------------------------------|---------|
| 1 | ケアハウスあいおい苑 | ○ |
| 2 | グループホーム　笑生苑 | ○ |
| 3 | グループホーム　湯田あいおい苑 | ○ |
| 4 | グループホーム　徳佐あいおい苑 | ○ |
| 5 | グループホーム　徳地あいおい苑 | ○ |
| 6 | 特別養護老人ホーム　自由の杜 | ○ |
| 7 | グループホーム　自由の杜 | ○ |
| 8 | 特別養護老人ホーム　Filage開出 | ○ |
| 9 | グループホーム　Filage開出 | ×（現状未掲載） |
| 10 | 特別養護老人ホーム　オ・サーバaioi | ○ |
| 11 | サ高・ショートステイ　オ・サーバaioi | ×（現状未掲載） |

---

## 5. HP 掲載施設の固定設定（WordPress 側）

施設名は **API から取得**するため、WordPress 側で名前を手入力する必要はありません。  
以下は **facilityId ごとに固定**する項目です（`docs/vacancy-hp-facility-config.json` 参照）。

| facilityId | 区分 | 所在地 | HP URL |
|------------|------|--------|--------|
| 10 | 特養 | （山口市下小鯖） | `/facilities/tokuyo-oserver-aioi` |
| 6 | 特養 | （防府市大崎） | `/facilities/tokuyo-jiyunomori/` |
| 8 | 特養 | （防府市開出西町） | `/facilities/tokuyo-filage-kaide/` |
| 1 | ケアハウス | （防府市佐野） | `/facilities/carehouse-aioien/` |
| 3 | GH | （山口市下市町） | `/facilities/grouphome-yuda-aioien` |
| 5 | GH | （山口市徳地） | `/facilities/grouphome-tokuji-aioien/` |
| 7 | GH | （防府市大崎） | `/facilities/grouphome-jiyunomori/` |
| 2 | GH | （防府市佐野） | `/facilities/grouphome-shoseien` |
| 4 | GH | （山口市阿東徳佐） | `/facilities/grouphome-tokusa-aioien/` |

---

## 6. 自動 / 手動の分担

### 自動（API + WordPress cron）

| 項目 |
|------|
| **施設名**（`facilities[].name`） |
| 各施設の空床数（`vacancy`） |
| 空き表示文言（「N室 空き」「空き無し」） |
| 空きあり / 空き無し セクションへの振り分け |
| タイトルの更新日（`updateDateLabel`） |
| 区分内「現在、空き室はございません」の出し分け |

### 手動（WordPress 固定設定）

| 項目 |
|------|
| 所在地（`（山口市…）`） |
| HP リンク URL |
| 特養 / ケアハウス / GH の区分と表示順 |
| 対象者バッジ・お問い合わせブロック |
| CSS・レイアウト |
| **facilityId** と上記固定項目の対応（JSON 設定） |
| API URL・API キー |

### 不要

| 項目 |
|------|
| 施設名の手入力・名称突合 |
| ユニット内訳 |

---

## 7. データの流れ

```
[朝9時 JST]
WordPress cron
  → GET /api/public/vacancy
  → facilities を id キーで保存
  → updateDateLabel を保存

[ページ表示]
facilityId=10 の行
  → name     = API facilities[10].name
  → vacancy  = API facilities[10].vacancy
  → url      = 固定設定
  → location = 固定設定
```

---

## 8. エラー時

| 状況 | 推奨動作 |
|------|----------|
| API 取得失敗 | 前回成功分の transient を表示 |
| 特定 id が API に無い | その行を非表示 or ログ |
| API キー誤り | 401。前回キャッシュを維持 |

---

## 9. 委託先への依頼文（コピー用）

> 空床情報ページを API 連動に変更します。  
> 毎朝 9 時頃（JST）、サーバー cron から API を 1 回 GET し、JSON を 24 時間キャッシュしてください。  
> **施設名と空床数は API の `facilities[].id` で引いてください**（名称の手入力は不要）。  
> WordPress 側は `facilityId` ごとに URL・所在地・区分のみ固定設定してください（`docs/vacancy-hp-facility-config.json` 参照）。  
> タイトル日付は API の `updateDateLabel` を使用してください。  
> 空床数に応じて「空きあり」「空き無し」セクションへ振り分けてください。

---

## 10. 関連ファイル

| ファイル | 内容 |
|----------|------|
| `docs/gas/vacancy-sheet/Code.gs` | スプレッドシート用 GAS（API 同期・HP JSON 出力） |
| `docs/gas/vacancy-sheet/README.md` | GAS セットアップ手順 |
| `docs/vacancy-hp-facility-config.json` | WordPress 固定設定（facilityId ↔ URL・所在地・区分） |
| `app/api/public/vacancy/route.ts` | 公開 API |
| `lib/publicVacancySql.ts` | 空床集計 SQL |
| `lib/vacancy.ts` | 日付ラベル等 |

---

## 11. スプレッドシート経由（人手補正あり・推奨）

```
預り金 API → GAS（7:00）→ シート C/D/E → F=C+E
                              ↓ 人が E を編集
GAS Web App → WordPress cron（9:00）→ HP 表示
```

- HP 表示値は **`hpFacilities[].vacancy`（F列）**
- API の C が D と異なって更新された行は **E を自動クリア**
- 詳細: `docs/gas/vacancy-sheet/README.md`

---

## 12. 未決事項

- [ ] 本番 `VACANCY_API_KEY` の発行と WordPress への受け渡し
- [ ] 本番 API URL の確定
- [ ] WordPress サーバー cron の設定（9:00 JST）
- [ ] 各ユニットの定員数が施設マスタに入っているか確認
- [ ] GAS Web App URL を WordPress 委託先へ共有
- [x] GAS から API 取得時 403 → `/api/public/vacancy` を geo 除外（middleware）
