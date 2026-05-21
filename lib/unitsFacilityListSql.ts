import { neonHttpSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'

/** まとめて入力 bootstrap 用・アクティブユニット id/name のみ */
export type ActiveUnitMinimal = { id: number; name: string }

/** `GET /api/units?facilityId=` と同等のアクティブ行（Neon／Prisma 回避） */
export async function fetchActiveUnitsMinimalByFacilityId(
  facilityId: number
): Promise<ActiveUnitMinimal[]> {
  return withTransientDbRetries(`unitsMinimal(facilityId=${facilityId})`, async () => {
    const sql = neonHttpSql()
    const rows = (await sql`
      SELECT u.id, u.name
      FROM "Unit" u
      WHERE u."facilityId" = ${facilityId}
        AND u."isActive" = true
      ORDER BY u.name ASC
    `) as { id: number; name: string }[]
    return rows.map((r) => ({ id: Number(r.id), name: String(r.name) }))
  })
}
