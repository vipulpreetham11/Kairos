import Link from 'next/link'
import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import { rupees, formatDate } from '@/lib/utils/format'
import { ChartWrapper } from '@/components/shared/chart-wrapper'

export default async function OwnerFeesPage() {
  const user = await requireRole(
    ['owner'] as unknown as Array<
      'owner' | 'principal' | 'teacher' | 'accountant' | 'parent'
    >
  )
  const supabase = await createServerClient()

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const [
    { data: invoicesRaw },
    { data: headInvoicesRaw },
    { data: dailyPaymentsRaw },
    { data: modePaymentsRaw },
    { data: defaulterInvoicesRaw },
  ] = await Promise.all([
    // Q1 — invoices with term info
    supabase
      .from('fee_invoices')
      .select(`
        id,
        net_amount,
        amount_paid,
        outstanding,
        status,
        fee_terms!inner (
          id,
          name,
          due_date,
          order_index
        )
      `)
      .eq('school_id', user.schoolId)
      .eq('academic_year_id', user.academicYearId || ''),

    // Q2 — invoices with fee head info
    supabase
      .from('fee_invoices')
      .select(`
        net_amount,
        amount_paid,
        outstanding,
        fee_heads!inner (
          id,
          name
        )
      `)
      .eq('school_id', user.schoolId)
      .eq('academic_year_id', user.academicYearId || ''),

    // Q3 — daily payments last 30 days
    supabase
      .from('fee_payments')
      .select('payment_date, amount')
      .eq('school_id', user.schoolId)
      .eq('status', 'active')
      .gte('payment_date', thirtyDaysAgo)
      .order('payment_date', { ascending: true }),

    // Q4 — payment mode breakdown
    supabase
      .from('fee_payments')
      .select('payment_mode, amount')
      .eq('school_id', user.schoolId)
      .eq('status', 'active'),

    // Q5 — defaulters: invoices with outstanding > 0, with student info
    supabase
      .from('fee_invoices')
      .select(`
        student_id,
        outstanding,
        status,
        due_date,
        students!inner (
          id,
          full_name,
          admission_no
        )
      `)
      .eq('school_id', user.schoolId)
      .eq('academic_year_id', user.academicYearId || '')
      .gt('outstanding', 0),
  ])

  // ── Q1: Term-wise aggregation ──────────────────────────────────────────
  const termMap = new Map<
    string,
    {
      name: string
      due_date: string
      order_index: number
      total_due: number
      total_paid: number
      total_outstanding: number
      paid_count: number
      unpaid_count: number
      partial_count: number
      invoice_count: number
    }
  >()

  safe.array(invoicesRaw).forEach((inv: any) => {
    const term = inv.fee_terms
    if (!term) return
    const tid = safe.string(term.id)
    if (!termMap.has(tid)) {
      termMap.set(tid, {
        name: safe.string(term.name),
        due_date: safe.string(term.due_date),
        order_index: safe.number(term.order_index),
        total_due: 0,
        total_paid: 0,
        total_outstanding: 0,
        paid_count: 0,
        unpaid_count: 0,
        partial_count: 0,
        invoice_count: 0,
      })
    }
    const t = termMap.get(tid)!
    t.total_due += safe.number(inv.net_amount)
    t.total_paid += safe.number(inv.amount_paid)
    t.total_outstanding += safe.number(inv.outstanding)
    t.invoice_count++
    const st = safe.string(inv.status)
    if (st === 'paid') t.paid_count++
    else if (st === 'unpaid') t.unpaid_count++
    else if (st === 'partial') t.partial_count++
  })

  const termStats = Array.from(termMap.values()).sort(
    (a, b) => a.order_index - b.order_index
  )

  // ── Q2: Fee head aggregation ───────────────────────────────────────────
  const headMap = new Map<
    string,
    { name: string; total_due: number; total_paid: number; total_outstanding: number }
  >()

  safe.array(headInvoicesRaw).forEach((inv: any) => {
    const head = inv.fee_heads
    if (!head) return
    const hid = safe.string(head.id)
    if (!headMap.has(hid)) {
      headMap.set(hid, {
        name: safe.string(head.name),
        total_due: 0,
        total_paid: 0,
        total_outstanding: 0,
      })
    }
    const h = headMap.get(hid)!
    h.total_due += safe.number(inv.net_amount)
    h.total_paid += safe.number(inv.amount_paid)
    h.total_outstanding += safe.number(inv.outstanding)
  })

  const headStats = Array.from(headMap.values()).sort(
    (a, b) => b.total_outstanding - a.total_outstanding
  )

  // ── Q3: Daily collection ───────────────────────────────────────────────
  const dailyMap = new Map<string, number>()
  safe.array(dailyPaymentsRaw).forEach((p: any) => {
    const date = safe.string(p.payment_date)
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + safe.number(p.amount))
  })
  const dailyEntries = Array.from(dailyMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )

  // ── Q4: Payment mode ───────────────────────────────────────────────────
  const modeMap: Record<string, { count: number; total: number }> = {
    cash: { count: 0, total: 0 },
    upi: { count: 0, total: 0 },
    cheque: { count: 0, total: 0 },
  }
  safe.array(modePaymentsRaw).forEach((p: any) => {
    const mode = safe.string(p.payment_mode).toLowerCase()
    if (mode in modeMap) {
      modeMap[mode].count++
      modeMap[mode].total += safe.number(p.amount)
    }
  })

  // ── Q5: Top defaulters ─────────────────────────────────────────────────
  const defaulterMap = new Map<
    string,
    {
      student_id: string
      full_name: string
      admission_no: string
      total_outstanding: number
      unpaid_count: number
      latest_due: string
    }
  >()

  safe.array(defaulterInvoicesRaw).forEach((inv: any) => {
    const student = inv.students
    if (!student) return
    const sid = safe.string(student.id)
    if (!defaulterMap.has(sid)) {
      defaulterMap.set(sid, {
        student_id: sid,
        full_name: safe.string(student.full_name),
        admission_no: safe.string(student.admission_no),
        total_outstanding: 0,
        unpaid_count: 0,
        latest_due: '',
      })
    }
    const d = defaulterMap.get(sid)!
    d.total_outstanding += safe.number(inv.outstanding)
    if (safe.string(inv.status) !== 'paid') d.unpaid_count++
    const dd = safe.string(inv.due_date)
    if (!d.latest_due || dd > d.latest_due) d.latest_due = dd
  })

  const topDefaulters = Array.from(defaulterMap.values())
    .sort((a, b) => b.total_outstanding - a.total_outstanding)
    .slice(0, 10)

  // ── Global KPIs ────────────────────────────────────────────────────────
  const totalDue = termStats.reduce((s, t) => s + t.total_due, 0)
  const totalCollected = termStats.reduce((s, t) => s + t.total_paid, 0)
  const totalOutstanding = termStats.reduce((s, t) => s + t.total_outstanding, 0)
  const overallRate = totalDue > 0 ? (totalCollected / totalDue) * 100 : 0

  const rateColor = (r: number) =>
    r > 80 ? 'text-emerald-600' : r > 60 ? 'text-amber-600' : 'text-red-600'
  const rateFill = (r: number) =>
    r > 80 ? 'bg-emerald-500' : r > 60 ? 'bg-amber-500' : 'bg-red-500'

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
        <h1 className="text-2xl font-semibold text-slate-900">Fee Overview</h1>
        <p className="text-sm text-slate-500">
          Collection status for the current academic year
        </p>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Due</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {rupees.short(totalDue)}
          </p>
          <p className="mt-1 text-xs text-slate-400">billed this year</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Collected</p>
          <p className={`mt-1 text-2xl font-semibold ${rateColor(overallRate)}`}>
            {rupees.short(totalCollected)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {overallRate.toFixed(1)}% of billed
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Outstanding</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              totalOutstanding > 0 ? 'text-red-600' : 'text-emerald-600'
            }`}
          >
            {rupees.short(totalOutstanding)}
          </p>
          <p className="mt-1 text-xs text-slate-400">pending collection</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Collection Rate</p>
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
      </div>

      {/* TERM TABLE */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Collection by Term
        </h2>
        {termStats.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No invoice data for this academic year.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Term</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Due Date</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Total Due</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Collected</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Outstanding</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">Paid</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">Partial</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">Unpaid</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 w-32">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {termStats.map((t) => {
                  const rate = t.total_due > 0 ? (t.total_paid / t.total_due) * 100 : 0
                  return (
                    <tr key={t.name} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {t.due_date ? formatDate(t.due_date) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {rupees.short(t.total_due)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                        {rupees.short(t.total_paid)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          t.total_outstanding > 0 ? 'text-red-600' : 'text-slate-400'
                        }`}
                      >
                        {rupees.short(t.total_outstanding)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          {t.paid_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          {t.partial_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          {t.unpaid_count}
                        </span>
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

      {/* FEE HEAD TABLE */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Collection by Fee Head
        </h2>
        {headStats.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No fee head data.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Fee Head</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Total Due</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Collected</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Outstanding</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 w-28">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {headStats.map((h, idx) => {
                  const rate = h.total_due > 0 ? (h.total_paid / h.total_due) * 100 : 0
                  const isWorst = idx === 0 && h.total_outstanding > 0
                  return (
                    <tr
                      key={h.name}
                      className={`hover:bg-slate-50 transition-colors ${
                        isWorst ? 'border-l-2 border-l-red-500' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">{h.name}</td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {rupees.short(h.total_due)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                        {rupees.short(h.total_paid)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          h.total_outstanding > 0 ? 'text-red-600' : 'text-slate-400'
                        }`}
                      >
                        {rupees.short(h.total_outstanding)}
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

      {/* DAILY CHART + PAYMENT MODES */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Daily Chart */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Daily Collection — Last 30 Days
          </h2>
          {dailyEntries.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50">
              <p className="text-sm text-slate-400">No payment data in last 30 days.</p>
            </div>
          ) : (
            <ChartWrapper
              data={{
                type: 'bar',
                labels: dailyEntries.map(([date]) => date),
                datasets: [
                  {
                    label: 'Daily Collection',
                    data: dailyEntries.map(([, paise]) => paise / 100),
                    color: '#10B981',
                  },
                ],
              }}
              height={200}
            />
          )}
        </div>

        {/* Payment Modes */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Payment Methods</h2>
          <div className="space-y-3">
            {/* UPI */}
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                  UPI
                </p>
                <span className="text-xs text-blue-500">
                  {modeMap.upi.count} payments
                </span>
              </div>
              <p className="mt-1 text-lg font-semibold text-blue-800">
                {rupees.short(modeMap.upi.total)}
              </p>
            </div>
            {/* Cash */}
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                  Cash
                </p>
                <span className="text-xs text-emerald-500">
                  {modeMap.cash.count} payments
                </span>
              </div>
              <p className="mt-1 text-lg font-semibold text-emerald-800">
                {rupees.short(modeMap.cash.total)}
              </p>
            </div>
            {/* Cheque */}
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                  Cheque
                </p>
                <span className="text-xs text-amber-500">
                  {modeMap.cheque.count} payments
                </span>
              </div>
              <p className="mt-1 text-lg font-semibold text-amber-800">
                {rupees.short(modeMap.cheque.total)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* TOP DEFAULTERS */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">
          Highest Outstanding
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          Top 10 students by outstanding amount
        </p>
        {topDefaulters.length === 0 ? (
          <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">
            No outstanding dues found. All fees collected!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Student</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Admission No</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Outstanding</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">Invoices</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topDefaulters.map((d) => (
                  <tr
                    key={d.student_id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {d.full_name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {d.admission_no || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">
                      {rupees.format(d.total_outstanding)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        {d.unpaid_count} unpaid
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        href={`/owner/students/${d.student_id}`}
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
