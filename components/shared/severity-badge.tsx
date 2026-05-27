'use client'

interface SeverityBadgeProps {
  severity: 'info' | 'warning' | 'critical'
}

const styles: Record<SeverityBadgeProps['severity'], string> = {
  info: 'bg-blue-50 text-blue-700',
  warning: 'bg-amber-50 text-amber-700',
  critical: 'bg-red-50 text-red-700',
}

const labels: Record<SeverityBadgeProps['severity'], string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles[severity]}`}>
      {labels[severity]}
    </span>
  )
}
