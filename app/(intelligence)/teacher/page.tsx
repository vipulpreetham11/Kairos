import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import { getCachedInsights, getInsights } from '@/lib/ai/insights'
import { aggregateSchoolData } from '@/lib/ai/aggregate'
import { DataFreshnessBar } from '@/components/shared/data-freshness-bar'
import { AIInsightCard } from '@/components/shared/ai-insight-card'
import { InsightSkeleton } from '@/components/shared/loading-skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { ChartWrapper } from '@/components/shared/chart-wrapper'
import { TeacherDiaryCopilot } from './components/diary-copilot'
import { RealtimeInsights } from '@/components/shared/realtime-insights'

export default async function TeacherPage() {
  const user = await requireRole(['teacher'])
  const supabase = createServerClient()

  const { data: assignments } = await supabase
    .from('teacher_assignments')
    .select('section_id')
    .eq('school_id', user.schoolId)
    .eq('teacher_id', user.userId)
    .eq('academic_year_id', user.academicYearId ?? '')

  const sectionIds = assignments?.map((a: { section_id: string }) => a.section_id) ?? []

  const { insights, generatedAt, isStale } = await getCachedInsights({
    role: 'teacher',
    schoolId: user.schoolId,
    userId: user.userId,
  })

  const metrics = await aggregateSchoolData({
    role: 'teacher',
    schoolId: user.schoolId,
    academicYearId: user.academicYearId ?? '',
    userId: user.userId,
    sectionIds,
    dateRange: {
      from: new Date('2025-06-01'),
      to: new Date('2025-11-30'),
    }
  })

  if (isStale) {
    getInsights({
      role: 'teacher',
      schoolId: user.schoolId,
      userId: user.userId,
      academicYearId: user.academicYearId ?? '',
      metrics,
    }).catch(err => console.error('[TEACHER_INSIGHTS]', err))
  }

  const attRate = metrics.attendance.overall_rate
  const attColor = attRate > 85 ? 'text-green-600' : attRate > 75 ? 'text-amber-600' : 'text-red-600'

  const hwRate = metrics.engagement.homework_completion_rate
  const hwColor = hwRate > 80 ? 'text-green-600' : hwRate > 60 ? 'text-amber-600' : 'text-red-600'

  const diaryRate = metrics.engagement.diary_fill_rate
  const diaryColor = diaryRate > 90 ? 'text-green-600' : diaryRate > 70 ? 'text-amber-600' : 'text-red-600'

  const statsCards = [
    { label: 'Class Attendance', value: attRate.toFixed(1) + '%', color: attColor },
    { label: 'Homework Completion', value: hwRate.toFixed(1) + '%', color: hwColor },
    { label: 'Diary Fill Rate', value: diaryRate.toFixed(1) + '%', color: diaryColor },
  ]

  const topAtRisk = metrics.risk_summary.top_at_risk.slice(0, 5)

  const trendData = {
    type: 'line' as const,
    labels: metrics.engagement.homework_trend.map((_, i) => 'Day ' + (i + 1)),
    datasets: [{
      label: 'Completion Rate',
      data: metrics.engagement.homework_trend,
      color: '#2563EB',
    }]
  }

  return (
    <div className="space-y-6 p-6">
      <DataFreshnessBar
        insightsGeneratedAt={generatedAt}
        isRefreshing={isStale}
      />

      <div className="grid grid-cols-3 gap-4">
        {statsCards.map(card => (
          <div key={card.label} className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className={"text-2xl font-semibold mt-1 " + card.color}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-3 space-y-6">
          <div>
            <h2 className="text-base font-semibold mb-3">AI Insights</h2>
            <RealtimeInsights
              schoolId={user.schoolId}
              role="teacher"
              userId={user.userId}
              initialInsights={insights}
              isStale={isStale}
            />
          </div>
        </div>

        <div className="col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-base font-semibold mb-4">Students Needing Attention</h2>
            {topAtRisk.length > 0 ? (
              <div className="space-y-3">
                {topAtRisk.map(student => {
                  const attRate = student.risk_factors.find(f => f.factor === 'attendance')?.score ?? 0;
                  return (
                  <div key={student.student_id} className="border border-gray-100 rounded-lg p-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium text-sm text-gray-900">{student.student_name}</p>
                      <p className="text-xs text-gray-500">Risk Score: {student.composite_risk_score}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Attendance</p>
                      <p className={"font-medium text-sm " + (attRate > 75 ? 'text-green-600' : 'text-red-600')}>
                        {Math.round(attRate)}%
                      </p>
                    </div>
                  </div>
                )})}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No students currently flagged for immediate attention.</p>
            )}
          </div>

          <div>
            <h2 className="text-base font-semibold mb-3">Diary Copilot</h2>
            <TeacherDiaryCopilot 
              schoolId={user.schoolId} 
              userId={user.userId} 
              sectionIds={sectionIds} 
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-base font-semibold mb-4">Homework Completion Trend (Last 7 Days)</h2>
        <ChartWrapper data={trendData} height={250} />
      </div>
    </div>
  )
}
