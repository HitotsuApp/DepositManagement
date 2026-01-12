# 印刷雛形の管理方法 - 設計方針

## 📋 要件整理

### 印刷対象
- **利用者の預かり金明細書**
  - 利用者名
  - 対象年月
  - 現在残高
  - 明細一覧（日付、区分、内容、金額、残高）
  - 備考欄

### 将来的な拡張
- 施設単位の明細書
- ユニット単位の明細書
- 法人全体の集計表

---

## 🎯 管理方法の選択肢

### 方法1: データベース管理（推奨）⭐

#### 実装方法
```prisma
model PrintTemplate {
  id          Int      @id @default(autoincrement())
  name        String   // テンプレート名（例: "利用者明細書"）
  type        String   // テンプレート種別（例: "resident_detail"）
  layout      String   // JSON形式でレイアウト情報を保存
  header      String?  // ヘッダーHTML/テキスト
  footer      String?  // フッターHTML/テキスト
  styles      String?  // CSSスタイル
  isDefault   Boolean  @default(false)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

#### メリット
✅ **柔軟性が高い**
- テンプレートを複数持てる（例：A4縦、A4横、A3等）
- ユーザーがカスタマイズ可能（将来的に）
- テンプレートのバージョン管理が可能

✅ **運用面での利点**
- テンプレートの変更が容易（DB更新のみ）
- テンプレートの追加・削除が簡単
- デフォルトテンプレートの切り替えが可能

✅ **拡張性**
- 将来的にテンプレート編集UIを追加可能
- テンプレートのプレビュー機能を実装可能
- テンプレートのエクスポート・インポートが可能

#### デメリット
❌ **初期実装がやや複雑**
- DBスキーマの追加が必要
- テンプレートデータの初期投入が必要

❌ **JSONパース処理が必要**
- レイアウト情報のパース処理が必要

---

### 方法2: ローカルファイル管理（設定ファイル）

#### 実装方法
```
/config
  /templates
    resident-detail.json    # 利用者明細書のテンプレート
    facility-summary.json   # 施設集計のテンプレート
    unit-summary.json        # ユニット集計のテンプレート
```

**テンプレートファイル例（JSON形式）:**
```json
{
  "name": "利用者預かり金明細書",
  "type": "resident_detail",
  "pageSize": "A4",
  "orientation": "portrait",
  "margins": {
    "top": 20,
    "right": 15,
    "bottom": 20,
    "left": 15
  },
  "header": {
    "enabled": true,
    "template": "預かり金明細書\\n対象年月: {{year}}年{{month}}月"
  },
  "body": {
    "sections": [
      {
        "type": "resident_info",
        "fields": ["name", "facility", "unit"]
      },
      {
        "type": "balance",
        "label": "現在残高"
      },
      {
        "type": "transactions_table",
        "columns": ["date", "type", "description", "amount", "balance"]
      }
    ]
  },
  "footer": {
    "enabled": true,
    "template": "発行日: {{printDate}}"
  },
  "styles": {
    "fontFamily": "Hiragino Sans, Meiryo",
    "fontSize": 10,
    "tableBorder": true
  }
}
```

#### メリット
✅ **実装が簡単**
- ファイルを読み込むだけ
- DBスキーマの変更不要

✅ **バージョン管理しやすい**
- Gitで管理可能
- 変更履歴が追跡しやすい

✅ **デプロイが簡単**
- ファイルを配置するだけ

#### デメリット
❌ **柔軟性が低い**
- テンプレートの追加・変更にコード変更が必要
- 実行時の変更が困難

❌ **運用面での制約**
- テンプレート変更時に再デプロイが必要
- 複数テンプレートの管理が煩雑

---

### 方法3: ハイブリッド方式（推奨）⭐⭐

#### 実装方法
- **基本テンプレート**: ローカルファイル（JSON/YAML）
- **カスタマイズ情報**: データベース（オーバーライド設定）

```prisma
model PrintTemplate {
  id          Int      @id @default(autoincrement())
  name        String   // テンプレート名
  baseTemplate String  // ベーステンプレートファイル名（例: "resident-detail"）
  customizations String? // JSON形式でカスタマイズ情報（オーバーライド）
  isDefault   Boolean  @default(false)
  isActive    Boolean  @default(true)
}
```

**動作:**
1. 基本テンプレートをファイルから読み込み
2. DBのカスタマイズ情報があればマージ
3. 最終的なテンプレートを生成

#### メリット
✅ **両方のメリットを享受**
- 基本テンプレートはファイルで管理（シンプル）
- カスタマイズはDBで管理（柔軟）

✅ **段階的な拡張が可能**
- 初期はファイルのみで実装
- 必要に応じてDB機能を追加

---

## 🎨 テンプレート設計の詳細

### テンプレート構造の推奨

#### 1. レイアウト定義（JSON形式）
```json
{
  "metadata": {
    "name": "利用者預かり金明細書",
    "version": "1.0",
    "pageSize": "A4",
    "orientation": "portrait"
  },
  "layout": {
    "header": {
      "height": 60,
      "components": [
        {
          "type": "text",
          "content": "預かり金明細書",
          "style": { "fontSize": 16, "fontWeight": "bold", "align": "center" }
        },
        {
          "type": "text",
          "content": "対象年月: {{year}}年{{month}}月",
          "style": { "fontSize": 12, "align": "right" }
        }
      ]
    },
    "body": {
      "components": [
        {
          "type": "section",
          "title": "利用者情報",
          "fields": [
            { "label": "利用者名", "value": "{{resident.name}}" },
            { "label": "施設", "value": "{{facility.name}}" },
            { "label": "ユニット", "value": "{{unit.name}}" }
          ]
        },
        {
          "type": "balance",
          "label": "現在残高",
          "value": "{{balance}}",
          "style": { "fontSize": 14, "fontWeight": "bold" }
        },
        {
          "type": "table",
          "title": "明細",
          "columns": [
            { "key": "date", "label": "日付", "width": "15%" },
            { "key": "type", "label": "区分", "width": "10%" },
            { "key": "description", "label": "内容", "width": "25%" },
            { "key": "amount", "label": "金額", "width": "15%", "align": "right" },
            { "key": "balance", "label": "残高", "width": "15%", "align": "right" }
          ],
          "data": "{{transactions}}"
        }
      ]
    },
    "footer": {
      "height": 40,
      "components": [
        {
          "type": "text",
          "content": "発行日: {{printDate}}",
          "style": { "fontSize": 10, "align": "right" }
        }
      ]
    }
  },
  "styles": {
    "fontFamily": "Hiragino Sans, Hiragino Kaku Gothic ProN, Meiryo",
    "fontSize": 10,
    "lineHeight": 1.5,
    "table": {
      "border": true,
      "headerBackground": "#f3f4f6",
      "cellPadding": 5
    }
  }
}
```

#### 2. テンプレートエンジン
- **Mustache/Handlebars**: シンプルなテンプレートエンジン
- **React PDF**: Reactコンポーネントとして定義
- **HTML to PDF**: HTMLテンプレートをPDFに変換

---

## 💡 推奨実装方針

### Phase 1: 初期実装（MVP）
**方法: ローカルファイル管理（JSON）**

**理由:**
- 実装が最も簡単
- 要件が明確（利用者明細書のみ）
- テンプレート変更頻度が低い想定

**実装内容:**
```
/config
  /templates
    resident-detail.json    # 利用者明細書テンプレート
```

**メリット:**
- すぐに実装できる
- シンプルで保守しやすい
- バージョン管理が容易

---

### Phase 2: 拡張（将来）
**方法: データベース管理に移行**

**移行タイミング:**
- テンプレートが複数必要になった時
- テンプレートのカスタマイズが必要になった時
- テンプレート編集UIが必要になった時

**移行方法:**
- 既存のJSONファイルをDBに初期データとして投入
- テンプレート読み込み処理をDB対応に変更

---

## 🎯 具体的な実装推奨

### 推奨: **方法3（ハイブリッド方式）** を段階的に実装

#### Step 1: ローカルファイルで基本実装
```
/config/templates/resident-detail.json
```

#### Step 2: 必要に応じてDB機能を追加
- テンプレートのカスタマイズ機能
- 複数テンプレートの管理
- テンプレート編集UI

---

## 📝 テンプレートファイルの配置場所

### オプション1: `/config/templates/`（推奨）
```
/config
  /templates
    resident-detail.json
    facility-summary.json
```

### オプション2: `/public/templates/`
- 静的ファイルとして配置
- 実行時に読み込み可能

### オプション3: `/lib/templates/`
- TypeScriptファイルとして定義
- 型安全性が高い

---

## 🔧 テンプレートエンジンの選択

### オプション1: React PDF（推奨）⭐⭐
```typescript
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 30 },
  title: { fontSize: 16, marginBottom: 10 }
})

const ResidentDetailPDF = ({ data }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>預かり金明細書</Text>
      {/* ... */}
    </Page>
  </Document>
)
```

**メリット:**
- Reactコンポーネントとして定義可能
- 型安全性が高い
- レイアウトの柔軟性が高い

---

### オプション2: jsPDF + html2canvas
```typescript
import jsPDF from 'jspdf'

const pdf = new jsPDF()
pdf.text('預かり金明細書', 10, 10)
// ...
pdf.save('明細書.pdf')
```

**メリット:**
- 軽量
- HTMLからPDF生成が容易

---

### オプション3: Puppeteer（サーバーサイド）
```typescript
const browser = await puppeteer.launch()
const page = await browser.newPage()
await page.setContent(html)
const pdf = await page.pdf({ format: 'A4' })
```

**メリット:**
- 高品質なPDF生成
- HTML/CSSをそのまま使用可能

---

## 📊 比較表

| 項目 | DB管理 | ファイル管理 | ハイブリッド |
|------|--------|------------|------------|
| 実装の簡単さ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| 柔軟性 | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| 運用の容易さ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| 拡張性 | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| 初期コスト | 中 | 低 | 中 |

---

## 🎯 最終推奨

### **段階的実装アプローチ**

1. **初期実装（MVP）**: ローカルファイル（JSON）で実装
   - `/config/templates/resident-detail.json`
   - React PDFまたはjsPDFを使用
   - シンプルで確実に動作

2. **拡張時**: 必要に応じてDB機能を追加
   - テンプレートのカスタマイズ機能
   - 複数テンプレートの管理
   - テンプレート編集UI

**理由:**
- 初期実装が簡単で確実
- 将来的な拡張に対応可能
- 段階的な投資が可能

---

## 📝 次のステップ

1. テンプレートファイルの構造を決定
2. テンプレートエンジンの選択（React PDF推奨）
3. テンプレートファイルの作成
4. PDF生成機能の実装
5. 印刷プレビュー機能の実装
