import type { PrismaClient } from '@prisma/client'
import { normalizeJapaneseLabel } from '@/lib/depositLedgerExcel'

export function buildResidentKey(unitName: string, userName: string): string {
  return `${normalizeJapaneseLabel(unitName)}|${normalizeJapaneseLabel(userName)}`
}

export type ResidentLookup = Map<
  string,
  { id: number; unitName: string; residentName: string }[]
>

export async function loadResidentLookup(
  prisma: PrismaClient,
  facilityId: number
): Promise<ResidentLookup> {
  const residents = await prisma.resident.findMany({
    where: { facilityId, isActive: true },
    include: { unit: { select: { name: true } } },
  })
  const map: ResidentLookup = new Map()
  for (const r of residents) {
    const key = buildResidentKey(r.unit.name, r.name)
    const list = map.get(key) ?? []
    list.push({ id: r.id, unitName: r.unit.name, residentName: r.name })
    map.set(key, list)
  }
  return map
}

export function resolveResidentId(
  lookup: ResidentLookup,
  unitName: string,
  userName: string
): { ok: true; residentId: number } | { ok: false; error: string } {
  const key = buildResidentKey(unitName, userName)
  const list = lookup.get(key)
  if (!list || list.length === 0) {
    return {
      ok: false,
      error: `マスタに利用者がありません（ユニット「${unitName}」・「${userName}」）`,
    }
  }
  if (list.length > 1) {
    return {
      ok: false,
      error: `同一ユニット・同名の利用者が${list.length}件あります（マスタで区別してください）`,
    }
  }
  return { ok: true, residentId: list[0].id }
}
