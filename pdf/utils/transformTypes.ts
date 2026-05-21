import type {
  TransformFacility,
  TransformResident,
  TransformTransaction,
  TransformUnit,
} from "./printModelTypes"

/** `transformToPrintData` 用の利用者ライン（当月取引のみ + unit） */
export type ResidentRelationsForFacility = TransformResident & {
  transactions: TransformTransaction[]
}

/** 印刷 transform 共通の施設ツリー */
export interface FacilityWithRelations extends TransformFacility {
  units: TransformUnit[]
  residents: ResidentRelationsForFacility[]
}
