import 'server-only'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import { getParentChildIds } from '@/lib/auth/get-current-user'
import type { RiskFactor, RiskLevel, Role, StudentRiskScore } from '@/types/ai'

interface RiskQueryParams {
  schoolId: string
  academicYearId: string
  role: Role
  userId: string
  sectionIds?: string[]
}

function computeAttendanceScore(studentId: string, rows: Record<string, unknown>[]): number {
  const mine = rows.filter((r) => safe.string(r.student_id) === studentId)
  if (mine.length === 0 && rows.length > 0) return 50
  if (mine.length === 0) return 50
  const present = mine.filter((r) => ['present', 'late'].includes(safe.string(r.status).toLowerCase())).length
  const present_rate = present / mine.length
  if (present_rate >= 0.9) return 10
  if (present_rate >= 0.75) return 30
  if (present_rate >= 0.6) return 55
  if (present_rate >= 0.5) return 75
  return 90
}

function computeAcademicScore(studentId: string, rows: Record<string, unknown>[]): number {
  const mine = rows.filter((r) => safe.string(r.student_id) === studentId)
  if (mine.length === 0) return 30
  const avg = mine.reduce((s, r) => s + (safe.number(r.marks_obtained) / Math.max(safe.number(r.max_marks), 1)) * 100, 0) / mine.length
  const failCount = mine.filter((r) => r.is_pass === false).length
  if (avg >= 75) return 10
  if (avg >= 50) return 30
  if (avg >= 35) return 55
  if (failCount >= 2) return 80
  return 70
}

function computeFeeScore(studentId: string, rows: Record<string, unknown>[]): number {
  const mine = rows.filter((r) => safe.string(r.student_id) === studentId)
  if (mine.length === 0) return 0
  const outstanding = mine.reduce((s, r) => s + safe.number(r.outstanding), 0)
  if (outstanding === 0) return 0
  const today = new Date()
  const maxOverdue = mine.reduce((max, r) => {
    if (safe.number(r.outstanding) <= 0) return max
    const dueDate = new Date(safe.string(r.due_date))
    if (Number.isNaN(dueDate.getTime())) return max
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(max, daysOverdue)
  }, 0)
  if (maxOverdue > 90) return 90
  if (maxOverdue > 60) return 70
  if (maxOverdue > 30) return 50
  return 30
}

function computeEngagementScore(studentId: string, rows: Record<string, unknown>[]): number {
  const mine = rows.filter((r) => safe.string(r.student_id) === studentId)
  if (mine.length === 0) return 20
  const completed = mine.filter((r) => safe.string(r.status).toLowerCase() === 'completed').length
  const rate = completed / mine.length
  if (rate >= 0.8) return 10
  if (rate >= 0.6) return 30
  if (rate >= 0.4) return 55
  return 75
}

function getRiskLevel(score: number): RiskLevel {
  if (score >= 75) return 'critical'
  if (score >= 55) return 'high'
  if (score >= 30) return 'medium'
  return 'low'
}

function buildRiskFactors(scores: { attendance_score: number; academic_score: number; fee_score: number; engagement_score: number }): RiskFactor[] {
  const factors: RiskFactor[] = [
    { factor: 'attendance', score: scores.attendance_score, weight: 0.35, detail: `Attendance score: ${scores.attendance_score}/100` },
    { factor: 'academic', score: scores.academic_score, weight: 0.3, detail: `Academic score: ${scores.academic_score}/100` },
    { factor: 'fee', score: scores.fee_score, weight: 0.2, detail: `Fee score: ${scores.fee_score}/100` },
    { factor: 'engagement', score: scores.engagement_score, weight: 0.15, detail: `Engagement score: ${scores.engagement_score}/100` },
  ]
  return factors.filter((f) => f.score > 30).sort((a, b) => b.score - a.score)
}

export async function computeRiskScoresBatch(schoolId: string, academicYearId: string): Promise<{ computed: number; duration_ms: number }> {
  const startTime = Date.now()
  const supabase = await createServerClient()
  const sixtyDaysAgo = new Date('2025-06-01').toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date('2025-06-01').toISOString()

  const { data: enrollmentsData } = await supabase.from('enrollments').select('student_id, section_id, class_id').eq('school_id', schoolId).eq('academic_year_id', academicYearId).eq('status', 'active')
  const enrollments = safe.array<Record<string, unknown>>(enrollmentsData)
  const studentIds = Array.from(new Set(enrollments.map((r) => safe.string(r.student_id)).filter(Boolean)))

  const [attendanceRes, resultsRes, feeRes, hwRes] = await Promise.all([
    supabase.from('attendance').select('student_id, date, status').eq('school_id', schoolId).gte('date', sixtyDaysAgo),
    supabase.from('results').select('student_id, marks_obtained, max_marks, is_pass, exam_id').eq('school_id', schoolId),
    supabase.from('fee_invoices').select('student_id, outstanding, net_amount, due_date, status').eq('school_id', schoolId).eq('academic_year_id', academicYearId).neq('status', 'cancelled'),
    supabase.from('homework_submissions').select('student_id, status, created_at').eq('school_id', schoolId).gte('created_at', thirtyDaysAgo),
  ])

  const attendanceRows = safe.array<Record<string, unknown>>(attendanceRes.data)
  const resultsRows = safe.array<Record<string, unknown>>(resultsRes.data)
  const feeRows = safe.array<Record<string, unknown>>(feeRes.data)
  const homeworkRows = safe.array<Record<string, unknown>>(hwRes.data)

  const { data: previousData } = await supabase.from('student_risk_scores').select('student_id, composite_risk_score').eq('school_id', schoolId).eq('academic_year_id', academicYearId)
  const previousMap = new Map<string, number>()
  safe.array<Record<string, unknown>>(previousData).forEach((r) => previousMap.set(safe.string(r.student_id), safe.number(r.composite_risk_score)))

  const nowIso = new Date().toISOString()
  const records = studentIds.map((studentId) => {
    const attendance_score = computeAttendanceScore(studentId, attendanceRows)
    const academic_score = computeAcademicScore(studentId, resultsRows)
    const fee_score = computeFeeScore(studentId, feeRows)
    const engagement_score = computeEngagementScore(studentId, homeworkRows)
    const composite = attendance_score * 0.35 + academic_score * 0.3 + fee_score * 0.2 + engagement_score * 0.15
    const previous = previousMap.has(studentId) ? safe.number(previousMap.get(studentId), 0) : null
    const delta = previous === null ? null : composite - previous
    const level = getRiskLevel(composite)
    const trend = delta !== null && delta > 5 ? 'declining' : delta !== null && delta < -5 ? 'improving' : composite > 75 ? 'critical' : 'stable'
    return {
      school_id: schoolId,
      student_id: studentId,
      academic_year_id: academicYearId,
      attendance_score,
      academic_score,
      fee_score,
      engagement_score,
      composite_risk_score: Math.round(composite * 100) / 100,
      risk_level: level,
      risk_factors: buildRiskFactors({ attendance_score, academic_score, fee_score, engagement_score }),
      previous_score: previous,
      score_delta: delta === null ? null : Math.round(delta * 100) / 100,
      trend,
      projected_score_30d: Math.round((composite + (delta ?? 0) * 2) * 100) / 100,
      intervention_window_days: level === 'critical' ? 7 : level === 'high' ? 14 : level === 'medium' ? 30 : null,
      computed_at: nowIso,
    }
  })

  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50)
    await supabase.from('student_risk_scores').upsert(batch, { onConflict: 'student_id,academic_year_id' })
  }

  const duration_ms = Date.now() - startTime
  console.log(`[RISK] Computed ${studentIds.length} scores in ${duration_ms}ms`)
  return { computed: studentIds.length, duration_ms }
}

export async function getRiskScoresForRole(params: RiskQueryParams): Promise<StudentRiskScore[]> {
  const supabase = await createServerClient()
  let query = supabase.from('student_risk_scores').select('*, students!inner(full_name, admission_no)').eq('school_id', params.schoolId).eq('academic_year_id', params.academicYearId).order('composite_risk_score', { ascending: false })

  if (params.role === 'teacher') {
    const sectionIds = safe.array<string>(params.sectionIds)
    if (sectionIds.length > 0) {
      const { data: enrollments } = await supabase.from('enrollments').select('student_id').eq('school_id', params.schoolId).eq('academic_year_id', params.academicYearId).in('section_id', sectionIds)
      const studentIds = safe.array<Record<string, unknown>>(enrollments).map((r) => safe.string(r.student_id)).filter(Boolean)
      query = query.in('student_id', studentIds.length > 0 ? studentIds : [''])
    }
  }

  if (params.role === 'parent') {
    const childIds = await getParentChildIds(params.userId, params.schoolId)
    query = query.in('student_id', childIds.length > 0 ? childIds : [''])
  }

  if (params.role === 'accountant') {
    query = supabase.from('student_risk_scores').select('student_id, fee_score, school_id, academic_year_id, computed_at').eq('school_id', params.schoolId).eq('academic_year_id', params.academicYearId).order('fee_score', { ascending: false })
  }

  const { data } = await query
  const rows = safe.array<Record<string, unknown>>(data)
  return rows.map((r) => ({
    student_id: safe.string(r.student_id),
    attendance_score: safe.number(r.attendance_score),
    academic_score: safe.number(r.academic_score),
    fee_score: safe.number(r.fee_score),
    engagement_score: safe.number(r.engagement_score),
    composite_risk_score: safe.number(r.composite_risk_score),
    risk_level: (['low', 'medium', 'high', 'critical'].includes(safe.string(r.risk_level)) ? safe.string(r.risk_level) : 'low') as RiskLevel,
    risk_factors: safe.array<RiskFactor>(r.risk_factors),
    previous_score: r.previous_score === null ? null : safe.number(r.previous_score),
    score_delta: r.score_delta === null ? null : safe.number(r.score_delta),
    trend: (['improving', 'stable', 'declining', 'critical'].includes(safe.string(r.trend)) ? safe.string(r.trend) : null) as 'improving' | 'stable' | 'declining' | 'critical' | null,
    projected_score_30d: r.projected_score_30d === null ? null : safe.number(r.projected_score_30d),
    intervention_window_days: r.intervention_window_days === null ? null : safe.number(r.intervention_window_days),
    computed_at: safe.string(r.computed_at),
  }))
}
