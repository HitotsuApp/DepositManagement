export const runtime = 'edge'

import { NextResponse } from 'next/server'
import {
  validateTransactionCreateBody,
  type TransactionCreatePayload,
} from '@/lib/transactionCreateValidation'
import { neonHttpSql } from '@/lib/neonHttpSql'
import { createTransactionsBatchNeon } from '@/lib/transactionWriteSql'

/** ストック一括登録の上限（1 リクエストあたり） */
const MAX_BATCH_ITEMS = 100

export async function POST(request: Request) {
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

    const sql = neonHttpSql()
    const created = await createTransactionsBatchNeon(sql, payloads)

    return NextResponse.json({ transactions: created })
  } catch (error) {
    console.error('Failed to create transactions batch:', error)
    return NextResponse.json({ error: 'Failed to create transactions batch' }, { status: 500 })
  }
}
