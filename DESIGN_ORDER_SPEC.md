# 表示順・印刷順の設計仕様

本ドキュメントは、各画面・機能における表示順・印刷順の設計をまとめたものです。

**2026年3月更新**: 表示順・印刷順のカスタマイズ機能を実装。マスタに displaySortOrder, printSortOrder を追加し、施設設定で切り替え可能に。

---

## 1. まとめて印刷機能の預り金明細書の印刷順

**現状の設計**: **明示的な順序指定なし（DBの取得順）**

- **実装箇所**: `app/api/print/batch-print/route.ts`
- **処理**: `facility.residents.map()` で各利用者の明細書を生成
- **順序**: Prisma の `include` で residents を取得する際、`orderBy` が指定されていない
- **結果**: PostgreSQL のデフォルトでは主キー（id）順で返されることが多いが、**仕様として保証されていない**

```typescript
// batch-print/route.ts 29-41行目
residents: {
  where: { isActive: true, endDate: null },
  include: { transactions: {...}, unit: true },
  // orderBy なし
}
```

---

## 2. 施設詳細画面の利用者別残高カードの表示順

**現状の設計**: **明示的な順序指定なし（DBの取得順）**

- **実装箇所**: `app/api/facilities/[id]/route.ts`
- **処理**: `facility.residents` を `displayResidents` としてそのまま使用し、`residentSummaries` に変換
- **順序**: residents の `select` に `orderBy` が指定されていない
- **結果**: まとめて印刷と同様、**仕様として保証されていない**（実質的には id 順の可能性が高い）

```typescript
// facilities/[id]/route.ts 46-65行目
residents: {
  where: {...},
  select: { id, name, unitId, transactions: {...} },
  // orderBy なし
}
```

---

## 3. 施設詳細画面のユニットのカードの表示順

**現状の設計**: **ユニット名の昇順（50音順）**

- **実装箇所**: `app/api/facilities/[id]/route.ts`
- **処理**: `facility.units` を取得
- **順序**: `orderBy: { name: 'asc' }` が指定されている

```typescript
// facilities/[id]/route.ts 34-44行目
units: {
  where: { isActive: true, facilityId: facilityId },
  select: { id: true, name: true },
  orderBy: { name: 'asc' },  // ← 名前昇順
}
```

---

## 4. 利用者詳細の前後機能で遷移する順

**現状の設計**: **利用者名の昇順（50音順）**

- **実装箇所**: `app/api/residents/route.ts`（利用者一覧API）
- **利用箇所**: 
  - 利用者詳細画面 (`app/residents/[id]/page.tsx`)
  - 印刷プレビュー画面（利用者タイプ時）(`app/print/preview/page.tsx`)
- **処理**: `fetchResidentsList` で `/api/residents?facilityId=xxx` を呼び出し、返却された順序で前後を計算
- **順序**: `orderBy: { name: 'asc' }` が指定されている

```typescript
// residents/route.ts 46行目
orderBy: { name: 'asc' },  // ← 名前昇順
```

```typescript
// residents/[id]/page.tsx 167-176行目
const currentIndex = sortedResidents.findIndex((r) => r.id === residentId)
// currentIndex - 1 が「前」、currentIndex + 1 が「次」
```

---

## まとめ

| 対象 | 順序 | 明示的指定 |
|------|------|------------|
| まとめて印刷の預り金明細書 | 未保証（実質 id 順の可能性） | なし |
| 施設詳細の利用者別残高カード | 未保証（実質 id 順の可能性） | なし |
| 施設詳細のユニットカード | **名前昇順** | `orderBy: { name: 'asc' }` |
| 利用者詳細の前後遷移 | **名前昇順** | `orderBy: { name: 'asc' }` |

---

## 設計上の注意点

- **一貫性**: 施設詳細の利用者カードとまとめて印刷の明細書順は、利用者詳細の前後遷移（名前順）と**異なる**設計になっている
- **統一を検討する場合**: 利用者に関する表示順を名前順に統一するなら、以下に `orderBy` を追加する必要がある
  - `app/api/print/batch-print/route.ts` の residents
  - `app/api/facilities/[id]/route.ts` の residents
  - （ユニット別に並べる場合は `orderBy: [{ unitId: 'asc' }, { name: 'asc' }]` など）
