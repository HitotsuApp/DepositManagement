import type { Prisma, PrismaClient, Resident, Transaction, Unit } from "@prisma/client"
import {
  fetchOpeningBalancesByResidentChunks,
  fetchTransactionsInRangeByResidentChunks,
  getLedgerSqlForPrint,
} from "@/lib/printLedgerFetch"

/** 年月のカレンダー範囲（施設TOP・取引月次と同様にローカル日付で解釈） */
export function getCalendarMonthRange(
  year: number,
  month: number
): { monthStart: Date; monthEnd: Date } {
  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)
  return { monthStart, monthEnd }
}

/**
 * 対象年月の期間と在籍期間（startDate / endDate）が重なる利用者。
 * isActive: true のみ（通常の月次在籍）。
 */
export function prismaWhereResidentOverlapsCalendarMonth(
  facilityId: number,
  year: number,
  month: number,
  unitId: number | null
): Prisma.ResidentWhereInput {
  const { monthStart, monthEnd } = getCalendarMonthRange(year, month)
  return {
    facilityId,
    isActive: true,
    ...(unitId != null ? { unitId } : {}),
    AND: [
      { OR: [{ startDate: null }, { startDate: { lte: monthEnd } }] },
      { OR: [{ endDate: null }, { endDate: { gte: monthStart } }] },
    ],
  }
}

export async function fetchResidentIdsWithTransactionsInMonth(
  prisma: PrismaClient,
  facilityId: number,
  year: number,
  month: number,
  unitId: number | null
): Promise<number[]> {
  const { monthStart, monthEnd } = getCalendarMonthRange(year, month)
  const rows = await prisma.transaction.findMany({
    where: {
      transactionDate: { gte: monthStart, lte: monthEnd },
      resident: {
        facilityId,
        ...(unitId != null ? { unitId } : {}),
      },
    },
    select: { residentId: true },
    distinct: ["residentId"],
  })
  return rows.map((r) => r.residentId)
}

export type ResidentForDepositPrint = Resident & {
  transactions: Transaction[]
  unit: Unit
}

/**
 * 本部報告（出納帳）用: （対象月と在籍が重なる）∪（その月に取引が1件以上ある）利用者。
 * 精算が退所月の翌月になるケースで、終了済み利用者も当月取引があれば含める。
 *
 * `transactions`: 当月分のみをロードする（過去すべては込めない）。繰越高は caller が `openingBalancesThruPreviousMonthEnd` を transform に渡す。
 */
export async function loadResidentsForDepositPrint(
  prisma: PrismaClient,
  facilityId: number,
  year: number,
  month: number,
  unitId: number | null
): Promise<{
  residents: ResidentForDepositPrint[]
  openingBalancesThruPreviousMonthEnd: Map<number, number>
}> {
  const overlapWhere = prismaWhereResidentOverlapsCalendarMonth(
    facilityId,
    year,
    month,
    unitId
  )

  const { monthStart, monthEnd } = getCalendarMonthRange(year, month)
  const previousMonthEnd = new Date(year, month - 1, 0, 23, 59, 59, 999)

  const includeMeta = {
    unit: true,
  } as const

  const [overlapList, txIds] = await Promise.all([
    prisma.resident.findMany({
      where: overlapWhere,
      include: includeMeta,
    }),
    fetchResidentIdsWithTransactionsInMonth(prisma, facilityId, year, month, unitId),
  ])

  const overlapIds = new Set(overlapList.map((r) => r.id))
  const missingIds = txIds.filter((id) => !overlapIds.has(id))

  let extras: Array<Resident & { unit: Unit }> = []
  if (missingIds.length > 0) {
    extras = await prisma.resident.findMany({
      where: {
        id: { in: missingIds },
        facilityId,
        ...(unitId != null ? { unitId } : {}),
      },
      include: includeMeta,
    })
  }

  const byId = new Map<number, Resident & { unit: Unit }>()
  for (const r of overlapList) {
    byId.set(r.id, r)
  }
  for (const r of extras) {
    byId.set(r.id, r)
  }

  const allIds = Array.from(byId.keys())
  const sql = getLedgerSqlForPrint()
  const [openingBalancesThruPreviousMonthEnd, txByResident] = await Promise.all([
    fetchOpeningBalancesByResidentChunks(sql, facilityId, allIds, previousMonthEnd),
    fetchTransactionsInRangeByResidentChunks(sql, facilityId, allIds, monthStart, monthEnd),
  ])

  const residents: ResidentForDepositPrint[] = Array.from(byId.values()).map((r) => ({
    ...r,
    transactions: txByResident.get(r.id) ?? [],
  }))

  return { residents, openingBalancesThruPreviousMonthEnd }
}
