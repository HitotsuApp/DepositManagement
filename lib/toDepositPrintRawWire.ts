import type { ResidentForDepositPrint } from "@/lib/residentPrintEligibility"
import type {
  DepositPrintFacilityWire,
  DepositPrintRawWire,
  DepositPrintResidentWire,
} from "@/pdf/utils/printRawWire"
import type { Facility, Unit } from "@prisma/client"

function serializeUnit(u: Unit): DepositPrintFacilityWire["units"][0] {
  return {
    id: u.id,
    facilityId: u.facilityId,
    name: u.name,
    capacity: u.capacity,
    displaySortOrder: u.displaySortOrder,
    printSortOrder: u.printSortOrder,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }
}

function serializeFacilityForPrintWire(
  facility: Facility & { units: Unit[] }
): DepositPrintFacilityWire {
  return {
    id: facility.id,
    name: facility.name,
    positionName: facility.positionName,
    positionHolderName: facility.positionHolderName,
    sortOrder: facility.sortOrder,
    useSameOrderForDisplayAndPrint: facility.useSameOrderForDisplayAndPrint,
    useUnitOrderForPrint: facility.useUnitOrderForPrint,
    residentDisplaySortMode: facility.residentDisplaySortMode,
    residentPrintSortMode: facility.residentPrintSortMode,
    noticeTemplateNormal: facility.noticeTemplateNormal,
    noticeTemplateMoveOut: facility.noticeTemplateMoveOut,
    isActive: facility.isActive,
    createdAt: facility.createdAt.toISOString(),
    updatedAt: facility.updatedAt.toISOString(),
    units: facility.units.map(serializeUnit),
  }
}

function serializeResidentForPrintWire(
  r: ResidentForDepositPrint
): DepositPrintResidentWire {
  const unit = serializeUnit(r.unit)
  return {
    id: r.id,
    name: r.name,
    nameFurigana: r.nameFurigana,
    facilityId: r.facilityId,
    unitId: r.unitId,
    displaySortOrder: r.displaySortOrder,
    printSortOrder: r.printSortOrder,
    displayNamePrefix: r.displayNamePrefix,
    namePrefixDisplayOption: r.namePrefixDisplayOption,
    startDate: r.startDate ? r.startDate.toISOString() : null,
    endDate: r.endDate ? r.endDate.toISOString() : null,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    unit,
    transactions: r.transactions.map((t) => ({
      id: t.id,
      residentId: t.residentId,
      transactionDate: t.transactionDate.toISOString(),
      transactionType: t.transactionType,
      amount: t.amount,
      description: t.description,
      payee: t.payee,
      reason: t.reason,
      createdAt: t.createdAt.toISOString(),
    })),
  }
}

export function buildDepositPrintRawWire(
  facility: Facility & { units: Unit[] },
  residents: ResidentForDepositPrint[],
  openingBalancesThruPreviousMonthEnd: Map<number, number>
): DepositPrintRawWire {
  const openingBalances: Record<string, number> = {}
  for (const [k, v] of openingBalancesThruPreviousMonthEnd) {
    openingBalances[String(k)] = v
  }
  return {
    facility: serializeFacilityForPrintWire(facility),
    residents: residents.map(serializeResidentForPrintWire),
    openingBalances,
  }
}
