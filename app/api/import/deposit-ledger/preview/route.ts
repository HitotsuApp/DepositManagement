import { NextResponse } from 'next/server'
import { getPrisma } from '@/lib/prisma'
import {
  computeBalanceWarnings,
  expandRowsToTransactionDrafts,
  parseDepositLedgerSheet,
  pickLedgerSheetName,
  readWorkbookFromBuffer,
} from '@/lib/depositLedgerExcel'
import { loadResidentLookup, resolveResidentId } from '@/lib/residentMatch'

export async function POST(request: Request) {
  const prisma = getPrisma()
  try {
    const form = await request.formData()
    const file = form.get('file')
    const facilityIdRaw = form.get('facilityId')
    const baseYearRaw = form.get('baseYear')
    const sheetMonthRaw = form.get('sheetMonth')
    const sheetNameOverride = form.get('sheetName')

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'file が必要です' }, { status: 400 })
    }

    const facilityId = Number(facilityIdRaw)
    if (!Number.isInteger(facilityId) || facilityId <= 0) {
      return NextResponse.json({ error: 'facilityId が不正です' }, { status: 400 })
    }

    const baseYear = Number(baseYearRaw)
    if (!Number.isInteger(baseYear) || baseYear < 1900 || baseYear > 2200) {
      return NextResponse.json({ error: 'baseYear（西暦）が不正です' }, { status: 400 })
    }

    const sheetMonth = Number(sheetMonthRaw)
    if (!Number.isInteger(sheetMonth) || sheetMonth < 1 || sheetMonth > 12) {
      return NextResponse.json({ error: 'sheetMonth（1–12）が不正です' }, { status: 400 })
    }

    const facility = await prisma.facility.findFirst({
      where: { id: facilityId, isActive: true },
    })
    if (!facility) {
      return NextResponse.json({ error: '施設が見つかりません' }, { status: 404 })
    }

    const buf = await file.arrayBuffer()
    const workbook = readWorkbookFromBuffer(buf)

    let sheetName: string | null =
      typeof sheetNameOverride === 'string' && sheetNameOverride.trim()
        ? sheetNameOverride.trim()
        : null
    if (!sheetName) {
      sheetName = pickLedgerSheetName(workbook, sheetMonth)
    }
    if (!sheetName || !workbook.Sheets[sheetName]) {
      return NextResponse.json(
        {
          error: `「${sheetMonth}月分」に一致するシートが見つかりません`,
          availableSheets: workbook.SheetNames,
        },
        { status: 400 }
      )
    }

    const sheet = workbook.Sheets[sheetName]
    const parsed = parseDepositLedgerSheet(sheet, baseYear, sheetMonth)
    const { drafts, errors: expandErrors } = expandRowsToTransactionDrafts(
      parsed,
      baseYear,
      sheetMonth
    )

    const lookup = await loadResidentLookup(prisma, facilityId)

    const commitItems: {
      residentId: number
      transactionDate: string
      transactionType: 'in' | 'out'
      amount: number
      description: string | null
      payee: string | null
      sourceSheetRow1Based: number
    }[] = []

    const residentErrors: string[] = []

    for (const d of drafts) {
      const resolved = resolveResidentId(lookup, d.unitName, d.userName)
      if (!resolved.ok) {
        residentErrors.push(`行${d.sourceSheetRow1Based}: ${resolved.error}`)
        continue
      }
      commitItems.push({
        residentId: resolved.residentId,
        transactionDate: d.transactionDate.toISOString(),
        transactionType: d.transactionType,
        amount: d.amount,
        description: d.description,
        payee: d.payee,
        sourceSheetRow1Based: d.sourceSheetRow1Based,
      })
    }

    let sumDeposit = 0
    let sumWithdrawal = 0
    for (const c of commitItems) {
      if (c.transactionType === 'in') sumDeposit += c.amount
      else sumWithdrawal += c.amount
    }
    const sums = { deposit: sumDeposit, withdrawal: sumWithdrawal }
    let totalMismatch: {
      excelDeposit: number | null
      excelWithdrawal: number | null
      parsedDeposit: number
      parsedWithdrawal: number
    } | null = null

    if (
      parsed.totalRow &&
      (Math.abs(parsed.totalRow.deposit - sums.deposit) > 0.05 ||
        Math.abs(parsed.totalRow.withdrawal - sums.withdrawal) > 0.05)
    ) {
      totalMismatch = {
        excelDeposit: parsed.totalRow.deposit,
        excelWithdrawal: parsed.totalRow.withdrawal,
        parsedDeposit: sums.deposit,
        parsedWithdrawal: sums.withdrawal,
      }
    }

    const balanceWarnings = computeBalanceWarnings(parsed)

    return NextResponse.json({
      success: true,
      sheetName,
      baseYear,
      sheetMonth,
      facilityId,
      totalRow: parsed.totalRow,
      sumFromDrafts: sums,
      totalMismatch,
      expandErrors,
      residentErrors,
      balanceWarnings,
      transactionCount: commitItems.length,
      commitItems,
      canCommit:
        expandErrors.length === 0 &&
        residentErrors.length === 0 &&
        commitItems.length > 0,
    })
  } catch (e) {
    console.error('deposit-ledger preview error:', e)
    return NextResponse.json(
      {
        error: 'プレビューに失敗しました',
        details: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    )
  }
}
