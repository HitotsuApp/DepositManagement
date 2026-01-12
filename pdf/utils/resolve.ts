/**
 * テンプレート文字列内の {{key.path}} をデータから解決する
 */
export const resolveTemplate = (
  text: string,
  data: Record<string, any>
): string => {
  return text.replace(/\{\{(.+?)\}\}/g, (_, key) => {
    const value = key.split(".").reduce((acc: any, k: string) => acc?.[k], data)
    return value ?? ""
  })
}
