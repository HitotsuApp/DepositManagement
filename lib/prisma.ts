import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'isomorphic-ws'

neonConfig.webSocketConstructor = ws

const connectionString = process.env.DATABASE_URL

export const getPrisma = () => {
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const pool = new Pool({ connectionString })
  const adapter = new PrismaNeon(pool)
  return new PrismaClient({ adapter })
}
