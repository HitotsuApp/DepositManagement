/**
 * Cloudflare Worker の 503 等で HTML が返る場合、response.json() が SyntaxError になるのを避ける。
 */
export async function readJsonFromApi<T>(response: Response, endpointLabel: string): Promise<T> {
  if (!response.ok) {
    let hint = ''
    try {
      const head = ((await response.clone().text()) as string).trimStart().slice(0, 80)
      if (head.startsWith('<!DOCTYPE') || head.startsWith('<html')) {
        hint = ' （HTML が返されたため一時過負荷の可能性があります）'
      }
    } catch {
      /* ignore */
    }
    throw new Error(`${endpointLabel}: HTTP ${response.status}${hint}`)
  }

  const ct = response.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) {
    throw new Error(
      `${endpointLabel}: JSON ではなく ${ct || '無 Content-Type'} が返されました`
    )
  }

  try {
    return (await response.json()) as T
  } catch {
    throw new Error(`${endpointLabel}: JSON の解析に失敗しました`)
  }
}
