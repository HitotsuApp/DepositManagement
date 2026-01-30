# サイドバー仕様書

## 概要

サイドバーは預り金管理システムの主要なナビゲーションコンポーネントです。施設選択機能と連携し、選択された施設に応じて表示内容を動的に変更します。

## ファイル構成

- **コンポーネント**: `components/Sidebar.tsx`
- **レイアウト**: `components/MainLayout.tsx`
- **コンテキスト**: `contexts/FacilityContext.tsx`

## 使用箇所

以下のページで`MainLayout`コンポーネント経由でサイドバーが使用されています：

- `/` - 法人ダッシュボード
- `/facilities/[id]` - 施設詳細ページ
- `/facilities/[id]/bulk-input` - 一括入力ページ
- `/master` - マスタ管理ページ
- `/print` - まとめて印刷ページ
- `/print/preview` - 印刷プレビューページ
- `/import` - データインポートページ
- `/cash-verification` - 現金確認ページ
- `/residents/[id]` - 入居者詳細ページ

## デザイン仕様

### サイズ・レイアウト

- **幅**: `w-64` (256px)
- **高さ**: `min-h-screen` (画面の最小高さ)
- **パディング**: `p-4` (16px)
- **背景色**: `rgba(62, 77, 101, 1)` (ダークブルーグレー)
- **テキスト色**: 白 (`text-white`)

### レイアウト構造

```
<div className="flex min-h-screen">
  <div className="no-print-sidebar">
    <Sidebar />
  </div>
  <main className="flex-1 p-8 bg-gray-50">
    {children}
  </main>
</div>
```

## 機能仕様

### 1. タイトル表示

- **表示内容**: 「預り金管理」
- **スタイル**: `text-xl font-bold mb-6`

### 2. 施設選択状態表示

#### 施設が選択されている場合

- **表示内容**: 選択中の施設名
- **スタイル**: 
  - 背景: `bg-blue-600`
  - ボーダー: `border-2 border-blue-400`
  - ラベル: `text-xs text-blue-200`
  - 施設名: `text-sm font-semibold text-white`

#### 施設が選択されていない場合（法人全体モード）

- **表示内容**: 「法人全体」
- **スタイル**:
  - 背景: `bg-gray-700`
  - ボーダー: `border border-gray-600`
  - ラベル: `text-xs text-gray-400`
  - テキスト: `text-sm font-semibold text-gray-300`

### 3. ナビゲーションメニュー

#### 3.1 法人ダッシュボード

- **リンク**: `/`
- **表示**: 「法人ダッシュボード」
- **アクティブ状態**: パスが `/` の場合に `bg-gray-700` が適用される
- **ホバー**: `hover:bg-gray-700`

#### 3.2 施設一覧セクション

- **セクションタイトル**: 「施設一覧」
- **スタイル**: `text-sm font-semibold text-gray-400`
- **区切り線**: `border-t border-gray-700`

##### 施設選択変更リンク

- **表示条件**: `selectedFacilityId !== null` の場合のみ表示
- **リンク**: `/facility-select`
- **表示**: 「変更」
- **スタイル**: `text-xs text-blue-400 hover:text-blue-300`
- **ツールチップ**: 「施設選択を変更」

##### 施設リスト

- **データ取得**: `/api/facilities` から取得
- **フィルタリング**:
  - アクティブな施設のみ表示 (`isActive === true`)
  - 施設が選択されている場合: 選択された施設のみ表示
  - 施設が選択されていない場合: すべてのアクティブな施設を表示
- **リンク**: `/facilities/${facility.id}`
- **アクティブ状態**: 
  - パスが `/facilities/${facility.id}` の場合: `bg-gray-700`
  - 選択中の施設の場合: `bg-blue-600 hover:bg-blue-700`
- **空状態**: 施設が選択されているが施設が見つからない場合、「施設が見つかりません」を表示

#### 3.3 その他のメニュー項目

以下のメニュー項目が表示されます：

1. **施設選択**
   - リンク: `/facility-select`
   - 表示: 「施設選択」

2. **まとめて印刷**
   - リンク: `/print`
   - 表示: 「まとめて印刷」

3. **マスタ管理**
   - リンク: `/master`
   - 表示: 「マスタ管理」

4. **データインポート**
   - リンク: `/import`
   - 表示: 「データインポート」

5. **現金確認**
   - リンク: `/cash-verification`
   - 表示: 「現金確認」

**共通スタイル**:
- パディング: `px-4 py-2`
- 角丸: `rounded`
- ホバー: `hover:bg-gray-700`
- アクティブ状態: パスが一致する場合に `bg-gray-700` が適用される

## 状態管理

### FacilityContext との連携

サイドバーは`FacilityContext`を使用して施設選択状態を管理します：

- **`selectedFacilityId`**: 選択された施設ID（`number | null`）
- **取得方法**: `useFacility()` フックを使用

### データ取得

- **APIエンドポイント**: `/api/facilities`
- **取得タイミング**: 
  - コンポーネントマウント時
  - `selectedFacilityId`が変更された時
- **データ構造**:
  ```typescript
  interface Facility {
    id: number
    name: string
    isActive: boolean
  }
  ```

## アクティブ状態の判定

- **判定方法**: `usePathname()` を使用して現在のパスを取得
- **関数**: `isActive(path: string) => boolean`
- **ロジック**: `pathname === path` で判定

## スタイリング詳細

### カラーパレット

- **背景色**: `rgba(62, 77, 101, 1)` (インラインスタイル)
- **ホバー背景**: `bg-gray-700`
- **アクティブ背景**: `bg-gray-700`
- **選択中施設背景**: `bg-blue-600`
- **選択中施設ホバー**: `bg-blue-700`
- **テキスト**: `text-white`
- **セカンダリテキスト**: `text-gray-400`
- **リンクテキスト**: `text-blue-400`

### スペーシング

- **セクション間**: `space-y-2`
- **セクション区切り**: `pt-4 border-t border-gray-700`
- **パディング**: `p-4` (外側), `px-4 py-2` (メニュー項目)

## 印刷時の動作

- **クラス**: `no-print-sidebar` が適用されている
- **目的**: 印刷時にサイドバーを非表示にするためのクラス（CSSで制御）

## エラーハンドリング

- **API取得エラー**: `console.error` でエラーをログ出力
- **施設が見つからない場合**: 「施設が見つかりません」を表示（施設選択時のみ）

## パフォーマンス考慮事項

- **再レンダリング**: `selectedFacilityId`が変更された時のみ施設リストを再取得
- **メモ化**: 現在は実装されていないが、必要に応じて`useMemo`で最適化可能

## 依存関係

- **Next.js**: `next/link`, `next/navigation`
- **React**: `useEffect`, `useState`
- **コンテキスト**: `@/contexts/FacilityContext`

## 今後の改善候補

1. ローディング状態の表示
2. エラー状態のUI改善
3. アニメーション効果の追加
4. レスポンシブ対応（モバイル時の折りたたみ）
5. アクセシビリティの向上（ARIA属性の追加）
