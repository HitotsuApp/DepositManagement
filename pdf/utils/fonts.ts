import { Font } from "@react-pdf/renderer"

/**
 * 日本語フォントを登録する
 * Noto Sans JPを使用（Google Fontsから取得）
 */
export const registerJapaneseFonts = async () => {
  try {
    // Noto Sans JP Regular
    Font.register({
      family: "NotoSansJP",
      fonts: [
        {
          src: "https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf",
          fontWeight: "normal",
        },
        {
          src: "https://fonts.gstatic.com/s/notosansjp/v52/-F6kfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf",
          fontWeight: "bold",
        },
      ],
    })
  } catch (error) {
    console.error("Failed to register Japanese fonts:", error)
    // フォールバック: システムフォントを使用
    Font.register({
      family: "NotoSansJP",
      fonts: [
        {
          src: "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap",
        },
      ],
    })
  }
}

// 初期化時にフォントを登録
if (typeof window === "undefined") {
  // サーバーサイドでのみ実行
  registerJapaneseFonts().catch(console.error)
}
