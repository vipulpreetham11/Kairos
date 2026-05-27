import { requireRole } from '@/lib/auth/get-current-user'
import { getCachedInsights, getInsights } from '@/lib/ai/insights'
import { aggregateSchoolData } from '@/lib/ai/aggregate'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import { rupees } from '@/lib/utils/format'
import { DataFreshnessBar } from '@/components/shared/data-freshness-bar'
import { AIInsightCard } from '@/components/shared/ai-insight-card'
import { InsightSkeleton } from '@/components/shared/loading-skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { RealtimeInsights } from '@/components/shared/realtime-insights'

export default async function AccountantPage() {
  const user = await requireRole(['accountant'])
  const supabase = await createServerClient()

  const { insights, generatedAt, isStale } = await getCachedInsights({
    role: 'accountant',
    schoolId: user.schoolId,
    userId: user.userId,
  })

  const metrics = await aggregateSchoolData({
    role: 'accountant',
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
      role: 'accountant',
      schoolId: user.schoolId,
      userId: user.userId,
      academicYearId: user.academicYearId ?? '',
      metrics,
    }).catch(err => console.error('[ACCOUNTANT_INSIGHTS]', err))
  }

  const { data: invoiceRows } = await supabase
    .from('fee_invoices')
    .select('outstanding, due_date, status, student_id, students!inner(full_name, admission_no)')
    .eq('school_id', user.schoolId)
    .neq('status', 'cancelled')
    .gt('outstanding', 0)
    .order('due_date', { ascending: true })
    .limit(20)

  const today = new Date()
  const prioritized = safe.array(invoiceRows).map((row: unknown) => {
    const r = row as Record<string, unknown>
    const student = r.students as Record<string, unknown>
    const dueDate = new Date(safe.string(r.due_date))
    const daysOverdue = Math.max(0, Math.floor(
      (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
    ))
    const outstanding = safe.number(r.outstanding)
    return {
      student_id: safe.string(r.student_id),
      student_name: safe.string(student?.full_name, 'Unknown'),
      admission_no: safe.string(student?.admission_no, ''),
      outstanding,
      days_overdue: daysOverdue,
      priority_score: daysOverdue * (outstanding / 10000),
    }
  }).sort((a, b) => b.priority_score - a.priority_score).slice(0, 10)

  const collectionPct = metrics.fees.target > 0
    ? Math.round((metrics.fees.collected / metrics.fees.target) * 100)
    : 0

  const buckets = [
    { label: '0-30 days', ...metrics.fees.overdue_buckets['0-30'], color: 'border-amber-400' },
    { label: '31-60 days', ...metrics.fees.overdue_buckets['31-60'], color: 'border-orange-500' },
    { label: '61-90 days', ...metrics.fees.overdue_buckets['61-90'], color: 'border-red-500' },
    { label: '90+ days', ...metrics.fees.overdue_buckets['90+'], color: 'border-red-700' },
  ]

  return (
    <div className="space-y-6 p-6">
      <DataFreshnessBar insightsGeneratedAt={generatedAt} isRefreshing={isStale} />

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Total Outstanding</p>
          <p className="text-2xl font-semibold mt-1 text-red-600">
            {rupees.short(metrics.fees.total_outstanding)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Collection Rate</p>
          <p className={`text-2xl font-semibold mt-1 ${metrics.fees.collection_rate > 80 ? 'text-green-600' : metrics.fees.collection_rate > 60 ? 'text-amber-600' : 'text-red-600'}`}>
            {metrics.fees.collection_rate.toFixed(1)}%
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">High Risk Accounts</p>
          <p className={`text-2xl font-semibold mt-1 ${metrics.fees.high_risk_count > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {metrics.fees.high_risk_count}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">90+ Days Overdue</p>
          <p className="text-2xl font-semibold mt-1 text-red-600">
            {metrics.fees.overdue_buckets['90+'].count}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-3 space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-base font-semibold mb-4">Priority Call List</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Student</th>
                  <th className="pb-2 font-medium">Outstanding</th>
                  <th className="pb-2 font-medium">Days Overdue</th>
                </tr>
              </thead>
              <tbody>
                {prioritized.map((inv, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2">
                      <p className="font-medium">{inv.student_name}</p>
                      <p className="text-xs text-gray-400">{inv.admission_no}</p>
                    </td>
                    <td className="py-2 text-red-600 font-medium">
                      {rupees.format(inv.outstanding)}
                    </td>
                    <td className="py-2">
                      <span className={`font-medium ${inv.days_overdue > 90 ? 'text-red-600' : inv.days_overdue > 60 ? 'text-orange-500' : 'text-amber-500'}`}>
                        {inv.days_overdue}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="text-base font-semibold mb-3">AI Insights</h2>
            <RealtimeInsights
              schoolId={user.schoolId}
              role="accountant"
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
                <div key={b.label} className={`border-l-4 ${b.color} pl-3 py-1`}>
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
            <h2 className="text-base font-semibold mb-4">Collection Progress</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Collected</span>
                <span className="text-green-600 font-medium">{rupees.short(metrics.fees.collected)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Target</span>
                <span className="font-medium">{rupees.short(metrics.fees.target)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: collectionPct + '%' }} />
              </div>
              <p className="text-xs text-gray-400 text-right">{collectionPct}% collected</p>
              <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
                <span className="text-gray-500">Outstanding</span>
                <span className="text-red-600 font-medium">{rupees.short(metrics.fees.total_outstanding)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
