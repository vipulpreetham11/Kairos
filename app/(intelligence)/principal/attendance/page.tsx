import Link from 'next/link'
import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import { ChartWrapper } from '@/components/shared/chart-wrapper'

// Ensure we have correct types for the raw data
type SectionRow = {
  id: string
  name: string
  classes: {
    name: string
    display_order: number
  }
}

type DefaulterRawRow = {
  student_id: string
  status: string
  students: {
    full_name: string
    admission_no: string
    enrollments: {
      section_id: string
    }[]
  }
}

export default async function PrincipalAttendancePage() {
  const user = await requireRole(
    ['principal', 'admin', 'super_admin'] as unknown as Array<
      'owner' | 'principal' | 'teacher' | 'accountant' | 'parent'
    >
  )
  const supabase = createServerClient()

  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  // Fetch all data in parallel
  const todayAttPromise = supabase
    .from('attendance')
    .select('section_id, status')
    .eq('school_id', user.schoolId)
    .eq('academic_year_id', user.academicYearId || '')
    .eq('date', today)

  const sectionsPromise = supabase
    .from('sections')
    .select(`
      id,
      name,
      classes!inner (name, display_order)
    `)
    .eq('school_id', user.schoolId)

  const trendAttPromise = supabase
    .from('attendance')
    .select('date, status')
    .eq('school_id', user.schoolId)
    .eq('academic_year_id', user.academicYearId || '')
    .gte('date', thirtyDaysAgo)

  const defaultersAttPromise = supabase
    .from('attendance')
    .select(`
      student_id,
      status,
      students!inner (
        full_name,
        admission_no,
        enrollments!inner (section_id)
      )
    `)
    .eq('school_id', user.schoolId)
    .eq('academic_year_id', user.academicYearId || '')

  const [
    { data: todayAttData },
    { data: sectionsData },
    { data: trendAttData },
    { data: defaultersAttData },
  ] = await Promise.all([
    todayAttPromise,
    sectionsPromise,
    trendAttPromise,
    defaultersAttPromise,
  ])

  // 1. Build sections list (sorted by class order, then section name)
  const sortedSections = safe
    .array(sectionsData)
    .map((s) => s as unknown as SectionRow)
    .sort((a, b) => {
      const classOrderDiff = safe.number(a.classes?.display_order) - safe.number(b.classes?.display_order)
      if (classOrderDiff !== 0) return classOrderDiff
      return safe.string(a.name).localeCompare(safe.string(b.name))
    })

  // 2. Build sectionAttendanceMap
  const sectionMap = new Map<
    string,
    { present: number; absent: number; total: number; rate: number; marked: boolean }
  >()

  sortedSections.forEach((sec) => {
    sectionMap.set(sec.id, { present: 0, absent: 0, total: 0, rate: 0, marked: false })
  })

  let totalPresent = 0
  let totalAbsent = 0

  safe.array(todayAttData).forEach((record: any) => {
    const secId = safe.string(record.section_id)
    const sec = sectionMap.get(secId)
    if (!sec) return

    sec.marked = true
    sec.total++

    if (record.status === 'present' || record.status === 'late') {
      sec.present++
      totalPresent++
    } else if (record.status === 'absent') {
      sec.absent++
      totalAbsent++
    }
  })

  for (const sec of sectionMap.values()) {
    if (sec.total > 0) {
      sec.rate = (sec.present / sec.total) * 100
    }
  }

  // 3. Compute school-wide today stats
  const totalStudents = totalPresent + totalAbsent
  const overallRate = totalStudents > 0 ? (totalPresent / totalStudents) * 100 : 0
  const markedCount = Array.from(sectionMap.values()).filter((s) => s.marked).length
  const totalSections = sortedSections.length

  // 4. Build trend data for chart
  const trendMap = new Map<string, { present: number; total: number }>()
  safe.array(trendAttData).forEach((record: any) => {
    const date = safe.string(record.date)
    if (!date) return
    if (!trendMap.has(date)) trendMap.set(date, { present: 0, total: 0 })

    const entry = trendMap.get(date)!
    entry.total++
    if (record.status === 'present' || record.status === 'late') {
      entry.present++
    }
  })

  const trend = Array.from(trendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, stats]) => ({
      date,
      rate: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
    }))

  // 5. Compute defaulters
  const studentAttMap = new Map<
    string,
    {
      present: number
      total: number
      full_name: string
      admission_no: string
      section_id: string
    }
  >()

  safe.array(defaultersAttData).forEach((record: any) => {
    const raw = record as DefaulterRawRow
    const sId = raw.student_id
    if (!sId) return

    if (!studentAttMap.has(sId)) {
      const full_name = safe.string(raw.students?.full_name)
      const admission_no = safe.string(raw.students?.admission_no)
      const enrolls = safe.array(raw.students?.enrollments) as any[]
      const section_id = enrolls.length > 0 ? safe.string(enrolls[0].section_id) : ''

      studentAttMap.set(sId, {
        present: 0,
        total: 0,
        full_name,
        admission_no,
        section_id,
      })
    }

    const entry = studentAttMap.get(sId)!
    entry.total++
    if (raw.status === 'present' || raw.status === 'late') {
      entry.present++
    }
  })

  const defaulters = Array.from(studentAttMap.entries())
    .map(([student_id, stats]) => {
      const rate = stats.total > 0 ? (stats.present / stats.total) * 100 : 0
      return {
        student_id,
        ...stats,
        rate,
      }
    })
    .filter((s) => s.total > 0 && s.rate < 75)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 20)

  // Format today's date
  const formattedToday = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Helper for KPI card color
  const getRateColor = (rate: number) => {
    if (rate > 85) return 'text-emerald-600'
    if (rate > 75) return 'text-amber-600'
    return 'text-red-600'
  }

  // Section mapping helper
  const getSectionName = (secId: string) => {
    const sec = sortedSections.find((s) => s.id === secId)
    if (!sec) return 'Unknown'
    return `${safe.string(sec.classes?.name)} - ${safe.string(sec.name)}`
  }

  return (
    <div className="space-y-6 p-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Attendance</h1>
        <p className="text-sm text-slate-500">Today — {formattedToday}</p>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1 */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Present Today</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className={`text-2xl font-semibold ${getRateColor(overallRate)}`}>
              {totalPresent} / {totalStudents}
            </p>
            {totalStudents > 0 && (
              <span className="text-sm text-slate-500">{overallRate.toFixed(1)}%</span>
            )}
          </div>
        </div>

        {/* Card 2 */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Absent Today</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              totalAbsent > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {totalAbsent}
          </p>
        </div>

        {/* Card 3 */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Sections Marked</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {markedCount} / {totalSections}
          </p>
          {markedCount === 0 && (
            <p className="mt-1 text-xs text-slate-400">Not yet marked</p>
          )}
        </div>

        {/* Card 4 */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Below 75%</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              defaulters.length > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {defaulters.length} students
          </p>
        </div>
      </div>

      {/* TREND CHART */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          30-Day Attendance Trend
        </h2>
        {trend.length > 0 ? (
          <ChartWrapper
            data={{
              type: 'line',
              labels: trend.map((d) => d.date),
              datasets: [
                {
                  label: 'Attendance Rate',
                  data: trend.map((d) => d.rate),
                  color: '#6366f1',
                },
              ],
              threshold_value: 75,
              threshold_label: '75% minimum',
            }}
            height={200}
          />
        ) : (
          <div className="flex h-[200px] items-center justify-center rounded-lg bg-slate-50 border border-dashed border-slate-200">
            <p className="text-sm text-slate-500">No trend data available.</p>
          </div>
        )}
      </div>

      {/* SECTION GRID */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Today — Section Wise</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sortedSections.map((sec) => {
            const stats = sectionMap.get(sec.id)!
            const isMarked = stats.marked
            const rate = stats.rate

            let badgeClass = 'bg-slate-100 text-slate-500'
            let badgeText = 'Not marked'

            if (isMarked) {
              badgeText = `${rate.toFixed(1)}%`
              if (rate > 85) badgeClass = 'bg-emerald-100 text-emerald-700'
              else if (rate > 75) badgeClass = 'bg-amber-100 text-amber-700'
              else badgeClass = 'bg-red-100 text-red-700'
            }

            return (
              <div key={sec.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">
                    Class {safe.string(sec.classes?.name)} - {safe.string(sec.name)}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}
                  >
                    {badgeText}
                  </span>
                </div>

                {isMarked ? (
                  <>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                        {stats.present} Present
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-red-500"></span>
                        {stats.absent} Absent
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${rate}%` }}
                      ></div>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 text-xs text-slate-400">Not marked yet</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* DEFAULTERS TABLE */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">
          Defaulters — Below 75% Attendance
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          {defaulters.length} students need attention
        </p>

        {defaulters.length === 0 ? (
          <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">
            No defaulters found. All students above 75%.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    Student
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    Admission No
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    Section
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">
                    Present
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">
                    Total
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">
                    Rate
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {defaulters.map((d) => (
                  <tr key={d.student_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {d.full_name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                        {d.admission_no || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {getSectionName(d.section_id)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {d.present} days
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {d.total} days
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        d.rate < 60 ? 'text-red-600' : 'text-amber-600'
                      }`}
                    >
                      {d.rate.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        href={`/principal/students/${d.student_id}`}
                        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
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
