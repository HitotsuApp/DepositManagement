# まとめて印刷機能 実装可能性の提示

## 概要
絞り込んだ施設の指定月について、以下をまとめて印刷する機能の実装可能性を提示します。

## 要件
1. **施設の預り金合計の印刷**（1枚程度想定）- 実装済み機能
2. **各利用者の預り金明細書の印刷**（29人登録されていれば29人分）
3. **上記2つを同時にプレビューおよび印刷**

## 実装可能性の評価

### ✅ 実装可能

既存のコードベースを確認した結果、以下の理由により**実装可能**と判断します。

### 既存の実装状況

#### 1. 施設の預り金合計の印刷（実装済み）
- **APIエンドポイント**: `/api/print/deposit-statement`
- **データ変換**: `transformToPrintData()` 関数（`pdf/utils/transform.ts`）
- **PDFテンプレート**: `deposit-statement.json`
- **プレビュー機能**: `/print/preview` ページ（ユニット/施設単位）

#### 2. 利用者別の預り金明細書の印刷（実装済み）
- **APIエンドポイント**: `/api/print/resident-statement`
- **データ変換**: `transformToResidentPrintData()` 関数（`pdf/utils/transform.ts`）
- **PDFテンプレート**: `resident-statement.json`
- **プレビュー機能**: `/print/preview` ページ（利用者単位、1人ずつ）

#### 3. PDFレンダリング基盤
- **PDFレンダラー**: `PdfRenderer` コンポーネント（`@react-pdf/renderer`使用）
- **複数ページ対応**: 既に実装済み（`ROWS_PER_PAGE = 20`で自動ページ分割）
- **日本語フォント**: NotoSansJP が登録済み

## 実装方針

### アプローチ1: 複数PDFを1つのDocumentに結合（推奨）

#### メリット
- `@react-pdf/renderer`の`Document`コンポーネントで複数の`Page`を順番に配置可能
- 1つのPDFファイルとして出力・印刷できる
- 既存の`PdfRenderer`コンポーネントを再利用可能

#### 実装イメージ
```tsx
<Document>
  {/* 1. 施設の預り金合計（1ページ） */}
  <Page>
    <PdfRenderer template={depositStatementTemplate} data={facilitySummaryData} />
  </Page>
  
  {/* 2. 各利用者の明細書（利用者数分のページ） */}
  {residents.map(resident => (
    <Page key={resident.id}>
      <PdfRenderer template={residentStatementTemplate} data={residentData} />
    </Page>
  ))}
</Document>
```

#### 必要な変更点
1. **新しいAPIエンドポイント**: `/api/print/batch-print`
   - 施設ID、年月を受け取る
   - 施設の預り金合計データを取得
   - 該当施設の全利用者リストを取得
   - 各利用者の明細書データを取得
   - 全てのデータを1つのレスポンスで返す

2. **新しいPDFレンダラーコンポーネント**: `BatchPdfRenderer`
   - 施設合計用の`PdfRenderer`を1回呼び出し
   - 各利用者用の`PdfRenderer`をループで呼び出し
   - 全てを1つの`Document`にまとめる

3. **プレビューページの拡張**: `/print/preview` または新しい `/print/batch-preview`
   - `type=batch` パラメータでまとめて印刷モードを識別
   - `PDFViewer`で複数ページを表示
   - ページナビゲーション機能（オプション）

### アプローチ2: 個別PDFを生成して結合（代替案）

#### メリット
- 既存の実装をそのまま利用可能
- 各PDFを個別に生成してから結合する方式

#### デメリット
- サーバーサイドでのPDF生成・結合処理が必要
- クライアントサイドでの結合は複雑
- パフォーマンスの問題（29人分のPDF生成は重い）

#### 実装イメージ
- サーバーサイドで各PDFを生成
- PDFライブラリ（例: `pdf-lib`）で結合
- 結合したPDFをダウンロード

## 推奨実装詳細

### 1. APIエンドポイント: `/api/print/batch-print`

```typescript
// リクエストパラメータ
GET /api/print/batch-print?facilityId=1&year=2024&month=4

// レスポンス構造
{
  facilitySummary: {
    // 施設の預り金合計データ（deposit-statement形式）
    statement: { month: "4月" },
    unit: { name: "全ユニット" },
    transactions: [...],
    summary: {...},
    facility: {...}
  },
  residentStatements: [
    {
      // 利用者1の明細書データ（resident-statement形式）
      statement: { month: "4月" },
      unit: { name: "ユニットA" },
      resident: { name: "利用者1" },
      transactions: [...],
      summary: {...},
      facility: {...}
    },
    // ... 利用者2〜29のデータ
  ]
}
```

### 2. 新しいコンポーネント: `BatchPdfRenderer`

```typescript
interface BatchPrintData {
  facilitySummary: PrintData  // deposit-statement形式
  residentStatements: ResidentPrintData[]  // resident-statement形式の配列
}

export const BatchPdfRenderer = ({ data }: { data: BatchPrintData }) => {
  return (
    <Document>
      {/* 施設合計ページ */}
      <Page>
        <PdfRenderer 
          template={depositStatementTemplate} 
          data={data.facilitySummary} 
        />
      </Page>
      
      {/* 各利用者のページ */}
      {data.residentStatements.map((residentData, index) => (
        <Page key={index}>
          <PdfRenderer 
            template={residentStatementTemplate} 
            data={residentData} 
          />
        </Page>
      ))}
    </Document>
  )
}
```

### 3. プレビューページの拡張

既存の`/print/preview`ページを拡張するか、新しい`/print/batch-preview`ページを作成。

```typescript
// URL例
/print/batch-preview?facilityId=1&year=2024&month=4&type=batch

// または既存ページを拡張
/print/preview?facilityId=1&year=2024&month=4&type=batch
```

### 4. 印刷ページ（`/print/page.tsx`）の拡張

既存の「まとめて印刷」ページに機能を追加：
- 「まとめて印刷」ボタンを追加
- プレビュー画面への遷移
- PDFダウンロード機能

## 技術的な考慮事項

### パフォーマンス
- **29人分のデータ取得**: 1回のAPIリクエストで全データを取得するため、レスポンス時間に注意
- **PDF生成**: クライアントサイドで生成するため、ブラウザのメモリ使用量に注意
- **推奨**: データ量が多い場合は、ページネーションやローディング表示を検討

### メモリ使用量
- 29人分のPDFを一度に生成する場合、ブラウザのメモリ使用量が増加
- モバイルデバイスでの動作確認が必要

### エラーハンドリング
- 利用者データが0人の場合の処理
- APIエラー時の適切なエラーメッセージ表示
- データ取得失敗時のリトライ機能

## 実装ステップ（参考）

1. **APIエンドポイントの実装**
   - `/api/print/batch-print/route.ts` を作成
   - 施設合計データと全利用者データを取得・変換

2. **BatchPdfRendererコンポーネントの実装**
   - `pdf/renderer/BatchPdfRenderer.tsx` を作成
   - 複数の`PdfRenderer`を組み合わせる

3. **プレビューページの実装/拡張**
   - バッチ印刷用のプレビューページを作成
   - `PDFViewer`で表示

4. **印刷ページのUI拡張**
   - `/print/page.tsx` に「まとめて印刷」機能を追加
   - プレビューへの遷移ボタンを追加

5. **テスト**
   - 少数の利用者でのテスト
   - 29人分でのパフォーマンステスト
   - エラーハンドリングのテスト

## 結論

**実装可能**です。既存のコードベースを活用し、以下の追加実装で対応可能です：

1. バッチ印刷用のAPIエンドポイント（1つ）
2. バッチPDFレンダラーコンポーネント（1つ）
3. プレビューページの拡張または新規作成（1ページ）
4. 印刷ページのUI拡張（既存ページの修正）

既存の`PdfRenderer`、テンプレート、データ変換関数をそのまま再利用できるため、実装コストは比較的低く抑えられます。
