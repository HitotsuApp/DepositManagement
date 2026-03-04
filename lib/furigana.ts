/**
 * ふりがな変換・バリデーション
 * 許容: ひらがな(U+3041-U+3096)、中黒(U+30FB)、長音(U+30FC)
 */

// ひらがな範囲（ぁ〜ん、ゔ、ゕ、ゖ）
const HIRAGANA_START = 0x3041
const HIRAGANA_END = 0x3096
// 中黒 ・
const NAKAGURO = 0x30fb
// 長音 ー（カタカナ長音）
const CHOUON = 0x30fc

/**
 * カタカナをひらがなに変換
 * カタカナ: U+30A1-U+30F6（ァ〜ン、ヴ、ヵ、ヶ）
 */
export function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30a1-\u30f6]/g, (char) => {
    const code = char.charCodeAt(0)
    // ァ(U+30A1)〜ン(U+30F3): ひらがなとの差は 0x60
    if (code >= 0x30a1 && code <= 0x30f3) {
      return String.fromCharCode(code - 0x60)
    }
    // ヴ(U+30F4) → ゔ(U+3094)
    if (code === 0x30f4) return "\u3094"
    // ヵ(U+30F5) → ゕ(U+3095)
    if (code === 0x30f5) return "\u3095"
    // ヶ(U+30F6) → ゖ(U+3096)
    if (code === 0x30f6) return "\u3096"
    return char
  })
}

/**
 * 許容文字かどうか
 */
function isAllowedChar(code: number): boolean {
  return (
    (code >= HIRAGANA_START && code <= HIRAGANA_END) ||
    code === NAKAGURO ||
    code === CHOUON
  )
}

/**
 * 許容文字のみ抽出（不正な文字を除去）
 * カタカナはひらがなに変換してから許容チェック
 */
export function sanitizeFurigana(str: string): string {
  if (!str || typeof str !== "string") return ""
  const hiragana = katakanaToHiragana(str)
  return [...hiragana]
    .filter((char) => isAllowedChar(char.charCodeAt(0)))
    .join("")
    .trim()
}
