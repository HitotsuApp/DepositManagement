export const runtime = 'edge'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import {
  truncateForTransactionField,
  validateLedgerImportCommitItem,
  type LedgerImportCommitItem,
} from '@/lib/depositLedgerImportCommit'

const MAX_COMMIT = 5000

/** replace_month: 対象年月の既存取引を該当利用者から削除してから登録。append: そのまま追加 */
export async function POST(request: Request) {
  const prisma = getPrisma()
  try {
    const body = await request.json()
    const facilityId = Number(body.facilityId)
    const baseYear = Number(body.baseYear)
    const sheetMonth = Number(body.sheetMonth)
    const mode = body.mode === 'replace_month' ? 'replace_month' : 'append'
    const itemsRaw = body.commitItems

    if (!Number.isInteger(facilityId) || facilityId <= 0) {
      return NextResponse.json({ error: 'facilityId が不正です' }, { status: 400 })
    }
    if (!Number.isInteger(baseYear) || !Number.isInteger(sheetMonth)) {
      return NextResponse.json({ error: 'baseYear / sheetMonth が不正です' }, { status: 400 })
    }
    if (sheetMonth < 1 || sheetMonth > 12) {
      return NextResponse.json({ error: 'sheetMonth が不正です' }, { status: 400 })
    }

    if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
      return NextResponse.json({ error: 'commitItems が空です' }, { status: 400 })
    }
    if (itemsRaw.length > MAX_COMMIT) {
      return NextResponse.json(
        { error: `1回の取込は${MAX_COMMIT}件までです` },
        { status: 400 }
      )
    }

    const facility = await prisma.facility.findFirst({
      where: { id: facilityId, isActive: true },
    })
    if (!facility) {
      return NextResponse.json({ error: '施設が見つかりません' }, { status: 404 })
    }

    const validated: LedgerImportCommitItem[] = []

    for (let i = 0; i < itemsRaw.length; i++) {
      const v = validateLedgerImportCommitItem(itemsRaw[i] as Record<string, unknown>, i)
      if (!v.ok) {
        return NextResponse.json({ error: v.error }, { status: 400 })
      }
      validated.push(v.data)
    }

    const residentIds = [...new Set(validated.map((c) => c.residentId))]
    const residents = await prisma.resident.findMany({
      where: { id: { in: residentIds }, facilityId, isActive: true },
      select: { id: true },
    })
    if (residents.length !== residentIds.length) {
      return NextResponse.json(
        { error: '施設に属しない利用者IDが含まれています' },
        { status: 400 }
      )
    }

    const rangeStart = new Date(baseYear, sheetMonth - 1, 1, 0, 0, 0, 0)
    const rangeEnd = new Date(baseYear, sheetMonth, 0, 23, 59, 59, 999)

    let truncatedFields = false
    const created = await prisma.$transaction(async (tx) => {
      if (mode === 'replace_month') {
        for (const rid of residentIds) {
          await tx.transaction.deleteMany({
            where: {
              residentId: rid,
              transactionDate: { gte: rangeStart, lte: rangeEnd },
            },
          })
        }
      }

      const out: Awaited<ReturnType<typeof tx.transaction.create>>[] = []
      for (const c of validated) {
        const { description, payee, truncated } = truncateForTransactionField(
          c.description,
          c.payee
        )
        if (truncated) truncatedFields = true
        const row = await tx.transaction.create({
          data: {
            residentId: c.residentId,
            transactionDate: new Date(c.transactionDate),
            transactionType: c.transactionType,
            amount: c.amount,
            description,
            payee,
            reason: null,
          },
        })
        out.push(row)
      }
      return out
    })

    return NextResponse.json({
      success: true,
      createdCount: created.length,
      mode,
      truncatedFields,
    })
  } catch (e) {
    console.error('deposit-ledger commit error:', e)
    return NextResponse.json(
      { error: '取込に失敗しました', details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
