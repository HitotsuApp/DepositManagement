export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { validateTransactionCreateBody } from '@/lib/transactionCreateValidation'

export async function POST(request: Request) {
  const prisma = getPrisma()
  try {
    const body = await request.json()
    const validated = validateTransactionCreateBody(body as Record<string, unknown>)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }
    const d = validated.data

    const transaction = await prisma.transaction.create({
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

    return NextResponse.json(transaction)
  } catch (error) {
    console.error('Failed to create transaction:', error)
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
  }
}
