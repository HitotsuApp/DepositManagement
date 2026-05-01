import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'isomorphic-ws'

neonConfig.webSocketConstructor = ws

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

/**
 * - 開発: HMR や短時間に複数リクエストが走るため global に1本キャッシュする。
 * - 本番（Edge / サーバーレス）: ワーカー再開後も global の接続が古いまま残り
 *   クエリ失敗（施設・ユニット取得エラー等）になることがあるため、都度作り直す。
 */
const globalForPrisma = globalThis as typeof globalThis & {
  __prisma?: PrismaClient
}

function createPrisma(): PrismaClient {
  const pool = new Pool({ connectionString })
  const adapter = new PrismaNeon(pool)
  return new PrismaClient({ adapter })
}

const isDev = process.env.NODE_ENV === 'development'

export const getPrisma = (): PrismaClient => {
  if (isDev) {
    if (!globalForPrisma.__prisma) {
      globalForPrisma.__prisma = createPrisma()
    }
    return globalForPrisma.__prisma
  }
  return createPrisma()
}
