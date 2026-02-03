import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

// Cloudflare Workers/Pages (Edge Runtime) で WebSocket を動かすための設定
// Edge Runtime環境では、WebSocketが利用できないため、wsパッケージを使用
// Cloudflare Edge Runtime環境の検出（複数の方法でチェック）
const isEdgeRuntime = 
  process.env.NEXT_RUNTIME === 'edge' ||
  typeof globalThis.WebSocket === 'undefined' ||
  (typeof globalThis !== 'undefined' && (globalThis as any).EdgeRuntime !== undefined)

// Edge Runtime環境では、常にWebSocket設定を適用
if (isEdgeRuntime) {
  neonConfig.webSocketConstructor = ws
}

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set')
}

// Poolを作成してPrismaNeonアダプターに渡す
const pool = new Pool({ connectionString })
const adapter = new PrismaNeon(pool)

// 開発中にグローバル変数を汚染しないための処理
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
