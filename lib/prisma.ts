import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'isomorphic-ws'

neonConfig.webSocketConstructor = ws

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

// Poolを外で定義して再利用（高速化の鍵）
const pool = new Pool({ connectionString })

export const getPrisma = () => {
  // PrismaClientはリクエストごとに新しく生成（I/Oエラー回避）
  const adapter = new PrismaNeon(pool)
  return new PrismaClient({ adapter })
}
