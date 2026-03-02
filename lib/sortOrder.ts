/**
 * 印刷順のソートユーティリティ
 * 施設設定に応じてユニット・利用者をソートする
 */

export interface SortableUnit {
  id: number
  displaySortOrder: number | null
  printSortOrder: number | null
  [key: string]: unknown
}

export interface SortableResident {
  id: number
  unitId: number
  displaySortOrder: number | null
  printSortOrder: number | null
  [key: string]: unknown
}

/**
 * ソートキーを取得（NULLは最後に来るようにInfinityを使用）
 */
function getSortKey(value: number | null): number {
  return value ?? Infinity
}

/**
 * 印刷用に利用者リストをソート
 * @param residents 利用者リスト（unit情報を含むこと）
 * @param units ユニットリスト（unitIdでマップ可能）
 * @param useSameOrderForDisplayAndPrint 表示順を印刷にも使用するか
 * @param useUnitOrderForPrint ユニット順を適用するか
 */
export function sortResidentsForPrint<T extends SortableResident>(
  residents: T[],
  units: SortableUnit[],
  useSameOrderForDisplayAndPrint: boolean,
  useUnitOrderForPrint: boolean
): T[] {
  const unitMap = new Map(units.map((u) => [u.id, u]))

  const residentSortKey = useSameOrderForDisplayAndPrint ? 'displaySortOrder' : 'printSortOrder'
  const unitSortKey = useSameOrderForDisplayAndPrint ? 'displaySortOrder' : 'printSortOrder'

  return [...residents].sort((a, b) => {
    if (useUnitOrderForPrint) {
      const unitA = unitMap.get(a.unitId)
      const unitB = unitMap.get(b.unitId)
      const unitOrderA = unitA ? getSortKey(unitA[unitSortKey] as number | null) : Infinity
      const unitOrderB = unitB ? getSortKey(unitB[unitSortKey] as number | null) : Infinity
      if (unitOrderA !== unitOrderB) return unitOrderA - unitOrderB
    }

    const orderA = getSortKey(a[residentSortKey] as number | null)
    const orderB = getSortKey(b[residentSortKey] as number | null)
    if (orderA !== orderB) return orderA - orderB
    return a.id - b.id
  })
}

/**
 * 表示用にユニットリストをソート
 */
export function sortUnitsForDisplay<T extends SortableUnit>(units: T[]): T[] {
  return [...units].sort((a, b) => {
    const orderA = getSortKey(a.displaySortOrder)
    const orderB = getSortKey(b.displaySortOrder)
    if (orderA !== orderB) return orderA - orderB
    return a.id - b.id
  })
}

/**
 * 印刷用にユニットリストをソート
 */
export function sortUnitsForPrint<T extends SortableUnit>(
  units: T[],
  useSameOrderForDisplayAndPrint: boolean
): T[] {
  const unitSortKey = useSameOrderForDisplayAndPrint ? 'displaySortOrder' : 'printSortOrder'
  return [...units].sort((a, b) => {
    const orderA = getSortKey(a[unitSortKey] as number | null)
    const orderB = getSortKey(b[unitSortKey] as number | null)
    if (orderA !== orderB) return orderA - orderB
    return a.id - b.id
  })
}
