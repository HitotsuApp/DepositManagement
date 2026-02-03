/**
 * キャッシュ無効化ユーティリティ
 * 
 * データ更新（POST/PUT/DELETE）後に、関連するAPIのキャッシュを無効化するためのユーティリティ関数
 */

/**
 * 関連するAPIのキャッシュを無効化する
 * 
 * @param paths 無効化するAPIパスの配列（例: ['/api/facilities/1', '/api/dashboard']）
 */
export async function invalidateCache(paths: string[]): Promise<void> {
  // ブラウザのキャッシュを無効化するために、各パスに対してGETリクエストを送信
  // cache: 'no-store' とタイムスタンプパラメータを使用してキャッシュを確実に無効化
  const promises = paths.map(path => {
    // タイムスタンプパラメータを追加してキャッシュを回避
    const separator = path.includes('?') ? '&' : '?'
    const url = `${path}${separator}_invalidate=${Date.now()}`
    
    return fetch(url, {
      method: 'GET',
      cache: 'no-store', // ブラウザキャッシュを無効化
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    }).then(response => {
      // レスポンスを読み込んで破棄（キャッシュを確実に無効化）
      return response.text().then(() => {})
    }).catch(error => {
      // エラーは無視（キャッシュ無効化は失敗しても続行）
      console.warn(`Failed to invalidate cache for ${path}:`, error)
    })
  })
  
  await Promise.all(promises)
}

/**
 * 取引関連のデータ更新後に呼び出す
 * 施設詳細、ダッシュボード、利用者詳細などのキャッシュを無効化
 * 
 * @param facilityId 施設ID（オプション）
 * @param residentId 利用者ID（オプション）
 * @param year 年（オプション）
 * @param month 月（オプション）
 */
export async function invalidateTransactionCache(
  facilityId?: number,
  residentId?: number,
  year?: number,
  month?: number
): Promise<void> {
  const paths: string[] = []
  
  // ダッシュボード
  if (facilityId && year && month) {
    paths.push(`/api/dashboard?year=${year}&month=${month}&facilityId=${facilityId}`)
  } else if (year && month) {
    paths.push(`/api/dashboard?year=${year}&month=${month}`)
  }
  
  // 施設詳細
  if (facilityId && year && month) {
    paths.push(`/api/facilities/${facilityId}?year=${year}&month=${month}`)
    paths.push(`/api/facilities/${facilityId}/transactions?year=${year}&month=${month}`)
  }
  
  // 利用者詳細
  if (residentId && year && month) {
    paths.push(`/api/residents/${residentId}?year=${year}&month=${month}`)
  }
  
  await invalidateCache(paths)
}

/**
 * マスタデータ更新後に呼び出す
 * 施設、ユニット、利用者のマスタデータのキャッシュを無効化
 * 
 * @param facilityId 施設ID（オプション）
 */
export async function invalidateMasterCache(facilityId?: number): Promise<void> {
  const paths: string[] = []
  
  // 施設一覧
  paths.push('/api/facilities')
  if (facilityId) {
    paths.push(`/api/facilities/${facilityId}`)
  }
  
  // ユニット一覧
  paths.push('/api/units')
  if (facilityId) {
    paths.push(`/api/units?facilityId=${facilityId}`)
  }
  
  // 利用者一覧
  paths.push('/api/residents')
  if (facilityId) {
    paths.push(`/api/residents?facilityId=${facilityId}`)
  }
  
  await invalidateCache(paths)
}
