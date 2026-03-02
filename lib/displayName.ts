/**
 * 利用者名の表示オプションに応じた表示名を取得
 * ソートには影響しない（displaySortOrder/printSortOrderを使用）
 */

export type NamePrefixDisplayOption = 'screen_only' | 'print_only' | 'none'

export interface ResidentWithDisplayOption {
  name: string
  displayNamePrefix?: string | null
  namePrefixDisplayOption?: string | null
}

/**
 * 画面または印刷用の表示名を取得
 * @param resident 利用者データ
 * @param context 表示コンテキスト（screen=画面、print=印刷）
 */
export function getResidentDisplayName(
  resident: ResidentWithDisplayOption,
  context: 'screen' | 'print'
): string {
  const prefix = resident.displayNamePrefix?.trim()
  if (!prefix) return resident.name

  const option = (resident.namePrefixDisplayOption || 'none') as NamePrefixDisplayOption
  if (option === 'none') return resident.name
  if (option === 'screen_only' && context === 'screen') return prefix + resident.name
  if (option === 'print_only' && context === 'print') return prefix + resident.name

  return resident.name
}
