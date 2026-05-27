'use client'

import { RefreshCw } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils/format'

interface DataFreshnessBarProps {
  insightsGeneratedAt: string | null
  riskComputedAt?: string | null
  onRefresh?: () => void
  isRefreshing?: boolean
}

export function DataFreshnessBar({
  insightsGeneratedAt,
  riskComputedAt,
  onRefresh,
  isRefreshing = false,
}: DataFreshnessBarProps) {
  const status = insightsGeneratedAt ? `Insights updated ${formatRelativeTime(insightsGeneratedAt)}` : 'Insights loading...'
  const risk = riskComputedAt ? ` • Risk ${formatRelativeTime(riskComputedAt)}` : ''

  return (
    <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-[12px] text-slate-600">
      <span suppressHydrationWarning>{status}{risk}</span>
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      ) : null}
    </div>
  )
}
