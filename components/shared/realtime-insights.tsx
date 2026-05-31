'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import type { AIInsight, Role } from '@/types/ai'
import { AIInsightCard } from '@/components/shared/ai-insight-card'
import { InsightSkeleton } from '@/components/shared/loading-skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { markInsightRead, markInsightActioned } from '@/app/(intelligence)/actions'
import { toast } from 'sonner'

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

  async function handleRead(insightId: string) {
    setInsights(prev =>
      prev.map(i => (i.id === insightId ? { ...i, is_read: true } : i))
    )
    const res = await markInsightRead(insightId)
    if (!res.success) {
      setInsights(prev =>
        prev.map(i => (i.id === insightId ? { ...i, is_read: false } : i))
      )
      toast.error('Failed to mark as read: ' + res.error)
    }
  }

  async function handleAction(insightId: string) {
    setInsights(prev =>
      prev.map(i => (i.id === insightId ? { ...i, action_taken: true } : i))
    )
    const res = await markInsightActioned(insightId)
    if (!res.success) {
      setInsights(prev =>
        prev.map(i => (i.id === insightId ? { ...i, action_taken: false } : i))
      )
      toast.error('Failed to mark as actioned: ' + res.error)
      throw new Error(res.error)
    } else {
      toast.success('Insight marked as actioned')
    }
  }

  if (insights.length > 0) {
    return (
      <div className="space-y-4">
        {insights.map(insight => (
          <AIInsightCard 
            key={insight.id} 
            insight={insight} 
            role={role} 
            onRead={handleRead}
            onAction={handleAction}
          />
        ))}
      </div>
    )
  }

  if (isStale) return <InsightSkeleton />

  return <EmptyState role={role} module="insights" />
}
