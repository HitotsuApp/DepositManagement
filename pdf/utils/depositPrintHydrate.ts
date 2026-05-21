import type {
  FacilityWithRelations as TransformFacilityShape,
  ResidentRelationsForFacility,
} from "./transformTypes"
import type { DepositPrintRawWire } from "./printRawWire"
import type { TransformFacility, TransformTransaction, TransformUnit } from "./printModelTypes"

function toDateMs(v: string | Date): Date {
  if (v instanceof Date) return v
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? new Date(0) : d
}

function hydrateUnit(raw: DepositPrintRawWire["facility"]["units"][0]): TransformUnit {
  return {
    id: Number(raw.id),
    facilityId: Number(raw.facilityId),
    name: String(raw.name),
    capacity: raw.capacity == null ? null : Number(raw.capacity),
    displaySortOrder:
      raw.displaySortOrder == null ? null : Number(raw.displaySortOrder),
    printSortOrder: raw.printSortOrder == null ? null : Number(raw.printSortOrder),
    isActive: Boolean(raw.isActive),
    createdAt: toDateMs(raw.createdAt),
    updatedAt: toDateMs(raw.updatedAt),
  }
}

function hydrateFacilityWithUnits(
  facility: DepositPrintRawWire["facility"]
): TransformFacility & { units: TransformUnit[] } {
  return {
    id: Number(facility.id),
    name: String(facility.name),
    positionName: facility.positionName != null ? String(facility.positionName) : null,
    positionHolderName:
      facility.positionHolderName != null
        ? String(facility.positionHolderName)
        : null,
    sortOrder: Number(facility.sortOrder),
    useSameOrderForDisplayAndPrint: Boolean(facility.useSameOrderForDisplayAndPrint),
    useUnitOrderForPrint: Boolean(facility.useUnitOrderForPrint),
    residentDisplaySortMode:
      facility.residentDisplaySortMode != null
        ? String(facility.residentDisplaySortMode)
        : null,
    residentPrintSortMode:
      facility.residentPrintSortMode != null
        ? String(facility.residentPrintSortMode)
        : null,
    noticeTemplateNormal:
      facility.noticeTemplateNormal != null ? String(facility.noticeTemplateNormal) : null,
    noticeTemplateMoveOut:
      facility.noticeTemplateMoveOut != null ? String(facility.noticeTemplateMoveOut) : null,
    isActive: Boolean(facility.isActive),
    createdAt: toDateMs(facility.createdAt),
    updatedAt: toDateMs(facility.updatedAt),
    units: facility.units.map(hydrateUnit),
  }
}

function hydrateTx(
  t: DepositPrintRawWire["residents"][0]["transactions"][0]
): TransformTransaction {
  return {
    id: Number(t.id),
    residentId: Number(t.residentId),
    transactionDate: toDateMs(t.transactionDate),
    transactionType: String(t.transactionType),
    amount: Number(t.amount),
    description: t.description != null ? String(t.description) : null,
    payee: t.payee != null ? String(t.payee) : null,
    reason: t.reason != null ? String(t.reason) : null,
    createdAt: toDateMs(t.createdAt),
  }
}

/** API JSON を `transformToPrintData` 向けオブジェクトへ */
export function hydrateDepositPrintWire(wire: DepositPrintRawWire): TransformFacilityShape {
  const f = hydrateFacilityWithUnits(wire.facility)
  const residents: ResidentRelationsForFacility[] = wire.residents.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    nameFurigana: r.nameFurigana != null ? String(r.nameFurigana) : null,
    facilityId: Number(r.facilityId),
    unitId: Number(r.unitId),
    displaySortOrder:
      r.displaySortOrder == null ? null : Number(r.displaySortOrder),
    printSortOrder: r.printSortOrder == null ? null : Number(r.printSortOrder),
    displayNamePrefix:
      r.displayNamePrefix != null ? String(r.displayNamePrefix) : null,
    namePrefixDisplayOption:
      r.namePrefixDisplayOption != null ? String(r.namePrefixDisplayOption) : null,
    startDate: r.startDate ? toDateMs(r.startDate) : null,
    endDate: r.endDate ? toDateMs(r.endDate) : null,
    isActive: Boolean(r.isActive),
    createdAt: toDateMs(r.createdAt),
    updatedAt: toDateMs(r.updatedAt),
    unit: hydrateUnit(r.unit),
    transactions: r.transactions.map(hydrateTx),
  }))
  return { ...f, residents } as TransformFacilityShape
}

export function openingBalancesWireToMap(
  ob: DepositPrintRawWire["openingBalances"]
): Map<number, number> {
  const m = new Map<number, number>()
  for (const [k, v] of Object.entries(ob)) {
    const id = Number(k)
    if (Number.isFinite(id)) {
      m.set(id, typeof v === "number" ? v : Number(v))
    }
  }
  return m
}
