'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFacility } from '@/contexts/FacilityContext'
import { invalidateTransactionCacheForResidents } from '@/lib/cache'

type PreviewCommitItem = {
  residentId: number
  transactionDate: string
  transactionType: 'in' | 'out'
  amount: number
  description: string | null
  payee: string | null
  sourceSheetRow1Based: number
}

type PreviewResponse = {
  success: boolean
  sheetName: string
  baseYear: number
  sheetMonth: number
  facilityId: number
  totalRow: { deposit: number; withdrawal: number; balance: number; sheetRow1Based: number } | null
  sumFromDrafts: { deposit: number; withdrawal: number }
  totalMismatch: {
    excelDeposit: number | null
    excelWithdrawal: number | null
    parsedDeposit: number
    parsedWithdrawal: number
  } | null
  expandErrors: string[]
  residentErrors: string[]
  balanceWarnings: { sheetRow1Based: number; detail: string }[]
  transactionCount: number
  commitItems: PreviewCommitItem[]
  canCommit: boolean
}

export default function ImportPage() {
  const router = useRouter()
  const { selectedFacilityId, facilities } = useFacility()
  const facilityOptions = useMemo(
    () =>
      facilities
        .filter((f) => f.isActive)
        .map(({ id, name }) => ({ id, name }))
        .sort((a, b) => a.id - b.id),
    [facilities]
  )
  const [facilityId, setFacilityId] = useState<number | ''>('')
  const [baseYear, setBaseYear] = useState(() => new Date().getFullYear())
  const [sheetMonth, setSheetMonth] = useState(() => new Date().getMonth() + 1)
  const [file, setFile] = useState<File | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [importMode, setImportMode] = useState<'append' | 'replace_month'>('replace_month')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (selectedFacilityId && facilityId === '') {
      setFacilityId(selectedFacilityId)
    }
  }, [selectedFacilityId, facilityId])

  const runPreview = async () => {
    setMessage(null)
    if (!file) {
      setMessage('Excelファイルを選択してください')
      return
    }
    if (facilityId === '' || !facilityId) {
      setMessage('施設を選択してください')
      return
    }

    setPreviewing(true)
    setPreview(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('facilityId', String(facilityId))
      fd.append('baseYear', String(baseYear))
      fd.append('sheetMonth', String(sheetMonth))

      const res = await fetch('/api/import/deposit-ledger/preview', {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error || 'プレビューに失敗しました')
        if (data.availableSheets && Array.isArray(data.availableSheets)) {
          setMessage(
            (data.error || '') +
              `（利用可能シート: ${data.availableSheets.join(', ')}）`
          )
        }
        return
      }
      setPreview(data as PreviewResponse)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'プレビューに失敗しました')
    } finally {
      setPreviewing(false)
    }
  }

  const runCommit = async () => {
    if (!preview?.canCommit || facilityId === '' || !facilityId) return

    if (
      importMode === 'replace_month' &&
      !window.confirm(
        `選択した施設について、${baseYear}年${sheetMonth}月の既存取引を対象利用者すべてで削除してから登録します。よろしいですか？`
      )
    ) {
      return
    }

    setCommitting(true)
    setMessage(null)
    try {
      const commitItems = preview.commitItems.map(
        ({ sourceSheetRow1Based: _r, ...rest }) => rest
      )

      const res = await fetch('/api/import/deposit-ledger/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facilityId,
          baseYear,
          sheetMonth,
          mode: importMode,
          commitItems,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error || '取込に失敗しました')
        return
      }

      const residentIds = [...new Set(preview.commitItems.map((c) => c.residentId))]
      await invalidateTransactionCacheForResidents(
        facilityId,
        residentIds,
        baseYear,
        sheetMonth
      )
      router.refresh()
      setMessage(
        `取込が完了しました（${data.createdCount}件）${
          data.truncatedFields ? ' ※長い摘要・支払先は切り詰めました' : ''
        }`
      )
      setPreview(null)
      setFile(null)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '取込に失敗しました')
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="max-w-5xl">
        <h1 className="text-3xl font-bold mb-2">データインポート（出納帳Excel）</h1>
        <p className="text-gray-600 mb-6 text-sm">
          施設の預り金出納帳Excel（固定レイアウト・「N月分」シート）から入出金を取り込みます。
          マスタのユニット名・利用者名とExcelの表記が一致する必要があります。詳細は{' '}
          <code className="text-xs bg-gray-100 px-1 rounded">deposit_import_spec.md</code>{' '}
          を参照してください。
        </p>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6 space-y-4">
          <h2 className="text-xl font-semibold">1. 取込条件</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">施設</label>
              <select
                value={facilityId === '' ? '' : String(facilityId)}
                onChange={(e) =>
                  setFacilityId(e.target.value ? Number(e.target.value) : '')
                }
                className="w-full border rounded px-3 py-2"
              >
                <option value="">選択してください</option>
                {facilityOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                日付に使う西暦年
              </label>
              <input
                type="number"
                min={1900}
                max={2200}
                value={baseYear}
                onChange={(e) => setBaseYear(Number(e.target.value))}
                className="w-full border rounded px-3 py-2"
              />
              <p className="text-xs text-gray-500 mt-1">
                例: 2025年4月分のシートなら 2025。 C列・E列の月日と組み合わせます。
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                対象シートの月（1–12）
              </label>
              <input
                type="number"
                min={1}
                max={12}
                value={sheetMonth}
                onChange={(e) => setSheetMonth(Number(e.target.value))}
                className="w-full border rounded px-3 py-2"
              />
              <p className="text-xs text-gray-500 mt-1">
                シート名が「4月分～」で始まるものを自動選択します（未一致時はエラー）。
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Excelファイル（.xls / .xlsx）
              </label>
              <input
                type="file"
                accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={runPreview}
            disabled={previewing}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {previewing ? 'プレビュー中…' : 'プレビュー'}
          </button>
        </div>

        {message && (
          <div
            className={`mb-4 p-4 rounded ${
              message.includes('完了') ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'
            }`}
          >
            {message}
          </div>
        )}

        {preview && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6 space-y-4">
            <h2 className="text-xl font-semibold">2. プレビュー結果</h2>
            <p className="text-sm text-gray-700">
              シート: <strong>{preview.sheetName}</strong> / 登録候補:{' '}
              <strong>{preview.transactionCount}</strong> 件
            </p>

            {preview.totalMismatch && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
                <strong>合計行との不一致:</strong> Excel入金合計 {preview.totalMismatch.excelDeposit}{' '}
                / 取込対象入金 {preview.totalMismatch.parsedDeposit}、Excel出金{' '}
                {preview.totalMismatch.excelWithdrawal} / 取込対象出金{' '}
                {preview.totalMismatch.parsedWithdrawal}
                （利用者マッチ失敗行は集計から除きます）
              </div>
            )}

            {preview.expandErrors.length > 0 && (
              <div>
                <p className="font-medium text-red-700">パースエラー</p>
                <ul className="list-disc list-inside text-sm text-red-800 max-h-40 overflow-y-auto">
                  {preview.expandErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {preview.residentErrors.length > 0 && (
              <div>
                <p className="font-medium text-red-700">利用者マスタ不一致</p>
                <ul className="list-disc list-inside text-sm text-red-800 max-h-40 overflow-y-auto">
                  {preview.residentErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {preview.balanceWarnings.length > 0 && (
              <div>
                <p className="font-medium text-amber-800">残高照合の警告（Excel L列）</p>
                <ul className="list-disc list-inside text-sm text-amber-900 max-h-40 overflow-y-auto">
                  {preview.balanceWarnings.map((w, i) => (
                    <li key={i}>
                      行 {w.sheetRow1Based}: {w.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <h3 className="font-medium">取込実行</h3>
              <div className="flex flex-wrap gap-4 items-center">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="mode"
                    checked={importMode === 'replace_month'}
                    onChange={() => setImportMode('replace_month')}
                  />
                  対象年月を置換（同月の既存取引を削除してから登録）
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="mode"
                    checked={importMode === 'append'}
                    onChange={() => setImportMode('append')}
                  />
                  追加のみ（重複に注意）
                </label>
              </div>
              <button
                type="button"
                onClick={runCommit}
                disabled={!preview.canCommit || committing}
                className="px-6 py-2 bg-green-700 text-white rounded hover:bg-green-800 disabled:bg-gray-400"
              >
                {committing ? '取込中…' : '取込実行'}
              </button>
              {!preview.canCommit && (
                <p className="text-sm text-gray-500">
                  エラーが解消され、登録候補が1件以上あるときに取込できます。
                </p>
              )}
            </div>
          </div>
        )}

        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
          <p className="font-medium text-gray-800 mb-2">取込仕様の要点</p>
          <ul className="list-disc list-inside space-y-1">
            <li>種別（G列）はDBに保存せず、摘要に [種別] を付けて格納します。</li>
            <li>
              繰越行・合計行・ユニット名(A)・利用者名(B)が両方空の行は取り込みません（繰越・期首は本システムの取引・残高に任せます）。
            </li>
            <li>残高列（L）は保存せず、プレビューで参考表示します（Excel の繰越を取り込まないため、先頭明細のLとは一致しないことがあります）。</li>
            <li>入金・出金が同じ行に両方ある場合は、2件の取引に分割します。</li>
          </ul>
        </div>
      </div>
  )
}
