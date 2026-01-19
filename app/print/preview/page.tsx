"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { PDFViewer } from "@react-pdf/renderer"
import { PdfRenderer } from "@/pdf/renderer/PdfRenderer"
import { BatchPdfRenderer } from "@/pdf/renderer/BatchPdfRenderer"
import MainLayout from "@/components/MainLayout"
import DateSelector from "@/components/DateSelector"
import depositStatementTemplate from "@/pdf/templates/deposit-statement.json"
import residentStatementTemplate from "@/pdf/templates/resident-statement.json"
import { PrintData, ResidentPrintData } from "@/pdf/utils/transform"

interface BatchPrintData {
  facilitySummary: PrintData
  residentStatements: ResidentPrintData[]
}

// 型ガード関数
function isResidentPrintData(data: PrintData | ResidentPrintData): data is ResidentPrintData {
  return "resident" in data
}

export default function PrintPreviewPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const facilityId = searchParams.get("facilityId")
  const unitId = searchParams.get("unitId")
  const residentId = searchParams.get("residentId")
  const printType = searchParams.get("type") // "unit", "resident", or "batch"
  
  const [year, setYear] = useState(() => {
    const y = searchParams.get("year")
    return y ? Number(y) : new Date().getFullYear()
  })
  const [month, setMonth] = useState(() => {
    const m = searchParams.get("month")
    return m ? Number(m) : new Date().getMonth() + 1
  })

  const [printData, setPrintData] = useState<PrintData | ResidentPrintData | null>(null)
  const [batchPrintData, setBatchPrintData] = useState<BatchPrintData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [residentFacilityId, setResidentFacilityId] = useState<number | null>(null)
  const [residents, setResidents] = useState<{ id: number; name: string }[]>([])
  const [prevResidentId, setPrevResidentId] = useState<number | null>(null)
  const [nextResidentId, setNextResidentId] = useState<number | null>(null)

  useEffect(() => {
    if (printType === "batch") {
      if (facilityId) {
        fetchBatchPrintData()
      } else {
        setError("施設IDが指定されていません")
        setIsLoading(false)
      }
    } else if (printType === "resident") {
      if (residentId) {
        fetchResidentPrintData()
      } else {
        setError("利用者IDが指定されていません")
        setIsLoading(false)
      }
    } else {
      if (facilityId) {
        fetchUnitPrintData()
      } else {
        setError("施設IDが指定されていません")
        setIsLoading(false)
      }
    }
  }, [facilityId, unitId, residentId, printType, year, month])

  const fetchUnitPrintData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const unitParam = unitId ? `&unitId=${unitId}` : ''
      const response = await fetch(
        `/api/print/deposit-statement?facilityId=${facilityId}${unitParam}&year=${year}&month=${month}`
      )
      if (!response.ok) {
        throw new Error("印刷データの取得に失敗しました")
      }
      const data = await response.json()
      setPrintData(data)
    } catch (err) {
      console.error("Failed to fetch print data:", err)
      setError(err instanceof Error ? err.message : "エラーが発生しました")
    } finally {
      setIsLoading(false)
    }
  }

  const fetchBatchPrintData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/print/batch-print?facilityId=${facilityId}&year=${year}&month=${month}`
      )
      if (!response.ok) {
        throw new Error("印刷データの取得に失敗しました")
      }
      const data = await response.json()
      setBatchPrintData(data)
    } catch (err) {
      console.error("Failed to fetch batch print data:", err)
      setError(err instanceof Error ? err.message : "エラーが発生しました")
    } finally {
      setIsLoading(false)
    }
  }

  const fetchResidentPrintData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/print/resident-statement?residentId=${residentId}&year=${year}&month=${month}`
      )
      if (!response.ok) {
        throw new Error("印刷データの取得に失敗しました")
      }
      const data = await response.json()
      setPrintData(data)
      
      // 施設IDを取得（利用者詳細APIから）
      if (residentId) {
        const residentDetailResponse = await fetch(
          `/api/residents/${residentId}?year=${year}&month=${month}`
        )
        if (residentDetailResponse.ok) {
          const residentDetail = await residentDetailResponse.json()
          setResidentFacilityId(residentDetail.facilityId || null)
        }
      }
    } catch (err) {
      console.error("Failed to fetch print data:", err)
      setError(err instanceof Error ? err.message : "エラーが発生しました")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (printType === "resident" && residentFacilityId && residentId) {
      fetchResidentsList()
    }
  }, [residentFacilityId, residentId, printType])

  const fetchResidentsList = async () => {
    try {
      const response = await fetch(
        `/api/residents?facilityId=${residentFacilityId}`
      )
      const data = await response.json()
      const sortedResidents = data.map((r: { id: number; name: string }) => ({
        id: r.id,
        name: r.name,
      }))
      setResidents(sortedResidents)
      
      // 前後の利用者IDを計算
      const currentIndex = sortedResidents.findIndex((r: { id: number }) => r.id === Number(residentId))
      if (currentIndex > 0) {
        setPrevResidentId(sortedResidents[currentIndex - 1].id)
      } else {
        setPrevResidentId(null)
      }
      if (currentIndex < sortedResidents.length - 1 && currentIndex >= 0) {
        setNextResidentId(sortedResidents[currentIndex + 1].id)
      } else {
        setNextResidentId(null)
      }
    } catch (error) {
      console.error("Failed to fetch residents list:", error)
    }
  }

  const handleResidentChange = (newResidentId: number) => {
    router.push(`/print/preview?residentId=${newResidentId}&year=${year}&month=${month}&type=resident`)
  }

  const handleDateChange = (newYear: number, newMonth: number) => {
    setYear(newYear)
    setMonth(newMonth)
  }

  const handleDownload = () => {
    // PDFダウンロード機能は後で実装可能
    window.print()
  }

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="text-xl mb-4">読み込み中...</div>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error || (printType !== "batch" && !printData) || (printType === "batch" && !batchPrintData)) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="text-xl text-red-600 mb-4">
              {error || "データが見つかりません"}
            </div>
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              戻る
            </button>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="h-screen flex flex-col">
        {/* ヘッダー */}
        <div className="bg-white border-b p-4 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">
              {printType === "batch" ? "まとめて印刷 プレビュー" : "預り金明細書 印刷プレビュー"}
            </h1>
            <DateSelector
              year={year}
              month={month}
              onDateChange={handleDateChange}
            />
          </div>
          <div className="flex flex-col items-end gap-2">
            {/* 利用者タイプの場合、利用者名と矢印ボタンを右上に表示 */}
            {printType === "resident" && printData && isResidentPrintData(printData) && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => prevResidentId && handleResidentChange(prevResidentId)}
                  disabled={!prevResidentId}
                  className={`px-3 py-1 rounded text-sm ${
                    prevResidentId
                      ? "bg-gray-200 hover:bg-gray-300"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  }`}
                  title={prevResidentId ? "前の利用者" : "前の利用者なし"}
                >
                  ◀
                </button>
                <span className="text-lg font-semibold min-w-[120px] text-center">
                  {printData.resident.name}
                </span>
                <button
                  onClick={() => nextResidentId && handleResidentChange(nextResidentId)}
                  disabled={!nextResidentId}
                  className={`px-3 py-1 rounded text-sm ${
                    nextResidentId
                      ? "bg-gray-200 hover:bg-gray-300"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  }`}
                  title={nextResidentId ? "次の利用者" : "次の利用者なし"}
                >
                  ▶
                </button>
              </div>
            )}
            {/* 戻るボタンを利用者名の下に配置 */}
            <button
              onClick={() => window.history.back()}
              className="px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              戻る
            </button>
          </div>
        </div>

        {/* PDFプレビュー */}
        <div className="flex-1 overflow-hidden">
          {printType === "batch" && batchPrintData ? (
            <PDFViewer width="100%" height="100%">
              <BatchPdfRenderer data={batchPrintData} />
            </PDFViewer>
          ) : printData ? (
            <PDFViewer width="100%" height="100%">
              <PdfRenderer
                template={
                  printType === "resident"
                    ? (residentStatementTemplate as any)
                    : (depositStatementTemplate as any)
                }
                data={printData}
              />
            </PDFViewer>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p>データを読み込み中...</p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  )
}
