export const runtime = 'edge'

import { requireApiSession } from "@/lib/requireApiSession"
import { NextResponse } from 'next/server'
import { validateTransactionCreateBody } from '@/lib/transactionCreateValidation'
import { neonHttpSql } from '@/lib/neonHttpSql'
import { createTransactionNeon } from '@/lib/transactionWriteSql'

export async function POST(request: Request) {
  const unauthorized = await requireApiSession()
  if (unauthorized) return unauthorized

  try {
    const body = await request.json()
    const validated = validateTransactionCreateBody(body as Record<string, unknown>)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }
    const d = validated.data

    const sql = neonHttpSql()
    const transaction = await createTransactionNeon(sql, d)

    return NextResponse.json(transaction)
  } catch (error) {
    console.error('Failed to create transaction:', error)
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
  }
}
