import { AIInsightCard } from '@/components/shared/ai-insight-card'
import { ChartWrapper } from '@/components/shared/chart-wrapper'
import { DataFreshnessBar } from '@/components/shared/data-freshness-bar'
import { EmptyState } from '@/components/shared/empty-state'
import { InsightSkeleton } from '@/components/shared/loading-skeleton'
import { aggregateSchoolData } from '@/lib/ai/aggregate'
import { getCachedInsights, getInsights } from '@/lib/ai/insights'
import { computeRiskScoresBatch } from '@/lib/ai/risk'
import { requireRole } from '@/lib/auth/get-current-user'
import { RiskStudentsPanel } from './components/risk-students-panel'
import { RealtimeInsights } from '@/components/shared/realtime-insights'

function tone(value: number, high: number, medium: number): string {
  if (value > high) return 'text-emerald-600'
  if (value > medium) return 'text-amber-600'
  return 'text-red-600'
}

export default async function PrincipalPage() {
  const user = await requireRole(['principal', 'admin', 'super_admin'] as unknown as Array<'owner' | 'principal' | 'teacher' | 'accountant' | 'parent'>)
  const { insights, generatedAt, isStale } = await getCachedInsights({
    role: 'principal',
    schoolId: user.schoolId,
    userId: user.userId,
  })

  const metrics = await aggregateSchoolData({
    role: 'principal',
    schoolId: user.schoolId,
    academicYearId: user.academicYearId ?? '',
    userId: user.userId,
    dateRange: { from: new Date('2025-06-01'), to: new Date('2025-11-30') },
  })

  if (isStale) {
    getInsights({
      role: 'principal',
      schoolId: user.schoolId,
      userId: user.userId,
      academicYearId: user.academicYearId ?? '',
      metrics,
    }).catch((err) => console.error('[PRINCIPAL_INSIGHTS]', err))
  }

  computeRiskScoresBatch(user.schoolId, user.academicYearId ?? '').catch((err) =>
    console.error('[PRINCIPAL_RISK]', err)
  )

  return (
    <div className="space-y-6">
      <DataFreshnessBar insightsGeneratedAt={generatedAt} isRefreshing={isStale} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Overall Attendance</p><p className={`mt-1 text-2xl font-semibold ${tone(metrics.attendance.overall_rate, 85, 75)}`}>{metrics.attendance.overall_rate.toFixed(1)}%</p></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Critical Risk Students</p><p className={`mt-1 text-2xl font-semibold ${metrics.risk_summary.critical_count > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{metrics.risk_summary.critical_count}</p></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Fee Collection Rate</p><p className={`mt-1 text-2xl font-semibold ${tone(metrics.fees.collection_rate, 80, 60)}`}>{metrics.fees.collection_rate.toFixed(1)}%</p></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Homework Completion</p><p className={`mt-1 text-2xl font-semibold ${tone(metrics.engagement.homework_completion_rate, 80, 60)}`}>{metrics.engagement.homework_completion_rate.toFixed(1)}%</p></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <section className="space-y-3 xl:col-span-3">
          <h2 className="text-sm font-semibold text-slate-900">AI Insights</h2>
            <RealtimeInsights
              schoolId={user.schoolId}
              role="principal"
              userId={user.userId}
              initialInsights={insights}
              isStale={isStale}
            />
        </section>

        <section className="space-y-3 xl:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Students At Risk</h2>
          <RiskStudentsPanel students={metrics.risk_summary.top_at_risk} schoolId={user.schoolId} userId={user.userId} />
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Attendance Trend</h2>
        <ChartWrapper
          height={250}
          data={{
            type: 'line',
            labels: metrics.attendance.trend_labels,
            datasets: [{ label: 'Attendance Rate', data: metrics.attendance.trend, color: '#6366f1' }],
            threshold_value: 75,
            threshold_label: 'Minimum target',
          }}
        />
      </section>
    </div>
  )
}
