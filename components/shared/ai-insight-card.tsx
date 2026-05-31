'use client'

import { useEffect, useMemo, useState } from 'react'
import { SeverityBadge } from '@/components/shared/severity-badge'
import { ConfidenceIndicator } from '@/components/shared/confidence-indicator'
import { ChartWrapper } from '@/components/shared/chart-wrapper'
import { formatRelativeTime } from '@/lib/utils/format'
import type { AIInsight, Role } from '@/types/ai'
import { CheckCircle } from 'lucide-react'

interface AIInsightCardProps { insight: AIInsight; role: Role; onRead?: (insightId: string) => void; onAction?: (insightId: string) => void }

export function AIInsightCard({ insight, role, onRead, onAction }: AIInsightCardProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [actioned, setActioned] = useState(insight.action_taken)
  const [showDot, setShowDot] = useState(!insight.is_read)
  const typeLabel = useMemo(() => insight.insight_type.split('_').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' '), [insight.insight_type])
  
  useEffect(() => {
    setActioned(insight.action_taken)
  }, [insight.action_taken])

  useEffect(() => {
    if (insight.is_read) return
    const t = setTimeout(() => { onRead?.(insight.id); setShowDot(false) }, 3000)
    return () => clearTimeout(t)
  }, [insight.id, insight.is_read, onRead])

  const handleAction = async () => {
    setActioned(true)
    try {
      await onAction?.(insight.id)
    } catch {
      setActioned(false)
    }
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <SeverityBadge severity={insight.severity} />
        <span>{typeLabel}</span>
        <ConfidenceIndicator level={insight.confidence_level} />
        <span>{formatRelativeTime(insight.generated_at)}</span>
        {showDot ? <span className="ml-auto h-2.5 w-2.5 rounded-full bg-blue-500 transition-opacity duration-3000" /> : null}
      </div>
      <h3 className="mt-2 text-[16px] font-semibold text-slate-900">{insight.title}</h3>
      <p className="mt-1 line-clamp-3 text-[14px] text-slate-600">{insight.narrative}</p>
      {insight.chart_data ? <div className="mt-3"><ChartWrapper data={insight.chart_data} height={160} /></div> : null}
      <button 
        type="button" 
        onClick={() => setShowDetails(!showDetails)} 
        className="text-sm text-blue-600 hover:underline"
      >
        {showDetails ? 'Hide details' : 'Show details'}
      </button>
      {showDetails && (
        <div className="mt-2 space-y-2 rounded-md bg-slate-50 p-3 text-sm">
          <div><p className="font-medium text-slate-800">Recommendation</p><p className="text-slate-600">{insight.recommendation}</p></div>
          {insight.consequence ? <div><p className="font-medium text-amber-700">If no action</p><p className="text-amber-700">{insight.consequence}</p></div> : null}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        {actioned ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle className="h-4 w-4" />
            Actioned
          </div>
        ) : (
          <button 
            type="button" 
            onClick={handleAction} 
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-700"
          >
            Mark as actioned
          </button>
        )}
        <span className="text-xs text-slate-500">{insight.data_points_used} records analyzed · {role}</span>
      </div>
    </article>
  )
}
