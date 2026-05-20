import { neon } from '@neondatabase/serverless'

export type NeonSql = ReturnType<typeof neon>

/**
 * Cloudflare Pages（Workers）ではリクエスト間で I/O を共有できないため、Isolate ごとにインスタンスを分ける。
 * `next dev` など Node では `neon()` を再利用し、並列コンパイル時に無駄なクライアント生成を抑える。
 */
const globalForNeon = globalThis as typeof globalThis & {
  __depositMgmt_neonSql?: NeonSql
}

const isCloudflarePages =
  process.env.CF_PAGES === '1' || process.env.CF_PAGES === 'true'

/**
 * Neon の fetch 経由 SQL（Workers の CPU が Prisma Query Engine WASM より軽い）
 * Cloudflare Pages では Prisma がリクエスト毎インスタンス化されるため、このパスではこちらを使う。
 */
export function neonHttpSql(): NeonSql {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  if (!isCloudflarePages && globalForNeon.__depositMgmt_neonSql) {
    return globalForNeon.__depositMgmt_neonSql
  }

  const sql = neon(connectionString) as NeonSql

  if (!isCloudflarePages) {
    globalForNeon.__depositMgmt_neonSql = sql
  }
  return sql
}
