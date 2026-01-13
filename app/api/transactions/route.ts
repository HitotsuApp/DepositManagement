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

    // 過去訂正入力の場合は理由が必須
    if ((body.transactionType === 'past_correct_in' || body.transactionType === 'past_correct_out') && !body.reason) {
      return NextResponse.json(
        { error: 'Reason is required for past correction transactions' },
        { status: 400 }
      )
    }

    const transactionDate = new Date(body.transactionDate)
    const transactionYear = transactionDate.getFullYear()
    const transactionMonth = transactionDate.getMonth() + 1
    const currentDate = new Date()
    const currentYear = currentDate.getFullYear()
    const currentMonth = currentDate.getMonth() + 1

    // 通常の入金・出金の場合、対象日が現在の月と一致しているかチェック
    if (body.transactionType === 'in' || body.transactionType === 'out') {
      if (transactionYear !== currentYear || transactionMonth !== currentMonth) {
        return NextResponse.json(
          { error: '対象日は今月の日付を入力してください' },
          { status: 400 }
        )
      }
    }

    // 過去訂正入力の場合、対象日が過去月であることを確認（今月の日付は許可しない）
    if (body.transactionType === 'past_correct_in' || body.transactionType === 'past_correct_out') {
      // 今月または未来の月の場合はエラー
      if (transactionYear > currentYear || (transactionYear === currentYear && transactionMonth >= currentMonth)) {
        return NextResponse.json(
          { error: '過去訂正入力は過去の月の日付のみ入力できます' },
          { status: 400 }
        )
      }
    }

    const transaction = await prisma.transaction.create({
      data: {
        residentId: Number(body.residentId),
        transactionDate: new Date(body.transactionDate),
        transactionType: body.transactionType,
        amount: Number(body.amount),
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

