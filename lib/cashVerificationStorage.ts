const KEY_PREFIX = 'deposit-mgmt:cash-verification:v1:facility:'

type StoredV1 = {
  v: 1
  billCounts: number[]
  coinCounts: number[]
}

function storageKey(facilityId: number): string {
  return `${KEY_PREFIX}${facilityId}`
}

function validateCounts(arr: unknown, len: number): number[] | null {
  if (!Array.isArray(arr) || arr.length !== len) return null
  const out: number[] = []
  for (const x of arr) {
    if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || !Number.isInteger(x)) {
      return null
    }
    out.push(x)
  }
  return out
}

/**
 * 施設ごとの現金確認ドラフト（枚数・本数）を読み込む。不正・未保存時は null。
 */
export function loadCashVerificationDraft(
  facilityId: number,
  billSlotCount: number,
  coinSlotCount: number
): { billCounts: number[]; coinCounts: number[] } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey(facilityId))
    if (!raw) return null
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object') return null
    const rec = data as Partial<StoredV1>
    if (rec.v !== 1) return null
    const bills = validateCounts(rec.billCounts, billSlotCount)
    const coins = validateCounts(rec.coinCounts, coinSlotCount)
    if (!bills || !coins) return null
    return { billCounts: bills, coinCounts: coins }
  } catch {
    return null
  }
}

/**
 * 枚数・本数のみ永続化（金額は画面側で再計算）。
 */
export function saveCashVerificationDraft(
  facilityId: number,
  billCounts: number[],
  coinCounts: number[]
): void {
  if (typeof window === 'undefined') return
  try {
    const payload: StoredV1 = {
      v: 1,
      billCounts: [...billCounts],
      coinCounts: [...coinCounts],
    }
    localStorage.setItem(storageKey(facilityId), JSON.stringify(payload))
  } catch (e) {
    console.warn('Failed to persist cash verification draft:', e)
  }
}

export function clearCashVerificationDraft(facilityId: number): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(storageKey(facilityId))
  } catch {
    // ignore
  }
}
