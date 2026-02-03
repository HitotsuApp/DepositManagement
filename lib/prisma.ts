import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'isomorphic-ws'

neonConfig.webSocketConstructor = ws

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

export const getPrisma = () => {
  // 毎回Poolから作り直すことで、リクエスト間の衝突を完全に防ぐ
  const pool = new Pool({ connectionString })
  const adapter = new PrismaNeon(pool)
  return new PrismaClient({ adapter })
}

// 既存コードへの影響を最小限にするため prisma インスタンスも export するが、
// これも getPrisma() を呼び出すようにする
export const prisma = getPrisma()
