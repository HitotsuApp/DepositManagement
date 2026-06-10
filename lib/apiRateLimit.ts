/**
 * Cloudflare Edge: /api/* 向け固定窓レート制限（caches.default）。
 * ローカル dev や caches 非対応環境では fail-open（許可）。
 */

import type { NextRequest } from 'next/server'

/** 1 IP あたり・1分あたりの /api 上限（/api/auth 除外は middleware 側） */
export const API_RATE_LIMIT_PER_MINUTE = 150

/** 1 IP あたり・1分あたりの /api/auth/signin 上限（callback 除外は middleware 側） */
export const SIGNIN_RATE_LIMIT_PER_MINUTE = 2

const RATE_LIMIT_WINDOW_SECONDS = 60

/** OAuth コールバック（Google ログイン後の復帰）。レート制限対象外。 */
export function isOAuthCallbackPath(pathname: string): boolean {
  return pathname.startsWith('/api/auth/callback')
}

/** signin 系のみ厳しめ制限（signin 画面・signin/google 等。callback は含めない） */
export function isSignInRateLimitPath(pathname: string): boolean {
  if (isOAuthCallbackPath(pathname)) return false
  return pathname === '/api/auth/signin' || pathname.startsWith('/api/auth/signin/')
}

/** Cloudflare Workers の caches.default（Node/標準 DOM 型には無い） */
function getEdgeDefaultCache(): Cache | null {
  if (typeof caches === 'undefined') return null
  const storage = caches as CacheStorage & { default?: Cache }
  return storage.default ?? null
}

function rateLimitCacheKey(ip: string, bucket: string): Request {
  return new Request(
    `https://deposit-management.rate-limit/${bucket}/${encodeURIComponent(ip)}`,
    { method: 'GET' }
  )
}

export function getClientIp(request: NextRequest): string {
  const cf = request.headers.get('cf-connecting-ip')
  if (cf && cf.trim()) return cf.trim()
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return 'unknown'
}

export type ApiRateLimitResult = {
  allowed: boolean
  count: number
  limit: number
}

export async function checkApiRateLimit(
  request: NextRequest,
  limit: number = API_RATE_LIMIT_PER_MINUTE,
  bucket: string = 'api'
): Promise<ApiRateLimitResult> {
  const ip = getClientIp(request)

  try {
    const cache = getEdgeDefaultCache()
    if (!cache) {
      return { allowed: true, count: 0, limit }
    }

    const cacheKey = rateLimitCacheKey(ip, bucket)
    const existing = await cache.match(cacheKey)

    let count = 0
    if (existing) {
      const raw = existing.headers.get('X-RateLimit-Count')
      const parsed = Number(raw)
      if (Number.isFinite(parsed) && parsed >= 0) count = parsed
    }

    count += 1

    if (count > limit) {
      return { allowed: false, count, limit }
    }

    await cache.put(
      cacheKey,
      new Response(null, {
        headers: {
          'X-RateLimit-Count': String(count),
          'Cache-Control': `max-age=${RATE_LIMIT_WINDOW_SECONDS}`,
        },
      })
    )

    return { allowed: true, count, limit }
  } catch {
    return { allowed: true, count: 0, limit }
  }
}

export async function checkSignInRateLimit(
  request: NextRequest
): Promise<ApiRateLimitResult> {
  return checkApiRateLimit(request, SIGNIN_RATE_LIMIT_PER_MINUTE, 'signin')
}
