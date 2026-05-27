'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import type { AIInsight, Role } from '@/types/ai'
import { AIInsightCard } from '@/components/shared/ai-insight-card'
import { InsightSkeleton } from '@/components/shared/loading-skeleton'
import { EmptyState } from '@/components/shared/empty-state'

interface RealtimeInsightsProps {
  schoolId: string
  role: Role
  userId: string
  initialInsights: AIInsight[]
  isStale: boolean
}

export function RealtimeInsights({
  schoolId, role, userId, initialInsights, isStale
}: RealtimeInsightsProps) {
  const [insights, setInsights] = useState<AIInsight[]>(initialInsights)

  useEffect(() => {
    const supabase = createBrowserClient()
    const channel = supabase
      .channel('insights_' + role + '_' + userId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ai_insights',
          filter: 'school_id=eq.' + schoolId
        },
        (payload) => {
          const newInsight = payload.new as AIInsight
          if (newInsight.role !== role) return
          if (newInsight.generated_for_user_id !== userId) return
          setInsights(prev => [
            newInsight,
            ...prev.filter(i => i.insight_type !== newInsight.insight_type)
          ])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [schoolId, role, userId])

  if (insights.length > 0) {
    return (
      <div className="space-y-4">
        {insights.map(insight => (
          <AIInsightCard key={insight.id} insight={insight} role={role} />
        ))}
      </div>
    )
  }

  if (isStale) return <InsightSkeleton />

  return <EmptyState role={role} module="insights" />
}
