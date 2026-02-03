# モーダル改善計画

作成日: 2026年1月30日

## 要望内容

1. **入金/出金の切り替え機能**: モーダル内で入金/出金を切り替えられるようにする
2. **Enterキーでの誤送信防止**: Enterキーで登録ボタン・キャンセルボタンが押されないようにする

---

## 実装可能性の確認

### ✅ 1. 入金/出金の切り替え機能

**実装可能**: ✅ **YES**

**理由**:
- 現在、`formData.transactionType`で`'in'`または`'out'`を保持している
- モーダル内に区分選択のセレクトボックスを追加するだけで実装可能
- 既存の`formData.transactionType`の状態管理を活用できる
- モーダルタイトルやボタンの色も`transactionType`に応じて動的に変更されているため、追加の変更も容易

**実装方法**:
- モーダル内に「区分」セレクトボックスを追加
- `formData.transactionType`を変更可能にする
- 変更時にモーダルタイトルとボタンの色を動的に更新

---

### ✅ 2. Enterキーでの誤送信防止

**実装可能**: ✅ **YES**

**理由**:
- HTMLフォームでは、フォーム内のボタンが`type="submit"`の場合、Enterキーで自動的に送信される
- これを防ぐ方法は複数ある：
  1. フォームの`onSubmit`で`e.preventDefault()`を常に呼び、明示的にボタンクリック時のみ送信
  2. Enterキーのイベントをキャッチして無効化
  3. フォーム内のボタンを`type="button"`に変更し、クリック時のみ送信処理を実行

**推奨実装方法**:
- 方法1と3の組み合わせが最も確実
- フォームの`onSubmit`で`e.preventDefault()`を常に呼ぶ
- 送信ボタンは`type="button"`に変更し、`onClick`で送信処理を実行
- これにより、Enterキーでの送信を完全に防止できる

---

## 実行計画

### タスク1: 入金/出金の切り替え機能追加

#### 対象ファイル
1. `app/residents/[id]/page.tsx` (利用者詳細画面)
2. `app/facilities/[id]/bulk-input/page.tsx` (まとめて入力画面)

#### 実装内容

**1.1 利用者詳細画面のモーダルに区分選択を追加**

- **場所**: `app/residents/[id]/page.tsx` の入金・出金モーダル内（対象日の前または後）
- **追加するUI**:
  ```tsx
  <div>
    <label className="block text-sm font-medium mb-1">
      区分 <span className="text-red-500">*</span>
    </label>
    <select
      value={formData.transactionType}
      onChange={(e) => setFormData({ ...formData, transactionType: e.target.value })}
      className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="in">入金</option>
      <option value="out">出金</option>
    </select>
  </div>
  ```
- **配置**: 対象日の前（最初の項目）に配置することを推奨

**1.2 まとめて入力画面のモーダルに区分選択を追加**

- **場所**: `app/facilities/[id]/bulk-input/page.tsx` の入金・出金モーダル内
- **追加するUI**: 利用者詳細画面と同様
- **配置**: 利用者選択の後、対象日の前に配置することを推奨

**1.3 モーダルタイトルとボタンの動的更新**

- 既に実装済み（`formData.transactionType`に応じて変更される）
- 追加の変更は不要

**1.4 モーダルオープン時の初期値設定**

- 現在の実装（入金ボタンで`'in'`、出金ボタンで`'out'`を設定）を維持
- モーダル内で切り替え可能にする

---

### タスク2: Enterキーでの誤送信防止

#### 対象ファイル
1. `app/residents/[id]/page.tsx` (利用者詳細画面)
2. `app/facilities/[id]/bulk-input/page.tsx` (まとめて入力画面)

#### 実装内容

**2.1 フォームの`onSubmit`を修正**

- **変更前**:
  ```tsx
  <form onSubmit={handleSubmit}>
  ```

- **変更後**:
  ```tsx
  <form onSubmit={(e) => { e.preventDefault(); }}>
  ```

**2.2 送信ボタンの`type`を変更**

- **変更前**:
  ```tsx
  <button type="submit" ...>
  ```

- **変更後**:
  ```tsx
  <button type="button" onClick={handleSubmit} ...>
  ```

**2.3 キャンセルボタンの確認**

- 既に`type="button"`になっているため変更不要
- ただし、念のため確認

**2.4 `handleSubmit`関数の修正**

- 現在、`handleSubmit`は`(e: React.FormEvent)`を受け取っている
- `onClick`から呼ばれる場合、`e`は`React.MouseEvent`になる
- または、`handleSubmit`を修正して両方に対応させる

**推奨実装**:
```tsx
const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
  if (e) {
    e.preventDefault()
  }
  // 既存の処理...
}
```

または、より明確に：
```tsx
const handleFormSubmit = async () => {
  // 既存のhandleSubmitの内容（e.preventDefault()を除く）
}

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  await handleFormSubmit()
}

// ボタンでは
<button type="button" onClick={handleFormSubmit} ...>
```

---

## 実装手順（詳細）

### ステップ1: 利用者詳細画面の修正

1. `app/residents/[id]/page.tsx`を開く
2. 入金・出金モーダル内に区分選択セレクトボックスを追加（対象日の前）
3. フォームの`onSubmit`を修正（`e.preventDefault()`を常に呼ぶ）
4. 送信ボタンの`type`を`"button"`に変更し、`onClick`で送信処理を実行
5. `handleSubmit`関数を修正（`onClick`と`onSubmit`の両方に対応）

### ステップ2: まとめて入力画面の修正

1. `app/facilities/[id]/bulk-input/page.tsx`を開く
2. 入金・出金モーダル内に区分選択セレクトボックスを追加（利用者選択の後、対象日の前）
3. フォームの`onSubmit`を修正（`e.preventDefault()`を常に呼ぶ）
4. 送信ボタンの`type`を`"button"`に変更し、`onClick`で送信処理を実行
5. `handleSubmit`関数を修正（`onClick`と`onSubmit`の両方に対応）

### ステップ3: 動作確認

1. 利用者詳細画面で入金モーダルを開く
   - 区分が「入金」で選択されていることを確認
   - 区分を「出金」に変更できることを確認
   - モーダルタイトルとボタンの色が変更されることを確認
2. まとめて入力画面で同様の確認
3. Enterキーを押しても送信されないことを確認
4. 送信ボタンをクリックした場合のみ送信されることを確認

---

## 注意事項

### 1. フォームのバリデーション

- HTML5の`required`属性は、フォーム送信時のみ動作する
- `type="button"`に変更すると、HTML5のバリデーションが動作しない可能性がある
- 現在の実装では、`handleSubmit`内でバリデーションを行っているため、問題なし

### 2. アクセシビリティ

- フォームを`<form>`タグのまま維持することで、スクリーンリーダーなどの支援技術に対応
- `type="button"`に変更しても、ボタンの役割は変わらないため問題なし

### 3. 既存機能への影響

- モーダルタイトルとボタンの色は既に`formData.transactionType`に応じて変更されているため、追加の変更は不要
- モーダルオープン時の初期値設定は変更不要（既存の実装を維持）

---

## 実装後の期待される動作

### 入金/出金の切り替え機能

1. 「💰 入金」ボタンをクリック → モーダルが開き、区分が「入金」で選択されている
2. モーダル内で区分を「出金」に変更 → モーダルタイトルが「💸 出金登録」に変更、ボタンの色が赤色に変更
3. 「💸 出金」ボタンをクリック → モーダルが開き、区分が「出金」で選択されている
4. モーダル内で区分を「入金」に変更 → モーダルタイトルが「💰 入金登録」に変更、ボタンの色が青色に変更

### Enterキーでの誤送信防止

1. フォーム内の任意の入力フィールドでEnterキーを押す → 何も起こらない（送信されない）
2. 送信ボタンをクリック → 正常に送信される
3. キャンセルボタンをクリック → モーダルが閉じる

---

## まとめ

両方の要望は**実装可能**です。

- **入金/出金の切り替え機能**: モーダル内に区分選択セレクトボックスを追加するだけ
- **Enterキーでの誤送信防止**: フォームの`onSubmit`を修正し、送信ボタンを`type="button"`に変更

実装は比較的簡単で、既存の機能への影響も最小限です。
