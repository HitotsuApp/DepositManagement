"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { PDFViewer } from "@react-pdf/renderer"
import { PdfRenderer } from "@/pdf/renderer/PdfRenderer"
import MainLayout from "@/components/MainLayout"
import DateSelector from "@/components/DateSelector"
import depositStatementTemplate from "@/pdf/templates/deposit-statement.json"
import residentStatementTemplate from "@/pdf/templates/resident-statement.json"

interface UnitPrintData {
  statement: {
    month: string
  }
  unit: {
    name: string
  }
  transactions: Array<{
    category: string
    userName: string
    date: string
    label: string
    payee: string
    income: number
    expense: number
    balance: number
  }>
  summary: {
    totalIncome: number
    totalExpense: number
    currentBalance: number
  }
  facility: {
    name: string
    position: string
    staffName: string
  }
}

interface ResidentPrintData {
  statement: {
    month: string
  }
  resident: {
    name: string
  }
  transactions: Array<{
    date: string
    type: string
    label: string
    payee: string
    income: number
    expense: number
    balance: number
  }>
  summary: {
    totalIncome: number
    totalExpense: number
    currentBalance: number
  }
  facility: {
    name: string
    position: string
    staffName: string
  }
}

type PrintData = UnitPrintData | ResidentPrintData

export default function PrintPreviewPage() {
  const searchParams = useSearchParams()
  const facilityId = searchParams.get("facilityId")
  const unitId = searchParams.get("unitId")
  const residentId = searchParams.get("residentId")
  const printType = searchParams.get("type") // "unit" or "resident"
  
  const [year, setYear] = useState(() => {
    const y = searchParams.get("year")
    return y ? Number(y) : new Date().getFullYear()
  })
  const [month, setMonth] = useState(() => {
    const m = searchParams.get("month")
    return m ? Number(m) : new Date().getMonth() + 1
  })

  const [printData, setPrintData] = useState<PrintData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (printType === "resident") {
      if (residentId) {
        fetchResidentPrintData()
      } else {
        setError("利用者IDが指定されていません")
        setIsLoading(false)
      }
    } else {
      if (facilityId && unitId) {
        fetchUnitPrintData()
      } else {
        setError("施設IDまたはユニットIDが指定されていません")
        setIsLoading(false)
      }
    }
  }, [facilityId, unitId, residentId, printType, year, month])

  const fetchUnitPrintData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/print/deposit-statement?facilityId=${facilityId}&unitId=${unitId}&year=${year}&month=${month}`
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
    } catch (err) {
      console.error("Failed to fetch print data:", err)
      setError(err instanceof Error ? err.message : "エラーが発生しました")
    } finally {
      setIsLoading(false)
    }
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

  if (error || !printData) {
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
        <div className="bg-white border-b p-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">預り金明細書 印刷プレビュー</h1>
            <DateSelector
              year={year}
              month={month}
              onDateChange={handleDateChange}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              印刷
            </button>
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
        </div>
      </div>
    </MainLayout>
  )
}
