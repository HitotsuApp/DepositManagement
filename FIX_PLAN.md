# 預り金管理システム 修正計画書

## 1. 概要

本ドキュメントは、機能テストおよびセキュリティテストの結果から抽出された推奨事項を基に、システムの改善・修正計画をまとめたものです。

## 2. 推奨事項の一覧

### 2.1 機能テストから抽出された推奨事項

| ID | 項目名 | 優先度 | カテゴリ | 出典 |
|----|--------|--------|----------|------|
| FIX-001 | 日付バリデーションの強化 | Medium | バリデーション | ISSUE-001 |
| FIX-002 | 数値変換のエラーハンドリング | Medium | エラーハンドリング | ISSUE-002 |
| FIX-003 | エラーメッセージの改善 | Low | エラーハンドリング | ISSUE-003 |
| FIX-004 | ログの改善 | 改善推奨 | 運用 | 推奨事項 |
| FIX-005 | テストの自動化 | 改善推奨 | 品質保証 | 推奨事項 |

### 2.2 セキュリティテストから抽出された推奨事項

| ID | 項目名 | 優先度 | カテゴリ | 出典 |
|----|--------|--------|----------|------|
| FIX-SEC-001 | 入力長制限の実装 | Medium | セキュリティ | ISSUE-SEC-001 |
| FIX-SEC-002 | エラーメッセージの詳細度 | Low | セキュリティ | ISSUE-SEC-002 |
| FIX-SEC-003 | CSP (Content Security Policy) の設定 | 改善推奨 | セキュリティ | 推奨事項 |
| FIX-SEC-004 | 入力バリデーションの強化 | 改善推奨 | セキュリティ | 推奨事項 |
| FIX-SEC-005 | セキュリティログの記録 | 改善推奨 | セキュリティ | 推奨事項 |
| FIX-SEC-006 | レート制限の実装 | 改善推奨 | セキュリティ | 推奨事項 |

---

## 3. 修正計画（優先順位順）

### Phase 1: 即座に対応すべき事項（リリース前推奨）

#### FIX-001: 日付バリデーションの強化
- **優先度**: Medium
- **影響度**: Medium
- **工数見積**: 2-3時間
- **対象ファイル**:
  - `app/api/transactions/route.ts`
  - `app/residents/[id]/page.tsx`
  - `app/facilities/[id]/bulk-input/page.tsx`

**修正内容**:
1. 日付文字列の妥当性チェック関数を作成
2. `new Date()`の結果が`Invalid Date`でないことを確認
3. 無効な日付の場合、適切なエラーメッセージを返す

**実装例**:
```typescript
function isValidDate(dateString: string): boolean {
  const date = new Date(dateString)
  return !isNaN(date.getTime())
}

// 使用例
if (!isValidDate(body.transactionDate)) {
  return NextResponse.json(
    { error: '無効な日付形式です' },
    { status: 400 }
  )
}
```

**テスト項目**:
- 無効な日付文字列（例: "2024-13-45"）を入力した場合、エラーが返される
- 有効な日付文字列は正常に処理される

---

#### FIX-002: 数値変換のエラーハンドリング
- **優先度**: Medium
- **影響度**: Medium
- **工数見積**: 2-3時間
- **対象ファイル**:
  - `app/api/facilities/[id]/route.ts`
  - `app/api/residents/[id]/route.ts`
  - `app/api/units/[id]/route.ts`
  - `app/api/transactions/[id]/route.ts`
  - その他のAPIルート

**修正内容**:
1. `Number(params.id)`の結果がNaNでないことを確認
2. NaNの場合は400 Bad Requestを返す
3. 共通のバリデーション関数を作成

**実装例**:
```typescript
function validateId(id: string | null): number | null {
  if (!id) return null
  const numId = Number(id)
  if (isNaN(numId)) return null
  return numId
}

// 使用例
const facilityId = validateId(params.id)
if (!facilityId) {
  return NextResponse.json(
    { error: '無効なIDです' },
    { status: 400 }
  )
}
```

**テスト項目**:
- 数値以外のID（例: "abc"）を指定した場合、400エラーが返される
- 有効な数値IDは正常に処理される

---

#### FIX-SEC-001: 入力長制限の実装
- **優先度**: Medium
- **影響度**: Medium
- **工数見積**: 3-4時間
- **対象ファイル**:
  - `prisma/schema.prisma`
  - すべての入力フォームコンポーネント

**修正内容**:
1. Prismaスキーマに最大長を設定
2. フロントエンドの入力欄に`maxLength`属性を追加
3. API側でもバリデーションを追加

**実装例（Prismaスキーマ）**:
```prisma
model Facility {
  id                Int      @id @default(autoincrement())
  name              String   @db.VarChar(255)
  positionName      String?  @db.VarChar(100)
  positionHolderName String? @db.VarChar(100)
  // ...
}

model Unit {
  id         Int    @id @default(autoincrement())
  facilityId Int
  name       String @db.VarChar(255)
  // ...
}

model Resident {
  id         Int    @id @default(autoincrement())
  facilityId Int
  unitId     Int
  name       String @db.VarChar(255)
  // ...
}

model Transaction {
  id          Int     @id @default(autoincrement())
  // ...
  description String? @db.VarChar(1000)
  payee       String? @db.VarChar(255)
  reason      String? @db.VarChar(500)
  // ...
}
```

**実装例（フロントエンド）**:
```tsx
<input
  type="text"
  maxLength={255}
  value={formData.name}
  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
/>
```

**API側バリデーション**:
```typescript
if (body.name && body.name.length > 255) {
  return NextResponse.json(
    { error: '施設名は255文字以内で入力してください' },
    { status: 400 }
  )
}
```

**テスト項目**:
- 最大長を超える文字列を入力した場合、エラーが返される
- 最大長以内の文字列は正常に処理される

---

### Phase 2: 改善推奨事項（リリース後対応可）

#### FIX-003: エラーメッセージの改善
- **優先度**: Low
- **影響度**: Low
- **工数見積**: 2-3時間
- **対象ファイル**:
  - すべてのAPIルート

**修正内容**:
1. 環境変数で開発/本番環境を判定
2. 開発環境では詳細なエラー情報を返す
3. 本番環境では一般化されたエラーメッセージを返す

**実装例**:
```typescript
const isDevelopment = process.env.NODE_ENV === 'development'

try {
  // ...
} catch (error) {
  console.error('Failed to create transaction:', error)
  return NextResponse.json(
    {
      error: '取引の作成に失敗しました',
      ...(isDevelopment && { details: error.message })
    },
    { status: 500 }
  )
}
```

**テスト項目**:
- 開発環境では詳細なエラー情報が返される
- 本番環境では一般化されたエラーメッセージが返される

---

#### FIX-SEC-002: エラーメッセージの詳細度（セキュリティ）
- **優先度**: Low
- **影響度**: Low
- **工数見積**: FIX-003と統合可能
- **対象ファイル**:
  - すべてのAPIルート

**修正内容**:
- FIX-003と同様の対応で解決可能

---

#### FIX-004: ログの改善
- **優先度**: 改善推奨
- **影響度**: Low
- **工数見積**: 4-6時間
- **対象ファイル**:
  - すべてのAPIルート
  - ログ設定ファイル（新規作成）

**修正内容**:
1. 構造化ログライブラリの導入（例: winston, pino）
2. エラーログにコンテキスト情報を追加
3. ログレベルの設定

**実装例**:
```typescript
import logger from '@/lib/logger'

try {
  // ...
} catch (error) {
  logger.error('Failed to create transaction', {
    error: error.message,
    stack: error.stack,
    body: body,
    userId: userId, // 認証実装後
  })
  // ...
}
```

**テスト項目**:
- エラー発生時に構造化されたログが記録される
- ログに必要なコンテキスト情報が含まれる

---

#### FIX-SEC-003: CSP (Content Security Policy) の設定
- **優先度**: 改善推奨
- **影響度**: Low
- **工数見積**: 1-2時間
- **対象ファイル**:
  - `next.config.js`
  - `app/layout.tsx`（メタタグ設定）

**修正内容**:
1. Next.jsの設定でCSPヘッダーを設定
2. 必要なディレクティブを設定

**実装例（next.config.js）**:
```javascript
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline';
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https:;
      font-src 'self' data:;
    `.replace(/\s{2,}/g, ' ').trim()
  },
]

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}
```

**テスト項目**:
- CSPヘッダーが設定されていることを確認
- XSS攻撃がブロックされることを確認

---

#### FIX-SEC-004: 入力バリデーションの強化
- **優先度**: 改善推奨
- **影響度**: Low
- **工数見積**: 4-6時間
- **対象ファイル**:
  - すべてのAPIルート
  - バリデーション関数（新規作成）

**修正内容**:
1. 共通のバリデーション関数を作成
2. 正規表現による入力検証
3. 許可リスト方式の採用（必要に応じて）

**実装例**:
```typescript
// lib/validation.ts
export function validateFacilityName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: '施設名を入力してください' }
  }
  if (name.length > 255) {
    return { valid: false, error: '施設名は255文字以内で入力してください' }
  }
  // 特殊文字のチェック（必要に応じて）
  if (/[<>]/.test(name)) {
    return { valid: false, error: '施設名に使用できない文字が含まれています' }
  }
  return { valid: true }
}
```

**テスト項目**:
- 各入力欄で適切なバリデーションが実行される
- 不正な入力が拒否される

---

#### FIX-SEC-005: セキュリティログの記録
- **優先度**: 改善推奨
- **影響度**: Low
- **工数見積**: 3-4時間
- **対象ファイル**:
  - すべてのAPIルート
  - セキュリティログ関数（新規作成）

**修正内容**:
1. 不正な入力の試みをログに記録
2. セキュリティ監視の強化

**実装例**:
```typescript
import securityLogger from '@/lib/security-logger'

if (isInvalidInput) {
  securityLogger.warn('Invalid input detected', {
    input: sanitizedInput,
    endpoint: request.url,
    ip: request.headers.get('x-forwarded-for'),
  })
  return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
}
```

**テスト項目**:
- 不正な入力の試みがログに記録される
- セキュリティログが適切に管理される

---

#### FIX-SEC-006: レート制限の実装
- **優先度**: 改善推奨
- **影響度**: Low
- **工数見積**: 4-6時間
- **対象ファイル**:
  - すべてのAPIルート
  - レート制限ミドルウェア（新規作成）

**修正内容**:
1. レート制限ライブラリの導入（例: express-rate-limit）
2. APIエンドポイントにレート制限を設定
3. ブルートフォース攻撃を防ぐ

**実装例**:
```typescript
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 100, // 最大100リクエスト
  message: 'Too many requests from this IP',
})

// Next.jsのミドルウェアとして実装
```

**テスト項目**:
- レート制限が適切に機能する
- 制限を超えたリクエストが拒否される

---

#### FIX-005: テストの自動化
- **優先度**: 改善推奨
- **影響度**: Low
- **工数見積**: 8-12時間
- **対象ファイル**:
  - テストファイル（新規作成）

**修正内容**:
1. Jestの設定
2. ユニットテストの作成
3. E2Eテストの導入（Playwright等）

**実装例**:
```typescript
// __tests__/api/transactions.test.ts
import { POST } from '@/app/api/transactions/route'

describe('POST /api/transactions', () => {
  it('should create a transaction with valid data', async () => {
    // テスト実装
  })
  
  it('should reject invalid date', async () => {
    // テスト実装
  })
})
```

**テスト項目**:
- ユニットテストが実行される
- E2Eテストが実行される

---

## 4. 実装スケジュール

### Phase 1: リリース前対応（推奨）
- **期間**: 1-2日
- **対象**: FIX-001, FIX-002, FIX-SEC-001
- **合計工数**: 7-10時間

### Phase 2: リリース後対応
- **期間**: 2-3週間
- **対象**: その他の改善推奨事項
- **合計工数**: 20-30時間

---

## 5. 実装時の注意事項

### 5.1 データベースマイグレーション
- FIX-SEC-001（入力長制限）の実装時は、既存データへの影響を確認
- 必要に応じてデータマイグレーションスクリプトを作成

### 5.2 後方互換性
- 既存のAPIとの互換性を維持
- バリデーションの追加は、既存の正常なデータを拒否しないように注意

### 5.3 テスト
- 各修正後にテストを実施
- 既存の機能が壊れていないことを確認

---

## 6. リスク評価

| 修正項目 | リスクレベル | リスク内容 | 対策 |
|---------|------------|-----------|------|
| FIX-001 | 低 | 既存の正常な日付が拒否される可能性 | 十分なテストを実施 |
| FIX-002 | 低 | 既存の正常なIDが拒否される可能性 | 十分なテストを実施 |
| FIX-SEC-001 | 中 | 既存データが最大長を超えている可能性 | データマイグレーションを実施 |
| FIX-003 | 低 | エラーメッセージの変更による影響 | ユーザーへの通知 |
| FIX-004 | 低 | ログの増加によるパフォーマンス影響 | ログローテーションの設定 |
| FIX-SEC-003 | 低 | CSP設定による既存機能への影響 | 段階的な導入 |
| FIX-SEC-004 | 低 | バリデーション強化による既存データの拒否 | 十分なテストを実施 |
| FIX-SEC-005 | 低 | ログの増加によるストレージ影響 | ログローテーションの設定 |
| FIX-SEC-006 | 低 | レート制限による正常ユーザーへの影響 | 適切な制限値の設定 |
| FIX-005 | 低 | テストの追加による開発時間の増加 | 段階的な導入 |

---

## 7. 成功基準

### Phase 1（リリース前対応）
- [ ] FIX-001: 無効な日付が適切に拒否される
- [ ] FIX-002: 無効なIDが適切に拒否される
- [ ] FIX-SEC-001: 入力長制限が実装され、最大長を超える入力が拒否される

### Phase 2（リリース後対応）
- [ ] FIX-003: 環境に応じたエラーメッセージが返される
- [ ] FIX-004: 構造化ログが記録される
- [ ] FIX-SEC-003: CSPヘッダーが設定されている
- [ ] FIX-SEC-004: 入力バリデーションが強化されている
- [ ] FIX-SEC-005: セキュリティログが記録される
- [ ] FIX-SEC-006: レート制限が実装されている
- [ ] FIX-005: 自動テストが実行される

---

## 8. まとめ

### 8.1 優先度の高い修正
1. **FIX-001**: 日付バリデーションの強化（Medium）
2. **FIX-002**: 数値変換のエラーハンドリング（Medium）
3. **FIX-SEC-001**: 入力長制限の実装（Medium）

### 8.2 推奨される実装順序
1. Phase 1の修正をリリース前に実施
2. Phase 2の修正をリリース後に段階的に実施

### 8.3 期待される効果
- **セキュリティの向上**: 入力長制限、CSP設定、レート制限により、セキュリティが強化される
- **エラーハンドリングの改善**: より適切なエラーメッセージとログにより、問題の特定が容易になる
- **品質の向上**: テストの自動化により、品質が向上する

---

**作成日**: 2024年12月
**最終更新日**: 2024年12月
**作成者**: システム開発チーム
