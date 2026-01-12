const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function clearDatabase() {
  try {
    console.log('データベースをクリアしています...')
    
    // 外部キー制約を無効化（SQLiteの場合）
    await prisma.$executeRaw`PRAGMA foreign_keys = OFF`
    
    // すべてのテーブルのデータを削除（外部キーの順序を考慮）
    await prisma.transaction.deleteMany({})
    await prisma.resident.deleteMany({})
    await prisma.unit.deleteMany({})
    await prisma.facility.deleteMany({})
    
    // 外部キー制約を再有効化
    await prisma.$executeRaw`PRAGMA foreign_keys = ON`
    
    console.log('✅ データベースのクリアが完了しました')
  } catch (error) {
    console.error('❌ エラーが発生しました:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

clearDatabase()
