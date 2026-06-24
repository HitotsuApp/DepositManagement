/** Authorization: Bearer <key> または X-API-Key: <key> */

function extractProvidedKey(request: Request): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim()
    if (token) return token
  }

  const apiKeyHeader = request.headers.get('x-api-key')?.trim()
  return apiKeyHeader || null
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export function verifyVacancyApiKey(request: Request): boolean {
  const expected = process.env.VACANCY_API_KEY?.trim()
  if (!expected) return false

  const provided = extractProvidedKey(request)
  if (!provided) return false

  return safeCompare(provided, expected)
}
