# 入金・出金モーダル実装確認レポート

作成日: 2026年1月30日

## 概要

利用者詳細画面とまとめて入力画面の入金・出金モーダルの実装内容を確認しました。

---

## 1. 利用者詳細画面の入金・出金モーダル

**ファイル**: `app/residents/[id]/page.tsx`  
**実装箇所**: 495-602行目

### 実装内容

#### モーダルの表示条件
- 当月表示時のみ表示（`isCurrentMonth`が`true`の場合）
- 「💰 入金」ボタンまたは「💸 出金」ボタンクリックで表示
- 過去月では入金・出金ボタン自体が非表示

#### フォーム項目

1. **対象日** (必須)
   - 入力タイプ: `date`
   - バリデーション:
     - 必須チェック
     - 日付形式チェック（`isValidDate`）
     - 日付範囲チェック（当月表示時のみ）:
       - 10日以前: 先月1日〜今月末日まで
       - 11日以降: 今月1日〜今日まで
   - HTML5の`min`/`max`属性で範囲制限

2. **金額** (必須)
   - 入力タイプ: `number`
   - バリデーション:
     - 必須チェック
     - 1円以上の整数のみ（`min="1"`, `step="1"`）
     - 小数入力不可
   - UI: 右側に「円」の単位表示

3. **内容（備考）** (任意)
   - 入力タイプ: `text`
   - 最大文字数: 100文字
   - プレースホルダー: "例: 預り金、返金など"

4. **支払先** (任意)
   - 入力タイプ: `text`
   - 最大文字数: 30文字
   - プレースホルダー: "支払先を入力"

#### バリデーション処理

```typescript
// 日付範囲チェック（192-213行目）
if (isCurrentMonth && showInOutForm) {
  const transactionDate = new Date(formData.transactionDate)
  const transactionDateStr = transactionDate.toISOString().split('T')[0]
  
  if (transactionDateStr < inOutDateRange.min || transactionDateStr > inOutDateRange.max) {
    // エラーメッセージ表示
  }
}

// 金額チェック（215-223行目）
const amount = parseFloat(formData.amount)
if (isNaN(amount) || amount < 1 || amount % 1 !== 0) {
  // エラーメッセージ表示
}
```

#### 日付範囲計算ロジック

```typescript
// 80-101行目
const getInOutDateRange = () => {
  if (currentDay <= 10) {
    // 10日以前の場合：先月1日〜今月末日まで
    const previousMonthFirstDay = new Date(currentYear, currentMonth - 2, 1)
    const currentMonthLastDay = new Date(currentYear, currentMonth, 0)
    return {
      min: previousMonthFirstDay.toISOString().split('T')[0],
      max: currentMonthLastDay.toISOString().split('T')[0],
    }
  } else {
    // 11日以降の場合：今月1日〜今日まで
    const currentMonthFirstDay = new Date(currentYear, currentMonth - 1, 1)
    return {
      min: currentMonthFirstDay.toISOString().split('T')[0],
      max: currentDate.toISOString().split('T')[0],
    }
  }
}
```

#### 送信処理

- APIエンドポイント: `/api/transactions` (POST)
- 送信データ:
  - `residentId`: 現在の利用者ID（固定）
  - `transactionDate`: 対象日
  - `transactionType`: 'in'（入金）または 'out'（出金）
  - `amount`: 金額（数値）
  - `description`: 内容（備考）
  - `payee`: 支払先

#### UI/UX

- モーダルタイトル: 入金時「💰 入金登録」、出金時「💸 出金登録」
- 登録ボタン: 入金時は青色、出金時は赤色
- キャンセルボタン: グレー背景
- 送信中の状態管理: `isSubmitting`でボタン無効化と「登録中...」表示
- 成功時: トースト通知表示後、モーダルを閉じてデータを再取得

#### モーダルクローズ時の処理

```typescript
onClose={() => {
  setShowInOutForm(false)
  setFormData({
    transactionDate: '',
    transactionType: 'in',
    amount: '',
    description: '',
    payee: '',
    reason: '',
  })
}}
```

---

## 2. まとめて入力画面の入金・出金モーダル

**ファイル**: `app/facilities/[id]/bulk-input/page.tsx`  
**実装箇所**: 587-784行目

### 実装内容

#### モーダルの表示条件
- 当月表示時のみ表示（`isCurrentMonth`が`true`の場合）
- 「💰 入金」ボタンまたは「💸 出金」ボタンクリックで表示
- 過去月では入金・出金ボタン自体が非表示

#### フォーム項目

1. **利用者** (必須) ⭐ **利用者詳細画面との主な違い**
   - 入力タイプ: `select`
   - 検索・絞り込み機能:
     - ユニットで絞り込み（ドロップダウン）
     - 利用者名で検索（テキスト入力）
     - 絞り込み結果の件数表示
   - 表示形式: "利用者名 (ユニット名)"
   - バリデーション: 必須チェック

2. **対象日** (必須)
   - 入力タイプ: `date`
   - バリデーション:
     - 必須チェック
     - 日付形式チェック（`isValidDate`）
     - 日付範囲チェック（当月表示時のみ）:
       - 10日以前: 先月1日〜今月末日まで
       - 11日以降: 今月1日〜今日まで
   - HTML5の`min`/`max`属性で範囲制限

3. **金額** (必須)
   - 入力タイプ: `number`
   - バリデーション:
     - 必須チェック
     - 1円以上の整数のみ（`min="1"`, `step="1"`）
     - 小数入力不可
   - UI: 右側に「円」の単位表示

4. **内容（備考）** (任意)
   - 入力タイプ: `text`
   - 最大文字数: 100文字
   - プレースホルダー: "例: 預り金、返金など"

5. **支払先** (任意)
   - 入力タイプ: `text`
   - 最大文字数: 30文字
   - プレースホルダー: "支払先を入力"

#### 利用者検索・絞り込み機能

```typescript
// ユニットで絞り込み
if (selectedUnitId !== null) {
  filteredResidents = filteredResidents.filter(r => r.unitId === selectedUnitId)
}

// 名前で絞り込み
if (residentSearchQuery) {
  filteredResidents = filteredResidents.filter(r => r.name.includes(residentSearchQuery))
}
```

#### バリデーション処理

利用者詳細画面と同様のバリデーションに加えて：

```typescript
// 利用者選択チェック（159-166行目）
if (!formData.residentId) {
  setToast({
    message: '利用者を選択してください',
    type: 'error',
    isVisible: true,
  })
  return
}
```

#### 日付範囲計算ロジック

利用者詳細画面と同一のロジック（86-103行目）

#### 送信処理

- APIエンドポイント: `/api/transactions` (POST)
- 送信データ:
  - `residentId`: 選択された利用者ID（数値に変換）
  - `transactionDate`: 対象日
  - `transactionType`: 'in'（入金）または 'out'（出金）
  - `amount`: 金額（数値）
  - `description`: 内容（備考）
  - `payee`: 支払先

#### UI/UX

- モーダルタイトル: 入金時「💰 入金登録」、出金時「💸 出金登録」
- 登録ボタン: 入金時は青色、出金時は赤色
- キャンセルボタン: グレー背景
- 送信中の状態管理: `isSubmitting`でボタン無効化と「登録中...」表示
- 成功時: トースト通知表示後、モーダルを閉じてデータを再取得

#### モーダルクローズ時の処理

```typescript
onClose={() => {
  setShowInOutForm(false)
  setResidentSearchQuery('')  // 検索クエリをリセット
  setSelectedUnitId(null)     // ユニット選択をリセット
  setFormData({
    residentId: '',
    transactionDate: '',
    transactionType: 'in',
    amount: '',
    description: '',
    payee: '',
    reason: '',
  })
}}
```

---

## 共通の実装パターン

### バリデーション

両画面で以下のバリデーションが実装されています：

1. **対象日**
   - 必須チェック
   - 日付形式チェック
   - 日付範囲チェック（当月のみ）

2. **金額**
   - 必須チェック
   - 1円以上
   - 整数のみ（小数不可）

3. **エラーメッセージ**
   - トースト通知で表示
   - 各バリデーションエラーに応じたメッセージ

### 日付範囲ロジック

両画面で同一のロジックを使用：
- 10日以前: 先月1日〜今月末日まで
- 11日以降: 今月1日〜今日まで

### API送信

- エンドポイント: `/api/transactions` (POST)
- エラーハンドリング: トースト通知で表示
- 成功時: データ再取得とトースト通知

---

## 主な違い

| 項目 | 利用者詳細画面 | まとめて入力画面 |
|------|---------------|-----------------|
| **利用者選択** | 不要（固定） | 必須（検索・絞り込み機能あり） |
| **ユニット絞り込み** | なし | あり |
| **利用者名検索** | なし | あり |
| **フォーム項目数** | 4項目 | 5項目（利用者選択追加） |

---

## 確認事項

### ✅ 実装済み

1. ✅ 入金・出金モーダルの基本機能
2. ✅ 対象日の日付範囲バリデーション
3. ✅ 金額のバリデーション（1円以上、整数のみ）
4. ✅ 必須項目のバリデーション
5. ✅ エラーメッセージの表示
6. ✅ 送信中の状態管理
7. ✅ 成功時のトースト通知
8. ✅ モーダルクローズ時のフォームリセット
9. ✅ まとめて入力画面の利用者検索・絞り込み機能

### 📝 確認推奨事項

1. **日付範囲の計算ロジック**
   - 10日以前と11日以降の分岐が正しく動作するか
   - 月末日の計算が正しいか（`new Date(currentYear, currentMonth, 0)`）

2. **利用者検索機能（まとめて入力画面）**
   - 大文字小文字の区別なし検索か（現在は`includes`で大文字小文字区別あり）
   - 部分一致検索の動作確認

3. **エラーハンドリング**
   - APIエラー時のメッセージ表示
   - ネットワークエラー時の処理

4. **アクセシビリティ**
   - フォーカス管理
   - キーボード操作（ESCキーでモーダルクローズなど）

---

## まとめ

両画面の入金・出金モーダルは、基本的な機能が適切に実装されています。まとめて入力画面では、利用者選択機能が追加されており、ユニット絞り込みと名前検索により使いやすくなっています。

日付範囲のバリデーションや金額のバリデーションも適切に実装されており、ユーザーエラーを防ぐ仕組みが整っています。
