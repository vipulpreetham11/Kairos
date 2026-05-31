import Link from 'next/link'
import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import { GraduationCap, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'

type SubjectResult = {
  name: string
  marks: number
  max: number
  grade: string
  isPass: boolean
  isAbsent: boolean
}

type ExamSummary = {
  id: string
  examName: string
  examType: string
  startDate: string
  subjects: SubjectResult[]
  totalMarks: number
  maxTotal: number
  percentage: number
  passedAll: boolean
  failedSubjects: SubjectResult[]
  rank?: number
}

export default async function ParentResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>
}) {
  const user = await requireRole(
    ['parent'] as unknown as Array<
      'owner' | 'principal' | 'teacher' | 'accountant' | 'parent'
    >
  )
  const supabase = await createServerClient()

  // 1. Get parent record
  const { data: parentData } = await supabase
    .from('parents')
    .select('id, full_name')
    .eq('user_id', user.userId)
    .eq('school_id', user.schoolId)
    .single()

  if (!parentData) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center p-6 text-center">
        <div className="rounded-full bg-slate-100 p-4 mb-4">
          <GraduationCap className="h-8 w-8 text-slate-400" />
        </div>
        <h2 className="text-lg font-medium text-slate-900">Parent Profile Not Found</h2>
        <p className="mt-1 text-sm text-slate-500 max-w-sm">
          We could not find your parent profile linked to this account. Please contact the school.
        </p>
      </div>
    )
  }

  // 2. Get linked children
  const { data: links } = await supabase
    .from('student_parents')
    .select(`
      student_id,
      is_primary,
      students!inner (
        id, full_name, admission_no,
        enrollments!inner (
          class_id,
          section_id,
          classes!inner (name),
          sections!inner (name)
        )
      )
    `)
    .eq('parent_id', parentData.id)
    .eq('school_id', user.schoolId)

  const children = safe.array(links).map((link: any) => {
    const s = link.students
    const e = safe.array(s.enrollments)[0] as any
    return {
      id: safe.string(s.id),
      name: safe.string(s.full_name),
      admission_no: safe.string(s.admission_no),
      class_name: e && e.classes ? safe.string(e.classes.name) : '',
      section_name: e && e.sections ? safe.string(e.sections.name) : '',
    }
  })

  if (children.length === 0) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center p-6 text-center">
        <div className="rounded-full bg-slate-100 p-4 mb-4">
          <GraduationCap className="h-8 w-8 text-slate-400" />
        </div>
        <h2 className="text-lg font-medium text-slate-900">No Children Linked</h2>
        <p className="mt-1 text-sm text-slate-500 max-w-sm">
          Your profile doesn't have any students linked to it. Please contact the school administrator.
        </p>
      </div>
    )
  }

  const params = await searchParams
  const selectedId = params.student ?? children[0].id
  const activeChild = children.find((c) => c.id === selectedId) || children[0]

  // 3. Fetch results and rankings
  const [{ data: resultsData }, { data: rankingsData }] = await Promise.all([
    supabase
      .from('results')
      .select(`
        marks_obtained,
        max_marks,
        grade,
        is_pass,
        is_absent,
        subjects!inner (name),
        exams!inner (id, name, exam_type, start_date)
      `)
      .eq('student_id', activeChild.id)
      .eq('school_id', user.schoolId)
      .eq('exams.is_published', true),
    supabase
      .from('rankings')
      .select('rank, percentage, total_marks, section_rank, class_rank, exam_id')
      .eq('student_id', activeChild.id)
      .eq('school_id', user.schoolId)
  ])

  // 4. Computation
  const examMap = new Map<string, ExamSummary>()
  safe.array(resultsData).forEach((row: any) => {
    const exam = row.exams
    const subject = row.subjects
    if (!exam || !subject) return
    const examId = safe.string(exam.id)
    
    if (!examMap.has(examId)) {
      examMap.set(examId, {
        id: examId,
        examName: safe.string(exam.name),
        examType: safe.string(exam.exam_type),
        startDate: safe.string(exam.start_date),
        subjects: [],
        totalMarks: 0,
        maxTotal: 0,
        percentage: 0,
        passedAll: true,
        failedSubjects: []
      })
    }
    const sum = examMap.get(examId)!
    
    const subRes: SubjectResult = {
      name: safe.string(subject.name),
      marks: safe.number(row.marks_obtained),
      max: safe.number(row.max_marks),
      grade: safe.string(row.grade),
      isPass: safe.boolean(row.is_pass),
      isAbsent: safe.boolean(row.is_absent)
    }
    
    sum.subjects.push(subRes)
    if (!subRes.isAbsent) {
      sum.totalMarks += subRes.marks
      sum.maxTotal += subRes.max
    }
    if (!subRes.isPass && !subRes.isAbsent) {
      sum.passedAll = false
      sum.failedSubjects.push(subRes)
    }
  })

  const rankings = safe.array<Record<string, any>>(rankingsData)
  
  const examResults = Array.from(examMap.values()).map(e => {
    e.percentage = e.maxTotal > 0 ? (e.totalMarks / e.maxTotal) * 100 : 0
    const rankRow = rankings.find((r: any) => safe.string(r.exam_id) === e.id)
    if (rankRow) e.rank = safe.number(rankRow.class_rank || rankRow.rank)
    return e
  }).sort((a, b) => b.startDate.localeCompare(a.startDate)) // Most recent first

  // Subject Averages
  const subjectMap = new Map<string, { totalPct: number, minPct: number, maxPct: number, count: number }>()
  examResults.forEach(e => {
    e.subjects.forEach(s => {
      if (s.isAbsent || s.max === 0) return
      const pct = (s.marks / s.max) * 100
      if (!subjectMap.has(s.name)) {
        subjectMap.set(s.name, { totalPct: 0, minPct: pct, maxPct: pct, count: 0 })
      }
      const m = subjectMap.get(s.name)!
      m.totalPct += pct
      m.count++
      if (pct < m.minPct) m.minPct = pct
      if (pct > m.maxPct) m.maxPct = pct
    })
  })

  const subjectAverages = Array.from(subjectMap.entries()).map(([name, data]) => ({
    name,
    avg: data.count > 0 ? data.totalPct / data.count : 0,
    best: data.maxPct,
    worst: data.minPct
  })).sort((a, b) => b.avg - a.avg)

  const latestExam = examResults.length > 0 ? examResults[0] : null
  const overallAvg = examResults.length > 0 
    ? examResults.reduce((acc, e) => acc + e.percentage, 0) / examResults.length 
    : 0

  const allRanks = examResults.map(e => e.rank).filter(r => r !== undefined && r > 0) as number[]
  const bestRank = allRanks.length > 0 ? Math.min(...allRanks) : null

  let trend = 0
  if (examResults.length >= 2) {
    trend = examResults[0].percentage - examResults[1].percentage
  }

  const needsAttention = subjectAverages.length > 0 ? subjectAverages[subjectAverages.length - 1] : null

  const getGradeColor = (g: string) => {
    const grade = g.toUpperCase()
    if (grade.startsWith('A')) return 'bg-emerald-100 text-emerald-700'
    if (grade.startsWith('B')) return 'bg-blue-100 text-blue-700'
    if (grade.startsWith('C')) return 'bg-amber-100 text-amber-700'
    if (grade.startsWith('F')) return 'bg-red-100 text-red-700'
    return 'bg-slate-100 text-slate-700'
  }

  const getPerfColorText = (pct: number) => {
    if (pct >= 75) return 'text-emerald-600'
    if (pct >= 50) return 'text-amber-600'
    return 'text-red-600'
  }

  const getPerfColorBg = (pct: number) => {
    if (pct >= 75) return 'bg-emerald-500'
    if (pct >= 50) return 'bg-amber-500'
    return 'bg-red-500'
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 pb-20">
      {/* HEADER & SELECTOR */}
      <div className="space-y-4">
        <Link
          href="/parent"
          className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700"
        >
          ← My Child
        </Link>
        
        {children.length > 1 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {children.map((child) => {
              const isSelected = child.id === activeChild.id
              return (
                <Link
                  key={child.id}
                  href={`/parent/results?student=${child.id}`}
                  className={`flex-none rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {child.name}
                </Link>
              )
            })}
          </div>
        )}

        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
            {activeChild.name}&apos;s Results
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {activeChild.class_name} {activeChild.section_name && `· Sec ${activeChild.section_name}`} · {activeChild.admission_no}
          </p>
        </div>
      </div>

      {examResults.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 mb-4">
            <GraduationCap className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="text-sm font-medium text-slate-900">No exam results available yet</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
            Results will appear here once your school publishes them.
          </p>
        </div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1 rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Latest Exam</p>
              <p className={`mt-1 text-2xl font-semibold ${getPerfColorText(latestExam!.percentage)}`}>
                {latestExam!.percentage.toFixed(1)}%
              </p>
              <p className="mt-1 text-xs text-slate-400 truncate" title={latestExam!.examName}>
                {latestExam!.examName}
              </p>
            </div>
            
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Overall Average</p>
              <p className={`mt-1 text-2xl font-semibold ${getPerfColorText(overallAvg)}`}>
                {overallAvg.toFixed(1)}%
              </p>
              <p className="mt-1 text-xs text-slate-400">Across all exams</p>
            </div>

            {bestRank ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Best Rank</p>
                <p className="mt-1 text-2xl font-semibold text-amber-600">
                  #{bestRank}
                </p>
                <p className="mt-1 text-xs text-slate-400">in class</p>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-4 hidden sm:block opacity-0"></div>
            )}
          </div>

          {/* TREND INDICATOR */}
          {examResults.length >= 2 && (
            <div>
              {trend > 5 ? (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 sm:p-4">
                  <div className="rounded-full bg-emerald-100 p-1">
                    <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                  </div>
                  <p className="text-sm text-emerald-700">
                    <span className="font-semibold">Improving</span> — up {trend.toFixed(1)}% from last exam.
                  </p>
                </div>
              ) : trend < -5 ? (
                <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 sm:p-4">
                  <div className="rounded-full bg-red-100 p-1">
                    <ArrowDownRight className="h-4 w-4 text-red-600" />
                  </div>
                  <p className="text-sm text-red-700">
                    <span className="font-semibold">Declining</span> — down {Math.abs(trend).toFixed(1)}% from last exam. Needs attention.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
                  <div className="rounded-full bg-slate-200 p-1">
                    <Minus className="h-4 w-4 text-slate-600" />
                  </div>
                  <p className="text-sm text-slate-600">
                    <span className="font-semibold">Stable performance</span> compared to last exam.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SUBJECT AVERAGES */}
          {subjectAverages.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-slate-900">Subject-wise Performance</h2>
                <p className="text-xs text-slate-500 mt-0.5">Averaged across all exams</p>
              </div>
              
              <div className="space-y-4">
                {subjectAverages.map(sub => (
                  <div key={sub.name}>
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-sm font-medium text-slate-700">{sub.name}</span>
                      <span className={`text-sm font-semibold ${getPerfColorText(sub.avg)}`}>{sub.avg.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${getPerfColorBg(sub.avg)} transition-all`} 
                        style={{ width: `${Math.min(sub.avg, 100)}%` }} 
                      />
                    </div>
                  </div>
                ))}
              </div>

              {needsAttention && needsAttention.avg < 60 && (
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-start gap-2">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Needs most attention:</span>
                  <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded">{needsAttention.name} ({needsAttention.avg.toFixed(1)}%)</span>
                </div>
              )}
            </div>
          )}

          {/* EXAM CARDS */}
          <div className="space-y-4">
            {examResults.map((exam) => (
              <div key={exam.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 sm:px-5 sm:py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{exam.examName}</h3>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                        {exam.examType.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    {exam.rank && (
                      <div className="text-xs font-medium text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded">
                        Rank: <span className="text-slate-900 font-bold">#{exam.rank}</span>
                      </div>
                    )}
                    <div className={`text-lg font-bold ${getPerfColorText(exam.percentage)}`}>
                      {exam.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white border-b border-slate-100">
                      <tr>
                        <th className="px-4 sm:px-5 py-3 text-left font-medium text-slate-500 text-xs uppercase tracking-wider">Subject</th>
                        <th className="px-4 sm:px-5 py-3 text-right font-medium text-slate-500 text-xs uppercase tracking-wider">Marks</th>
                        <th className="px-4 sm:px-5 py-3 text-center font-medium text-slate-500 text-xs uppercase tracking-wider">Grade</th>
                        <th className="px-4 sm:px-5 py-3 text-center font-medium text-slate-500 text-xs uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {exam.subjects.map((sub, idx) => (
                        <tr key={idx} className={!sub.isPass && !sub.isAbsent ? 'bg-red-50/30' : ''}>
                          <td className="px-4 sm:px-5 py-3 text-slate-900 font-medium whitespace-nowrap">
                            {sub.name}
                          </td>
                          <td className="px-4 sm:px-5 py-3 text-right whitespace-nowrap">
                            {sub.isAbsent ? (
                              <span className="text-slate-400 italic">N/A</span>
                            ) : (
                              <>
                                <span className="font-semibold text-slate-900">{sub.marks}</span>
                                <span className="text-slate-400 text-xs ml-1">/ {sub.max}</span>
                              </>
                            )}
                          </td>
                          <td className="px-4 sm:px-5 py-3 text-center">
                            {sub.isAbsent ? (
                              <span className="text-slate-400 text-xs">—</span>
                            ) : (
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(sub.grade)}`}>
                                {sub.grade || '-'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 sm:px-5 py-3 text-center">
                            {sub.isAbsent ? (
                              <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">Absent</span>
                            ) : sub.isPass ? (
                              <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">Pass</span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Fail</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="bg-slate-50 px-4 sm:px-5 py-3 border-t border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-slate-600">
                      Total Marks: <span className="font-semibold text-slate-900">{exam.totalMarks}</span> / {exam.maxTotal}
                    </p>
                    <p className="text-sm">
                      <span className="text-emerald-600 font-medium">{exam.subjects.filter(s => s.isPass && !s.isAbsent).length} passed</span>
                      <span className="text-slate-300 mx-2">|</span>
                      {exam.failedSubjects.length > 0 ? (
                        <span className="text-red-600 font-bold">{exam.failedSubjects.length} failed</span>
                      ) : (
                        <span className="text-slate-500">0 failed</span>
                      )}
                    </p>
                  </div>
                  {exam.failedSubjects.length > 0 && (
                    <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded inline-block">
                      Failed in: {exam.failedSubjects.map(s => s.name).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
