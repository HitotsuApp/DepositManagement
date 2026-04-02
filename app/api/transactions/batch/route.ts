export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import {
  validateTransactionCreateBody,
  type TransactionCreatePayload,
} from '@/lib/transactionCreateValidation'

/** ストック一括登録の上限（1 リクエストあたり） */
const MAX_BATCH_ITEMS = 100

export async function POST(request: Request) {
  const prisma = getPrisma()
  try {
    const body = await request.json()
    const itemsRaw = body?.items

    if (!Array.isArray(itemsRaw)) {
      return NextResponse.json(
        { error: 'items must be an array' },
        { status: 400 }
      )
    }

    if (itemsRaw.length === 0) {
      return NextResponse.json(
        { error: 'items must not be empty' },
        { status: 400 }
      )
    }

    if (itemsRaw.length > MAX_BATCH_ITEMS) {
      return NextResponse.json(
        { error: `items must be at most ${MAX_BATCH_ITEMS} entries` },
        { status: 400 }
      )
    }

    const payloads: TransactionCreatePayload[] = []

    for (let i = 0; i < itemsRaw.length; i++) {
      const item = itemsRaw[i]
      if (typeof item !== 'object' || item === null) {
        return NextResponse.json(
          { error: 'Invalid item', index: i },
          { status: 400 }
        )
      }
      const v = validateTransactionCreateBody(item as Record<string, unknown>)
      if (!v.ok) {
        return NextResponse.json({ error: v.error, index: i }, { status: 400 })
      }
      payloads.push(v.data)
    }

    const created = await prisma.$transaction(async (tx) => {
      const out: Awaited<ReturnType<typeof tx.transaction.create>>[] = []
      for (const d of payloads) {
        const row = await tx.transaction.create({
          data: {
            residentId: d.residentId,
            transactionDate: d.transactionDate,
            transactionType: d.transactionType,
            amount: d.amount,
            description: d.description,
            payee: d.payee,
            reason: d.reason,
          },
        })
        out.push(row)
      }
      return out
    })

    return NextResponse.json({ transactions: created })
  } catch (error) {
    console.error('Failed to create transactions batch:', error)
    return NextResponse.json({ error: 'Failed to create transactions batch' }, { status: 500 })
  }
}
