import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'isomorphic-ws'

neonConfig.webSocketConstructor = ws

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

/**
 * - **Vercel Edge 等**: Isolate あたり 1 本の PrismaClient + Pool を `globalThis` に再利用する。
 * - **Cloudflare Workers / Pages**: 「別リクエストの I/O を共有できない」制限があり、
 *   シングルトンにすると `Cannot perform I/O on behalf of a different request` で 500 になる。
 *   そのため `CF_PAGES=1`（Pages 本番が注入）のときは **常にリクエストごとに新規 Client**。
 *
 * 強制: `PRISMA_NEW_CLIENT_EACH_REQUEST=true`（切り分け・他ホスト向けロールバック）。
 *
 * Neon では DATABASE_URL に **プーラー用ホスト**（`-pooler`）を推奨。README を参照。
 */
const globalForPrisma = globalThis as typeof globalThis & {
  __prisma?: PrismaClient
}

function createPrisma(): PrismaClient {
  const pool = new Pool({ connectionString })
  const adapter = new PrismaNeon(pool)
  return new PrismaClient({ adapter })
}

const newClientEachRequest =
  process.env.PRISMA_NEW_CLIENT_EACH_REQUEST === 'true' ||
  process.env.PRISMA_FORCE_NEW_CLIENT_EACH_REQUEST === 'true'

/** Cloudflare Pages がビルド時・実行時に注入（通常は本番で `1`） */
const isCloudflarePages =
  process.env.CF_PAGES === '1' || process.env.CF_PAGES === 'true'

export const getPrisma = (): PrismaClient => {
  if (newClientEachRequest || isCloudflarePages) {
    return createPrisma()
  }
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = createPrisma()
  }
  return globalForPrisma.__prisma
}
