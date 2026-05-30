import Link from 'next/link'
import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'

// Define expected shapes for typed casting
type ExamRaw = {
  id: string
  name: string
  exam_type: string
  start_date: string
  end_date: string
  is_published: boolean
  status: string
  class_id: string
}

export default async function PrincipalExamsPage() {
  const user = await requireRole(
    ['principal', 'admin', 'super_admin'] as unknown as Array<
      'owner' | 'principal' | 'teacher' | 'accountant' | 'parent'
    >
  )
  const supabase = await createServerClient()

  // 1. Fetch data in parallel
  const examsPromise = supabase
    .from('exams')
    .select(`id, name, exam_type, start_date, end_date, is_published, status, class_id`)
    .eq('school_id', user.schoolId)
    .eq('academic_year_id', user.academicYearId || '')
    .order('start_date', { ascending: false })

  // Combines Query 2 & 3: Results with Subject Join
  const resultsPromise = supabase
    .from('results')
    .select(`
      exam_id,
      is_pass,
      is_absent,
      marks_obtained,
      max_marks,
      subject_id,
      subjects!inner(name)
    `)
    .eq('school_id', user.schoolId)

  const rankingsPromise = supabase
    .from('rankings')
    .select(`
      exam_id,
      rank,
      percentage,
      total_marks,
      student_id,
      students!inner(full_name, admission_no)
    `)
    .eq('school_id', user.schoolId)
    .lte('rank', 5)
    .order('exam_id')
    .order('rank', { ascending: true })

  const [{ data: examsDataRaw }, { data: resultsDataRaw }, { data: rankingsDataRaw }] =
    await Promise.all([examsPromise, resultsPromise, rankingsPromise])

  const examsData = safe.array(examsDataRaw)
  const resultsData = safe.array(resultsDataRaw)
  const rankingsData = safe.array(rankingsDataRaw)

  // 2. Data Computation

  // Exam stats
  const examStatsMap = new Map<
    string,
    { total: number; passed: number; failed: number; absent: number; totalPerc: number; countPerc: number }
  >()

  // Subject stats
  const subjectStatsMap = new Map<
    string,
    { name: string; total: number; fail_count: number; totalPerc: number; countPerc: number }
  >()

  resultsData.forEach((r: any) => {
    // Process Exam Stats
    const eId = safe.string(r.exam_id)
    if (eId) {
      if (!examStatsMap.has(eId)) {
        examStatsMap.set(eId, {
          total: 0,
          passed: 0,
          failed: 0,
          absent: 0,
          totalPerc: 0,
          countPerc: 0,
        })
      }
      const eSt = examStatsMap.get(eId)!
      eSt.total++
      if (r.is_pass) eSt.passed++
      if (!r.is_pass && !r.is_absent) eSt.failed++
      if (r.is_absent) eSt.absent++

      const obtained = safe.number(r.marks_obtained)
      const max = safe.number(r.max_marks)
      if (max > 0) {
        eSt.totalPerc += (obtained / max) * 100
        eSt.countPerc++
      }
    }

    // Process Subject Stats
    const sId = safe.string(r.subject_id)
    if (sId) {
      if (!subjectStatsMap.has(sId)) {
        const sName = safe.string(r.subjects?.name) || 'Unknown Subject'
        subjectStatsMap.set(sId, {
          name: sName,
          total: 0,
          fail_count: 0,
          totalPerc: 0,
          countPerc: 0,
        })
      }
      const sSt = subjectStatsMap.get(sId)!
      sSt.total++
      if (!r.is_pass && !r.is_absent) sSt.fail_count++

      const obtained = safe.number(r.marks_obtained)
      const max = safe.number(r.max_marks)
      if (max > 0) {
        sSt.totalPerc += (obtained / max) * 100
        sSt.countPerc++
      }
    }
  })

  // Format subject performance array
  const subjectsStats = Array.from(subjectStatsMap.values())
    .map((s) => ({
      name: s.name,
      total: s.total,
      fail_count: s.fail_count,
      avg: s.countPerc > 0 ? s.totalPerc / s.countPerc : 0,
      pass_rate: s.total > 0 ? ((s.total - s.fail_count) / s.total) * 100 : 0,
    }))
    .sort((a, b) => a.avg - b.avg) // worst first

  // Top Performers Map
  const topPerformersMap = new Map<string, any[]>()
  rankingsData.forEach((r: any) => {
    const eId = safe.string(r.exam_id)
    if (!eId) return
    if (!topPerformersMap.has(eId)) topPerformersMap.set(eId, [])
    
    topPerformersMap.get(eId)!.push({
      rank: safe.number(r.rank),
      percentage: safe.number(r.percentage),
      total_marks: safe.number(r.total_marks),
      student_id: safe.string(r.student_id),
      full_name: safe.string(r.students?.full_name),
      admission_no: safe.string(r.students?.admission_no),
    })
  })

  // Ensure top performers are strictly sorted by rank (just in case)
  for (const list of topPerformersMap.values()) {
    list.sort((a, b) => a.rank - b.rank)
  }

  // Global KPIs
  const totalExams = examsData.length
  const publishedExams = examsData.filter((e: any) => e.is_published).length
  const totalResultsEntered = resultsData.length

  let sumPassRate = 0
  let examsWithPassRate = 0
  for (const st of examStatsMap.values()) {
    if (st.total > 0) {
      sumPassRate += (st.passed / st.total) * 100
      examsWithPassRate++
    }
  }
  const overallPassRate = examsWithPassRate > 0 ? sumPassRate / examsWithPassRate : 0

  let mostFailedSubject = { name: 'None', fail_count: 0 }
  subjectsStats.forEach((s) => {
    if (s.fail_count > mostFailedSubject.fail_count) {
      mostFailedSubject = { name: s.name, fail_count: s.fail_count }
    }
  })

  return (
    <div className="space-y-6 p-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Exams & Results</h1>
        <p className="text-sm text-slate-500">{totalExams} exams this academic year</p>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1 */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Exams</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalExams}</p>
          <p className="mt-1 text-xs text-slate-400">{publishedExams} published</p>
        </div>

        {/* Card 2 */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Overall Pass Rate</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              overallPassRate > 80
                ? 'text-emerald-600'
                : overallPassRate > 60
                ? 'text-amber-600'
                : 'text-red-600'
            }`}
          >
            {overallPassRate.toFixed(1)}%
          </p>
        </div>

        {/* Card 3 */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Most Challenged Subject</p>
          <p className="mt-1 truncate text-2xl font-semibold text-red-600">
            {mostFailedSubject.name}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {mostFailedSubject.fail_count} failures
          </p>
        </div>

        {/* Card 4 */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Results Entered</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {totalResultsEntered}
          </p>
          <p className="mt-1 text-xs text-slate-400">across all exams</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* EXAMS LIST */}
        <div className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">All Exams</h2>
          {examsData.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No exams found for this academic year.
            </div>
          ) : (
            <div className="space-y-3">
              {examsData.map((rawExam: any) => {
                const exam = rawExam as ExamRaw
                const stats = examStatsMap.get(exam.id)
                const performers = topPerformersMap.get(exam.id) || []
                const top3 = performers.slice(0, 3)

                return (
                  <div
                    key={exam.id}
                    className="rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">
                          {exam.name || 'Unnamed Exam'}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {exam.exam_type || 'General'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {exam.start_date || '?'} &rarr; {exam.end_date || '?'}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          exam.is_published
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {exam.is_published ? 'Published' : 'Draft'}
                      </span>
                    </div>

                    <div className="mt-3 border-t border-slate-100 pt-3">
                      {stats ? (
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Avg</span>
                            <span className={`text-xs font-semibold ${
                              stats.countPerc > 0 && (stats.totalPerc / stats.countPerc) > 80 ? 'text-emerald-600' :
                              stats.countPerc > 0 && (stats.totalPerc / stats.countPerc) > 60 ? 'text-amber-600' :
                              'text-red-600'
                            }`}>
                              {stats.countPerc > 0 ? (stats.totalPerc / stats.countPerc).toFixed(1) : '0.0'}%
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Passed</span>
                            <span className="text-xs font-semibold text-emerald-600">{stats.passed}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Failed</span>
                            <span className="text-xs font-semibold text-red-600">{stats.failed}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Absent</span>
                            <span className="text-xs font-semibold text-slate-500">{stats.absent}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">No results entered yet</p>
                      )}
                    </div>

                    {top3.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-slate-500 mb-2">Top 3</p>
                        <div className="flex flex-wrap gap-2">
                          {top3.map((p) => (
                            <Link
                              key={p.student_id}
                              href={`/principal/students/${p.student_id}`}
                              className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100 transition-colors"
                            >
                              #{p.rank} {p.full_name} &mdash; {p.percentage.toFixed(1)}%
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* SUBJECT PERFORMANCE TABLE */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">
              Subject Performance
            </h2>
            <p className="mb-4 text-xs text-slate-500">Averaged across all exams</p>

            {subjectsStats.length === 0 ? (
              <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                No subject performance data available yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">
                        Subject
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-600">
                        Avg Score
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-600">
                        Pass Rate
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-600">
                        Failures
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-600">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subjectsStats.map((subj, idx) => {
                      const isWorst = idx === 0
                      let statusText = 'Needs Attention'
                      let statusColor = 'bg-red-100 text-red-700'
                      
                      if (subj.avg > 70) {
                        statusText = 'Good'
                        statusColor = 'bg-emerald-100 text-emerald-700'
                      } else if (subj.avg > 50) {
                        statusText = 'Average'
                        statusColor = 'bg-amber-100 text-amber-700'
                      }

                      return (
                        <tr
                          key={subj.name}
                          className={`hover:bg-slate-50 transition-colors ${
                            isWorst ? 'border-l-2 border-l-red-500' : ''
                          }`}
                        >
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {subj.name}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-semibold ${
                              subj.avg > 70
                                ? 'text-emerald-600'
                                : subj.avg > 50
                                ? 'text-amber-600'
                                : 'text-red-600'
                            }`}
                          >
                            {subj.avg.toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {subj.pass_rate.toFixed(1)}%
                          </td>
                          <td
                            className={`px-4 py-3 text-right ${
                              subj.fail_count > 10 ? 'text-red-600 font-semibold' : 'text-slate-600'
                            }`}
                          >
                            {subj.fail_count}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusColor}`}
                            >
                              {statusText}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
