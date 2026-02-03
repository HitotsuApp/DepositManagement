export const runtime = 'edge';

import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import { validateId } from '@/lib/validation'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const prisma = getPrisma()
  try {
    const transactionId = validateId(params.id)
    if (!transactionId) {
      return NextResponse.json(
        { error: '無効なIDです' },
        { status: 400 }
      )
    }
    
    // 取引を取得して現在の状態を確認
    const currentTransaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    })

    if (!currentTransaction) {
      return NextResponse.json(
        { error: '取引が見つかりません' },
        { status: 404 }
      )
    }

    // 既に訂正済みの場合はエラー
    if (
      currentTransaction.transactionType === 'correct_in' ||
      currentTransaction.transactionType === 'correct_out'
    ) {
      return NextResponse.json(
        { error: 'この取引は既に訂正済みです' },
        { status: 400 }
      )
    }

    // transactionTypeを訂正区分に変更
    let newTransactionType: string
    if (currentTransaction.transactionType === 'in') {
      newTransactionType = 'correct_in'
    } else if (currentTransaction.transactionType === 'out') {
      newTransactionType = 'correct_out'
    } else {
      return NextResponse.json(
        { error: 'この取引は訂正できません' },
        { status: 400 }
      )
    }

    // 取引を更新
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        transactionType: newTransactionType,
      },
    })

    return NextResponse.json(updatedTransaction)
  } catch (error) {
    console.error('Failed to update transaction:', error)
    return NextResponse.json(
      { error: '取引の更新に失敗しました' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
