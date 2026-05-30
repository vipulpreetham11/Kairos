import Link from 'next/link'
import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'

type ClassEnrollRow = {
  id: string
  name: string
  display_order: number
  active: number
  dropped: number
  transferred: number
  total: number
}

type GenderRow = {
  gender: string | null
  count: number
}

type RiskRow = {
  risk_level: string
  count: number
}

type LeadRow = {
  status: string
  source: string
  count: number
}

const SOURCE_LABELS: Record<string, string> = {
  voice_call: 'Voice Call',
  website: 'Website',
  walkin: 'Walk-in',
  whatsapp: 'WhatsApp',
  referral: 'Referral',
}

export default async function OwnerEnrollmentPage() {
  const user = await requireRole(
    ['owner'] as unknown as Array<
      'owner' | 'principal' | 'teacher' | 'accountant' | 'parent'
    >
  )
  const supabase = await createServerClient()

  const [
    { data: classesRaw },
    { data: genderRaw },
    { data: riskRaw },
    { data: leadsRaw },
  ] = await Promise.all([
    // Q1 — Enrollment by class (classes + left join enrollments)
    supabase
      .from('classes')
      .select(`
        id,
        name,
        display_order,
        enrollments!left (
          status,
          school_id,
          academic_year_id
        )
      `)
      .eq('school_id', user.schoolId)
      .order('display_order'),

    // Q2 — Gender breakdown (active enrolled students)
    supabase
      .from('students')
      .select(`
        gender,
        enrollments!inner (
          school_id,
          academic_year_id,
          status
        )
      `)
      .eq('school_id', user.schoolId)
      .eq('is_deleted', false),

    // Q3 — Dropout risk summary
    supabase
      .from('student_risk_scores')
      .select('risk_level')
      .eq('school_id', user.schoolId),

    // Q4 — Admission leads pipeline
    supabase
      .from('admission_leads')
      .select('status, source')
      .eq('school_id', user.schoolId),
  ])

  // ── Compute class enrollment stats ──────────────────────────────────────
  const classStats: ClassEnrollRow[] = safe.array(classesRaw).map((c: any) => {
    const enrollments = safe.array(c.enrollments).filter(
      (e: any) =>
        e.school_id === user.schoolId &&
        e.academic_year_id === (user.academicYearId || '')
    )
    const active = enrollments.filter((e: any) => e.status === 'active').length
    const dropped = enrollments.filter((e: any) => e.status === 'dropped').length
    const transferred = enrollments.filter((e: any) => e.status === 'transferred').length
    return {
      id: safe.string(c.id),
      name: safe.string(c.name),
      display_order: safe.number(c.display_order),
      active,
      dropped,
      transferred,
      total: active + dropped + transferred,
    }
  })

  const totalActive = classStats.reduce((s, c) => s + c.active, 0)
  const totalDropped = classStats.reduce((s, c) => s + c.dropped, 0)
  const totalTransferred = classStats.reduce((s, c) => s + c.transferred, 0)
  const dropoutRate =
    totalActive + totalDropped > 0
      ? (totalDropped / (totalActive + totalDropped)) * 100
      : 0

  // ── Gender breakdown ─────────────────────────────────────────────────────
  const genderMap: Record<string, number> = { male: 0, female: 0, other: 0 }
  safe.array(genderRaw).forEach((s: any) => {
    const enrollments = safe.array(s.enrollments).filter(
      (e: any) =>
        e.school_id === user.schoolId &&
        e.academic_year_id === (user.academicYearId || '') &&
        e.status === 'active'
    )
    if (enrollments.length === 0) return
    const g = (s.gender as string | null)?.toLowerCase() ?? 'other'
    const key = g === 'male' || g === 'female' ? g : 'other'
    genderMap[key] = (genderMap[key] ?? 0) + 1
  })
  const totalGendered = genderMap.male + genderMap.female + genderMap.other

  // ── Risk distribution ────────────────────────────────────────────────────
  const riskMap: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  }
  safe.array(riskRaw).forEach((r: any) => {
    const rl = safe.string(r.risk_level).toLowerCase()
    if (rl in riskMap) riskMap[rl]++
  })

  // ── Leads pipeline ───────────────────────────────────────────────────────
  const stageOrder = ['new', 'contacted', 'visited', 'enrolled', 'lost']
  const stageMap: Record<string, number> = {}
  const sourceConvMap: Record<string, { total: number; converted: number }> = {}

  safe.array(leadsRaw).forEach((l: any) => {
    const status = safe.string(l.status)
    const source = safe.string(l.source)
    stageMap[status] = (stageMap[status] ?? 0) + 1
    if (!sourceConvMap[source]) sourceConvMap[source] = { total: 0, converted: 0 }
    sourceConvMap[source].total++
    if (status === 'enrolled') sourceConvMap[source].converted++
  })

  const totalLeads = safe.array(leadsRaw).length
  const enrolledLeads = stageMap['enrolled'] ?? 0
  const lostLeads = stageMap['lost'] ?? 0
  const activePipelineLeads = totalLeads - enrolledLeads - lostLeads
  const conversionRate =
    totalLeads > 0 ? (enrolledLeads / totalLeads) * 100 : 0

  // Stage colors
  const stageColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700 border-blue-200',
    contacted: 'bg-blue-200 text-blue-800 border-blue-300',
    visited: 'bg-blue-300 text-blue-900 border-blue-400',
    enrolled: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    lost: 'bg-red-100 text-red-700 border-red-200',
  }

  const stageBarColors: Record<string, string> = {
    new: 'bg-blue-200',
    contacted: 'bg-blue-400',
    visited: 'bg-blue-500',
    enrolled: 'bg-emerald-500',
    lost: 'bg-red-400',
  }

  return (
    <div className="space-y-6 p-6">
      {/* HEADER */}
      <div>
        <Link
          href="/owner"
          className="mb-2 inline-flex items-center text-xs text-slate-500 hover:text-slate-700"
        >
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Enrollment</h1>
        <p className="text-sm text-slate-500">
          Enrollment health and admissions pipeline
        </p>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Enrolled</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalActive}</p>
          <p className="mt-1 text-xs text-slate-400">Active students</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Dropped This Year</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              totalDropped > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {totalDropped}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {totalTransferred} transferred
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Dropout Rate</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              dropoutRate > 5
                ? 'text-red-600'
                : dropoutRate > 2
                ? 'text-amber-600'
                : 'text-emerald-600'
            }`}
          >
            {dropoutRate.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-slate-400">of enrolled students</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Lead Pipeline</p>
          <p className="mt-1 text-2xl font-semibold text-blue-600">
            {activePipelineLeads}
          </p>
          <p className="mt-1 text-xs text-slate-400">active prospects</p>
        </div>
      </div>

      {/* CLASS-WISE TABLE + GENDER */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Class Table */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Enrollment by Class
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Class</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Active</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Dropped</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Transferred</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Total</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 w-24">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classStats.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                      No class data found.
                    </td>
                  </tr>
                ) : (
                  classStats.map((cls) => {
                    const fillPct = cls.total > 0 ? (cls.active / cls.total) * 100 : 0
                    return (
                      <tr key={cls.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">{cls.name}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {cls.active}
                        </td>
                        <td
                          className={`px-4 py-3 text-right ${
                            cls.dropped > 0
                              ? 'font-semibold text-red-600'
                              : 'text-slate-400'
                          }`}
                        >
                          {cls.dropped}
                        </td>
                        <td
                          className={`px-4 py-3 text-right ${
                            cls.transferred > 0
                              ? 'text-amber-600'
                              : 'text-slate-400'
                          }`}
                        >
                          {cls.transferred}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">{cls.total}</td>
                        <td className="px-4 py-3">
                          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full bg-blue-500 transition-all"
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Gender + Risk */}
        <div className="space-y-4">
          {/* Gender Distribution */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              Gender Distribution
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <p className="text-xs text-blue-500">Male</p>
                <p className="mt-1 text-xl font-semibold text-blue-700">
                  {genderMap.male}
                </p>
                <p className="text-xs text-blue-400">
                  {totalGendered > 0
                    ? ((genderMap.male / totalGendered) * 100).toFixed(1)
                    : '0'}
                  %
                </p>
              </div>
              <div className="rounded-lg bg-pink-50 p-3 text-center">
                <p className="text-xs text-pink-500">Female</p>
                <p className="mt-1 text-xl font-semibold text-pink-700">
                  {genderMap.female}
                </p>
                <p className="text-xs text-pink-400">
                  {totalGendered > 0
                    ? ((genderMap.female / totalGendered) * 100).toFixed(1)
                    : '0'}
                  %
                </p>
              </div>
            </div>
            {/* Ratio bar */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-pink-100">
              <div
                className="h-full bg-blue-400 transition-all"
                style={{
                  width:
                    totalGendered > 0
                      ? `${(genderMap.male / totalGendered) * 100}%`
                      : '50%',
                }}
              />
            </div>
            {genderMap.other > 0 && (
              <p className="mt-2 text-xs text-slate-400">
                {genderMap.other} other / unspecified
              </p>
            )}
          </div>

          {/* Risk Distribution */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">
              Enrollment Risk
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Students at risk of dropping out
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-red-100 bg-red-50 p-2 text-center">
                <p className="text-[10px] text-red-400 uppercase tracking-wide">Critical</p>
                <p className="text-lg font-semibold text-red-600">{riskMap.critical}</p>
              </div>
              <div className="rounded-lg border border-orange-100 bg-orange-50 p-2 text-center">
                <p className="text-[10px] text-orange-400 uppercase tracking-wide">High</p>
                <p className="text-lg font-semibold text-orange-600">{riskMap.high}</p>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-2 text-center">
                <p className="text-[10px] text-amber-400 uppercase tracking-wide">Medium</p>
                <p className="text-lg font-semibold text-amber-600">{riskMap.medium}</p>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2 text-center">
                <p className="text-[10px] text-emerald-400 uppercase tracking-wide">Low</p>
                <p className="text-lg font-semibold text-emerald-600">{riskMap.low}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Based on attendance, fees, and academic performance
            </p>
          </div>
        </div>
      </div>

      {/* ADMISSIONS PIPELINE */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Admissions Pipeline
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Conversion rate:{' '}
              <span className="font-semibold text-slate-700">
                {conversionRate.toFixed(1)}%
              </span>
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {totalLeads} total leads
          </span>
        </div>

        {totalLeads === 0 ? (
          <div className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-400">
            No admission leads found.
          </div>
        ) : (
          <>
            {/* Funnel */}
            <div className="mb-6 space-y-2">
              {stageOrder.map((stage) => {
                const count = stageMap[stage] ?? 0
                const pct = totalLeads > 0 ? (count / totalLeads) * 100 : 0
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <div className="w-20 shrink-0 text-right">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium border ${
                          stageColors[stage] ?? 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        {stage.charAt(0).toUpperCase() + stage.slice(1)}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="h-6 w-full overflow-hidden rounded-md bg-slate-100">
                        <div
                          className={`h-full transition-all ${
                            stageBarColors[stage] ?? 'bg-slate-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-20 shrink-0 text-right">
                      <span className="text-sm font-semibold text-slate-700">
                        {count}
                      </span>
                      <span className="ml-1 text-xs text-slate-400">
                        ({pct.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Source breakdown */}
            <h3 className="mb-2 text-xs font-semibold text-slate-700 uppercase tracking-wide">
              By Source
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-600">
                      Source
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-600">
                      Leads
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-600">
                      Converted
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-600">
                      Rate
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(sourceConvMap)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([src, stats]) => {
                      const rate =
                        stats.total > 0
                          ? (stats.converted / stats.total) * 100
                          : 0
                      return (
                        <tr
                          key={src}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-4 py-2 font-medium text-slate-900">
                            {SOURCE_LABELS[src] ?? src}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-600">
                            {stats.total}
                          </td>
                          <td className="px-4 py-2 text-right text-emerald-600 font-medium">
                            {stats.converted}
                          </td>
                          <td
                            className={`px-4 py-2 text-right font-semibold ${
                              rate > 30
                                ? 'text-emerald-600'
                                : rate > 15
                                ? 'text-amber-600'
                                : 'text-red-600'
                            }`}
                          >
                            {rate.toFixed(1)}%
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
