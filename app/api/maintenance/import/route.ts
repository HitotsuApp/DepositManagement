export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'

interface ImportRow {
  facilityName: string
  unitName: string
  residentName: string
  endDate: string
  transactionDate: string
  transactionType: string
  amount: number
  description?: string
  payee?: string
  reason?: string
}

export async function POST(request: Request) {
  const prisma = getPrisma()
  try {
    const body = await request.json()
    const rows: ImportRow[] = body.rows || []

    if (rows.length === 0) {
      return NextResponse.json({ error: 'インポートするデータがありません' }, { status: 400 })
    }

    const results = {
      residentsRestored: 0,
      transactionsRestored: 0,
      errors: [] as string[],
    }

    // 施設・ユニット・利用者のマップを作成
    const facilityMap = new Map<string, number>()
    const unitMap = new Map<string, number>()
    const residentMap = new Map<string, number>()

    // 日付文字列をDateオブジェクトに変換するヘルパー関数
    const parseDate = (dateString: string, fieldName: string): Date | null => {
      if (!dateString || dateString.trim() === '') {
        return null
      }
      // 複数の日付形式に対応
      // YYYY-MM-DD, YYYY/MM/DD, YYYY年MM月DD日
      let normalized = dateString.trim()
        .replace(/\//g, '-')
        .replace(/年/g, '-')
        .replace(/月/g, '-')
        .replace(/日/g, '')
      
      // 0埋め処理: YYYY-M-D を YYYY-MM-DD に変換
      const parts = normalized.split('-')
      if (parts.length === 3) {
        const year = parts[0]
        const month = parts[1].padStart(2, '0')
        const day = parts[2].padStart(2, '0')
        normalized = `${year}-${month}-${day}`
      }
      
      const datePattern = /^\d{4}-\d{2}-\d{2}$/
      if (!datePattern.test(normalized)) {
        results.errors.push(`${fieldName}の形式が不正です: ${dateString} (YYYY-MM-DD形式で入力してください)`)
        return null
      }
      const date = new Date(normalized)
      if (isNaN(date.getTime())) {
        results.errors.push(`${fieldName}の日付が無効です: ${dateString}`)
        return null
      }
      return date
    }

    // 終了者情報をグループ化（同じ利用者のTransactionをまとめる）
    const residentGroups = new Map<string, {
      facilityName: string
      unitName: string
      residentName: string
      endDate: string
      transactions: ImportRow[]
    }>()

    for (const row of rows) {
      const key = `${row.facilityName}-${row.unitName}-${row.residentName}`
      if (!residentGroups.has(key)) {
        residentGroups.set(key, {
          facilityName: row.facilityName,
          unitName: row.unitName,
          residentName: row.residentName,
          endDate: row.endDate,
          transactions: [],
        })
      }
      residentGroups.get(key)!.transactions.push(row)
    }

    // 終了者情報とTransactionデータを復元
    for (const [key, group] of residentGroups) {
      try {
        // 施設の取得または作成
        let facilityId = facilityMap.get(group.facilityName)
        if (!facilityId) {
          let facility = await prisma.facility.findFirst({
            where: { name: group.facilityName, isActive: true },
          })
          if (!facility) {
            facility = await prisma.facility.create({
              data: {
                name: group.facilityName,
                isActive: true,
              },
            })
          }
          facilityId = facility.id
          facilityMap.set(group.facilityName, facilityId)
        }

        // ユニットの取得または作成
        const unitKey = `${facilityId}-${group.unitName}`
        let unitId = unitMap.get(unitKey)
        if (!unitId) {
          let unit = await prisma.unit.findFirst({
            where: {
              facilityId,
              name: group.unitName,
              isActive: true,
            },
          })
          if (!unit) {
            unit = await prisma.unit.create({
              data: {
                facilityId,
                name: group.unitName,
                isActive: true,
              },
            })
          }
          unitId = unit.id
          unitMap.set(unitKey, unitId)
        }

        // 利用者の取得または作成
        const residentKey = `${facilityId}-${unitId}-${group.residentName}`
        let residentId = residentMap.get(residentKey)
        
        const endDate = parseDate(group.endDate, `利用者「${group.residentName}」の終了日`)
        if (!endDate) {
          results.errors.push(`利用者「${group.residentName}」の終了日が不正です`)
          continue
        }
        
        if (!residentId) {
          let resident = await prisma.resident.findFirst({
            where: {
              facilityId,
              unitId,
              name: group.residentName,
            },
          })
          
          if (!resident) {
            // 新規作成
            resident = await prisma.resident.create({
              data: {
                facilityId,
                unitId,
                name: group.residentName,
                endDate,
                isActive: true, // インポート時はisActiveをtrueにする
              },
            })
            results.residentsRestored++
          } else {
            // 既存の利用者を更新
            if (!resident.endDate) {
              resident = await prisma.resident.update({
                where: { id: resident.id },
                data: { endDate },
              })
            } else if (resident.endDate.getTime() !== endDate.getTime()) {
              // 終了日が異なる場合はエラー
              results.errors.push(`利用者「${group.residentName}」の終了日が既存データと異なります`)
              continue
            }
          }
          residentId = resident.id
          residentMap.set(residentKey, residentId)
        }

        // Transactionデータの復元
        for (const transactionRow of group.transactions) {
          const transactionDate = parseDate(transactionRow.transactionDate, '取引日')
          if (!transactionDate) {
            continue
          }

          // 既存のTransactionがあるか確認（重複チェック）
          const existingTransaction = await prisma.transaction.findFirst({
            where: {
              residentId,
              transactionDate,
              transactionType: transactionRow.transactionType,
              amount: transactionRow.amount,
            },
          })

          if (existingTransaction) {
            results.errors.push(
              `利用者「${group.residentName}」の取引が既に存在します: ${transactionDate.toLocaleDateString('ja-JP')} ${transactionRow.transactionType} ${transactionRow.amount}円`
            )
            continue
          }

          await prisma.transaction.create({
            data: {
              residentId,
              transactionDate,
              transactionType: transactionRow.transactionType,
              amount: transactionRow.amount,
              description: transactionRow.description || null,
              payee: transactionRow.payee || null,
              reason: transactionRow.reason || null,
            },
          })
          results.transactionsRestored++
        }
      } catch (error: any) {
        results.errors.push(`行の処理エラー: ${error.message}`)
      }
    }

    // エラーがある場合はエラーを返す
    if (results.errors.length > 0) {
      return NextResponse.json(
        { 
          error: 'インポートエラーが発生しました',
          details: results.errors,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error: any) {
    console.error('Failed to import maintenance data:', error)
    return NextResponse.json(
      { error: 'インポートに失敗しました', details: error.message },
      { status: 500 }
    )
  }
}
