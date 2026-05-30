import Link from 'next/link'
import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import { rupees, formatDate } from '@/lib/utils/format'

export default async function AccountantCollectionsPage() {
  const user = await requireRole(
    ['accountant'] as unknown as Array<
      'owner' | 'principal' | 'teacher' | 'accountant' | 'parent'
    >
  )
  const supabase = await createServerClient()

  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const [
    { data: todayRaw },
    { data: weekRaw },
    { data: headInvoicesRaw },
    { data: classInvoicesRaw },
    { data: recentRaw },
  ] = await Promise.all([
    // Q1 — Today's payments
    supabase
      .from('fee_payments')
      .select('amount')
      .eq('school_id', user.schoolId)
      .eq('payment_date', today)
      .eq('status', 'active'),

    // Q2 — This week's payments (with mode)
    supabase
      .from('fee_payments')
      .select('payment_date, amount, payment_mode')
      .eq('school_id', user.schoolId)
      .eq('status', 'active')
      .gte('payment_date', sevenDaysAgo)
      .order('payment_date', { ascending: false }),

    // Q3 — Fee invoices with fee head
    supabase
      .from('fee_invoices')
      .select(`
        id,
        net_amount,
        amount_paid,
        outstanding,
        status,
        fee_heads!inner ( id, name )
      `)
      .eq('school_id', user.schoolId)
      .eq('academic_year_id', user.academicYearId || ''),

    // Q4 — Fee invoices with class via enrollments
    supabase
      .from('fee_invoices')
      .select(`
        student_id,
        net_amount,
        amount_paid,
        outstanding,
        enrollments!inner (
          class_id,
          academic_year_id,
          school_id,
          classes!inner ( id, name, display_order )
        )
      `)
      .eq('school_id', user.schoolId)
      .eq('academic_year_id', user.academicYearId || ''),

    // Q5 — Recent 10 payments with student info
    supabase
      .from('fee_payments')
      .select(`
        id,
        amount,
        payment_mode,
        payment_date,
        receipt_number,
        students!inner ( full_name, admission_no )
      `)
      .eq('school_id', user.schoolId)
      .eq('status', 'active')
      .order('payment_date', { ascending: false })
      .limit(10),
  ])

  // ── Q1: Today ──────────────────────────────────────────────────────────
  const todayPayments = safe.array(todayRaw)
  const todayTotal = todayPayments.reduce(
    (s: number, p: any) => s + safe.number(p.amount),
    0
  )
  const todayCount = todayPayments.length

  // ── Q2: Week activity ─────────────────────────────────────────────────
  // Build a map: date → { cash, upi, cheque, total }
  type DayStats = { cash: number; upi: number; cheque: number; total: number }
  const weekMap = new Map<string, DayStats>()

  // Seed all 7 days including today
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]
    weekMap.set(d, { cash: 0, upi: 0, cheque: 0, total: 0 })
  }

  safe.array(weekRaw).forEach((p: any) => {
    const date = safe.string(p.payment_date)
    const mode = safe.string(p.payment_mode).toLowerCase() as
      | 'cash'
      | 'upi'
      | 'cheque'
    const amt = safe.number(p.amount)
    if (!weekMap.has(date)) return
    const day = weekMap.get(date)!
    if (mode === 'cash' || mode === 'upi' || mode === 'cheque') day[mode] += amt
    day.total += amt
  })

  const weekEntries = Array.from(weekMap.entries()).sort((a, b) =>
    b[0].localeCompare(a[0])
  )
  const weekTotal = weekEntries.reduce((s, [, d]) => s + d.total, 0)
  const weekColTotals = weekEntries.reduce(
    (acc, [, d]) => ({
      cash: acc.cash + d.cash,
      upi: acc.upi + d.upi,
      cheque: acc.cheque + d.cheque,
      total: acc.total + d.total,
    }),
    { cash: 0, upi: 0, cheque: 0, total: 0 }
  )

  // ── Q3: Fee head aggregation ───────────────────────────────────────────
  const headMap = new Map<
    string,
    {
      name: string
      total_invoices: number
      paid_count: number
      total_due: number
      total_paid: number
      total_outstanding: number
    }
  >()

  safe.array(headInvoicesRaw).forEach((inv: any) => {
    const head = inv.fee_heads
    if (!head) return
    const hid = safe.string(head.id)
    if (!headMap.has(hid)) {
      headMap.set(hid, {
        name: safe.string(head.name),
        total_invoices: 0,
        paid_count: 0,
        total_due: 0,
        total_paid: 0,
        total_outstanding: 0,
      })
    }
    const h = headMap.get(hid)!
    h.total_invoices++
    h.total_due += safe.number(inv.net_amount)
    h.total_paid += safe.number(inv.amount_paid)
    h.total_outstanding += safe.number(inv.outstanding)
    if (safe.string(inv.status) === 'paid') h.paid_count++
  })

  const headStats = Array.from(headMap.values()).sort((a, b) => {
    const rateA = a.total_due > 0 ? a.total_paid / a.total_due : 0
    const rateB = b.total_due > 0 ? b.total_paid / b.total_due : 0
    return rateA - rateB // worst first
  })

  // ── Q4: Class aggregation ──────────────────────────────────────────────
  const classMap = new Map<
    string,
    {
      name: string
      display_order: number
      total_due: number
      total_paid: number
      total_outstanding: number
      student_ids: Set<string>
      defaulter_ids: Set<string>
    }
  >()

  safe.array(classInvoicesRaw).forEach((inv: any) => {
    const enrollment = safe.array(inv.enrollments)[0] as any
    if (!enrollment) return
    if (
      enrollment.school_id !== user.schoolId ||
      enrollment.academic_year_id !== (user.academicYearId || '')
    )
      return
    const cls = enrollment.classes
    if (!cls) return
    const cid = safe.string(cls.id)
    if (!classMap.has(cid)) {
      classMap.set(cid, {
        name: safe.string(cls.name),
        display_order: safe.number(cls.display_order),
        total_due: 0,
        total_paid: 0,
        total_outstanding: 0,
        student_ids: new Set(),
        defaulter_ids: new Set(),
      })
    }
    const c = classMap.get(cid)!
    c.total_due += safe.number(inv.net_amount)
    c.total_paid += safe.number(inv.amount_paid)
    c.total_outstanding += safe.number(inv.outstanding)
    c.student_ids.add(safe.string(inv.student_id))
    if (safe.number(inv.outstanding) > 0) {
      c.defaulter_ids.add(safe.string(inv.student_id))
    }
  })

  const classStats = Array.from(classMap.entries())
    .map(([, c]) => ({
      ...c,
      student_count: c.student_ids.size,
      defaulter_count: c.defaulter_ids.size,
    }))
    .sort((a, b) => a.display_order - b.display_order)

  // ── Global KPIs ────────────────────────────────────────────────────────
  const totalDue = headStats.reduce((s, h) => s + h.total_due, 0)
  const totalPaid = headStats.reduce((s, h) => s + h.total_paid, 0)
  const totalOutstanding = headStats.reduce((s, h) => s + h.total_outstanding, 0)
  const overallRate = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0

  const rateColor = (r: number) =>
    r > 80 ? 'text-emerald-600' : r > 60 ? 'text-amber-600' : 'text-red-600'
  const rateFill = (r: number) =>
    r > 80 ? 'bg-emerald-500' : r > 60 ? 'bg-amber-500' : 'bg-red-500'

  const modeBadge: Record<string, string> = {
    cash: 'bg-green-100 text-green-700',
    upi: 'bg-blue-100 text-blue-700',
    cheque: 'bg-amber-100 text-amber-700',
  }

  return (
    <div className="space-y-6 p-6">
      {/* HEADER */}
      <div>
        <Link
          href="/accountant"
          className="mb-2 inline-flex items-center text-xs text-slate-500 hover:text-slate-700"
        >
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Collections</h1>
        <p className="text-sm text-slate-500">
          Real-time fee collection tracking
        </p>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Today&apos;s Collection</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">
            {rupees.short(todayTotal)}
          </p>
          <p className="mt-1 text-xs text-slate-400">{todayCount} payments</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">This Week</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {rupees.short(weekTotal)}
          </p>
          <p className="mt-1 text-xs text-slate-400">Last 7 days</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Overall Rate</p>
          <p className={`mt-1 text-2xl font-semibold ${rateColor(overallRate)}`}>
            {overallRate.toFixed(1)}%
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full transition-all ${rateFill(overallRate)}`}
              style={{ width: `${Math.min(overallRate, 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Outstanding</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              totalOutstanding > 0 ? 'text-red-600' : 'text-emerald-600'
            }`}
          >
            {rupees.short(totalOutstanding)}
          </p>
          <p className="mt-1 text-xs text-slate-400">Pending collection</p>
        </div>
      </div>

      {/* THIS WEEK ACTIVITY */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          This Week&apos;s Collections
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Cash</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">UPI</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Cheque</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Daily Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {weekEntries.map(([date, stats]) => {
                const isToday = date === today
                return (
                  <tr
                    key={date}
                    className={`transition-colors ${
                      isToday
                        ? 'bg-blue-50 font-semibold'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-4 py-3 text-slate-700">
                      {formatDate(date)}
                      {isToday && (
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Today
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {stats.cash > 0 ? rupees.short(stats.cash) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {stats.upi > 0 ? rupees.short(stats.upi) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {stats.cheque > 0 ? rupees.short(stats.cheque) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {stats.total > 0 ? rupees.short(stats.total) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 bg-slate-50">
              <tr className="font-bold">
                <td className="px-4 py-3 text-slate-900">Total</td>
                <td className="px-4 py-3 text-right text-slate-900">
                  {rupees.short(weekColTotals.cash)}
                </td>
                <td className="px-4 py-3 text-right text-slate-900">
                  {rupees.short(weekColTotals.upi)}
                </td>
                <td className="px-4 py-3 text-right text-slate-900">
                  {rupees.short(weekColTotals.cheque)}
                </td>
                <td className="px-4 py-3 text-right text-slate-900">
                  {rupees.short(weekColTotals.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* CLASS-WISE COLLECTION */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Class-wise Collection
        </h2>
        {classStats.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No class data found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Class</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">Students</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">Defaulters</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Total Due</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Collected</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Outstanding</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 w-28">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classStats.map((cls) => {
                  const rate =
                    cls.total_due > 0 ? (cls.total_paid / cls.total_due) * 100 : 0
                  return (
                    <tr key={cls.name} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">{cls.name}</td>
                      <td className="px-4 py-3 text-center text-slate-600">
                        {cls.student_count}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {cls.defaulter_count > 0 ? (
                          <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            {cls.defaulter_count}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            0
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {rupees.short(cls.total_due)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600">
                        {rupees.short(cls.total_paid)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          cls.total_outstanding > 0 ? 'text-red-600' : 'text-slate-400'
                        }`}
                      >
                        {rupees.short(cls.total_outstanding)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full transition-all ${rateFill(rate)}`}
                              style={{ width: `${Math.min(rate, 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-semibold ${rateColor(rate)}`}>
                            {rate.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FEE HEAD PERFORMANCE */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">
          Fee Head Performance
        </h2>
        {headStats.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No fee head data.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {headStats.map((h) => {
              const rate = h.total_due > 0 ? (h.total_paid / h.total_due) * 100 : 0
              return (
                <div
                  key={h.name}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-semibold text-slate-900 text-sm">{h.name}</p>
                    <span
                      className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        rate > 80
                          ? 'bg-emerald-100 text-emerald-700'
                          : rate > 60
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {rate.toFixed(0)}%
                    </span>
                  </div>
                  <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full transition-all ${rateFill(rate)}`}
                      style={{ width: `${Math.min(rate, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    {rupees.short(h.total_paid)} collected of{' '}
                    {rupees.short(h.total_due)} total
                  </p>
                  {h.total_outstanding > 0 && (
                    <p className="mt-0.5 text-xs text-red-500">
                      {rupees.short(h.total_outstanding)} outstanding
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* RECENT PAYMENTS */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">
          Recent Payments
        </h2>
        <p className="mb-4 text-xs text-slate-500">Last 10 transactions</p>
        {safe.array(recentRaw).length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No payments recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Receipt</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Student</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Amount</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">Mode</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {safe.array(recentRaw).map((p: any) => {
                  const student = p.students
                  const mode = safe.string(p.payment_mode).toLowerCase()
                  return (
                    <tr key={safe.string(p.id)} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-slate-500">
                          {safe.string(p.receipt_number) || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {student ? safe.string(student.full_name) : '—'}
                        </p>
                        {student && safe.string(student.admission_no) && (
                          <span className="mt-0.5 inline-flex rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                            {safe.string(student.admission_no)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600">
                        {rupees.format(safe.number(p.amount))}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            modeBadge[mode] ?? 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {mode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {safe.string(p.payment_date)
                          ? formatDate(safe.string(p.payment_date))
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
