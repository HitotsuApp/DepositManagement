'use client'

import { useState, useEffect } from 'react'
import MainLayout from '@/components/MainLayout'
import DateSelector from '@/components/DateSelector'
import Card from '@/components/Card'
import { useRouter } from 'next/navigation'

interface FacilitySummary {
  id: number
  name: string
  totalAmount: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [totalAmount, setTotalAmount] = useState(0)
  const [facilities, setFacilities] = useState<FacilitySummary[]>([])

  useEffect(() => {
    fetchDashboardData()
  }, [year, month])

  const fetchDashboardData = async () => {
    try {
      const response = await fetch(`/api/dashboard?year=${year}&month=${month}`)
      const data = await response.json()
      setTotalAmount(data.totalAmount || 0)
      setFacilities(data.facilities || [])
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    }
  }

  const handleDateChange = (newYear: number, newMonth: number) => {
    setYear(newYear)
    setMonth(newMonth)
  }

  const handleFacilityClick = (facilityId: number) => {
    router.push(`/facilities/${facilityId}?year=${year}&month=${month}`)
  }

  return (
    <MainLayout>
      <div>
        <h1 className="text-3xl font-bold mb-6">法人ダッシュボード</h1>
        
        <DateSelector year={year} month={month} onDateChange={handleDateChange} />

        <div className="mb-8">
          <Card
            title="法人全体の預かり金合計"
            amount={totalAmount}
            className="bg-blue-50 border-2 border-blue-200"
          />
        </div>

        <h2 className="text-xl font-semibold mb-4">各施設の合計金額</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {facilities.map(facility => (
            <Card
              key={facility.id}
              title={facility.name}
              amount={facility.totalAmount}
              onClick={() => handleFacilityClick(facility.id)}
            />
          ))}
        </div>
      </div>
    </MainLayout>
  )
}

