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
| ページ（正当なアプリパスのみ） | **signin へリダイレクト** |
| ページ（スキャン・未知パス） | **404**（signin へ誘導しない） |
| 海外 IP（`cf-ipcountry` ≠ JP） | **403** |

- ブラウザの `fetch` は同一オリジンで **セッション Cookie が自動送信** されるため、ログイン済み利用者の UX は変わらない。
- API に HTML リダイレクトは **しない**（JSON パースエラー防止）。

変更ファイル: `middleware.ts`

### 2. レート制限（業務 API: 150 リクエスト/分/IP）

| 項目 | 値 |
|------|-----|
| 上限 | **150 本/分/IP**（`API_RATE_LIMIT_PER_MINUTE`） |
| 対象 | `/api/*`（**`/api/auth/*` は除外**） |
| 超過時 | **429** + `Retry-After: 60` |
| 実装 | Cloudflare Edge の `caches.default`（固定 60 秒窓） |
| ローカル `npm run dev` | caches 非対応時は **fail-open**（制限なし） |

想定根拠（1人運用）:

- まとめて入力 最大施設 307 件 ≒ **6〜7 本/回**
- 当月＋前月 ≒ **2倍** → **~30 本/分** 想定
- 他 API **~60 本/分**
- 余裕を見て **150 本/分**

### 3. signin 専用レート制限（2 リクエスト/分/IP）

| 項目 | 値 |
|------|-----|
| 上限 | **2 本/分/IP**（`SIGNIN_RATE_LIMIT_PER_MINUTE`） |
| 対象 | `/api/auth/signin` および `/api/auth/signin/*`（例: `signin/google`） |
| **除外** | `/api/auth/callback/*`（OAuth コールバック） |
| その他 `/api/auth/*` | 制限なし（`session` 等） |

Bot ダッシュボードで `/api/auth/signin` への連打が多かったため、業務 API とは **別カウンタ（bucket: `signin`）** で厳しめに制限。

### 4. エッジ Bot 対策（403 / 404 早期返却）

| 条件 | 挙動 | 目的 |
|------|------|------|
| `cf-ipcountry` が JP 以外 | **403** | BR/NL 等からのスキャンを 1 本で遮断 |
| `symfony/`, `.gz`, `.sql` 等のプローブパス | **404** | スキャナ向けパスを即拒否 |
| 許可リスト外のページパス | **404** | 未知パスを signin に流さない（307+429 の 2 本消費を防止） |

**ログの読み方**: `/api/auth/signin` が **429** なら signin 制限は効いている。  
問題は `/symfony/tls.gz` 等が **307** で Worker を消費していた点 → 上記で **403 または 404（1 本）** に変更。

変更ファイル: `lib/edgeSecurity.ts`, `middleware.ts`

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
lib/apiRateLimit.ts  → SIGNIN_RATE_LIMIT_PER_MINUTE = 2
```

---

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `middleware.ts` | API 401 / 429、geo 403、ページ 404/リダイレクト |
| `lib/apiRateLimit.ts` | IP 抽出・レート制限 |
| `lib/edgeSecurity.ts` | 国別ブロック・プローブ検知・許可ページ判定 |
| `auth.config.ts` | `@hitotsunokai.jp` ドメイン制限（変更なし） |
