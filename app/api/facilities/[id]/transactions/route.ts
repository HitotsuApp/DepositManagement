export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getPrisma } from '@/lib/prisma'
import { validateId } from '@/lib/validation'
import { getResidentDisplayName } from '@/lib/displayName'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  console.time('prisma-init')
  const prisma = getPrisma()
  console.timeEnd('prisma-init')

  try {
    const facilityId = validateId(params.id)
    if (!facilityId) {
      return NextResponse.json(
        { error: '無効なIDです' },
        { status: 400 }
      )
    }
    const { searchParams } = new URL(request.url)
    const year = Number(searchParams.get('year')) || new Date().getFullYear()
    const month = Number(searchParams.get('month')) || new Date().getMonth() + 1

    // 指定年月の開始日と終了日を計算
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)
    // 前月の最終日（前月の残高を計算するため）
    const previousMonthEndDate = new Date(year, month - 1, 0, 23, 59, 59, 999)

    console.time('main-query')
    // 施設の存在確認と利用者一覧を取得（取引は別クエリで取得するため簡略化）
    const facility = await prisma.facility.findUnique({
      where: { id: facilityId },
      select: {
        id: true,
        residents: {
          where: {
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            displayNamePrefix: true,
            namePrefixDisplayOption: true,
          },
          orderBy: { name: 'asc' },
        },
      },
    })

    console.timeEnd('main-query')

    if (!facility) {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }

    console.time('previous-balance-aggregate')
    // 前月までの残高をDB側で一括集計（パフォーマンス最適化）
    interface PreviousBalanceRow {
      residentId: number
      balance: number | string // PostgreSQLのSUMはnumeric型を返すため
    }

    let previousBalances = new Map<number, number>()
    try {
      const previousBalancesRaw = await prisma.$queryRaw<PreviousBalanceRow[]>`
        SELECT 
          "residentId",
          COALESCE(SUM(
            CASE 
              WHEN "transactionType" IN ('in', 'past_correct_in') THEN amount
              WHEN "transactionType" IN ('out', 'past_correct_out') THEN -amount
              ELSE 0
            END
          ), 0) as balance
        FROM "Transaction"
        WHERE "transactionDate" <= ${previousMonthEndDate}
          AND "transactionType" NOT IN ('correct_in', 'correct_out')
          AND "residentId" IN (
            SELECT id FROM "Resident"
            WHERE "facilityId" = ${facilityId}
              AND "isActive" = true
          )
        GROUP BY "residentId"
      `

      // Mapに変換（PostgreSQLのnumeric型をNumberに変換）
      previousBalancesRaw.forEach(row => {
        previousBalances.set(row.residentId, Number(row.balance))
      })
    } catch (error) {
      console.error('Failed to calculate previous balances with aggregate query:', error)
      throw new Error('前月残高の計算に失敗しました')
    }
    console.timeEnd('previous-balance-aggregate')

    console.time('balance-calculation-query')
    // DB側で残高を計算（ウィンドウ関数を使用してパフォーマンス最適化）
    // JavaScript側のループ処理を削減し、DB側で効率的に計算
    interface TransactionWithBalanceRow {
      id: number
      transactionDate: Date
      transactionType: string
      amount: number
      description: string | null
      payee: string | null
      reason: string | null
      residentId: number
      residentName: string
      balance: number | string // PostgreSQLのSUMはnumeric型を返すため
      facility_balance: number | string
    }

    // 利用者IDと表示名のマップを作成（画面表示用）
    const residentDisplayNameMap = new Map<number, string>()
    facility.residents.forEach(resident => {
      residentDisplayNameMap.set(
        resident.id,
        getResidentDisplayName(resident as any, 'screen')
      )
    })

    // 利用者IDのリストを作成
    const residentIds = Array.from(residentDisplayNameMap.keys())

    /** 施設の前月末時点の預り金合計（アクティブ利用者ごとの前月末残高の合計。取引がない利用者は0） */
    let facilityOpeningTotal = 0
    residentIds.forEach((rid) => {
      facilityOpeningTotal += previousBalances.get(rid) ?? 0
    })

    let transactionsWithBalance: TransactionWithBalanceRow[] = []
    if (residentIds.length > 0) {
      // 前月残高をサブクエリで取得し、ウィンドウ関数で累積残高を計算
      // 施設残高は全利用者を通じた transaction_amount の累積に前月末施設合計を加算
      transactionsWithBalance = await prisma.$queryRaw<TransactionWithBalanceRow[]>`
        WITH previous_balances AS (
          SELECT 
            "residentId",
            COALESCE(SUM(
              CASE 
                WHEN "transactionType" IN ('in', 'past_correct_in') THEN amount
                WHEN "transactionType" IN ('out', 'past_correct_out') THEN -amount
                ELSE 0
              END
            ), 0) as balance
          FROM "Transaction"
          WHERE "transactionDate" <= ${previousMonthEndDate}
            AND "transactionType" NOT IN ('correct_in', 'correct_out')
            AND "residentId" IN (${Prisma.join(residentIds)})
          GROUP BY "residentId"
        ),
        facility_opening AS (
          SELECT COALESCE(SUM(COALESCE(pb.balance, 0)), 0)::numeric AS total
          FROM "Resident" r
          LEFT JOIN previous_balances pb ON pb."residentId" = r.id
          WHERE r."facilityId" = ${facilityId}
            AND r."isActive" = true
        ),
        current_transactions AS (
          SELECT 
            t.id,
            t."transactionDate",
            t."transactionType",
            t.amount,
            t.description,
            t.payee,
            t.reason,
            t."residentId",
            r.name as "residentName",
            COALESCE(pb.balance, 0) as previous_balance,
            CASE 
              WHEN t."transactionType" IN ('in', 'past_correct_in') THEN t.amount
              WHEN t."transactionType" IN ('out', 'past_correct_out') THEN -t.amount
              ELSE 0
            END as transaction_amount
          FROM "Transaction" t
          INNER JOIN "Resident" r ON t."residentId" = r.id
          LEFT JOIN previous_balances pb ON t."residentId" = pb."residentId"
          WHERE t."transactionDate" >= ${startDate}
            AND t."transactionDate" <= ${endDate}
            AND t."residentId" IN (${Prisma.join(residentIds)})
            AND r."facilityId" = ${facilityId}
            AND r."isActive" = true
        )
        SELECT 
          ct.id,
          ct."transactionDate",
          ct."transactionType",
          ct.amount,
          ct.description,
          ct.payee,
          ct.reason,
          ct."residentId",
          ct."residentName",
          (ct.previous_balance + SUM(ct.transaction_amount) OVER (
            PARTITION BY ct."residentId" 
            ORDER BY ct."transactionDate" ASC, ct.id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ))::numeric as balance,
          (fo.total + SUM(ct.transaction_amount) OVER (
            ORDER BY ct."transactionDate" ASC, ct.id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ))::numeric as facility_balance
        FROM current_transactions ct
        CROSS JOIN facility_opening fo
        ORDER BY ct."transactionDate" ASC, ct.id ASC
      `
    }
    console.timeEnd('balance-calculation-query')

    console.time('processing-logic')
    // データを整形（PostgreSQLのnumeric型をNumberに変換、表示名を適用）
    let allTransactions = transactionsWithBalance.map(t => ({
      id: t.id,
      transactionDate: t.transactionDate.toISOString(),
      transactionType: t.transactionType,
      amount: t.amount,
      description: t.description,
      payee: t.payee,
      reason: t.reason,
      balance: Number(t.balance),
      facilityBalance: Number(t.facility_balance),
      residentId: t.residentId,
      residentName: residentDisplayNameMap.get(t.residentId) ?? t.residentName,
    }))

    // 施設の前月末合計が0でないとき、明細先頭に「前月より繰越」行（当月取引0件でも表示）
    if (facilityOpeningTotal !== 0) {
      const previousMonthEnd = new Date(year, month - 1, 0, 23, 59, 59, 999)
      allTransactions = [
        {
          id: -1,
          transactionDate: previousMonthEnd.toISOString(),
          transactionType: 'carryover_facility',
          amount: 0,
          description: null,
          payee: null,
          reason: null,
          balance: 0,
          facilityBalance: facilityOpeningTotal,
          residentId: -1,
          residentName: '',
          isCarryOver: true,
        } as any,
        ...allTransactions,
      ]
    }
    console.timeEnd('processing-logic')

    const response = NextResponse.json({
      transactions: allTransactions,
    })
    
    // キャッシュヘッダーの追加（更新頻度が高いため短いキャッシュ時間）
    response.headers.set('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=59')
    
    return response
  } catch (error) {
    console.error('Failed to fetch facility transactions:', error)
    return NextResponse.json({ error: 'Failed to fetch facility transactions' }, { status: 500 })
  }
}
