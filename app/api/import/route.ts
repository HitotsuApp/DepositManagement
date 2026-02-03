export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface ImportRow {
  facilityName: string
  unitName: string
  residentName: string
  initialBalance: number
  startDate?: string
  endDate?: string
  positionName?: string
  positionHolderName?: string
  sortOrder?: number
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
    const facilityInfoMap = new Map<string, { positionName?: string | null, positionHolderName?: string | null }>()
    const unitMap = new Map<string, number>()
    const residentMap = new Map<string, number>()

    // 日付文字列をDateオブジェクトに変換するヘルパー関数
    const parseDate = (dateString?: string, fieldName?: string): Date | null => {
      if (!dateString || dateString.trim() === '') {
        return null
      }
      // YYYY-MM-DD形式を検証
      const datePattern = /^\d{4}-\d{2}-\d{2}$/
      if (!datePattern.test(dateString.trim())) {
        if (fieldName) {
          results.errors.push(`${fieldName}の形式が不正です: ${dateString} (YYYY-MM-DD形式で入力してください)`)
        }
        return null
      }
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        if (fieldName) {
          results.errors.push(`${fieldName}の日付が無効です: ${dateString}`)
        }
        return null
      }
      return date
    }

    for (const row of rows) {
      try {
        // 施設の取得または作成
        let facilityId = facilityMap.get(row.facilityName)
        let facilityInfo = facilityInfoMap.get(row.facilityName)
        
        if (!facilityId) {
          let facility = await prisma.facility.findFirst({
            where: { name: row.facilityName, isActive: true },
          })
          if (!facility) {
            // 新規作成時は施設情報を設定
            // CSVに指定があればそれを使用、なければnull
            const facilityData: any = {
              name: row.facilityName,
              sortOrder: row.sortOrder ?? 0,
              isActive: true,
            }
            if (row.positionName) {
              facilityData.positionName = row.positionName
            }
            if (row.positionHolderName) {
              facilityData.positionHolderName = row.positionHolderName
            }
            facility = await prisma.facility.create({
              data: facilityData,
            })
            results.facilitiesCreated++
            // 施設情報をマップに保存
            facilityInfo = {
              positionName: facility.positionName,
              positionHolderName: facility.positionHolderName,
            }
          } else {
            // 既存施設の情報を更新（オプション項目のみ）
            const updateData: any = {}
            // CSVに指定がある場合のみ更新（既存値がnullの場合のみ）
            if (row.positionName && !facility.positionName) {
              updateData.positionName = row.positionName
            }
            if (row.positionHolderName && !facility.positionHolderName) {
              updateData.positionHolderName = row.positionHolderName
            }
            if (row.sortOrder !== undefined && facility.sortOrder === 0) {
              updateData.sortOrder = row.sortOrder
            }
            if (Object.keys(updateData).length > 0) {
              facility = await prisma.facility.update({
                where: { id: facility.id },
                data: updateData,
              })
            }
            // 施設情報をマップに保存（既存の値または更新後の値）
            facilityInfo = {
              positionName: facility.positionName,
              positionHolderName: facility.positionHolderName,
            }
          }
          facilityId = facility.id
          facilityMap.set(row.facilityName, facilityId)
          facilityInfoMap.set(row.facilityName, facilityInfo)
        } else {
          // 既に取得済みの施設情報を使用
          facilityInfo = facilityInfoMap.get(row.facilityName)
          
          // CSVに役職名・役職者名が指定されている場合、施設情報を更新（既存値がnullの場合のみ）
          if (row.positionName || row.positionHolderName) {
            const facility = await prisma.facility.findUnique({
              where: { id: facilityId },
            })
            if (facility) {
              const updateData: any = {}
              if (row.positionName && !facility.positionName) {
                updateData.positionName = row.positionName
              }
              if (row.positionHolderName && !facility.positionHolderName) {
                updateData.positionHolderName = row.positionHolderName
              }
              if (Object.keys(updateData).length > 0) {
                const updatedFacility = await prisma.facility.update({
                  where: { id: facilityId },
                  data: updateData,
                })
                // 施設情報をマップに更新
                facilityInfo = {
                  positionName: updatedFacility.positionName,
                  positionHolderName: updatedFacility.positionHolderName,
                }
                facilityInfoMap.set(row.facilityName, facilityInfo)
              }
            }
          }
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
            // 新規作成時は利用者情報を設定
            const residentData: any = {
              facilityId,
              unitId,
              name: row.residentName,
              isActive: true,
            }
            const startDate = parseDate(row.startDate, `利用者「${row.residentName}」の入居日`)
            const endDate = parseDate(row.endDate, `利用者「${row.residentName}」の退居日`)
            if (startDate) {
              residentData.startDate = startDate
            }
            if (endDate) {
              residentData.endDate = endDate
            }
            resident = await prisma.resident.create({
              data: residentData,
            })
            results.residentsCreated++
          } else {
            // 既存利用者の情報を更新（オプション項目のみ、空の場合は更新しない）
            const updateData: any = {}
            const startDate = parseDate(row.startDate, `利用者「${row.residentName}」の入居日`)
            const endDate = parseDate(row.endDate, `利用者「${row.residentName}」の退居日`)
            if (startDate && !resident.startDate) {
              updateData.startDate = startDate
            }
            if (endDate && !resident.endDate) {
              updateData.endDate = endDate
            }
            if (Object.keys(updateData).length > 0) {
              resident = await prisma.resident.update({
                where: { id: resident.id },
                data: updateData,
              })
            }
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

