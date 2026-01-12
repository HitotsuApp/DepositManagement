import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface ImportRow {
  facilityName: string
  unitName: string
  residentName: string
  initialBalance: number
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const rows: ImportRow[] = body.rows || []

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No data to import' }, { status: 400 })
    }

    const results = {
      facilitiesCreated: 0,
      unitsCreated: 0,
      residentsCreated: 0,
      transactionsCreated: 0,
      errors: [] as string[],
    }

    // 施設・ユニット・利用者のマップを作成
    const facilityMap = new Map<string, number>()
    const unitMap = new Map<string, number>()
    const residentMap = new Map<string, number>()

    for (const row of rows) {
      try {
        // 施設の取得または作成
        let facilityId = facilityMap.get(row.facilityName)
        if (!facilityId) {
          let facility = await prisma.facility.findFirst({
            where: { name: row.facilityName, isActive: true },
          })
          if (!facility) {
            facility = await prisma.facility.create({
              data: {
                name: row.facilityName,
                sortOrder: 0,
                isActive: true,
              },
            })
            results.facilitiesCreated++
          }
          facilityId = facility.id
          facilityMap.set(row.facilityName, facilityId)
        }

        // ユニットの取得または作成
        const unitKey = `${facilityId}-${row.unitName}`
        let unitId = unitMap.get(unitKey)
        if (!unitId) {
          let unit = await prisma.unit.findFirst({
            where: {
              facilityId,
              name: row.unitName,
              isActive: true,
            },
          })
          if (!unit) {
            unit = await prisma.unit.create({
              data: {
                facilityId,
                name: row.unitName,
                isActive: true,
              },
            })
            results.unitsCreated++
          }
          unitId = unit.id
          unitMap.set(unitKey, unitId)
        }

        // 利用者の取得または作成
        const residentKey = `${facilityId}-${unitId}-${row.residentName}`
        let residentId = residentMap.get(residentKey)
        if (!residentId) {
          let resident = await prisma.resident.findFirst({
            where: {
              facilityId,
              unitId,
              name: row.residentName,
              isActive: true,
            },
          })
          if (!resident) {
            resident = await prisma.resident.create({
              data: {
                facilityId,
                unitId,
                name: row.residentName,
                isActive: true,
              },
            })
            results.residentsCreated++
          }
          residentId = resident.id
          residentMap.set(residentKey, residentId)
        }

        // 初期残高の取引を作成（残高が0より大きい場合のみ）
        if (row.initialBalance > 0) {
          // 既存の初期残高取引があるか確認
          const existingTransaction = await prisma.transaction.findFirst({
            where: {
              residentId,
              description: '初期残高',
            },
          })

          if (!existingTransaction) {
            await prisma.transaction.create({
              data: {
                residentId,
                transactionDate: new Date(),
                transactionType: 'in',
                amount: row.initialBalance,
                description: '初期残高',
                reason: null,
              },
            })
            results.transactionsCreated++
          }
        }
      } catch (error: any) {
        results.errors.push(`行の処理エラー: ${error.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error: any) {
    console.error('Failed to import data:', error)
    return NextResponse.json(
      { error: 'Failed to import data', details: error.message },
      { status: 500 }
    )
  }
}

