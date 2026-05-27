import { requireRole } from '@/lib/auth/get-current-user'
import { getCachedInsights, getInsights } from '@/lib/ai/insights'
import { aggregateSchoolData } from '@/lib/ai/aggregate'
import { rupees } from '@/lib/utils/format'
import { DataFreshnessBar } from '@/components/shared/data-freshness-bar'
import { AIInsightCard } from '@/components/shared/ai-insight-card'
import { InsightSkeleton } from '@/components/shared/loading-skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { ChartWrapper } from '@/components/shared/chart-wrapper'
import { RealtimeInsights } from '@/components/shared/realtime-insights'

export default async function OwnerPage() {
  const user = await requireRole(['owner'])

  const { insights, generatedAt, isStale } = await getCachedInsights({
    role: 'owner',
    schoolId: user.schoolId,
    userId: user.userId,
  })

  const metrics = await aggregateSchoolData({
    role: 'owner',
    schoolId: user.schoolId,
    academicYearId: user.academicYearId ?? '',
    userId: user.userId,
    dateRange: {
      from: new Date('2025-06-01'),
      to: new Date('2025-11-30'),
    }
  })

  if (isStale) {
    getInsights({
      role: 'owner',
      schoolId: user.schoolId,
      userId: user.userId,
      academicYearId: user.academicYearId ?? '',
      metrics,
    }).catch(err => console.error('[OWNER_INSIGHTS]', err))
  }

  const totalAtRisk = metrics.risk_summary.critical_count +
    metrics.risk_summary.high_count

  const collectionPct = metrics.fees.target > 0
    ? Math.round((metrics.fees.collected / metrics.fees.target) * 100)
    : 0

  const statsCards = [
    {
      label: 'Total Outstanding',
      value: rupees.short(metrics.fees.total_outstanding),
      color: metrics.fees.total_outstanding > 0 ? 'text-red-600' : 'text-green-600',
    },
    {
      label: 'Collection Rate',
      value: metrics.fees.collection_rate.toFixed(1) + '%',
      color: metrics.fees.collection_rate > 80 ? 'text-green-600'
        : metrics.fees.collection_rate > 60 ? 'text-amber-600'
        : 'text-red-600',
    },
    {
      label: 'Students At Risk',
      value: String(totalAtRisk),
      color: totalAtRisk > 10 ? 'text-red-600'
        : totalAtRisk > 5 ? 'text-amber-600'
        : 'text-green-600',
    },
    {
      label: 'Homework Completion',
      value: metrics.engagement.homework_completion_rate.toFixed(1) + '%',
      color: metrics.engagement.homework_completion_rate > 80 ? 'text-green-600'
        : metrics.engagement.homework_completion_rate > 60 ? 'text-amber-600'
        : 'text-red-600',
    },
  ]

  const buckets = [
    { label: '0-30 days', ...metrics.fees.overdue_buckets['0-30'], color: 'border-amber-400' },
    { label: '31-60 days', ...metrics.fees.overdue_buckets['31-60'], color: 'border-orange-500' },
    { label: '61-90 days', ...metrics.fees.overdue_buckets['61-90'], color: 'border-red-500' },
    { label: '90+ days', ...metrics.fees.overdue_buckets['90+'], color: 'border-red-700' },
  ]

  const riskRows = [
    { label: 'Critical', count: metrics.risk_summary.critical_count, color: 'text-red-600' },
    { label: 'High', count: metrics.risk_summary.high_count, color: 'text-orange-500' },
    { label: 'Medium', count: metrics.risk_summary.medium_count, color: 'text-amber-500' },
    { label: 'Low', count: metrics.risk_summary.low_count, color: 'text-green-600' },
  ]

  const trendData = {
    type: 'line' as const,
    labels: metrics.attendance.trend_labels,
    datasets: [{
      label: 'Attendance Rate',
      data: metrics.attendance.trend,
      color: '#6366f1',
    }],
    threshold_value: 75,
    threshold_label: 'Minimum target',
  }

  return (
    <div className="space-y-6 p-6">
      <DataFreshnessBar
        insightsGeneratedAt={generatedAt}
        isRefreshing={isStale}
      />

      <div className="grid grid-cols-4 gap-4">
        {statsCards.map(card => (
          <div key={card.label}
            className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className={`text-2xl font-semibold mt-1 ${card.color}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-3 space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-base font-semibold mb-4">Revenue Intelligence</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Collected</span>
                <span className="font-medium text-green-600">
                  {rupees.short(metrics.fees.collected)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Target</span>
                <span className="font-medium">{rupees.short(metrics.fees.target)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full"
                  style={{ width: collectionPct + '%' }}
                />
              </div>
              <p className="text-xs text-gray-400 text-right">{collectionPct}% collected</p>
              <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
                <span className="text-gray-500">Forecast 30d</span>
                <span className="font-medium">{rupees.short(metrics.fees.forecast_30d)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Forecast 60d</span>
                <span className="font-medium">{rupees.short(metrics.fees.forecast_60d)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Outstanding</span>
                <span className="font-medium text-red-600">
                  {rupees.short(metrics.fees.total_outstanding)}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold mb-3">AI Insights</h2>
            <RealtimeInsights
              schoolId={user.schoolId}
              role="owner"
              userId={user.userId}
              initialInsights={insights}
              isStale={isStale}
            />
          </div>
        </div>

        <div className="col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-base font-semibold mb-4">Fee Overdue Buckets</h2>
            <div className="space-y-3">
              {buckets.map(b => (
                <div key={b.label}
                  className={`border-l-4 ${b.color} pl-3 py-1`}>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{b.label}</span>
                    <span className="font-medium">{b.count} students</span>
                  </div>
                  <p className="text-xs text-gray-400">{rupees.short(b.amount)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-base font-semibold mb-4">Risk Summary</h2>
            <div className="space-y-2">
              {riskRows.map(r => (
                <div key={r.label}
                  className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">{r.label}</span>
                  <span className={`font-semibold text-lg ${r.color}`}>
                    {r.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-base font-semibold mb-4">Attendance Trend</h2>
        <ChartWrapper data={trendData} height={250} />
      </div>
    </div>
  )
}
