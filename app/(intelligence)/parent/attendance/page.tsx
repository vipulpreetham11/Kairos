import Link from 'next/link'
import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import { formatDate } from '@/lib/utils/format'
import { AlertCircle, CalendarDays, CheckCircle2 } from 'lucide-react'

export default async function ParentAttendancePage({
  searchParams,
}: {
  searchParams: { student?: string }
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
          <CalendarDays className="h-8 w-8 text-slate-400" />
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
          <CalendarDays className="h-8 w-8 text-slate-400" />
        </div>
        <h2 className="text-lg font-medium text-slate-900">No Children Linked</h2>
        <p className="mt-1 text-sm text-slate-500 max-w-sm">
          Your profile doesn't have any students linked to it. Please contact the school administrator.
        </p>
      </div>
    )
  }

  const selectedId = searchParams.student ?? children[0].id
  const activeChild = children.find((c) => c.id === selectedId) || children[0]

  // 3. Get attendance for selected child
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const { data: attendanceData } = await supabase
    .from('attendance')
    .select('date, status')
    .eq('student_id', activeChild.id)
    .eq('school_id', user.schoolId)
    .eq('academic_year_id', user.academicYearId ?? '')
    .gte('date', ninetyDaysAgo)
    .order('date', { ascending: false })

  const rawAttendance = safe.array(attendanceData)
  const totalDays = rawAttendance.length
  
  let presentDays = 0
  let absentDays = 0
  const calendarMap: Record<string, string> = {}
  
  const monthlyMap = new Map<string, { present: number; absent: number; total: number; label: string }>()

  rawAttendance.forEach((a: any) => {
    const d = safe.string(a.date)
    const st = safe.string(a.status).toLowerCase()
    if (!d) return
    
    calendarMap[d] = st
    
    if (st === 'present' || st === 'late') presentDays++
    if (st === 'absent') absentDays++

    const ym = d.substring(0, 7)
    if (!monthlyMap.has(ym)) {
      const dObj = new Date(d)
      const label = dObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      monthlyMap.set(ym, { present: 0, absent: 0, total: 0, label })
    }
    const m = monthlyMap.get(ym)!
    m.total++
    if (st === 'present' || st === 'late') m.present++
    if (st === 'absent') m.absent++
  })

  const attendanceRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 0

  // 4. Calendar Generation (Last 3 months)
  const todayDate = new Date()
  const monthsToRender = []
  for (let i = 0; i < 3; i++) {
    const d = new Date(todayDate.getFullYear(), todayDate.getMonth() - i, 1)
    monthsToRender.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    })
  }

  function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate()
  }

  function getFirstDayOfMonth(year: number, month: number) {
    // 0 = Sunday, 1 = Monday ... 6 = Saturday
    // We want Mon=0 to Sun=6
    let d = new Date(year, month, 1).getDay()
    return d === 0 ? 6 : d - 1
  }

  const rateColor = (r: number) =>
    r >= 85 ? 'text-emerald-600' : r >= 75 ? 'text-amber-600' : 'text-red-600'

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
                  href={`/parent/attendance?student=${child.id}`}
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
            {activeChild.name}&apos;s Attendance
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {activeChild.class_name} {activeChild.section_name && `· Sec ${activeChild.section_name}`} · {activeChild.admission_no}
          </p>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Attendance Rate</p>
          <p className={`mt-1 text-2xl font-semibold ${rateColor(attendanceRate)}`}>
            {attendanceRate.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-slate-400">Last 90 days</p>
        </div>
        
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Days Present</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">
            {presentDays}
          </p>
          <p className="mt-1 text-xs text-slate-400">days</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Days Absent</p>
          <p className={`mt-1 text-2xl font-semibold ${absentDays > 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {absentDays}
          </p>
          <p className="mt-1 text-xs text-slate-400">days</p>
        </div>
      </div>

      {/* STATUS INDICATOR */}
      {totalDays > 0 && (
        <div>
          {attendanceRate >= 85 ? (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 sm:p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-medium text-emerald-800">Attendance is good.</p>
                <p className="mt-0.5 text-sm text-emerald-700">Keep it up!</p>
              </div>
            </div>
          ) : attendanceRate >= 75 ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-800">Attendance needs attention.</p>
                <p className="mt-0.5 text-sm text-amber-700">Below 85% may affect learning.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 sm:p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-800">Attendance is critically low.</p>
                <p className="mt-0.5 text-sm text-red-700">Please ensure regular attendance. Below 75% may result in exam issues.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MONTHLY SUMMARY TABLE */}
      {monthlyMap.size > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Monthly Breakdown</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Month</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">Present</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">Absent</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">Total</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from(monthlyMap.entries())
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .map(([ym, stats]) => {
                    const rate = stats.total > 0 ? (stats.present / stats.total) * 100 : 0
                    return (
                      <tr key={ym}>
                        <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">{stats.label}</td>
                        <td className="px-3 py-2 text-right text-emerald-600">{stats.present}</td>
                        <td className="px-3 py-2 text-right text-red-600">{stats.absent}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{stats.total}</td>
                        <td className={`px-3 py-2 text-right font-medium ${rateColor(rate)}`}>
                          {rate.toFixed(0)}%
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CALENDAR VIEW */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Attendance Calendar</h2>
        
        <div className="space-y-6">
          {monthsToRender.map(({ year, month, label }) => {
            const daysInMonth = getDaysInMonth(year, month)
            const firstDay = getFirstDayOfMonth(year, month)
            const blanks = Array.from({ length: firstDay })
            const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
            
            return (
              <div key={`${year}-${month}`}>
                <h3 className="mb-2 text-xs font-semibold text-slate-700">{label}</h3>
                <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <div key={`header-${i}`} className="text-[10px] sm:text-xs font-medium text-slate-400 py-1">
                      {d}
                    </div>
                  ))}
                  
                  {blanks.map((_, i) => (
                    <div key={`blank-${i}`} className="aspect-square" />
                  ))}
                  
                  {days.map((day) => {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const status = calendarMap[dateStr]
                    
                    let bgClass = "bg-slate-50 text-slate-400" // future or no data
                    
                    if (status) {
                      if (status === 'present') bgClass = "bg-emerald-500 text-white font-medium shadow-sm"
                      else if (status === 'absent') bgClass = "bg-red-500 text-white font-medium shadow-sm"
                      else if (status === 'late') bgClass = "bg-amber-400 text-white font-medium shadow-sm"
                      else if (status === 'excused') bgClass = "bg-blue-300 text-white font-medium shadow-sm"
                    } else {
                      // Check if it's weekend
                      const dayOfWeek = new Date(year, month, day).getDay()
                      if (dayOfWeek === 0 || dayOfWeek === 6) {
                        bgClass = "bg-slate-100 text-slate-400"
                      }
                    }

                    return (
                      <div key={dateStr} className="flex aspect-square items-center justify-center">
                        <div className={`flex h-6 w-6 sm:h-8 sm:w-8 items-center justify-center rounded-full text-[10px] sm:text-xs ${bgClass}`}>
                          {day}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 sm:gap-4 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-emerald-500"></span>
            Present
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-red-500"></span>
            Absent
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-amber-400"></span>
            Late
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-blue-300"></span>
            Excused
          </div>
        </div>
      </div>

      {/* RECENT ABSENCES */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Recent Absences</h2>
        
        {absentDays === 0 ? (
          <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            No absences recorded. Great attendance!
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border rounded-lg overflow-hidden">
            {rawAttendance
              .filter((a: any) => safe.string(a.status).toLowerCase() === 'absent')
              .slice(0, 10)
              .map((a: any, idx) => (
                <div key={idx} className="flex items-center justify-between bg-white px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">
                    {formatDate(safe.string(a.date))}
                  </span>
                  <span className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                    Absent
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
