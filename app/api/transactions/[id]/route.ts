export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { validateId } from '@/lib/validation'
import { neonHttpSql } from '@/lib/neonHttpSql'
import { markTransactionCorrectNeon } from '@/lib/transactionWriteSql'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const transactionId = validateId(params.id)
    if (!transactionId) {
      return NextResponse.json(
        { error: '無効なIDです' },
        { status: 400 }
      )
    }

    const sql = neonHttpSql()
    const result = await markTransactionCorrectNeon(sql, transactionId)

    if (result.ok) {
      return NextResponse.json(result.transaction)
    }

    switch (result.error) {
      case 'NOT_FOUND':
        return NextResponse.json({ error: '取引が見つかりません' }, { status: 404 })
      case 'ALREADY_CORRECT':
        return NextResponse.json(
          { error: 'この取引は既に訂正済みです' },
          { status: 400 }
        )
      case 'WRONG_TYPE':
      case 'MONTH_NOT_ALLOWED':
        return NextResponse.json(
          { error: 'この取引は訂正できません' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Failed to update transaction:', error)
    return NextResponse.json(
      { error: '取引の更新に失敗しました' },
      { status: 500 }
    )
  }
}
