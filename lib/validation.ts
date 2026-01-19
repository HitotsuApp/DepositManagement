/**
 * バリデーション関数
 */

/**
 * 日付文字列が有効かどうかをチェック
 * @param dateString 日付文字列（YYYY-MM-DD形式を想定）
 * @returns 有効な日付の場合true、無効な場合false
 */
export function isValidDate(dateString: string): boolean {
  if (!dateString || typeof dateString !== 'string') {
    return false
  }
  const date = new Date(dateString)
  return !isNaN(date.getTime())
}

/**
 * ID文字列を数値に変換し、バリデーションを行う
 * @param id ID文字列またはnull
 * @returns 有効な数値ID、無効な場合はnull
 */
export function validateId(id: string | null | undefined): number | null {
  if (!id) return null
  const numId = Number(id)
  if (isNaN(numId) || numId <= 0 || !Number.isInteger(numId)) {
    return null
  }
  return numId
}

/**
 * 文字列の最大長をチェック
 * @param value チェックする文字列
 * @param maxLength 最大長
 * @returns 最大長以内の場合true、超過している場合false
 */
export function validateMaxLength(value: string | null | undefined, maxLength: number): boolean {
  if (value === null || value === undefined) return true // null/undefinedは許可
  return value.length <= maxLength
}

/**
 * 入力長制限の定数
 */
export const MAX_LENGTHS = {
  FACILITY_NAME: 30,
  POSITION_NAME: 30,
  POSITION_HOLDER_NAME: 30,
  UNIT_NAME: 30,
  RESIDENT_NAME: 30,
  TRANSACTION_DESCRIPTION: 100,
  TRANSACTION_PAYEE: 30,
  TRANSACTION_REASON: 100,
} as const
