/** Neon / Undici が返す接続失敗かどうか（コンピュートスリープ・一時的なネットワーク不良） */

function digCauseChain(error: unknown, maxDepth: number): unknown[] {
  const out: unknown[] = []
  let cur: unknown = error
  for (let i = 0; i < maxDepth && cur && typeof cur === 'object'; i++) {
    out.push(cur)
    cur = (cur as { cause?: unknown }).cause
  }
  return out
}

export function isTransientDbConnectionError(error: unknown): boolean {
  const chain = digCauseChain(error, 8)

  for (const item of chain) {
    if (typeof ErrorEvent !== 'undefined' && item instanceof ErrorEvent) {
      return true
    }

    if (!item || typeof item !== 'object') continue

    const anyItem = item as {
      name?: string
      message?: string
      code?: string
      constructor?: { name?: string }
    }

    const name = String(anyItem.name ?? anyItem.constructor?.name ?? '')
    const msg = String(anyItem.message ?? '')
    const code = String(anyItem.code ?? '')

    if (code === 'UND_ERR_CONNECT_TIMEOUT') return true
    if (name === 'ConnectTimeoutError') return true
    if (name === 'NeonDbError' && /fetch failed|timeout|ECONNRESET|ENOTFOUND/i.test(msg))
      return true
    if (/Connect Timeout Error|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(msg))
      return true
    if (/connection terminated unexpectedly|server closed the connection/i.test(msg))
      return true
  }

  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Neon のウェイクやネットワークの一時障害で落ちたときにだけ再試行する。
 * `next dev` で複数ルートが同時に DB に刺さるとタイムアウトしやすいため効くことがある。
 */
export async function withTransientDbRetries<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseDelayMs?: number }
): Promise<T> {
  const attempts = opts?.attempts ?? 4
  const baseDelayMs = opts?.baseDelayMs ?? 600
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      const retryable = isTransientDbConnectionError(e)
      if (!retryable || i === attempts - 1) throw e
      const delay = baseDelayMs * (i + 1)
      console.warn(
        `[withTransientDbRetries] ${label}: attempt ${i + 1}/${attempts} failed, retry in ${delay}ms`
      )
      await sleep(delay)
    }
  }
  throw last
}
