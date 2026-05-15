import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'isomorphic-ws'

neonConfig.webSocketConstructor = ws

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

/**
 * Isolate（サーバレスワーカー）あたり 1 本の PrismaClient + Pool を再利用する。
 *
 * `.env`: `PRISMA_NEW_CLIENT_EACH_REQUEST=true` のときのみ、従来どおりリクエストごとに
 * Client を生成する（接続トラブル切り分け・緊急ロールバック用）。
 *
 * Neon サーバレスでは DATABASE_URL に **プーラー用ホスト**（`-pooler`）を推奨。README を参照。
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

export const getPrisma = (): PrismaClient => {
  if (newClientEachRequest) {
    return createPrisma()
  }
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = createPrisma()
  }
  return globalForPrisma.__prisma
}
