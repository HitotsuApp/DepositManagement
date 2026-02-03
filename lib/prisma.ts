import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'isomorphic-ws'

// WebSocket設定
neonConfig.webSocketConstructor = ws

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

// リクエストごとに新しいPoolとAdapterを作成する
// ※Edge Runtimeではこちらの方が安定します
export const getPrisma = () => {
  const pool = new Pool({ connectionString })
  const adapter = new PrismaNeon(pool)
  return new PrismaClient({ adapter })
}

// 既存のコードとの互換性のために prisma を export しますが、
// 毎回新しいインスタンスを返すようにします
export const prisma = getPrisma()