/**
 * GET /api/print/resident-statement で利用する利用者＋施設＋ユニット（Prisma findUnique include 相当、Date は Prisma 同様インスタンス）
 */

import type { NeonSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'

export type ResidentForResidentStatement = {
  id: number
  facilityId: number
  unitId: number
  name: string
  nameFurigana: string | null
  displaySortOrder: number | null
  printSortOrder: number | null
  displayNamePrefix: string | null
  namePrefixDisplayOption: string | null
  startDate: Date | null
  endDate: Date | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  facility: {
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
  unit: {
    id: number
    facilityId: number
    name: string
    capacity: number | null
    displaySortOrder: number | null
    printSortOrder: number | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }
}

function toDate(u: unknown): Date {
  if (u instanceof Date) return u
  if (typeof u === 'string' || typeof u === 'number') return new Date(u)
  throw new Error('residentStatementMetaSql: invalid date column')
}

function coerceObj(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === 'string') {
    try {
      const p = JSON.parse(value) as unknown
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>
    } catch {
      return null
    }
  }
  return null
}

function facilityFromJson(blob: unknown): ResidentForResidentStatement['facility'] | null {
  const f = coerceObj(blob)
  if (!f) return null
  return {
    id: Number(f.id),
    name: String(f.name ?? ''),
    positionName: f.positionName == null ? null : String(f.positionName),
    positionHolderName: f.positionHolderName == null ? null : String(f.positionHolderName),
    sortOrder: Number(f.sortOrder ?? 0),
    useSameOrderForDisplayAndPrint: Boolean(f.useSameOrderForDisplayAndPrint ?? true),
    useUnitOrderForPrint: Boolean(f.useUnitOrderForPrint ?? true),
    residentDisplaySortMode:
      f.residentDisplaySortMode == null ? null : String(f.residentDisplaySortMode),
    residentPrintSortMode:
      f.residentPrintSortMode == null ? null : String(f.residentPrintSortMode),
    noticeTemplateNormal: f.noticeTemplateNormal == null ? null : String(f.noticeTemplateNormal),
    noticeTemplateMoveOut:
      f.noticeTemplateMoveOut == null ? null : String(f.noticeTemplateMoveOut),
    isActive: Boolean(f.isActive),
    createdAt: toDate(f.createdAt),
    updatedAt: toDate(f.updatedAt),
  }
}

function unitFromJson(blob: unknown): ResidentForResidentStatement['unit'] | null {
  const u = coerceObj(blob)
  if (!u) return null
  return {
    id: Number(u.id),
    facilityId: Number(u.facilityId),
    name: String(u.name ?? ''),
    capacity: u.capacity == null ? null : Number(u.capacity),
    displaySortOrder: u.displaySortOrder == null ? null : Number(u.displaySortOrder),
    printSortOrder: u.printSortOrder == null ? null : Number(u.printSortOrder),
    isActive: Boolean(u.isActive),
    createdAt: toDate(u.createdAt),
    updatedAt: toDate(u.updatedAt),
  }
}

export async function fetchResidentWithFacilityUnitForStatement(
  sql: NeonSql,
  residentId: number
): Promise<ResidentForResidentStatement | null> {
  return withTransientDbRetries(`residentStatementMeta(${residentId})`, async () => {
    const rows = (await sql`
      SELECT
        r.id,
        r."facilityId",
        r."unitId",
        r.name,
        r."nameFurigana",
        r."displaySortOrder",
        r."printSortOrder",
        r."displayNamePrefix",
        r."namePrefixDisplayOption",
        r."startDate",
        r."endDate",
        r."isActive",
        r."createdAt",
        r."updatedAt",
        json_build_object(
          'id',
          f.id,
          'name',
          f.name,
          'positionName',
          f."positionName",
          'positionHolderName',
          f."positionHolderName",
          'sortOrder',
          f."sortOrder",
          'useSameOrderForDisplayAndPrint',
          f."useSameOrderForDisplayAndPrint",
          'useUnitOrderForPrint',
          f."useUnitOrderForPrint",
          'residentDisplaySortMode',
          f."residentDisplaySortMode",
          'residentPrintSortMode',
          f."residentPrintSortMode",
          'noticeTemplateNormal',
          f."noticeTemplateNormal",
          'noticeTemplateMoveOut',
          f."noticeTemplateMoveOut",
          'isActive',
          f."isActive",
          'createdAt',
          f."createdAt",
          'updatedAt',
          f."updatedAt"
        ) AS facility_blob,
        json_build_object(
          'id',
          u.id,
          'facilityId',
          u."facilityId",
          'name',
          u.name,
          'capacity',
          u.capacity,
          'displaySortOrder',
          u."displaySortOrder",
          'printSortOrder',
          u."printSortOrder",
          'isActive',
          u."isActive",
          'createdAt',
          u."createdAt",
          'updatedAt',
          u."updatedAt"
        ) AS unit_blob
      FROM "Resident" r
      INNER JOIN "Facility" f ON f.id = r."facilityId"
      INNER JOIN "Unit" u ON u.id = r."unitId"
      WHERE r.id = ${residentId}
      LIMIT 1
    `) as Record<string, unknown>[]

    if (rows.length === 0) return null
    const row = rows[0]
    const facility = facilityFromJson(row.facility_blob)
    const unit = unitFromJson(row.unit_blob)
    if (!facility || !unit) return null

    return {
      id: Number(row.id),
      facilityId: Number(row.facilityId),
      unitId: Number(row.unitId),
      name: String(row.name ?? ''),
      nameFurigana: row.nameFurigana == null ? null : String(row.nameFurigana),
      displaySortOrder: row.displaySortOrder == null ? null : Number(row.displaySortOrder),
      printSortOrder: row.printSortOrder == null ? null : Number(row.printSortOrder),
      displayNamePrefix: row.displayNamePrefix == null ? null : String(row.displayNamePrefix),
      namePrefixDisplayOption:
        row.namePrefixDisplayOption == null ? null : String(row.namePrefixDisplayOption),
      startDate: row.startDate == null ? null : toDate(row.startDate),
      endDate: row.endDate == null ? null : toDate(row.endDate),
      isActive: Boolean(row.isActive),
      createdAt: toDate(row.createdAt),
      updatedAt: toDate(row.updatedAt),
      facility,
      unit,
    }
  })
}
