import { requireRole, getParentChildIds } from '@/lib/auth/get-current-user'
import { getCachedInsights, getInsights } from '@/lib/ai/insights'
import { aggregateSchoolData } from '@/lib/ai/aggregate'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import { DataFreshnessBar } from '@/components/shared/data-freshness-bar'
import { AIInsightCard } from '@/components/shared/ai-insight-card'
import { InsightSkeleton } from '@/components/shared/loading-skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { RealtimeInsights } from '@/components/shared/realtime-insights'

export default async function ParentPage() {
  const user = await requireRole(['parent'])
  
  let childIds: string[] = []
  try {
    childIds = await getParentChildIds(user.userId, user.schoolId)
  } catch (err: unknown) {
    const error = err as Error
    if (error.message === 'NO_CHILDREN_LINKED' || error.name === 'AuthError') {
      return <div className="p-6 text-gray-500">No children linked to your account.</div>
    }
    throw error
  }

  if (childIds.length === 0) {
    return <div className="p-6 text-gray-500">No children linked to your account.</div>
  }

  const studentId = childIds[0]
  const supabase = createServerClient()

  const { data: student } = await supabase
    .from('students')
    .select('full_name, admission_no')
    .eq('id', studentId)
    .eq('school_id', user.schoolId)
    .single()

  const { data: attendance } = await supabase
    .from('attendance')
    .select('date, status')
    .eq('student_id', studentId)
    .eq('school_id', user.schoolId)
    .gte('date', '2025-10-01')
    .lte('date', '2025-11-30')
    .order('date', { ascending: false })

  const attRows = safe.array(attendance).map(r => r as Record<string, unknown>)
  const presentCount = attRows.filter(r => 
    safe.string(r.status) === 'present' || safe.string(r.status) === 'late'
  ).length
  const attRate = attRows.length > 0 ? (presentCount / attRows.length) * 100 : 0
  const attColor = attRate > 85 ? 'text-green-600' : attRate > 75 ? 'text-amber-600' : 'text-red-600'

  const { data: homework } = await supabase
    .from('homework_submissions')
    .select('status, created_at')
    .eq('student_id', studentId)
    .eq('school_id', user.schoolId)
    .order('created_at', { ascending: false })
    .limit(10)

  const hwRows = safe.array(homework).map(r => r as Record<string, unknown>)
  const hwCompletedCount = hwRows.filter(r => safe.string(r.status).toLowerCase() === 'completed').length
  const hwRate = hwRows.length > 0 ? (hwCompletedCount / hwRows.length) * 100 : 0
  const hwColor = hwRate > 80 ? 'text-green-600' : hwRate > 60 ? 'text-amber-600' : 'text-red-600'

  const { data: results } = await supabase
    .from('results')
    .select('marks_obtained, max_marks, is_pass, subjects!inner(name)')
    .eq('student_id', studentId)
    .eq('school_id', user.schoolId)
    .order('created_at', { ascending: false })
    .limit(10)

  const resRows = safe.array(results).map(r => r as Record<string, unknown>)
  let examTotal = 0
  resRows.forEach(r => {
    const ob = safe.number(r.marks_obtained)
    const mx = safe.number(r.max_marks)
    if (mx > 0) examTotal += (ob / mx) * 100
  })
  const examAvg = resRows.length > 0 ? examTotal / resRows.length : 0
  const examColor = examAvg > 75 ? 'text-green-600' : examAvg > 50 ? 'text-amber-600' : 'text-red-600'

  const { insights, generatedAt, isStale } = await getCachedInsights({
    role: 'parent',
    schoolId: user.schoolId,
    userId: user.userId,
  })

  const metrics = await aggregateSchoolData({
    role: 'parent',
    schoolId: user.schoolId,
    academicYearId: user.academicYearId ?? '',
    userId: user.userId,
    studentId,
    dateRange: {
      from: new Date('2025-06-01'),
      to: new Date('2025-11-30'),
    }
  })

  if (isStale) {
    getInsights({
      role: 'parent',
      schoolId: user.schoolId,
      userId: user.userId,
      academicYearId: user.academicYearId ?? '',
      metrics,
    }).catch(err => console.error('[PARENT_INSIGHTS]', err))
  }

  const studentName = safe.string(student?.full_name, 'Unknown Student')
  const admissionNo = safe.string(student?.admission_no, '')

  return (
    <div className="space-y-6 p-6">
      <DataFreshnessBar insightsGeneratedAt={generatedAt} isRefreshing={isStale} />

      <div className="bg-white border border-gray-200 rounded-lg p-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{studentName}</h1>
          <p className="text-sm text-gray-500">Admission No: {admissionNo}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Attendance This Month</p>
          <p className={"text-2xl font-semibold mt-1 " + attColor}>
            {attRate.toFixed(1)}%
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Homework Completion</p>
          <p className={"text-2xl font-semibold mt-1 " + hwColor}>
            {hwRate.toFixed(1)}%
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Last Exam Average</p>
          <p className={"text-2xl font-semibold mt-1 " + examColor}>
            {examAvg.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-3 space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-base font-semibold mb-4">Recent Attendance</h2>
            {attRows.length > 0 ? (
              <div className="flex flex-wrap gap-4">
                {attRows.slice(0, 10).map((r, i) => {
                  const st = safe.string(r.status)
                  const isPresent = st === 'present' || st === 'late'
                  const colorClass = isPresent ? 'bg-green-500' : 'bg-red-500'
                  return (
                    <div key={i} className="flex flex-col items-center">
                      <div className={"w-4 h-4 rounded-full " + colorClass} />
                      <span className="text-xs text-gray-400 mt-1">{safe.string(r.date).slice(5, 10)}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No recent attendance records.</p>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-base font-semibold mb-4">Exam Results</h2>
            {resRows.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">Subject</th>
                    <th className="pb-2 font-medium">Marks</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {resRows.map((r, i) => {
                    const subj = r.subjects as Record<string, unknown>
                    const subjName = safe.string(subj?.name, 'Unknown')
                    const ob = safe.number(r.marks_obtained)
                    const mx = safe.number(r.max_marks)
                    const isPass = Boolean(r.is_pass)
                    return (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 font-medium">{subjName}</td>
                        <td className="py-2">{ob} / {mx}</td>
                        <td className="py-2">
                          <span className={"px-2 py-1 text-xs rounded-full " + (isPass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                            {isPass ? 'Pass' : 'Fail'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-500">No exam results available.</p>
            )}
          </div>
        </div>

        <div className="col-span-2 space-y-6">
          <div>
            <h2 className="text-base font-semibold mb-3">AI Weekly Summary</h2>
            <RealtimeInsights
              schoolId={user.schoolId}
              role="parent"
              userId={user.userId}
              initialInsights={insights}
              isStale={isStale}
            />
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-base font-semibold mb-4">Recent Homework</h2>
            {hwRows.length > 0 ? (
              <div className="space-y-3">
                {hwRows.slice(0, 5).map((r, i) => {
                  const st = safe.string(r.status).toLowerCase()
                  const isComp = st === 'completed'
                  const colorClass = isComp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  const label = isComp ? 'Completed' : 'Pending'
                  const dateStr = safe.string(r.created_at).slice(0, 10)
                  return (
                    <div key={i} className="flex justify-between items-center border-b border-gray-50 pb-2">
                      <span className="text-sm text-gray-600">{dateStr}</span>
                      <span className={"px-2 py-1 text-xs rounded-full " + colorClass}>
                        {label}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No recent homework.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
