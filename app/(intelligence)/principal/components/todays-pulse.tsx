import Link from 'next/link'
import {
  Clock,
  CheckCircle,
  UserX,
  Users,
  AlertTriangle,
  IndianRupee,
  BookOpen,
  AlertCircle,
} from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'

interface TodaysPulseProps {
  schoolId: string
  academicYearId: string
}

function formatAmount(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}K`
  return `₹${rupees.toFixed(0)}`
}

export async function TodaysPulse({ schoolId, academicYearId }: TodaysPulseProps) {
  const supabase = createServerClient()

  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]

  const yearFilter = academicYearId || ''

  // All parallel queries
  const [
    { data: sectionsData },
    { data: todayAttData },
    { data: absentTodayData },
    { data: absentYestData },
    { data: absentThreeDaysData },
    { data: examsData },
    { data: feeData },
    { data: criticalRiskData },
  ] = await Promise.all([
    // Q1a: All active sections
    supabase
      .from('sections')
      .select('id')
      .eq('school_id', schoolId),

    // Q1b: Sections that have attendance marked today
    supabase
      .from('attendance')
      .select('section_id')
      .eq('school_id', schoolId)
      .eq('date', today)
      .eq('academic_year_id', yearFilter),

    // Q2: Distinct absent students today
    supabase
      .from('attendance')
      .select('student_id')
      .eq('school_id', schoolId)
      .eq('date', today)
      .eq('status', 'absent')
      .eq('academic_year_id', yearFilter),

    // Q3a: Absent yesterday
    supabase
      .from('attendance')
      .select('student_id')
      .eq('school_id', schoolId)
      .eq('date', yesterday)
      .eq('status', 'absent')
      .eq('academic_year_id', yearFilter),

    // Q3b: Absent 3 days ago
    supabase
      .from('attendance')
      .select('student_id')
      .eq('school_id', schoolId)
      .eq('date', threeDaysAgo)
      .eq('status', 'absent')
      .eq('academic_year_id', yearFilter),

    // Q4: Published exams recently
    supabase
      .from('exams')
      .select('id')
      .eq('school_id', schoolId)
      .eq('is_published', true)
      .eq('academic_year_id', yearFilter)
      .gte('start_date', yesterday),

    // Q5: Fee payments today
    supabase
      .from('fee_payments')
      .select('amount')
      .eq('school_id', schoolId)
      .eq('payment_date', today)
      .eq('status', 'active'),

    // Q6: New critical risk students computed today
    supabase
      .from('student_risk_scores')
      .select('student_id')
      .eq('school_id', schoolId)
      .eq('risk_level', 'critical')
      .gte('computed_at', `${today}T00:00:00`),
  ])

  // Compute section marking status
  const totalSections = safe.array(sectionsData).length
  const markedSectionIds = new Set(
    (safe.array(todayAttData) as { section_id: string }[]).map((r) => r.section_id)
  )
  const markedCount = markedSectionIds.size
  const unmarkedCount = Math.max(0, totalSections - markedCount)

  // Absent count today (distinct)
  const absentTodayIds = new Set(
    (safe.array(absentTodayData) as { student_id: string }[]).map((r) => r.student_id)
  )
  const absentCount = absentTodayIds.size

  // Consecutive absences: students absent all 3 days
  const absentYestSet = new Set(
    (safe.array(absentYestData) as { student_id: string }[]).map((r) => r.student_id)
  )
  const absentThreeDaysSet = new Set(
    (safe.array(absentThreeDaysData) as { student_id: string }[]).map((r) => r.student_id)
  )
  let consecutiveAbsentCount = 0
  for (const id of absentTodayIds) {
    if (absentYestSet.has(id) && absentThreeDaysSet.has(id)) consecutiveAbsentCount++
  }

  // Published exams
  const publishedExamCount = safe.array(examsData).length

  // Fee collections
  const feeRows = safe.array(feeData) as { amount: number }[]
  const todayPaymentCount = feeRows.length
  const totalFeeAmount = feeRows.reduce((sum, r) => sum + safe.number(r.amount), 0)

  // New critical risk today
  const newCriticalCount = safe.array(criticalRiskData).length

  // Format today's date
  const formattedDate = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  // Determine if we have any urgent items to show
  const hasUrgentItems =
    unmarkedCount > 0 ||
    absentCount > 0 ||
    consecutiveAbsentCount > 0 ||
    todayPaymentCount > 0 ||
    publishedExamCount > 0 ||
    newCriticalCount > 0

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Today&apos;s Pulse</h2>
        <span className="text-xs text-slate-400">{formattedDate}</span>
      </div>

      {/* Pulse items */}
      <div className="flex flex-wrap gap-3">
        {/* 1. Attendance marking status — always shown */}
        {unmarkedCount > 0 ? (
          <Link
            href="/principal/attendance"
            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
          >
            <Clock className="h-3 w-3" />
            {unmarkedCount} section{unmarkedCount !== 1 ? 's' : ''} not marked
          </Link>
        ) : (
          <Link
            href="/principal/attendance"
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <CheckCircle className="h-3 w-3" />
            All sections marked
          </Link>
        )}

        {/* 2. Absences today */}
        {absentCount > 0 ? (
          <Link
            href="/principal/attendance"
            className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
          >
            <UserX className="h-3 w-3" />
            {absentCount} absent today
          </Link>
        ) : (
          <span className="inline-flex cursor-default items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500">
            <Users className="h-3 w-3" />
            No absences today
          </span>
        )}

        {/* 3. Consecutive absences — only if > 0 */}
        {consecutiveAbsentCount > 0 && (
          <Link
            href="/principal/students?risk=critical"
            className="inline-flex items-center gap-2 rounded-full border border-red-300 bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-800 transition-colors hover:bg-red-200"
          >
            <AlertTriangle className="h-3 w-3" />
            {consecutiveAbsentCount} absent 3+ days
          </Link>
        )}

        {/* 4. Fee collections — only if payments exist today */}
        {todayPaymentCount > 0 && (
          <Link
            href="/principal/students"
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <IndianRupee className="h-3 w-3" />
            {formatAmount(totalFeeAmount)} collected today
          </Link>
        )}

        {/* 5. Published exams — only if any published recently */}
        {publishedExamCount > 0 && (
          <Link
            href="/principal/exams"
            className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
          >
            <BookOpen className="h-3 w-3" />
            {publishedExamCount} exam result{publishedExamCount !== 1 ? 's' : ''} published
          </Link>
        )}

        {/* 6. New critical risk — only if any today */}
        {newCriticalCount > 0 && (
          <Link
            href="/principal/students?risk=critical"
            className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
          >
            <AlertCircle className="h-3 w-3" />
            {newCriticalCount} new critical risk
          </Link>
        )}

        {/* Empty state — school running smoothly */}
        {!hasUrgentItems && (
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            <CheckCircle className="h-3 w-3" />
            School is running smoothly today
          </span>
        )}
      </div>
    </div>
  )
}
