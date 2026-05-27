'use client'

interface ConfidenceIndicatorProps {
  level: 'high' | 'medium' | 'low'
}

const styles: Record<ConfidenceIndicatorProps['level'], string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
}

const labels: Record<ConfidenceIndicatorProps['level'], string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
}

export function ConfidenceIndicator({ level }: ConfidenceIndicatorProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-500">
      <span className={`h-2 w-2 rounded-full ${styles[level]}`} />
      {labels[level]}
    </span>
  )
}
