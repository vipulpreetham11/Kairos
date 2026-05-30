import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import { rupees } from '@/lib/utils/format'
import { ArrowLeft, ArrowUp, ArrowDown, Minus } from 'lucide-react'

type StudentDetailRow = {
  id: string
  full_name: string
  admission_no: string
  enrollments: {
    classes: { name: string }
    sections: { name: string }
  }[]
}

type RiskScoreRow = {
  composite_risk_score: number
  risk_level: string
  trend: string
  risk_factors: { factor: string; score: number; detail: string }[]
}

type AttendanceRow = {
  date: string
  status: string
}

type ResultRow = {
  marks_obtained: number
  max_marks: number
  grade: string
  is_pass: boolean
  subjects: { name: string }
  exams: { name: string; start_date: string }
}

type FeeRow = {
  outstanding: number
  due_date: string
  status: string
  net_amount: number
  fee_heads: { name: string }
  fee_terms: { name: string }
}

type HomeworkRow = {
  status: string
  created_at: string
  class_diary: {
    subject_id: string
    subjects: { name: string }
  }
}

export default async function StudentProfilePage({
  params,
}: {
  params: { studentId: string }
}) {
  const user = await requireRole(['principal', 'admin', 'super_admin'] as unknown as Array<'owner' | 'principal' | 'teacher' | 'accountant' | 'parent'>)
  const supabase = await createServerClient()
  const studentId = params.studentId

  // 1. Verify student belongs to same school + fetch basic details
  const { data: studentData } = await supabase
    .from('students')
    .select(`
      *,
      enrollments!inner (
        roll_number,
        status,
        academic_year_id,
        classes!inner (name),
        sections!inner (name)
      )
    `)
    .eq('id', studentId)
    .eq('school_id', user.schoolId)
    .eq('is_deleted', false)
    .eq('enrollments.academic_year_id', user.academicYearId)
    .single()

  if (!studentData) {
    notFound()
  }

  // 2. Risk score
  const riskPromise = supabase
    .from('student_risk_scores')
    .select('*')
    .eq('student_id', studentId)
    .eq('school_id', user.schoolId)
    .single()

  // 3. Attendance last 60 days
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  const attendancePromise = supabase
    .from('attendance')
    .select('date, status')
    .eq('student_id', studentId)
    .eq('school_id', user.schoolId)
    .gte('date', sixtyDaysAgo)
    .order('date', { ascending: false })

  // 4. Exam results
  const resultsPromise = supabase
    .from('results')
    .select(`
      marks_obtained, 
      max_marks,
      grade, 
      is_pass,
      subjects!inner(name),
      exams!inner(name, start_date)
    `)
    .eq('student_id', studentId)
    .eq('school_id', user.schoolId)
    .limit(30)

  // 5. Fee invoices
  const feesPromise = supabase
    .from('fee_invoices')
    .select(`
      outstanding, 
      due_date,
      status,
      net_amount,
      fee_heads!inner(name),
      fee_terms!inner(name)
    `)
    .eq('student_id', studentId)
    .eq('school_id', user.schoolId)
    .order('due_date', { ascending: false })

  // 6. Homework submissions
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const homeworkPromise = supabase
    .from('homework_submissions')
    .select(`
      status,
      created_at,
      class_diary!inner(
        subject_id,
        subjects!inner(name)
      )
    `)
    .eq('student_id', studentId)
    .eq('school_id', user.schoolId)
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(20)

  const [
    { data: riskData },
    { data: attendanceData },
    { data: resultsData },
    { data: feesData },
    { data: homeworkData }
  ] = await Promise.all([
    riskPromise,
    attendancePromise,
    resultsPromise,
    feesPromise,
    homeworkPromise
  ])

  const risk = riskData as RiskScoreRow | null
  const attendance = safe.array<AttendanceRow>(attendanceData)
  
  // Sort results in memory to avoid nested ordering issues
  const results = safe.array<ResultRow>(resultsData)
  results.sort((a, b) => {
    const dateA = new Date(a.exams?.start_date || 0).getTime()
    const dateB = new Date(b.exams?.start_date || 0).getTime()
    return dateB - dateA
  })

  const fees = safe.array<FeeRow>(feesData)
  const homework = safe.array<HomeworkRow>(homeworkData)

  const rawStudent = studentData as unknown as StudentDetailRow
  const enrollment = rawStudent.enrollments?.[0]
  const cls = enrollment?.classes
  const sec = enrollment?.sections
  const studentInitials = safe.string(rawStudent.full_name).substring(0, 2).toUpperCase()

  // KPI calculations
  const totalDays = attendance.length
  const presentDays = attendance.filter(a => a.status === 'present').length
  const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0

  const totalOutstandingPaise = fees.reduce((sum, f) => sum + safe.number(f.outstanding), 0)
  const totalOutstandingText = rupees.format(totalOutstandingPaise)

  const validResults = results.filter(r => safe.number(r.max_marks) > 0)
  let examAvg = 0
  if (validResults.length > 0) {
    const totalScore = validResults.reduce((sum, r) => sum + (safe.number(r.marks_obtained) / safe.number(r.max_marks)), 0)
    examAvg = Math.round((totalScore / validResults.length) * 100)
  }

  const totalHw = homework.length
  const completedHw = homework.filter(h => h.status === 'completed').length
  const hwCompletionRate = totalHw > 0 ? Math.round((completedHw / totalHw) * 100) : 0

  function getRiskBadgeClasses(level: string) {
    switch (level) {
      case 'critical': return 'bg-red-100 text-red-700'
      case 'high': return 'bg-orange-100 text-orange-700'
      case 'medium': return 'bg-amber-100 text-amber-700'
      case 'low': return 'bg-emerald-100 text-emerald-700'
      default: return 'bg-slate-100 text-slate-500'
    }
  }

  function getRiskLabel(level: string) {
    switch (level) {
      case 'critical': return 'Critical'
      case 'high': return 'High'
      case 'medium': return 'Medium'
      case 'low': return 'Low'
      default: return 'Not scored'
    }
  }

  // Render
  return (
    <div className="space-y-6 p-6">
      <Link href="/principal/students" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> All Students
      </Link>

      {/* STUDENT HEADER */}
      <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">
            {studentInitials}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{safe.string(rawStudent.full_name)}</h1>
            <p className="text-sm text-slate-500">
              Admission: {safe.string(rawStudent.admission_no)} · {safe.string(cls?.name)} - {safe.string(sec?.name)}
            </p>
          </div>
        </div>
        
        {risk && (
          <div className="flex items-center gap-4 rounded-lg bg-slate-50 p-3">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase">Risk Level</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold ${getRiskBadgeClasses(risk.risk_level)}`}>
                  {getRiskLabel(risk.risk_level)}
                </span>
                <span className="text-lg font-bold text-slate-700">{risk.composite_risk_score}</span>
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
              {risk.trend === 'declining' || risk.trend === 'critical' ? (
                <ArrowUp className="h-5 w-5 text-red-500" />
              ) : risk.trend === 'improving' ? (
                <ArrowDown className="h-5 w-5 text-emerald-500" />
              ) : (
                <Minus className="h-5 w-5 text-slate-400" />
              )}
            </div>
          </div>
        )}
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Attendance Rate</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{attendanceRate}%</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Outstanding</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalOutstandingText}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Last Exam Avg</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{examAvg}%</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Homework Completion</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{hwCompletionRate}%</p>
        </div>
      </div>

      {/* RISK BREAKDOWN */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Risk Analysis</h2>
        {!risk ? (
          <p className="text-sm text-slate-500">Risk score not yet computed for this student.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {(safe.array(risk.risk_factors) || []).map((factor: any, i: number) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700 capitalize">{factor.factor} Factor</span>
                  <span className="text-slate-500">{factor.score}/100</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div 
                    className={`h-full rounded-full ${factor.score > 70 ? 'bg-red-500' : factor.score > 40 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                    style={{ width: `${Math.min(100, Math.max(0, factor.score))}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">{factor.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ATTENDANCE */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Attendance — Last 60 Days</h2>
        <div className="flex flex-wrap gap-2">
          {attendance.map((a, i) => (
            <div 
              key={i} 
              title={`${new Date(a.date).toLocaleDateString()}: ${a.status}`}
              className={`h-4 w-4 rounded-full ${
                a.status === 'present' ? 'bg-emerald-500' :
                a.status === 'absent' ? 'bg-red-500' :
                a.status === 'late' ? 'bg-amber-500' :
                'bg-slate-100'
              }`}
            />
          ))}
          {attendance.length === 0 && <p className="text-sm text-slate-500">No attendance records in the last 60 days.</p>}
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Present: <span className="font-medium">{presentDays}</span> days | 
          Absent: <span className="font-medium">{totalDays - presentDays}</span> days | 
          Rate: <span className="font-medium">{attendanceRate}%</span>
        </p>
      </div>

      {/* EXAM RESULTS */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Academic Performance</h2>
        {results.length === 0 ? (
          <p className="text-sm text-slate-500">No exam records found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Exam</th>
                  <th className="px-4 py-2">Subject</th>
                  <th className="px-4 py-2 text-right">Marks</th>
                  <th className="px-4 py-2 text-right">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {results.map((r, i) => {
                  const examName = r.exams?.name || 'Unknown Exam'
                  const subjectName = r.subjects?.name || 'Unknown Subject'
                  const isPass = r.is_pass
                  
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium text-slate-900">{examName}</td>
                      <td className="px-4 py-2">{subjectName}</td>
                      <td className="px-4 py-2 text-right">
                        {safe.number(r.marks_obtained)} / {safe.number(r.max_marks)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${isPass ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {safe.string(r.grade) || (isPass ? 'Pass' : 'Fail')}
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

      {/* FEE STATUS */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Fee Status</h2>
        {fees.length === 0 ? (
          <p className="text-sm text-slate-500">No fee records found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Fee Head</th>
                  <th className="px-4 py-2">Term</th>
                  <th className="px-4 py-2">Due Date</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-right">Outstanding</th>
                  <th className="px-4 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {fees.map((f, i) => {
                  const outstanding = safe.number(f.outstanding)
                  const isPaid = f.status === 'paid' || outstanding === 0
                  
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium text-slate-900">{f.fee_heads?.name || 'Unknown'}</td>
                      <td className="px-4 py-2">{f.fee_terms?.name || 'Unknown'}</td>
                      <td className="px-4 py-2">{f.due_date ? new Date(f.due_date).toLocaleDateString() : 'N/A'}</td>
                      <td className="px-4 py-2 text-right">{rupees.format(safe.number(f.net_amount))}</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-900">{rupees.format(outstanding)}</td>
                      <td className="px-4 py-2 text-right">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          isPaid ? 'bg-emerald-50 text-emerald-700' :
                          outstanding > 0 && outstanding < safe.number(f.net_amount) ? 'bg-amber-50 text-amber-700' :
                          'bg-red-50 text-red-700'
                        }`}>
                          {f.status || 'pending'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold text-slate-900">
                  <td colSpan={4} className="px-4 py-3 text-right">Total Outstanding:</td>
                  <td className="px-4 py-3 text-right">{totalOutstandingText}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* HOMEWORK */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Homework (Last 30 days)</h2>
        {homework.length === 0 ? (
          <p className="text-sm text-slate-500">No homework records found</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-600 font-medium">
              {completedHw} of {totalHw} completed ({hwCompletionRate}%)
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {homework.map((h, i) => (
                <div key={i} className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 p-2 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-700">{h.class_diary?.subjects?.name || 'Unknown'}</span>
                    <span className="text-xs text-slate-500">{new Date(h.created_at).toLocaleDateString()}</span>
                  </div>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    h.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                    h.status === 'not_completed' ? 'bg-red-50 text-red-700' :
                    'bg-amber-50 text-amber-700'
                  }`}>
                    {h.status?.replace('_', ' ') || 'pending'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* DRAFT MESSAGE ACTION */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h2 className="mb-2 text-base font-semibold text-blue-900">Take Action</h2>
        <p className="mb-4 text-sm text-blue-700">Need to discuss this student's performance or attendance with their parents?</p>
        <Link 
          href="/principal" 
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Draft WhatsApp to Parent &rarr;
        </Link>
      </div>

    </div>
  )
}
