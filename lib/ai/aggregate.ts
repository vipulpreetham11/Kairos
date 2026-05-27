import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import type { AggregateParams, AggregatedMetrics } from '@/types/metrics'
import type { RiskFactor, RiskLevel } from '@/types/ai'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getRows(value: unknown): Record<string, unknown>[] {
  return safe.array<unknown>(value).filter(isRecord)
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86400000)
}

function parseRiskLevel(value: unknown): RiskLevel {
  const level = safe.string(value)
  if (level === 'critical' || level === 'high' || level === 'medium' || level === 'low') return level
  return 'low'
}

function parseRiskFactorType(value: unknown): RiskFactor['factor'] {
  const factor = safe.string(value)
  if (factor === 'attendance' || factor === 'academic' || factor === 'fee' || factor === 'engagement') return factor
  return 'attendance'
}

export async function aggregateSchoolData(params: AggregateParams): Promise<AggregatedMetrics> {
  const supabase = await createServerClient()
  const fromDate = params.dateRange.from.toISOString().slice(0, 10)
  const toDate = params.dateRange.to.toISOString().slice(0, 10)
  const now = Date.now()
  const [attendance, fees, academic, engagement, riskSummary] = await Promise.all([
    (async () => {
      try {
        let q = supabase.from('attendance').select('student_id, section_id, date, status').eq('school_id', params.schoolId).eq('academic_year_id', params.academicYearId).gte('date', fromDate).lte('date', toDate)
        if (params.role === 'teacher' && safe.array<string>(params.sectionIds).length > 0) q = q.in('section_id', safe.array<string>(params.sectionIds))
        if (params.role === 'parent' && safe.string(params.studentId)) q = q.eq('student_id', safe.string(params.studentId))
        const { data } = await q
        const rows = getRows(data)
        const byDay = new Map<string, { total: number; present: number }>()
        const byStudent = new Map<string, { total: number; present: number }>()
        const bySection = new Map<string, { recentT: number; recentP: number; priorT: number; priorP: number }>()
        rows.forEach((r) => {
          const date = safe.string(r.date).slice(0, 10)
          const studentId = safe.string(r.student_id)
          const sectionId = safe.string(r.section_id)
          const status = safe.string(r.status).toLowerCase()
          const present = status === 'present' || status === 'late' ? 1 : 0
          const day = byDay.get(date) ?? { total: 0, present: 0 }; day.total += 1; day.present += present; byDay.set(date, day)
          const stu = byStudent.get(studentId) ?? { total: 0, present: 0 }; stu.total += 1; stu.present += present; byStudent.set(studentId, stu)
          const age = Math.floor((now - new Date(date).getTime()) / 86400000)
          const sec = bySection.get(sectionId) ?? { recentT: 0, recentP: 0, priorT: 0, priorP: 0 }
          if (age <= 7) { sec.recentT += 1; sec.recentP += present } else if (age <= 14) { sec.priorT += 1; sec.priorP += present }
          bySection.set(sectionId, sec)
        })
        const total = rows.length
        const present = rows.reduce((sum, r) => sum + (['present', 'late'].includes(safe.string(r.status).toLowerCase()) ? 1 : 0), 0)
        const trend_labels: string[] = []
        const trend: number[] = []
        for (let i = 29; i >= 0; i -= 1) {
          const key = dayKey(daysAgo(i))
          trend_labels.push(key)
          const day = byDay.get(key)
          trend.push(day && day.total > 0 ? Math.round((day.present / day.total) * 100) : 0)
        }
        const chronic_absentees = Array.from(byStudent.values()).filter((s) => s.total > 0 && (s.present / s.total) * 100 < 60).length
        const anomalous_sections = Array.from(bySection.entries()).map(([section_id, sec]) => {
          const recent = sec.recentT > 0 ? (sec.recentP / sec.recentT) * 100 : 100
          const prior = sec.priorT > 0 ? (sec.priorP / sec.priorT) * 100 : 100
          const drop = Math.max(prior - recent, 0)
          return { section_id, section_name: section_id, drop_percentage: Math.round(drop * 10) / 10, days_declining: drop > 10 ? 7 : 0 }
        }).filter((s) => s.drop_percentage > 10)
        return { overall_rate: total > 0 ? (present / total) * 100 : 0, trend, trend_labels, chronic_absentees, anomalous_sections }
      } catch (error) {
        console.error('[aggregate.attendance]', error)
        return { overall_rate: 0, trend: [], trend_labels: [], chronic_absentees: 0, anomalous_sections: [] }
      }
    })(),
    (async () => {
      try {
        let invQ = supabase.from('fee_invoices').select('outstanding, net_amount, due_date, status, student_id').eq('school_id', params.schoolId).eq('academic_year_id', params.academicYearId).neq('status', 'cancelled')
        if (params.role === 'parent' && safe.string(params.studentId)) invQ = invQ.eq('student_id', safe.string(params.studentId))
        const [invoiceRes, paymentRes] = await Promise.all([invQ, supabase.from('fee_payments').select('amount, payment_date').eq('school_id', params.schoolId).gte('payment_date', fromDate)])
        const invoices = getRows(invoiceRes.data)
        const payments = getRows(paymentRes.data)
        const target = Math.round(invoices.reduce((s, r) => s + safe.number(r.net_amount), 0))
        const total_outstanding = Math.round(invoices.reduce((s, r) => s + safe.number(r.outstanding), 0))
        const collected = target - total_outstanding
        const collection_rate = target > 0 ? ((collected / target) * 100) : 0
        const overdue_buckets = { '0-30': { count: 0, amount: 0 }, '31-60': { count: 0, amount: 0 }, '61-90': { count: 0, amount: 0 }, '90+': { count: 0, amount: 0 } }
        let high_risk_count = 0
        invoices.forEach((r) => {
          const outstanding = safe.number(r.outstanding)
          if (outstanding <= 0) return
          const due = safe.date(r.due_date)
          if (!due) return
          const days = Math.floor((now - due.getTime()) / 86400000)
          if (days > 0 && days <= 30) { overdue_buckets['0-30'].count += 1; overdue_buckets['0-30'].amount += outstanding }
          else if (days <= 60) { overdue_buckets['31-60'].count += 1; overdue_buckets['31-60'].amount += outstanding }
          else if (days <= 90) { overdue_buckets['61-90'].count += 1; overdue_buckets['61-90'].amount += outstanding }
          else if (days > 90) { overdue_buckets['90+'].count += 1; overdue_buckets['90+'].amount += outstanding }
          if (days > 0 && days <= 60) high_risk_count += 1
        })
        const byDay = new Map<string, number>()
        payments.forEach((r) => {
          const key = safe.string(r.payment_date).slice(0, 10)
          byDay.set(key, safe.number(byDay.get(key), 0) + safe.number(r.amount))
        })
        const daily_collection_trend: number[] = []
        for (let i = 29; i >= 0; i -= 1) daily_collection_trend.push(Math.round(safe.number(byDay.get(dayKey(daysAgo(i))), 0)))
        const avg = daily_collection_trend.reduce((a, b) => a + b, 0) / 30
        return { total_outstanding, collection_rate, target, collected, forecast_30d: Math.round(collected + avg * 30), forecast_60d: Math.round(collected + avg * 60), high_risk_count, overdue_buckets, daily_collection_trend }
      } catch (error) {
        console.error('[aggregate.fees]', error)
        return { total_outstanding: 0, collection_rate: 0, target: 0, collected: 0, forecast_30d: 0, forecast_60d: 0, high_risk_count: 0, overdue_buckets: { '0-30': { count: 0, amount: 0 }, '31-60': { count: 0, amount: 0 }, '61-90': { count: 0, amount: 0 }, '90+': { count: 0, amount: 0 } }, daily_collection_trend: [] }
      }
    })(),
    (async () => {
      try {
        const { data } = await supabase.from('results').select('student_id, subject_id, marks_obtained, max_marks, is_pass').eq('school_id', params.schoolId)
        const rows = getRows(data)
        let totalPct = 0
        let passCount = 0
        const subjectMap = new Map<string, { sum: number; count: number; pass: number; fail: number }>()
        const studentMap = new Map<string, number[]>()
        rows.forEach((r) => {
          const marks = safe.number(r.marks_obtained)
          const max = Math.max(safe.number(r.max_marks), 1)
          const pct = (marks / max) * 100
          totalPct += pct
          if (r.is_pass === true) passCount += 1
          const subjectId = safe.string(r.subject_id)
          const subject = subjectMap.get(subjectId) ?? { sum: 0, count: 0, pass: 0, fail: 0 }
          subject.sum += pct; subject.count += 1; if (r.is_pass === true) subject.pass += 1; else subject.fail += 1; subjectMap.set(subjectId, subject)
          const studentId = safe.string(r.student_id)
          const scores = studentMap.get(studentId) ?? []
          scores.push(pct)
          studentMap.set(studentId, scores)
        })
        const students = Array.from(studentMap.values()).map((scores) => scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1))
        const declining_students = Array.from(studentMap.values()).filter((s) => s.length >= 2 && s[s.length - 1] < s[s.length - 2] - 10).length
        const subject_averages = Array.from(subjectMap.entries()).map(([subject_id, v]) => ({ subject_id, subject_name: subject_id, average: v.count > 0 ? v.sum / v.count : 0, pass_rate: v.count > 0 ? (v.pass / v.count) * 100 : 0, fail_count: v.fail }))
        return { school_average: rows.length > 0 ? totalPct / rows.length : 0, pass_rate: rows.length > 0 ? (passCount / rows.length) * 100 : 0, subject_averages, declining_students, top_performers: students.filter((s) => s > 80).length, at_risk_students: students.filter((s) => s < 35).length }
      } catch (error) {
        console.error('[aggregate.academic]', error)
        return { school_average: 0, pass_rate: 0, subject_averages: [], declining_students: 0, top_performers: 0, at_risk_students: 0 }
      }
    })(),
    (async () => {
      try {
        let hwQ = supabase.from('homework_submissions').select('created_at, status, student_id').eq('school_id', params.schoolId)
        let diaryQ = supabase.from('class_diary').select('date, section_id, what_was_taught').eq('school_id', params.schoolId)
        if (params.role === 'teacher' && safe.array<string>(params.sectionIds).length > 0) { diaryQ = diaryQ.in('section_id', safe.array<string>(params.sectionIds)) }
        if (params.role === 'parent' && safe.string(params.studentId)) hwQ = hwQ.eq('student_id', safe.string(params.studentId))
        const [hwRes, diaryRes] = await Promise.all([hwQ, diaryQ])
        console.log('[HW_ERROR]', hwRes.error, 'count:', hwRes.data?.length)
        const hwRows = getRows(hwRes.data)
        console.log('[HW_DEBUG]', hwRows.length, 'rows fetched')
        const diaryRows = getRows(diaryRes.data)
        const completed = hwRows.filter((r) => safe.string(r.status).toLowerCase() === 'completed').length
        const homework_completion_rate = hwRows.length > 0 ? (completed / hwRows.length) * 100 : 0
        const filled = diaryRows.filter((r) => safe.string(r.what_was_taught).trim().length > 0).length
        const diary_fill_rate = diaryRows.length > 0 ? (filled / diaryRows.length) * 100 : 0
        const byDay = new Map<string, { total: number; complete: number }>()
        hwRows.forEach((r) => {
          const key = safe.string(r.date).slice(0, 10)
          const d = byDay.get(key) ?? { total: 0, complete: 0 }
          d.total += 1
          if (safe.string(r.status).toLowerCase() === 'completed') d.complete += 1
          byDay.set(key, d)
        })
        const last7Days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date()
          d.setDate(d.getDate() - (6 - i))
          return d.toISOString().split('T')[0]
        })

        const homework_trend = last7Days.map(day => {
          const dayRows = hwRows.filter(r =>
            safe.string(r.created_at, '').startsWith(day)
          )
          if (dayRows.length === 0) return 0
          const completed = dayRows.filter(r =>
            safe.string(r.status, '').toLowerCase() === 'completed'
          ).length
          return Math.round((completed / dayRows.length) * 100)
        })
        return { homework_completion_rate, diary_fill_rate, parent_response_rate: 0, homework_trend }
      } catch (error) {
        console.error('[aggregate.engagement]', error)
        return { homework_completion_rate: 0, diary_fill_rate: 0, parent_response_rate: 0, homework_trend: [] }
      }
    })(),
    (async () => {
      try {
        let q = supabase.from('student_risk_scores')
          .select('student_id, composite_risk_score, risk_level, risk_factors, trend, intervention_window_days')
          .eq('school_id', params.schoolId)
          .eq('academic_year_id', params.academicYearId)
          .order('composite_risk_score', { ascending: false })
          .limit(10)
        if (params.role === 'parent' && safe.string(params.studentId)) q = q.eq('student_id', safe.string(params.studentId))
        const { data } = await q
        const riskRows = getRows(data)
        const levelCount: Record<RiskLevel, number> = { critical: 0, high: 0, medium: 0, low: 0 }
        riskRows.forEach((r) => {
          const level = parseRiskLevel(r.risk_level)
          levelCount[level] += 1
        })
        // After getting riskRows, fetch student names
        const studentIds = riskRows.map(r => safe.string(r.student_id))
        const { data: studentsData } = await supabase
          .from('students')
          .select('id, full_name, admission_no')
          .in('id', studentIds)
          .eq('school_id', params.schoolId)

        interface StudentRow {
          id: string
          full_name: string
          admission_no: string
        }

        const studentsMap = new Map<string, StudentRow>(
          safe.array<StudentRow>(studentsData).map(s => [s.id, s])
        )

        const top_at_risk = riskRows.map(r => {
          const rawFactors = safe.array<unknown>(r.risk_factors)
          const risk_factors: RiskFactor[] = rawFactors.filter(isRecord).map((f) => ({
            factor: parseRiskFactorType(f.factor),
            score: safe.number(f.score),
            weight: safe.number(f.weight),
            detail: safe.string(f.detail),
          }))
          return {
            student_id: safe.string(r.student_id),
            student_name: studentsMap.get(safe.string(r.student_id))?.full_name ?? 'Unknown',
            admission_no: studentsMap.get(safe.string(r.student_id))?.admission_no ?? '',
            class_name: '',
            section_name: '',
            composite_risk_score: safe.number(r.composite_risk_score),
            risk_level: safe.string(r.risk_level, 'low') as RiskLevel,
            risk_factors,
            trend: safe.string(r.trend, 'stable'),
            intervention_window_days: r.intervention_window_days as number | null
          }
        })
        return { critical_count: levelCount.critical, high_count: levelCount.high, medium_count: levelCount.medium, low_count: levelCount.low, top_at_risk }
      } catch (error) {
        console.error('[aggregate.risk]', error)
        return { critical_count: 0, high_count: 0, medium_count: 0, low_count: 0, top_at_risk: [] }
      }
    })(),
  ])

  return {
    attendance,
    fees,
    academic,
    engagement,
    risk_summary: riskSummary,
    computed_at: new Date().toISOString(),
  }
}
