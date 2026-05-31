import Link from 'next/link'
import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import { Users, AlertTriangle, ChevronRight } from 'lucide-react'

export default async function TeacherStudentsPage({
  searchParams,
}: {
  searchParams: { section?: string }
}) {
  const user = await requireRole(
    ['teacher'] as unknown as Array<
      'owner' | 'principal' | 'teacher' | 'accountant' | 'parent'
    >
  )
  const supabase = await createServerClient()

  // 1. Get teacher's assigned sections
  const { data: assignments, error: assignmentError } = await supabase
    .from('teacher_assignments')
    .select('section_id, class_id, subject_id')
    .eq('teacher_id', user.userId)
    .eq('school_id', user.schoolId)
    .eq('academic_year_id', user.academicYearId ?? '')

  console.log('[TEACHER_ASSIGNMENTS]', { 
    userId: user.userId,
    schoolId: user.schoolId, 
    academicYearId: user.academicYearId,
    assignments, 
    assignmentError 
  })

  const sectionIds = [
    ...new Set(
      safe
        .array(assignments)
        .map((a: any) => safe.string(a.section_id))
        .filter(Boolean)
    ),
  ]

  if (sectionIds.length === 0) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center p-6 text-center">
        <div className="rounded-full bg-slate-100 p-4 mb-4">
          <Users className="h-8 w-8 text-slate-400" />
        </div>
        <h2 className="text-lg font-medium text-slate-900">
          No classes assigned yet
        </h2>
        <p className="mt-1 text-sm text-slate-500 max-w-sm">
          You haven't been assigned to any classes for the current academic year.
          Please contact your principal.
        </p>
      </div>
    )
  }

  // 2. Parallel queries
  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: studentsRaw },
    { data: attendanceRaw },
  ] = await Promise.all([
    // Query A: Students in teacher's sections
    supabase
      .from('students')
      .select(`
        id,
        full_name,
        admission_no,
        gender,
        enrollments!inner (
          section_id,
          classes!inner (name, display_order),
          sections!inner (name)
        ),
        student_risk_scores (
          composite_risk_score,
          risk_level,
          engagement_score
        )
      `)
      .eq('school_id', user.schoolId)
      .eq('is_deleted', false)
      .eq('enrollments.school_id', user.schoolId)
      .eq('enrollments.academic_year_id', user.academicYearId ?? '')
      .eq('enrollments.status', 'active')
      .in('enrollments.section_id', sectionIds),

    // Query B: Today's attendance
    supabase
      .from('attendance')
      .select('student_id, status')
      .eq('school_id', user.schoolId)
      .eq('date', today)
      .in('section_id', sectionIds),
  ])

  const safeStudentsRaw = safe.array(studentsRaw)
  const studentIds = safeStudentsRaw.map((s: any) => safe.string(s.id))

  // Query C: Homework this week
  let homeworkRaw: any[] = []
  if (studentIds.length > 0) {
    const { data: hwData } = await supabase
      .from('homework_submissions')
      .select('student_id, status')
      .eq('school_id', user.schoolId)
      .gte('created_at', sevenDaysAgo)
      .in('student_id', studentIds)
    homeworkRaw = safe.array(hwData)
  }

  // 3. Computation
  const allStudents = safeStudentsRaw
    .map((s: any) => {
      const sId = safe.string(s.id)
      const enroll = safe.array<Record<string, any>>(s.enrollments)[0]
      const risk = safe.array<Record<string, any>>(s.student_risk_scores)[0]

      const att = safe.array<Record<string, any>>(attendanceRaw).find((a) => safe.string(a.student_id) === sId)
      const presentToday = att ? safe.string(att.status).toLowerCase() : null

      const hw = homeworkRaw.filter((h: any) => safe.string(h.student_id) === sId)
      const homeworkTotal = hw.length
      const homeworkCompleted = hw.filter(
        (h: any) => safe.string(h.status).toLowerCase() === 'completed'
      ).length
      const homeworkRate =
        homeworkTotal > 0 ? (homeworkCompleted / homeworkTotal) * 100 : 0

      const riskLevel = risk ? safe.string(risk.risk_level).toLowerCase() : 'low'
      // Note: check for raw null to allow distinguishing 'no data' from '0'
      const engagementScore = risk?.engagement_score !== undefined && risk.engagement_score !== null 
        ? safe.number(risk.engagement_score) 
        : null

      const needsAttention =
        riskLevel === 'critical' ||
        riskLevel === 'high' ||
        (homeworkTotal > 0 && homeworkRate < 40)

      let reason = ''
      if (riskLevel === 'critical' || riskLevel === 'high') {
        reason = 'High risk'
      } else if (homeworkTotal > 0 && homeworkRate < 40) {
        reason = `Low homework (${homeworkRate.toFixed(0)}%)`
      }

      return {
        id: sId,
        name: safe.string(s.full_name),
        admissionNo: safe.string(s.admission_no),
        sectionId: enroll ? safe.string(enroll.section_id) : '',
        className: enroll && enroll.classes ? safe.string(enroll.classes.name) : '',
        sectionName: enroll && enroll.sections ? safe.string(enroll.sections.name) : '',
        displayOrder: enroll && enroll.classes ? safe.number(enroll.classes.display_order) : 999,
        presentToday,
        homeworkCompleted,
        homeworkTotal,
        homeworkRate,
        engagementScore,
        needsAttention,
        reason,
      }
    })
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
      if (a.sectionName !== b.sectionName) return a.sectionName.localeCompare(b.sectionName)
      return a.name.localeCompare(b.name)
    })

  // Group sections for the filter row
  const sectionMap = new Map<string, string>()
  allStudents.forEach((s) => {
    if (s.sectionId && !sectionMap.has(s.sectionId)) {
      sectionMap.set(s.sectionId, `${s.className} ${s.sectionName}`)
    }
  })
  const distinctSections = Array.from(sectionMap.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const selectedSectionId = searchParams.section || 'all'
  const filteredStudents =
    selectedSectionId === 'all'
      ? allStudents
      : allStudents.filter((s) => s.sectionId === selectedSectionId)

  // 4. KPIs based on filtered students
  const totalStudents = filteredStudents.length
  const presentTodayCount = filteredStudents.filter(
    (s) => s.presentToday === 'present' || s.presentToday === 'late'
  ).length
  const needsAttentionCount = filteredStudents.filter((s) => s.needsAttention).length

  let totalHwRate = 0
  let hwStudentsCount = 0
  filteredStudents.forEach((s) => {
    if (s.homeworkTotal > 0) {
      totalHwRate += s.homeworkRate
      hwStudentsCount++
    }
  })
  const avgHomeworkRate = hwStudentsCount > 0 ? totalHwRate / hwStudentsCount : 0

  // Helpers
  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase()

  const getAttendanceDot = (status: string | null) => {
    if (status === 'present') return <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500"></span><span className="text-emerald-700 font-medium text-xs">Present</span></span>
    if (status === 'absent') return <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500"></span><span className="text-red-700 font-medium text-xs">Absent</span></span>
    if (status === 'late') return <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500"></span><span className="text-amber-700 font-medium text-xs">Late</span></span>
    if (status === 'excused') return <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-300"></span><span className="text-blue-700 font-medium text-xs">Excused</span></span>
    return <span className="text-slate-400 font-medium text-xs">—</span>
  }

  const getEngagementBadge = (score: number | null) => {
    if (score === null) return <span className="text-slate-400 font-medium text-xs">—</span>
    if (score < 40) return <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Low</span>
    if (score <= 70) return <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Medium</span>
    return <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Good</span>
  }

  return (
    <div className="space-y-6 p-6">
      {/* PAGE HEADER */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My Students</h1>
        <p className="mt-1 text-sm text-slate-500">
          {allStudents.length} students across {distinctSections.length} classes
        </p>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Students</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {totalStudents}
          </p>
        </div>
        
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Present Today</p>
          <p className={`mt-1 text-2xl font-semibold ${
            totalStudents > 0 && presentTodayCount / totalStudents >= 0.85 ? 'text-emerald-600' : 'text-slate-900'
          }`}>
            {presentTodayCount}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Needs Attention</p>
          <p className={`mt-1 text-2xl font-semibold ${needsAttentionCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {needsAttentionCount}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Homework Rate</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {avgHomeworkRate.toFixed(1)}%
          </p>
          <p className="mt-1 text-[10px] text-slate-400">This week</p>
        </div>
      </div>

      {/* SECTION FILTER */}
      {distinctSections.length > 1 && (
        <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-2 sm:mx-0 sm:px-0">
          <Link
            href="/teacher/students?section=all"
            className={`flex-none rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              selectedSectionId === 'all'
                ? 'bg-blue-600 text-white border border-blue-600'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            All
          </Link>
          {distinctSections.map((sec) => (
            <Link
              key={sec.id}
              href={`/teacher/students?section=${sec.id}`}
              className={`flex-none rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                selectedSectionId === sec.id
                  ? 'bg-blue-600 text-white border border-blue-600'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {sec.label}
            </Link>
          ))}
        </div>
      )}

      {/* NEEDS ATTENTION SECTION */}
      {needsAttentionCount > 0 && (
        <div className="rounded-lg border border-red-100 bg-red-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h2 className="font-semibold text-red-900">
              Needs Attention ({needsAttentionCount})
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredStudents
              .filter((s) => s.needsAttention)
              .map((s) => (
                <div key={`at-risk-${s.id}`} className="flex items-center gap-3 rounded-lg border border-red-100 bg-white p-3 shadow-sm">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 font-semibold text-red-700">
                    {getInitials(s.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {s.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-500">
                        {s.className} {s.sectionName}
                      </span>
                      <span className="text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                        {s.reason}
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/principal/students/${s.id}`}
                    className="flex shrink-0 items-center justify-center rounded-full bg-slate-50 p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    title="View Full Profile"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ALL STUDENTS TABLE */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Student</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Class</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Today</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">Homework</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-900">Engagement</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-900">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No students found in this section.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => (
                  <tr
                    key={s.id}
                    className={`transition-colors hover:bg-slate-50 ${
                      s.needsAttention ? 'bg-red-50/30' : 'bg-white'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700 text-xs">
                          {getInitials(s.name)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{s.name}</p>
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium mt-0.5 inline-block">
                            {s.admissionNo}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium">
                      {s.className} {s.sectionName}
                    </td>
                    <td className="px-4 py-3">
                      {getAttendanceDot(s.presentToday)}
                    </td>
                    <td className="px-4 py-3">
                      {s.homeworkTotal > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600 font-medium">
                            {s.homeworkCompleted}/{s.homeworkTotal}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              s.homeworkRate >= 80
                                ? 'bg-emerald-100 text-emerald-700'
                                : s.homeworkRate >= 40
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {s.homeworkRate.toFixed(0)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-medium">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getEngagementBadge(s.engagementScore)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/principal/students/${s.id}`}
                        className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"
                      >
                        View Profile
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
