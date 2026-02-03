export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isValidDate, validateMaxLength, MAX_LENGTHS } from '@/lib/validation'

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

    // 日付の妥当性チェック
    if (!isValidDate(body.transactionDate)) {
      return NextResponse.json(
        { error: '無効な日付形式です' },
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
    const transactionDateStr = transactionDate.toISOString().split('T')[0]
    const currentDate = new Date()
    const currentYear = currentDate.getFullYear()
    const currentMonth = currentDate.getMonth() + 1
    const currentDay = currentDate.getDate()

    // 通常の入金・出金の場合、対象日が許可された範囲内かチェック
    if (body.transactionType === 'in' || body.transactionType === 'out') {
      let minDate: string
      let maxDate: string
      let errorMessage: string
      
      if (currentDay <= 10) {
        // 10日以前の場合：先月1日〜今月末日まで
        const previousMonthFirstDay = new Date(currentYear, currentMonth - 2, 1)
        const currentMonthLastDay = new Date(currentYear, currentMonth, 0)
        minDate = previousMonthFirstDay.toISOString().split('T')[0]
        maxDate = currentMonthLastDay.toISOString().split('T')[0]
        errorMessage = '対象日は先月1日から今月末日までの日付を入力してください'
      } else {
        // 11日以降の場合：今月1日〜今日まで
        const currentMonthFirstDay = new Date(currentYear, currentMonth - 1, 1)
        minDate = currentMonthFirstDay.toISOString().split('T')[0]
        maxDate = currentDate.toISOString().split('T')[0]
        errorMessage = '対象日は今月1日から今日までの日付を入力してください'
      }
      
      if (transactionDateStr < minDate || transactionDateStr > maxDate) {
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        )
      }
    }

    // 過去訂正入力の場合、対象日が過去月であることを確認（今月の日付は許可しない）
    if (body.transactionType === 'past_correct_in' || body.transactionType === 'past_correct_out') {
      const transactionYear = transactionDate.getFullYear()
      const transactionMonth = transactionDate.getMonth() + 1
      // 今月または未来の月の場合はエラー
      if (transactionYear > currentYear || (transactionYear === currentYear && transactionMonth >= currentMonth)) {
        return NextResponse.json(
          { error: '過去訂正入力は過去の月の日付のみ入力できます' },
          { status: 400 }
        )
      }
    }
    
    // 文字列長のバリデーション
    if (body.description && !validateMaxLength(body.description, MAX_LENGTHS.TRANSACTION_DESCRIPTION)) {
      return NextResponse.json(
        { error: `内容（備考）は${MAX_LENGTHS.TRANSACTION_DESCRIPTION}文字以内で入力してください` },
        { status: 400 }
      )
    }
    
    if (body.payee && !validateMaxLength(body.payee, MAX_LENGTHS.TRANSACTION_PAYEE)) {
      return NextResponse.json(
        { error: `支払先は${MAX_LENGTHS.TRANSACTION_PAYEE}文字以内で入力してください` },
        { status: 400 }
      )
    }
    
    if (body.reason && !validateMaxLength(body.reason, MAX_LENGTHS.TRANSACTION_REASON)) {
      return NextResponse.json(
        { error: `理由は${MAX_LENGTHS.TRANSACTION_REASON}文字以内で入力してください` },
        { status: 400 }
      )
    }

    const transaction = await prisma.transaction.create({
      data: {
        residentId: Number(body.residentId),
        transactionDate: new Date(body.transactionDate),
        transactionType: body.transactionType,
        amount: Number(body.amount),
        description: body.description ? body.description.trim() : null,
        payee: body.payee ? body.payee.trim() : null,
        reason: body.reason ? body.reason.trim() : null,
      },
    })

    return NextResponse.json(transaction)
  } catch (error) {
    console.error('Failed to create transaction:', error)
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
  }
}

