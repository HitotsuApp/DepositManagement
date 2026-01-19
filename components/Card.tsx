interface CardProps {
  title: string
  amount: number
  onClick?: () => void
  className?: string
}

export default function Card({ title, amount, onClick, className = '' }: CardProps) {
  const formattedAmount = new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(amount)

  // classNameに背景色が含まれているかチェック
  const hasBackgroundColor = className.includes('bg-')
  const defaultBackground = hasBackgroundColor ? '' : 'bg-white'

  return (
    <div
      onClick={onClick}
      className={`
        ${defaultBackground} rounded-lg shadow-md p-6
        ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}
        ${className}
      `}
    >
      <h3 className="text-xl font-medium text-gray-600 mb-2">{title}</h3>
      <p className="text-2xl font-bold text-gray-900">{formattedAmount}</p>
    </div>
  )
}

