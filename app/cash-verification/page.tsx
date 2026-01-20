'use client'

import { useState, useEffect, useCallback } from 'react'
import MainLayout from '@/components/MainLayout'
import DateSelector from '@/components/DateSelector'
import { useFacility } from '@/contexts/FacilityContext'

interface CashDenomination {
  value: number
  label: string
  count: number
  amount: number
}

interface Facility {
  id: number
  name: string
  isActive: boolean
}

const BILL_DENOMINATIONS: CashDenomination[] = [
  { value: 10000, label: '10,000円', count: 0, amount: 0 },
  { value: 5000, label: '5,000円', count: 0, amount: 0 },
  { value: 2000, label: '2,000円', count: 0, amount: 0 },
  { value: 1000, label: '1,000円', count: 0, amount: 0 },
  { value: 500, label: '500円', count: 0, amount: 0 },
  { value: 100, label: '100円', count: 0, amount: 0 },
  { value: 50, label: '50円', count: 0, amount: 0 },
  { value: 10, label: '10円', count: 0, amount: 0 },
  { value: 5, label: '5円', count: 0, amount: 0 },
  { value: 1, label: '1円', count: 0, amount: 0 },
]

const COIN_DENOMINATIONS: CashDenomination[] = [
  { value: 500, label: '500円', count: 0, amount: 0 },
  { value: 100, label: '100円', count: 0, amount: 0 },
  { value: 50, label: '50円', count: 0, amount: 0 },
  { value: 10, label: '10円', count: 0, amount: 0 },
  { value: 5, label: '5円', count: 0, amount: 0 },
  { value: 1, label: '1円', count: 0, amount: 0 },
]

export default function CashVerificationPage() {
  const { selectedFacilityId: globalSelectedFacilityId } = useFacility()
  const [localSelectedFacilityId, setLocalSelectedFacilityId] = useState<number | null>(null)
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [facilityBalance, setFacilityBalance] = useState(0)
  const [facilityName, setFacilityName] = useState('')
  const [bills, setBills] = useState<CashDenomination[]>(BILL_DENOMINATIONS)
  const [coins, setCoins] = useState<CashDenomination[]>(COIN_DENOMINATIONS)
  const [isLoading, setIsLoading] = useState(false)

  // グローバルに選択されている施設がある場合はそれを使用、なければローカル選択を使用
  const selectedFacilityId = globalSelectedFacilityId || localSelectedFacilityId

  // 施設一覧を取得
  useEffect(() => {
    const fetchFacilities = async () => {
      try {
        const response = await fetch('/api/facilities')
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
        }
        const data = await response.json()
        // エラーオブジェクトの場合は空配列を設定
        if (data.error || !Array.isArray(data)) {
          console.error('Failed to fetch facilities:', data.error || 'Invalid response format')
          setFacilities([])
          return
        }
        // 配列であることを確認してからfilterを呼び出す
        const facilitiesArray = Array.isArray(data) ? data : []
        setFacilities(facilitiesArray.filter((f: Facility) => f.isActive))
      } catch (error) {
        console.error('Failed to fetch facilities:', error)
        setFacilities([])
      }
    }
    fetchFacilities()
  }, [])

  const fetchFacilityInfo = useCallback(async () => {
    if (!selectedFacilityId) return
    
    try {
      const response = await fetch(`/api/facilities/${selectedFacilityId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch facility info')
      }
      const data = await response.json()
      setFacilityName(data.name || '')
    } catch (error) {
      console.error('Failed to fetch facility info:', error)
    }
  }, [selectedFacilityId])

  const fetchFacilityBalance = useCallback(async () => {
    if (!selectedFacilityId) return
    
    setIsLoading(true)
    try {
      const response = await fetch(`/api/facilities/${selectedFacilityId}?year=${year}&month=${month}`)
      if (!response.ok) {
        throw new Error('Failed to fetch facility balance')
      }
      const data = await response.json()
      setFacilityBalance(data.totalAmount || 0)
    } catch (error) {
      console.error('Failed to fetch facility balance:', error)
      alert('施設残高の取得に失敗しました')
      setFacilityBalance(0)
    } finally {
      setIsLoading(false)
    }
  }, [selectedFacilityId, year, month])

  useEffect(() => {
    if (selectedFacilityId) {
      fetchFacilityBalance()
      fetchFacilityInfo()
    } else {
      setFacilityBalance(0)
      setFacilityName('')
    }
  }, [selectedFacilityId, fetchFacilityBalance, fetchFacilityInfo])

  const handleDateChange = (newYear: number, newMonth: number) => {
    setYear(newYear)
    setMonth(newMonth)
  }

  const handleBillCountChange = (index: number, count: number) => {
    const newBills = [...bills]
    newBills[index].count = Math.max(0, count)
    newBills[index].amount = newBills[index].count * newBills[index].value
    setBills(newBills)
  }

  const handleCoinCountChange = (index: number, count: number) => {
    const newCoins = [...coins]
    newCoins[index].count = Math.max(0, count)
    // 50枚セット単位で計算（棒金）
    newCoins[index].amount = newCoins[index].count * newCoins[index].value * 50
    setCoins(newCoins)
  }

  const billSubtotal = bills.reduce((sum, bill) => sum + bill.amount, 0)
  const coinSubtotal = coins.reduce((sum, coin) => sum + coin.amount, 0)
  const totalAmount = billSubtotal + coinSubtotal
  const totalCount = bills.reduce((sum, bill) => sum + bill.count, 0) + coins.reduce((sum, coin) => sum + coin.count, 0)
  const difference = facilityBalance - totalAmount

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const resetCounts = () => {
    setBills(BILL_DENOMINATIONS.map(b => ({ ...b, count: 0, amount: 0 })))
    setCoins(COIN_DENOMINATIONS.map(c => ({ ...c, count: 0, amount: 0 })))
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPdf = async () => {
    if (!selectedFacilityId) {
      alert('施設を選択してください')
      return
    }

    try {
      // 紙幣・硬貨のデータをURLパラメータにエンコード
      const billsParam = encodeURIComponent(JSON.stringify(bills))
      const coinsParam = encodeURIComponent(JSON.stringify(coins))
      
      // APIを呼び出してPDFをダウンロード
      const url = `/api/print/cash-verification?facilityId=${selectedFacilityId}&year=${year}&month=${month}&bills=${billsParam}&coins=${coinsParam}`
      
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('PDF生成に失敗しました')
      }

      // PDFをBlobとして取得
      const blob = await response.blob()
      
      // ダウンロード
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `現金確認_${facilityName}_${year}年${month}月.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('Failed to download PDF:', error)
      alert('PDFのダウンロードに失敗しました')
    }
  }

  return (
    <MainLayout>
      <div>
        <style jsx global>{`
          @media print {
            /* サイドバーを非表示 - 最も確実な方法 */
            .no-print-sidebar,
            .no-print-sidebar *,
            aside,
            nav,
            [role="navigation"],
            body > div > div.flex > .no-print-sidebar,
            body > div > div.flex > aside,
            body > div > div.flex > nav,
            body > div > div.flex > div:first-child,
            body > div[id*="__next"] > div.flex > .no-print-sidebar,
            body > div[id*="__next"] > div.flex > aside,
            body > div[id*="__next"] > div.flex > nav,
            body > div[id*="__next"] > div.flex > div:first-child,
            /* Sidebarコンポーネントのdiv（w-64クラスを持つ） */
            div.w-64,
            div[class*="w-64"] {
              display: none !important;
              visibility: hidden !important;
              width: 0 !important;
              height: 0 !important;
              overflow: hidden !important;
              position: absolute !important;
              left: -9999px !important;
            }
            
            /* MainLayoutのflexレイアウトを解除 */
            body > div > div.flex,
            body > div[id*="__next"] > div.flex {
              display: block !important;
              flex-direction: column !important;
            }
            
            /* メインコンテンツを全幅に */
            main.flex-1 {
              width: 100% !important;
              max-width: 100% !important;
              margin-left: 0 !important;
            }
            
            /* タイトル「現金確認」を非表示 */
            h1.text-3xl {
              display: none !important;
            }
            
            /* 施設選択セクションとDateSelectorを非表示 */
            .no-print-facility-select,
            .no-print-date-selector {
              display: none !important;
            }
            
            /* 印刷ボタンとリセットボタンを非表示 */
            .no-print-button {
              display: none !important;
            }
            
            /* 印刷用日付を表示 */
            .print-date {
              display: block !important;
            }
            
            /* 独立した印刷用日付セクションは非表示 */
            .print-date.bg-white {
              display: none !important;
            }
            
            /* 合計・差異表示セクションを非表示 */
            .no-print-summary {
              display: none !important;
            }
            
            /* 印刷時のセクション間のマージンを詰める */
            .print-section {
              margin-bottom: 0.5rem !important;
            }
            
            /* メインコンテンツの余白を調整 */
            main {
              padding: 0 !important;
              margin: 0 !important;
            }
            
            /* ページの余白を調整 */
            @page {
              margin: 1cm;
            }
            
            /* すべての背景色を白に、文字色を黒に統一（モノクロ印刷） */
            * {
              color: #000 !important;
              background: #fff !important;
              background-color: #fff !important;
            }
            
            /* 金種表（預り金）の部分を印刷用に調整（枠なし） */
            .bg-green-50,
            .bg-green-100 {
              background: #fff !important;
              background-color: #fff !important;
              color: #000 !important;
            }
            
            /* テキストの色を黒に統一 */
            .text-white,
            .text-green-800,
            .text-green-600,
            .text-red-600,
            .text-blue-600,
            .text-gray-600 {
              color: #000 !important;
            }
            
            /* ボーダーの色を黒に統一 */
            .border-green-200,
            .border-gray-300,
            .border-gray-400 {
              border-color: #000 !important;
            }
            
            /* 入力フィールドの背景を白に */
            input,
            select {
              background: #fff !important;
              background-color: #fff !important;
              border: 1px solid #000 !important;
              color: #000 !important;
            }
            
            /* テーブルのボーダーを黒に */
            table {
              border-color: #000 !important;
            }
            
            table th,
            table td {
              border-color: #000 !important;
            }
            
            /* 影を削除 */
            .shadow-md,
            .shadow-lg {
              box-shadow: none !important;
            }
          }
          
          /* 通常表示時は印刷用日付を非表示 */
          .print-date {
            display: none;
          }
        `}</style>
        <h1 className="text-3xl font-bold mb-6">現金確認</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6 no-print-date-selector">
          {!globalSelectedFacilityId && (
            <div className="mb-4 no-print-facility-select">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                施設選択
              </label>
              <select
                value={localSelectedFacilityId || ''}
                onChange={(e) => setLocalSelectedFacilityId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">施設を選択してください</option>
                {facilities.map(facility => (
                  <option key={facility.id} value={facility.id}>
                    {facility.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="[&>div]:mb-0">
              <DateSelector year={year} month={month} onDateChange={handleDateChange} />
            </div>
            {selectedFacilityId && (
              <div className="flex gap-2 no-print-button">
                <button
                  onClick={handlePrint}
                  className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600 shadow-md hover:shadow-lg transition-shadow"
                  title="印刷"
                >
                  🖨️ 印刷
                </button>
                <button
                  onClick={handleDownloadPdf}
                  className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 shadow-md hover:shadow-lg transition-shadow"
                  title="PDFダウンロード"
                >
                  📄 PDFダウンロード
                </button>
              </div>
            )}
          </div>
        </div>

        {selectedFacilityId ? (
          <>
            {/* 施設別残額合計 */}
            <div className="mb-6 relative">
              <div className="text-lg font-semibold mb-2">金種表（預り金）</div>
              <div className="text-3xl font-bold">
                {isLoading ? '読み込み中...' : formatCurrency(facilityBalance)}
              </div>
              {facilityName && (
                <div className="text-sm mt-2">
                  {facilityName}
                </div>
              )}
              {/* 印刷用日付を右下に配置 */}
              <div className="print-date absolute bottom-4 right-4 text-sm font-normal">
                印刷日: {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>

            {/* 紙幣・硬貨入力セクション（統合） */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6 print-section">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">紙幣</h2>
                <button
                  onClick={resetCounts}
                  className="no-print-button px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm"
                >
                  リセット
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-4">額面</th>
                      <th className="text-center py-2 px-4 w-32">枚数</th>
                      <th className="text-right py-2 px-4 w-40">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map((bill, index) => (
                      <tr key={bill.value} className="border-b">
                        <td className="py-2 px-4">{bill.label}</td>
                        <td className="py-2 px-4">
                          <input
                            type="number"
                            min="0"
                            value={bill.count || ''}
                            onChange={(e) => handleBillCountChange(index, parseInt(e.target.value) || 0)}
                            className="w-full px-2 py-1 border border-yellow-300 rounded bg-yellow-50 text-center"
                            placeholder="0"
                          />
                        </td>
                        <td className="py-2 px-4 text-right font-mono">
                          {formatCurrency(bill.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* 【本】セクション */}
              <div className="mt-6">
                <div className="bg-green-100 px-4 py-2 mb-4 rounded">
                  <span className="font-semibold text-green-800">【本】</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-4">額面</th>
                        <th className="text-center py-2 px-4 w-32">本数（50枚セット）</th>
                        <th className="text-right py-2 px-4 w-40">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coins.map((coin, index) => (
                        <tr key={coin.value} className="border-b">
                          <td className="py-2 px-4">{coin.label}</td>
                          <td className="py-2 px-4">
                            <input
                              type="number"
                              min="0"
                              value={coin.count || ''}
                              onChange={(e) => handleCoinCountChange(index, parseInt(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-yellow-300 rounded bg-yellow-50 text-center"
                              placeholder="0"
                            />
                          </td>
                          <td className="py-2 px-4 text-right font-mono">
                            {formatCurrency(coin.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-400 font-semibold">
                        <td colSpan={2} className="py-2 px-4 text-right">合計</td>
                        <td className="py-2 px-4 text-right font-mono">
                          {formatCurrency(totalAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* 合計・差異表示 */}
            <div className="bg-white rounded-lg shadow-md p-6 no-print-summary">
              <div className="text-xl font-semibold">
                {formatCurrency(facilityBalance)}（預り金合計）ー{formatCurrency(totalAmount)}（現金合計）＝<span className={difference === 0 ? 'text-green-600' : difference > 0 ? 'text-red-600' : 'text-blue-600'}>{formatCurrency(difference)}</span>（差異）
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
            施設を選択してください。サイドバーから「施設選択」を選択して施設を選択してください。
          </div>
        )}
      </div>
    </MainLayout>
  )
}
