/**
 * Cloudflare Edge 向け Bot / スキャン対策。
 * cf-ipcountry 未設定（ローカル dev）では geo ブロックは fail-open。
 */

import type { NextRequest } from 'next/server'

const ALLOWED_COUNTRY = 'JP'

/** 脆弱性スキャナがよく叩くパス・拡張子 */
const PROBE_PATH_RE =
  /\.(gz|rar|7z|zip|tar|bz2|sql|bak|old|env|log|ini|conf|cfg|php|asp|aspx|jsp)$/i

const PROBE_PREFIXES = [
  '/symfony',
  '/wp-admin',
  '/wp-login',
  '/wp-content',
  '/wordpress',
  '/phpmyadmin',
  '/.env',
  '/.git',
  '/vendor/',
  '/actuator',
  '/server-status',
  '/xmlrpc.php',
  '/admin.php',
] as const

/** 未ログインでも signin へ誘導する正当なアプリページ */
const KNOWN_PAGE_EXACT = new Set(['/', '/facility-select', '/print'])

const KNOWN_PAGE_PREFIXES = [
  '/facilities/',
  '/residents/',
  '/print/',
  '/maintenance',
  '/import',
  '/master',
  '/whiteboard',
  '/cash-verification',
] as const

export function getCountryCode(request: NextRequest): string | null {
  const cc = request.headers.get('cf-ipcountry')
  if (!cc?.trim()) return null
  return cc.trim().toUpperCase()
}

/** 日本以外の IP を拒否（ヘッダー無しは許可） */
export function isGeoBlocked(request: NextRequest): boolean {
  const cc = getCountryCode(request)
  if (!cc) return false
  return cc !== ALLOWED_COUNTRY
}

export function isObviousProbePath(pathname: string): boolean {
  if (PROBE_PATH_RE.test(pathname)) return true
  const lower = pathname.toLowerCase()
  return PROBE_PREFIXES.some(
    (prefix) => lower === prefix || lower.startsWith(prefix)
  )
}

export function isKnownAppPagePath(pathname: string): boolean {
  if (KNOWN_PAGE_EXACT.has(pathname)) return true
  return KNOWN_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix)
  )
}
