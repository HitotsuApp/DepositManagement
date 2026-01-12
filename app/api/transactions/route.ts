import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // バリデーション
    if (!body.residentId || !body.transactionDate || !body.transactionType || !body.amount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // 訂正入力の場合は理由が必須
    if ((body.transactionType === 'correct_in' || body.transactionType === 'correct_out') && !body.reason) {
      return NextResponse.json(
        { error: 'Reason is required for correction transactions' },
        { status: 400 }
      )
    }

    const transaction = await prisma.transaction.create({
      data: {
        residentId: body.residentId,
        transactionDate: new Date(body.transactionDate),
        transactionType: body.transactionType,
        amount: body.amount,
        description: body.description || null,
        payee: body.payee || null,
        reason: body.reason || null,
      },
    })

    return NextResponse.json(transaction)
  } catch (error) {
    console.error('Failed to create transaction:', error)
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
  }
}

