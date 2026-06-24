/**
 * GET /api/public/vacancy 用（利用者名は取得しない集計 SQL）
 */

import type { NeonSql } from '@/lib/neonHttpSql'
import { withTransientDbRetries } from '@/lib/withTransientDbRetries'
import type { PublicVacancyFacility } from '@/lib/vacancy'

const PUBLIC_VACANCY_SQL = `
SELECT
  f.id,
  f.name,
  COALESCE(SUM(sub.vacancy), 0)::int AS vacancy
FROM "Facility" f
LEFT JOIN (
  SELECT
    u."facilityId",
    GREATEST(0, u.capacity - (
      SELECT COUNT(*)::int
      FROM "Resident" r
      WHERE r."unitId" = u.id
        AND r."isActive" = true
        AND r."endDate" IS NULL
        AND trim(r.name) <> '空床'
        AND trim(r.name) !~ '^[0-9]+$'
    )) AS vacancy
  FROM "Unit" u
  WHERE u."isActive" = true
    AND u.capacity IS NOT NULL
    AND u.capacity > 0
) sub ON sub."facilityId" = f.id
WHERE f."isActive" = true
GROUP BY f.id, f.name, f."sortOrder"
ORDER BY f."sortOrder" ASC NULLS LAST, f.id ASC
`

export async function fetchPublicVacancyFacilities(
  sql: NeonSql
): Promise<PublicVacancyFacility[]> {
  const rows = await withTransientDbRetries('publicVacancy', async () => {
    return (await sql(PUBLIC_VACANCY_SQL.trim())) as Record<string, unknown>[]
  })

  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name ?? ''),
    vacancy: Number(row.vacancy ?? 0),
  }))
}
