import type { FacilityTransactionPayload } from '@/lib/bulkFacilityTransactionsFetch'
import type { ResidentFacilityScopedRow } from '@/lib/residentsFacilityListSql'
import type { ActiveUnitMinimal } from '@/lib/unitsFacilityListSql'

/** `GET .../bulk-input-bootstrap` の JSON（クライアント・ルート共通） */
export type BulkInputBootstrapJson = {
  facilityName: string
  residents: ResidentFacilityScopedRow[]
  units: ActiveUnitMinimal[]
  transactions: FacilityTransactionPayload[]
  transactionsHasMore: boolean
}
