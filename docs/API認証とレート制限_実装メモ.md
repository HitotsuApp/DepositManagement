# API 認証とレート制限 — 実装メモ

作成日: 2026-06-10  
目的: 再稼働前の Bot 対策（未認証 API 直叩きの防止と異常連打の抑制）

---

## 実装内容

### 1. API セッション認証（401）

| パス | 未ログイン時の挙動 |
|------|-------------------|
| `/api/auth/*` | 従来どおり（ログイン可能） |
| その他 `/api/*` | **401 JSON** `{ error: "Unauthorized" }` |
| ページ（`/facilities/...` 等） | 従来どおり **signin へリダイレクト** |

- ブラウザの `fetch` は同一オリジンで **セッション Cookie が自動送信** されるため、ログイン済み利用者の UX は変わらない。
- API に HTML リダイレクトは **しない**（JSON パースエラー防止）。

変更ファイル: `middleware.ts`

### 2. レート制限（150 リクエスト/分/IP）

| 項目 | 値 |
|------|-----|
| 上限 | **150 本/分/IP**（`lib/apiRateLimit.ts` の `API_RATE_LIMIT_PER_MINUTE`） |
| 対象 | `/api/*`（**`/api/auth/*` は除外**） |
| 超過時 | **429** `{ error: "Too Many Requests" }` + `Retry-After: 60` |
| 実装 | Cloudflare Edge の `caches.default`（固定 60 秒窓） |
| ローカル `npm run dev` | caches 非対応時は **fail-open**（制限なし） |

想定根拠（1人運用）:

- まとめて入力 最大施設 307 件 ≒ **6〜7 本/回**
- 当月＋前月 ≒ **2倍** → **~30 本/分** 想定
- 他 API **~60 本/分**
- 余裕を見て **150 本/分**

---

## デプロイ後の確認

1. **未ログイン**で `GET /api/dashboard` → **401**
2. **ログイン後**でまとめて入力（最大施設）→ **resume 含め 429 なし**
3. Cloudflare ログで **401/429** の急増がないか（Bot 抑制の確認）
4. 正規利用で **429** が出たら `API_RATE_LIMIT_PER_MINUTE` を引き上げ

---

## 定数の変更場所

```
lib/apiRateLimit.ts  → API_RATE_LIMIT_PER_MINUTE = 150
```

---

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `middleware.ts` | API 401 / 429、ページリダイレクト |
| `lib/apiRateLimit.ts` | IP 抽出・レート制限 |
| `auth.config.ts` | `@hitotsunokai.jp` ドメイン制限（変更なし） |
