'use client'

interface RiskLevelBadgeProps {
  level: 'low' | 'medium' | 'high' | 'critical'
}

const styles: Record<RiskLevelBadgeProps['level'], string> = {
  low: 'bg-emerald-50 text-emerald-700',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700 animate-pulse',
}

export function RiskLevelBadge({ level }: RiskLevelBadgeProps) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${styles[level]}`}>
      {level}
    </span>
  )
}
