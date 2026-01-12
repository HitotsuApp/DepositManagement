'use client'

interface DateSelectorProps {
  year: number
  month: number
  onDateChange: (year: number, month: number) => void
}

export default function DateSelector({ year, month, onDateChange }: DateSelectorProps) {
  const handlePrevMonth = () => {
    if (month === 1) {
      onDateChange(year - 1, 12)
    } else {
      onDateChange(year, month - 1)
    }
  }

  const handleNextMonth = () => {
    if (month === 12) {
      onDateChange(year + 1, 1)
    } else {
      onDateChange(year, month + 1)
    }
  }

  const formatDate = (y: number, m: number) => {
    return `${y}-${String(m).padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-4 mb-6">
      <button
        onClick={handlePrevMonth}
        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
      >
        ◀
      </button>
      <span className="text-xl font-semibold min-w-[120px] text-center">
        {formatDate(year, month)}
      </span>
      <button
        onClick={handleNextMonth}
        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
      >
        ▶
      </button>
    </div>
  )
}

