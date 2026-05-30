import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import { rupees, formatDate } from '@/lib/utils/format'

export default async function OwnerStudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  const user = await requireRole(
    ['owner'] as unknown as Array<'owner' | 'principal' | 'teacher' | 'accountant' | 'parent'>
  )
  const supabase = await createServerClient()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, admission_no, gender')
    .eq('id', studentId)
    .eq('school_id', user.schoolId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (!student) notFound()

  const [
    { data: enrollment },
    { data: riskScore },
    { data: invoicesRaw },
    { data: paymentsRaw },
  ] = await Promise.all([
    supabase
      .from('enrollments')
      .select(`
        classes (name),
        sections (name)
      `)
      .eq('student_id', studentId)
      .eq('school_id', user.schoolId)
      .eq('academic_year_id', user.academicYearId || '')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('student_risk_scores')
      .select('fee_score, risk_level, composite_risk_score')
      .eq('student_id', studentId)
      .eq('school_id', user.schoolId)
      .maybeSingle(),
    supabase
      .from('fee_invoices')
      .select(`
        *,
        fee_heads!inner(name),
        fee_terms!inner(name, order_index)
      `)
      .eq('student_id', studentId)
      .eq('school_id', user.schoolId),
    supabase
      .from('fee_payments')
      .select('*')
      .eq('student_id', studentId)
      .eq('school_id', user.schoolId)
      .eq('status', 'active')
      .order('payment_date', { ascending: false }),
  ])

  const invoices = safe.array(invoicesRaw).sort((a: any, b: any) => {
    const aOrder = a.fee_terms?.order_index ?? 0
    const bOrder = b.fee_terms?.order_index ?? 0
    if (aOrder !== bOrder) return aOrder - bOrder
    const aName = safe.string(a.fee_heads?.name)
    const bName = safe.string(b.fee_heads?.name)
    return aName.localeCompare(bName)
  })

  let totalDue = 0
  let totalPaid = 0
  let totalOutstanding = 0

  invoices.forEach((inv: any) => {
    totalDue += safe.number(inv.net_amount)
    totalPaid += safe.number(inv.amount_paid)
    totalOutstanding += safe.number(inv.outstanding)
  })

  const payments = safe.array(paymentsRaw)
  const paymentCount = payments.length
  const collectionRate = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0

  const className = safe.string((enrollment?.classes as any)?.name ?? (enrollment?.classes as any)?.[0]?.name)
  const sectionName = safe.string((enrollment?.sections as any)?.name ?? (enrollment?.sections as any)?.[0]?.name)
  const classDisplay = className
    ? `Class ${className} ${sectionName ? `- ${sectionName}` : ''}`
    : 'Not Assigned'

  const feeScore = riskScore?.fee_score ? safe.number(riskScore.fee_score) : null
  let scoreBadge = null
  if (feeScore !== null) {
    if (feeScore > 70) {
      scoreBadge = (
        <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
          High Fee Risk
        </span>
      )
    } else if (feeScore > 40) {
      scoreBadge = (
        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
          Medium Risk
        </span>
      )
    } else {
      scoreBadge = (
        <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          Low Risk
        </span>
      )
    }
  } else {
    scoreBadge = (
      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
        Not scored
      </span>
    )
  }

  const termGroups = new Map<
    string,
    {
      termName: string
      invoices: any[]
      termDue: number
      termPaid: number
      termOutstanding: number
    }
  >()

  invoices.forEach((inv: any) => {
    const termName = safe.string(inv.fee_terms?.name) || 'Unknown Term'
    if (!termGroups.has(termName)) {
      termGroups.set(termName, {
        termName,
        invoices: [],
        termDue: 0,
        termPaid: 0,
        termOutstanding: 0,
      })
    }
    const group = termGroups.get(termName)!
    group.invoices.push(inv)
    group.termDue += safe.number(inv.net_amount)
    group.termPaid += safe.number(inv.amount_paid)
    group.termOutstanding += safe.number(inv.outstanding)
  })

  const initials = safe.string(student.full_name)
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href="/owner/students"
          className="mb-4 inline-flex items-center text-xs text-slate-500 hover:text-slate-700"
        >
          ← All Students
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-xl font-semibold text-blue-700">
              {initials || '?'}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                {safe.string(student.full_name)}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {safe.string(student.admission_no)} • {classDisplay}
              </p>
            </div>
          </div>
          <div>{scoreBadge}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Due</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {rupees.format(totalDue)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Paid</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">
            {rupees.format(totalPaid)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Outstanding</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              totalOutstanding > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {rupees.format(totalOutstanding)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Payments Made</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{paymentCount}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Fee Status</h2>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">
            {rupees.format(totalPaid)} paid of {rupees.format(totalDue)} total
          </span>
          <span className="font-semibold text-slate-900">
            {collectionRate.toFixed(1)}%
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full transition-all ${
              collectionRate > 80
                ? 'bg-emerald-500'
                : collectionRate > 40
                ? 'bg-amber-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${Math.min(collectionRate, 100)}%` }}
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Fee Invoices</h2>
        {termGroups.size === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            No invoices found for this student.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    Fee Head
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    Due Date
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">
                    Paid
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">
                    Outstanding
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from(termGroups.values()).map((group) => (
                  <React.Fragment key={group.termName}>
                    <tr>
                      <td
                        colSpan={6}
                        className="bg-slate-50 px-4 py-2 font-medium text-slate-900"
                      >
                        {group.termName}
                      </td>
                    </tr>
                    {group.invoices.map((inv) => {
                      const st = safe.string(inv.status)
                      let statusColor = 'bg-slate-100 text-slate-500'
                      if (st === 'paid') statusColor = 'bg-emerald-100 text-emerald-700'
                      if (st === 'partial') statusColor = 'bg-amber-100 text-amber-700'
                      if (st === 'unpaid') statusColor = 'bg-red-100 text-red-700'

                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-slate-700">
                            {safe.string(inv.fee_heads?.name)}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {inv.due_date ? formatDate(inv.due_date) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {rupees.format(inv.net_amount)}
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-600">
                            {rupees.format(inv.amount_paid)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right ${
                              safe.number(inv.outstanding) > 0
                                ? 'font-semibold text-red-600'
                                : 'text-slate-500'
                            }`}
                          >
                            {rupees.format(inv.outstanding)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColor}`}
                            >
                              {st}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                    <tr className="border-t border-slate-200 font-medium">
                      <td className="px-4 py-3 text-slate-900">Term Total</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-right text-slate-900">
                        {rupees.format(group.termDue)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-600">
                        {rupees.format(group.termPaid)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900">
                        {rupees.format(group.termOutstanding)}
                      </td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </React.Fragment>
                ))}
                <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
                  <td className="px-4 py-4">Total</td>
                  <td className="px-4 py-4"></td>
                  <td className="px-4 py-4 text-right">{rupees.format(totalDue)}</td>
                  <td className="px-4 py-4 text-right text-emerald-600">
                    {rupees.format(totalPaid)}
                  </td>
                  <td className="px-4 py-4 text-right text-red-600">
                    {rupees.format(totalOutstanding)}
                  </td>
                  <td className="px-4 py-4"></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Payment History</h2>
        {payments.length === 0 ? (
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
            No payments recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    Receipt
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">
                    Date
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-600">
                    Mode
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p: any) => {
                  const mode = safe.string(p.payment_mode).toLowerCase()
                  let modeBadge = 'bg-slate-100 text-slate-700'
                  if (mode === 'cash') modeBadge = 'bg-green-100 text-green-700'
                  if (mode === 'upi') modeBadge = 'bg-blue-100 text-blue-700'
                  if (mode === 'cheque') modeBadge = 'bg-amber-100 text-amber-700'

                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {safe.string(p.receipt_number) || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {p.payment_date ? formatDate(p.payment_date) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600">
                        {rupees.format(p.amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${modeBadge}`}
                        >
                          {mode}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        For academic performance and attendance details, contact the principal.
      </p>
    </div>
  )
}
