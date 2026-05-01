import { MAX_LENGTHS, validateMaxLength } from '@/lib/validation'

/** 取込コミット用（通常APIの「対象日は今月…」制限なし） */
export type LedgerImportCommitItem = {
  residentId: number
  transactionDate: string
  transactionType: 'in' | 'out'
  amount: number
  description: string | null
  payee: string | null
}

export function validateLedgerImportCommitItem(
  item: Record<string, unknown>,
  index: number
): { ok: true; data: LedgerImportCommitItem } | { ok: false; error: string } {
  const residentId = Number(item.residentId)
  if (!Number.isInteger(residentId) || residentId <= 0) {
    return { ok: false, error: `インデックス${index}: residentIdが不正です` }
  }
  const transactionType = item.transactionType
  if (transactionType !== 'in' && transactionType !== 'out') {
    return { ok: false, error: `インデックス${index}: transactionTypeは in または out のみです` }
  }
  const amount = Number(item.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: `インデックス${index}: amountが不正です` }
  }
  const dateStr = item.transactionDate != null ? String(item.transactionDate) : ''
  const transactionDate = new Date(dateStr)
  if (Number.isNaN(transactionDate.getTime())) {
    return { ok: false, error: `インデックス${index}: transactionDateが不正です` }
  }

  const description =
    item.description !== undefined && item.description !== null
      ? String(item.description)
      : ''
  const payee =
    item.payee !== undefined && item.payee !== null ? String(item.payee) : ''

  if (description && !validateMaxLength(description, MAX_LENGTHS.TRANSACTION_DESCRIPTION)) {
    return {
      ok: false,
      error: `インデックス${index}: 内容は${MAX_LENGTHS.TRANSACTION_DESCRIPTION}文字以内にしてください`,
    }
  }
  if (payee && !validateMaxLength(payee, MAX_LENGTHS.TRANSACTION_PAYEE)) {
    return {
      ok: false,
      error: `インデックス${index}: 支払先は${MAX_LENGTHS.TRANSACTION_PAYEE}文字以内にしてください`,
    }
  }

  return {
    ok: true,
    data: {
      residentId,
      transactionDate: transactionDate.toISOString(),
      transactionType,
      amount,
      description: description.trim() ? description.trim() : null,
      payee: payee.trim() ? payee.trim() : null,
    },
  }
}

export function truncateForTransactionField(
  description: string | null,
  payee: string | null
): { description: string | null; payee: string | null; truncated: boolean } {
  let truncated = false
  let d = description
  let p = payee
  if (d && d.length > MAX_LENGTHS.TRANSACTION_DESCRIPTION) {
    d = d.slice(0, MAX_LENGTHS.TRANSACTION_DESCRIPTION)
    truncated = true
  }
  if (p && p.length > MAX_LENGTHS.TRANSACTION_PAYEE) {
    p = p.slice(0, MAX_LENGTHS.TRANSACTION_PAYEE)
    truncated = true
  }
  return { description: d, payee: p, truncated }
}
