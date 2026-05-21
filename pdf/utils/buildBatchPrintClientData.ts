import type { ResidentPrintData } from "@/pdf/utils/transform"
import {
  buildNoticeFromFacilityTemplate,
  transformToPrintData,
  transformToResidentPrintData,
} from "@/pdf/utils/transform"
import type { FacilityWithRelations } from "@/pdf/utils/transformTypes"
import { sortResidentsForPrint, type SortableResident, type SortableUnit } from "@/lib/sortOrder"

export interface BatchPrintClientData {
  facilitySummary: ReturnType<typeof transformToPrintData>
  residentStatements: ResidentPrintData[]
}

/** クライアント: raw 施設ツリーからまとめて印刷用データを組み立て */
export function buildBatchPrintClientData(
  facilityWithResidents: FacilityWithRelations,
  year: number,
  month: number,
  openingBalances: Map<number, number>
): BatchPrintClientData {
  const residentPrintSortMode =
    (facilityWithResidents as { residentPrintSortMode?: string | null })
      .residentPrintSortMode ?? null
  const useSameOrder =
    (facilityWithResidents as { useSameOrderForDisplayAndPrint?: boolean })
      .useSameOrderForDisplayAndPrint ?? true
  const useUnitOrder =
    (facilityWithResidents as { useUnitOrderForPrint?: boolean })
      .useUnitOrderForPrint ?? true

  const residents = facilityWithResidents.residents
  const sortedResidents = sortResidentsForPrint(
    residents as unknown as SortableResident[],
    facilityWithResidents.units as unknown as SortableUnit[],
    useSameOrder,
    useUnitOrder,
    residentPrintSortMode === "aiueo" ? "aiueo" : "manual"
  )

  const facilitySummary = transformToPrintData(
    facilityWithResidents,
    null,
    year,
    month,
    { residentOpeningBalances: openingBalances }
  )

  const facilityNoticeTemplate =
    (facilityWithResidents as { noticeTemplateNormal?: string | null })
      .noticeTemplateNormal ?? null

  const residentStatements: ResidentPrintData[] =
    sortedResidents.length === 0
      ? []
      : sortedResidents.map((resident) => {
          const base = residents.find((r) => r.id === resident.id)
          if (!base) {
            throw new Error(`Resident ${resident.id} not found`)
          }
          const residentWithRelations = {
            ...base,
            facility: facilityWithResidents,
            transactions: base.transactions,
            unit: base.unit,
          }
          const printData = transformToResidentPrintData(
            residentWithRelations,
            year,
            month,
            "monthOnly",
            {
              openingBalanceThruPreviousMonthEnd:
                openingBalances.get(resident.id) ?? 0,
            }
          )
          const notice = buildNoticeFromFacilityTemplate(
            facilityNoticeTemplate,
            "normal"
          )
          if (notice) printData.notice = notice
          return printData
        })

  return { facilitySummary, residentStatements }
}
