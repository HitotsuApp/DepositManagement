/**
 * 東アジア系の「表示幅」に近い単位（半角=1、全角相当=2）で文字を折り返す。
 * 厳密な East Asian Width ではなく、PDFのセル幅に合わせた実用近似。
 */
export function getCharDisplayWidth(codePoint: number): number {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return 1
  // 半角カタカナ
  if (codePoint >= 0xff61 && codePoint <= 0xff9f) return 1
  return 2
}

export function wrapTextByDisplayWidth(text: string, maxUnitsPerLine: number): string {
  if (maxUnitsPerLine < 1) return text
  const lines: string[] = []
  let current = ""
  let width = 0

  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    const w = getCharDisplayWidth(cp)
    if (width + w > maxUnitsPerLine && current.length > 0) {
      lines.push(current)
      current = ch
      width = w
    } else {
      current += ch
      width += w
    }
  }
  if (current.length > 0) lines.push(current)
  return lines.join("\n")
}
