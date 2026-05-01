import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'isomorphic-ws'

neonConfig.webSocketConstructor = ws

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

/**
 * Neon serverless は WebSocket 経由の接続のため、リクエストごとに Pool / Prisma を
 * 新規作成すると接続が乱立し、切断時に "Connection terminated unexpectedly" や
 * プレビューAPI失敗の原因になる。開発時の HMR でも global に1本持ち続ける。
 */
const globalForPrisma = globalThis as typeof globalThis & {
  __prisma?: PrismaClient
}

function createPrisma(): PrismaClient {
  const pool = new Pool({ connectionString })
  const adapter = new PrismaNeon(pool)
  return new PrismaClient({ adapter })
}

export const getPrisma = (): PrismaClient => {
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = createPrisma()
  }
  return globalForPrisma.__prisma
}

export const prisma = getPrisma()
