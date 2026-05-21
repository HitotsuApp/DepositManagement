import type { Prisma, Resident, Unit } from "@prisma/client"
import type { TransformTransaction } from "@/pdf/utils/printModelTypes"
import {
  fetchOpeningBalancesAndTransactionsInRangeByResidentChunks,
  getLedgerSqlForPrint,
} from "@/lib/printLedgerFetch"
import {
  fetchResidentIdsWithTransactionsInMonthSql,
  fetchResidentsByIdsFacilityScopedSql,
  fetchResidentsOverlapCalendarMonthSql,
} from "@/lib/printResidentsDepositSql"

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

export type ResidentForDepositPrint = Resident & {
  transactions: TransformTransaction[]
  unit: Unit
}

/**
 * 本部報告（出納帳）用: （対象月と在籍が重なる）∪（その月に取引が1件以上ある）利用者。
 * Cloudflare Edge 向け Neon HTTP（Prisma なし）
 */
export async function loadResidentsForDepositPrint(
  facilityId: number,
  year: number,
  month: number,
  unitId: number | null
): Promise<{
  residents: ResidentForDepositPrint[]
  openingBalancesThruPreviousMonthEnd: Map<number, number>
}> {
  const { monthStart, monthEnd } = getCalendarMonthRange(year, month)
  const previousMonthEnd = new Date(year, month - 1, 0, 23, 59, 59, 999)

  const [overlapList, txIds] = await Promise.all([
    fetchResidentsOverlapCalendarMonthSql(
      facilityId,
      monthStart,
      monthEnd,
      unitId
    ),
    fetchResidentIdsWithTransactionsInMonthSql(
      facilityId,
      monthStart,
      monthEnd,
      unitId
    ),
  ])

  const overlapIds = new Set(overlapList.map((r) => r.id))
  const missingIds = txIds.filter((id) => !overlapIds.has(id))

  const extras =
    missingIds.length > 0
      ? await fetchResidentsByIdsFacilityScopedSql(
          facilityId,
          missingIds,
          unitId
        )
      : []

  const byId = new Map<number, Resident & { unit: Unit }>()
  for (const r of overlapList) {
    byId.set(r.id, r)
  }
  for (const r of extras) {
    byId.set(r.id, r)
  }

  const allIds = Array.from(byId.keys())
  const sql = getLedgerSqlForPrint()
  const { openingBalances: openingBalancesThruPreviousMonthEnd, transactionsByResident } =
    await fetchOpeningBalancesAndTransactionsInRangeByResidentChunks(
      sql,
      facilityId,
      allIds,
      previousMonthEnd,
      monthStart,
      monthEnd
    )

  const residents: ResidentForDepositPrint[] = Array.from(byId.values()).map((r) => ({
    ...r,
    transactions: transactionsByResident.get(r.id) ?? [],
  }))

  return { residents, openingBalancesThruPreviousMonthEnd }
}
