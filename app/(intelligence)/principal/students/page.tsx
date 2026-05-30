import Link from 'next/link'
import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import { Search } from 'lucide-react'

type ClassRow = {
  id: string
  name: string
}

type StudentRow = {
  id: string
  full_name: string
  admission_no: string
  gender: string
  date_of_birth: string
  enrollments: {
    roll_number: string
    status: string
    academic_year_id: string
    class_id: string
    section_id: string
    classes: { name: string; display_order: number }
    sections: { name: string }
  }[]
  student_risk_scores: {
    composite_risk_score: number
    risk_level: string
    trend: string
  }[]
}

export default async function PrincipalStudentsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const user = await requireRole(['principal', 'admin', 'super_admin'] as unknown as Array<'owner' | 'principal' | 'teacher' | 'accountant' | 'parent'>)
  const supabase = await createServerClient()
  
  const search = typeof searchParams.search === 'string' ? searchParams.search : ''
  const classFilter = typeof searchParams.class === 'string' ? searchParams.class : ''
  const riskFilter = typeof searchParams.risk === 'string' ? searchParams.risk : ''

  // 1. Fetch Classes for dropdown
  const { data: classesData } = await supabase
    .from('classes')
    .select('id, name')
    .eq('school_id', user.schoolId)
    .order('display_order')

  const classes = safe.array<ClassRow>(classesData)

  // 2. Fetch Students
  let query = supabase
    .from('students')
    .select(`
      id,
      full_name,
      admission_no,
      gender,
      date_of_birth,
      enrollments!inner (
        roll_number,
        status,
        academic_year_id,
        class_id,
        section_id,
        classes!inner (name, display_order),
        sections!inner (name)
      ),
      student_risk_scores (
        composite_risk_score,
        risk_level,
        trend
      )
    `)
    .eq('school_id', user.schoolId)
    .eq('is_deleted', false)

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,admission_no.ilike.%${search}%`)
  }

  const { data: studentsData, error } = await query

  if (error) {
    console.error('[StudentsPage] Error fetching students', error)
  }

  // Flatten and map data
  const rawStudents = safe.array<StudentRow>(studentsData).map((s) => {
    const enrollment = s.enrollments?.[0]
    const cls = enrollment?.classes
    const sec = enrollment?.sections
    const risk = s.student_risk_scores?.[0]

    return {
      id: safe.string(s.id),
      full_name: safe.string(s.full_name),
      admission_no: safe.string(s.admission_no),
      gender: safe.string(s.gender),
      date_of_birth: safe.string(s.date_of_birth),
      roll_number: safe.string(enrollment?.roll_number),
      class_id: safe.string(enrollment?.class_id),
      class_name: safe.string(cls?.name),
      section_name: safe.string(sec?.name),
      display_order: safe.number(cls?.display_order, 999),
      composite_risk_score: risk?.composite_risk_score !== undefined && risk?.composite_risk_score !== null ? safe.number(risk.composite_risk_score) : null,
      risk_level: safe.string(risk?.risk_level, ''),
      trend: safe.string(risk?.trend, '')
    }
  })

  // Filter in memory for class and risk
  let filteredStudents = rawStudents
  if (classFilter) {
    filteredStudents = filteredStudents.filter(s => s.class_id === classFilter)
  }
  if (riskFilter) {
    filteredStudents = filteredStudents.filter(s => s.risk_level === riskFilter)
  }

  // Sort: class display_order, section_name, full_name
  filteredStudents.sort((a, b) => {
    if (a.display_order !== b.display_order) return a.display_order - b.display_order
    if (a.section_name !== b.section_name) return a.section_name.localeCompare(b.section_name)
    return a.full_name.localeCompare(b.full_name)
  })

  const totalStudents = rawStudents.length
  const uniqueClasses = new Set(rawStudents.map(s => s.class_id)).size
  const uniqueSections = new Set(rawStudents.map(s => `${s.class_id}-${s.section_name}`)).size

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

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">Students</h1>
        <p className="text-sm text-slate-500">{totalStudents} students enrolled</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {totalStudents} Total Students
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {uniqueClasses} Classes
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {uniqueSections} Sections
        </div>
      </div>

      <form method="GET" className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="Search by name or admission no..."
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          name="class"
          defaultValue={classFilter}
          className="rounded-lg border border-slate-200 py-2 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Classes</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          name="risk"
          defaultValue={riskFilter}
          className="rounded-lg border border-slate-200 py-2 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Risk Levels</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">Filter</button>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white">
        {filteredStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-slate-500">No students found matching your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">SR.</th>
                  <th className="px-4 py-3">Admission No</th>
                  <th className="px-4 py-3">Student Details</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Risk Level</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredStudents.map((student, idx) => (
                  <tr key={student.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                        {student.admission_no}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{student.full_name}</div>
                      <div className="text-xs text-slate-500">
                        {student.gender} · DOB: {student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString() : 'N/A'}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {student.class_name} - {student.section_name}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getRiskBadgeClasses(student.risk_level)}`}>
                          {getRiskLabel(student.risk_level)}
                        </span>
                        {student.composite_risk_score !== null && (
                          <span className="text-xs font-semibold text-slate-700">{student.composite_risk_score}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link 
                        href={`/principal/students/${student.id}`}
                        className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        View Profile
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
