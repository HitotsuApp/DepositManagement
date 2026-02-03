import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'isomorphic-ws'

// WebSocketの接続を安定させるための設定
neonConfig.webSocketConstructor = ws
// 接続が切断されたときに再試行しやすくする
neonConfig.useSecureWebSocket = true

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

// connectionTimeoutMillis を追加して、DBが起きるのを少し待つようにします
const pool = new Pool({ 
  connectionString,
  connectionTimeoutMillis: 10000, // 10秒まで待機を許可
})

const adapter = new PrismaNeon(pool)

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient({ 
  adapter,
  // ログを出力するようにすると、Cloudflareのログで原因が追いやすくなります
  log: ['error', 'warn'] 
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma