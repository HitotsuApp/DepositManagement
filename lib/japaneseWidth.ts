/**
 * フォーム表示向け：ASCII の半角英数字・記号・半角スペース、および半角カタカナを全角へ寄せる。
 * 既に全角の文字はそのまま。
 */
const HW_KATAKANA =
  '｡｢｣､･ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝﾞﾟ'
const FW_KATAKANA =
  '。「」、・ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン゛゜'

const kanaHalfToFull = (() => {
  const m = new Map<string, string>()
  for (let i = 0; i < HW_KATAKANA.length; i++) {
    m.set(HW_KATAKANA[i], FW_KATAKANA[i])
  }
  return m
})()

export function halfWidthToFullWidthFormText(input: string): string {
  let out = ''
  for (const c of input) {
    const code = c.charCodeAt(0)
    if (code === 0x20) {
      out += '\u3000'
      continue
    }
    if (code >= 0x21 && code <= 0x7e) {
      out += String.fromCharCode(code + 0xfee0)
      continue
    }
    const z = kanaHalfToFull.get(c)
    if (z !== undefined) {
      out += z
      continue
    }
    out += c
  }
  return out
}
