# 表示順・印刷順 実装計画

## 概要

ユニット・利用者に表示順・印刷順を追加し、施設マスタで切り替え可能にする機能の実装計画。

---

## 変更対象の整理

| マスタ | 追加項目 | 既存 |
|-------|----------|------|
| Facility | useSameOrderForDisplayAndPrint, useUnitOrderForPrint | sortOrder |
| Unit | displaySortOrder, printSortOrder | - |
| Resident | displaySortOrder, printSortOrder | - |

---

## Phase 1: スキーマ・マイグレーション

### 1.1 Prisma スキーマ変更

**ファイル**: `prisma/schema.prisma`

```prisma
model Facility {
  // 既存フィールド...
  useSameOrderForDisplayAndPrint Boolean @default(true)   // true: 表示順を印刷にも使用
  useUnitOrderForPrint           Boolean @default(true)   // true: 印刷時にユニット順を適用
}

model Unit {
  // 既存フィールド...
  displaySortOrder Int?  // 表示順（NULL=従来通りid順）
  printSortOrder   Int?  // 印刷順（NULL=従来通りid順）
}

model Resident {
  // 既存フィールド...
  displaySortOrder Int?  // 表示順（NULL=従来通りid順）
  printSortOrder   Int?  // 印刷順（NULL=従来通りid順）
}
```

### 1.2 マイグレーション

```bash
npx prisma migrate dev --name add_sort_order_fields
```

- 既存データは NULL のまま（従来通りの挙動を維持）

---

## Phase 2: バリデーション

### 2.1 数値専用バリデーション追加

**ファイル**: `lib/validation.ts`

- `validateSortOrder(value: unknown): number | null` を追加
  - 整数のみ許可、負の数は許可するか要検討（通常は0以上の整数）
  - 空文字・null は null を返す（未設定として扱う）

---

## Phase 3: API 変更

### 3.1 施設 API

**ファイル**: `app/api/facilities/route.ts`, `app/api/facilities/[id]/route.ts`

- GET: `useSameOrderForDisplayAndPrint`, `useUnitOrderForPrint` をレスポンスに含める
- PUT: 上記2項目の更新を受け付ける

### 3.2 ユニット API

**ファイル**: `app/api/units/route.ts`, `app/api/units/[id]/route.ts`

- GET: `displaySortOrder`, `printSortOrder` をレスポンスに含める
- POST/PUT: 上記2項目の受け付け、数値バリデーション

### 3.3 利用者 API

**ファイル**: `app/api/residents/route.ts`, `app/api/residents/[id]/route.ts`

- GET: `displaySortOrder`, `printSortOrder` をレスポンスに含める
- POST/PUT: 上記2項目の受け付け、数値バリデーション

### 3.4 施設詳細 API（表示順の適用）

**ファイル**: `app/api/facilities/[id]/route.ts`

- 施設設定 `useSameOrderForDisplayAndPrint` を取得
- **ユニットの表示順**:
  - `ORDER BY displaySortOrder ASC NULLS LAST, id ASC`
  - （useSameOrderForDisplayAndPrint が true の場合、printSortOrder は使わない）
- **利用者の表示順**:
  - 同上 `ORDER BY displaySortOrder ASC NULLS LAST, id ASC`
  - ユニットで絞り込み時も同様

※ Prisma の include では orderBy がネストで指定可能。residents に orderBy を追加する。

### 3.5 まとめて印刷 API（印刷順の適用）

**ファイル**: `app/api/print/batch-print/route.ts`

- 施設の `useSameOrderForDisplayAndPrint`, `useUnitOrderForPrint` を取得
- 利用者・ユニットを取得後、**アプリケーション側でソート**（Prisma の include では複雑なソートが難しいため）

**ソートロジック**:
```
if (useSameOrderForDisplayAndPrint) {
  // 表示順を印刷にも使用
  residentSortKey = displaySortOrder
  unitSortKey = displaySortOrder
} else {
  residentSortKey = printSortOrder
  unitSortKey = printSortOrder
}

if (useUnitOrderForPrint) {
  // ユニット順 → 利用者順（階層的）
  residents を (unit.unitSortKey, resident.residentSortKey, id) でソート
} else {
  // 利用者順のみ（フラット）
  residents を (resident.residentSortKey, id) でソート
}
```

### 3.6 出納帳・預り金報告書 API（印刷順の適用）

**ファイル**: `app/api/print/deposit-statement/route.ts`

- 同上、施設設定を取得し、unitSummaries と transactions の並び順を制御
- `transformToPrintData` にソート済みの facility を渡すか、transform 内でソートするか要検討

### 3.7 利用者一覧 API（前後遷移用）

**ファイル**: `app/api/residents/route.ts`

- 施設詳細の表示順と一致させるため、`displaySortOrder` でソート
- `ORDER BY displaySortOrder ASC NULLS LAST, id ASC`
- 施設ID指定時は、その施設の useSameOrderForDisplayAndPrint に応じて displaySortOrder を使用

※ 利用者一覧は施設横断で取得する場合もある（facilityId なし）→ その場合は id 順でよい

---

## Phase 4: データ変換層（transform）

**ファイル**: `pdf/utils/transform.ts`

- `transformToPrintData` が受け取る facility の residents, units は**呼び出し元でソート済み**とする
- batch-print, deposit-statement の API でソートしてから transform に渡す
- transform 内の変更は最小限

---

## Phase 5: マスタ管理 UI

### 5.1 施設マスタ

**ファイル**: `app/master/page.tsx`

- 施設編集モーダルに追加:
  - 「表示順と印刷順を同じにする」チェックボックス（useSameOrderForDisplayAndPrint）
  - 「印刷時にユニット順を適用する」チェックボックス（useUnitOrderForPrint）
- デフォルトは両方 true（従来の階層的表示を維持）

### 5.2 ユニットマスタ

**ファイル**: `app/master/page.tsx`

- ユニット編集モーダルに追加:
  - 表示順（displaySortOrder）: 数値入力、空欄可
  - 印刷順（printSortOrder）: 数値入力、空欄可
- 施設の「表示順と印刷順を同じにする」が true の場合、印刷順は非表示または無効化するか？→ 施設設定に従い、印刷順は保存しておき切り替え時に使う

### 5.3 利用者マスタ

**ファイル**: `app/master/page.tsx`

- 利用者編集モーダルに追加:
  - 表示順（displaySortOrder）: 数値入力、空欄可
  - 印刷順（printSortOrder）: 数値入力、空欄可
- 同上、施設設定で印刷順の表示を切り替えるかは要検討

### 5.4 入力制限

- type="number" で整数のみ
- または inputMode="numeric" + pattern で数字のみ許可
- バリデーション: 空欄は許可、入力時は整数のみ（小数点・文字は拒否）

---

## Phase 6: ドラッグ＆ドロップでの並び替え（オプション）

- マスタ一覧でドラッグで並び替え可能にすると UX が向上
- 既存の施設マスタには「上へ」「下へ」ボタンあり（handleReorderFacility）
- ユニット・利用者にも同様の並び替え UI を追加可能
- Phase 5 で数値入力のみでも実装可能なため、優先度は低め

---

## 実装順序（推奨）

| 順番 | Phase | 内容 | 依存 |
|------|-------|------|------|
| 1 | Phase 1 | スキーマ・マイグレーション | - |
| 2 | Phase 2 | バリデーション | - |
| 3 | Phase 3.1〜3.3 | 各マスタ API の CRUD 対応 | Phase 1, 2 |
| 4 | Phase 5 | マスタ管理 UI | Phase 3 |
| 5 | Phase 3.4 | 施設詳細 API の表示順 | Phase 1 |
| 6 | Phase 3.5, 3.6 | 印刷 API の印刷順 | Phase 1 |
| 7 | Phase 3.7 | 利用者一覧 API（前後遷移） | Phase 1 |
| 8 | Phase 4 | transform の調整（必要に応じて） | Phase 6 |

---

## テスト観点

- [ ] 既存データ（sortOrder が NULL）で従来通りの表示・印刷になること
- [ ] 表示順を設定した場合、施設詳細・利用者一覧の前後で正しく並ぶこと
- [ ] 印刷順を設定し、施設で「別にする」にした場合、印刷順が反映されること
- [ ] 「ユニット順をオフ」にした場合、ユニットを飛び越えた印刷順になること
- [ ] 数値以外を入力した場合、バリデーションエラーになること
- [ ] 空欄の場合は NULL として保存され、従来通りになること

---

## 注意事項

1. **Unit の unitId**: Resident は unitId が必須。unitId が null のユニット（未所属）は現状スキーマにないため考慮不要。
2. **キャッシュ**: 施設詳細 API 等でキャッシュヘッダーを設定しているため、sortOrder 変更後の即時反映を確認すること。
3. **インポート**: 初期データインポートに displaySortOrder, printSortOrder の列を追加するかは別途検討。
