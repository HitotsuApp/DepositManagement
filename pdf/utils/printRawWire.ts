/** `GET deposit-statement` / `batch-print` の JSON 形式（ISO 文字列の日時） */

export interface DepositPrintUnitWire {
  id: number
  facilityId: number
  name: string
  capacity: number | null
  displaySortOrder: number | null
  printSortOrder: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface DepositPrintFacilityWire {
  id: number
  name: string
  positionName: string | null
  positionHolderName: string | null
  sortOrder: number
  useSameOrderForDisplayAndPrint: boolean
  useUnitOrderForPrint: boolean
  residentDisplaySortMode: string | null
  residentPrintSortMode: string | null
  noticeTemplateNormal: string | null
  noticeTemplateMoveOut: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  units: DepositPrintUnitWire[]
}

export interface DepositPrintTransactionWire {
  id: number
  residentId: number
  transactionDate: string
  transactionType: string
  amount: number
  description: string | null
  payee: string | null
  reason: string | null
  createdAt: string
}

export interface DepositPrintResidentWire {
  id: number
  name: string
  nameFurigana: string | null
  facilityId: number
  unitId: number
  displaySortOrder: number | null
  printSortOrder: number | null
  displayNamePrefix: string | null
  namePrefixDisplayOption: string | null
  startDate: string | null
  endDate: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  unit: DepositPrintUnitWire
  transactions: DepositPrintTransactionWire[]
}

export interface DepositPrintRawWire {
  facility: DepositPrintFacilityWire
  residents: DepositPrintResidentWire[]
  openingBalances: Record<string, number>
}
