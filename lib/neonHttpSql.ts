import { neon } from '@neondatabase/serverless'

/**
 * Neon の fetch 経由 SQL（Workers の CPU が Prisma Query Engine WASM より軽い）
 * Cloudflare Pages では Prisma がリクエスト毎インスタンス化されるため、このパスではこちらを使う。
 */
export function neonHttpSql() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  return neon(connectionString)
}
