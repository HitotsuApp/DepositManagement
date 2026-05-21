/**
 * Cloudflare での Prisma WASM 回避のための印刷モデル形状（値は API / transform 共通）。
 */

import type { SortableResident, SortableUnit } from "@/lib/sortOrder"

export interface TransformFacility {
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
  createdAt: Date
  updatedAt: Date
}

export interface TransformUnit extends SortableUnit {
  facilityId: number
  name: string
  capacity: number | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface TransformResident extends SortableResident {
  facilityId: number
  displayNamePrefix: string | null
  namePrefixDisplayOption: string | null
  startDate: Date | null
  endDate: Date | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  unit: TransformUnit
}

export interface TransformTransaction {
  id: number
  residentId: number
  transactionDate: Date
  transactionType: string
  amount: number
  description: string | null
  payee: string | null
  reason: string | null
  createdAt: Date
}
