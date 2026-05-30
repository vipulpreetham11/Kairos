import Link from 'next/link'
import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import { rupees } from '@/lib/utils/format'

export default async function OwnerStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; class?: string; status?: string }>
}) {
  const user = await requireRole(
    ['owner'] as unknown as Array<'owner' | 'principal' | 'teacher' | 'accountant' | 'parent'>
  )
  const supabase = await createServerClient()
  const { search, class: classFilter, status: statusFilter } = await searchParams

  const [
    { data: studentsRaw },
    { data: classesRaw },
  ] = await Promise.all([
    supabase
      .from('students')
      .select(`
        id,
        full_name,
        admission_no,
        is_deleted,
        enrollments!inner (
          class_id,
          status,
          academic_year_id,
          classes (name, display_order),
          sections (name)
        ),
        fee_invoices (
          id,
          net_amount,
          amount_paid,
          outstanding,
          status,
          academic_year_id
        ),
        student_risk_scores (
          fee_score,
          risk_level
        )
      `)
      .eq('school_id', user.schoolId)
      .eq('is_deleted', false)
      .eq('enrollments.school_id', user.schoolId)
      .eq('enrollments.academic_year_id', user.academicYearId || '')
      .eq('enrollments.status', 'active'),
    supabase
      .from('classes')
      .select('id, name, display_order')
      .eq('school_id', user.schoolId)
      .order('display_order', { ascending: true }),
  ])

  const studentsList = safe.array(studentsRaw).map((s: any) => {
    const enrollments = safe.array(s.enrollments)
    const activeEnrollment = enrollments.find(
      (e: any) => e.status === 'active' && e.academic_year_id === user.academicYearId
    )
    const classData = activeEnrollment?.classes || {}
    const sectionData = activeEnrollment?.sections || {}

    let total_due = 0
    let total_paid = 0
    let total_outstanding = 0
    let unpaid_count = 0

    const invoices = safe.array(s.fee_invoices).filter(
      (inv: any) => inv.academic_year_id === user.academicYearId
    )

    invoices.forEach((inv: any) => {
      total_due += safe.number(inv.net_amount)
      total_paid += safe.number(inv.amount_paid)
      total_outstanding += safe.number(inv.outstanding)
      if (inv.status !== 'paid') unpaid_count++
    })

    const risk = safe.array(s.student_risk_scores)[0] || {}

    return {
      id: safe.string(s.id),
      full_name: safe.string(s.full_name),
      admission_no: safe.string(s.admission_no),
      class_id: safe.string(activeEnrollment?.class_id),
      class_name: safe.string(classData.name),
      display_order: safe.number(classData.display_order),
      section_name: safe.string(sectionData.name),
      total_due,
      total_paid,
      total_outstanding,
      unpaid_count,
      fee_score: risk.fee_score ? safe.number(risk.fee_score) : null,
      risk_level: safe.string(risk.risk_level),
    }
  }).sort((a, b) => b.total_outstanding - a.total_outstanding)

  let filtered = studentsList
  if (search) {
    const sStr = search.toLowerCase()
    filtered = filtered.filter(
      (st) =>
        st.full_name.toLowerCase().includes(sStr) ||
        st.admission_no.toLowerCase().includes(sStr)
    )
  }

  if (classFilter) {
    filtered = filtered.filter((st) => st.class_id === classFilter)
  }

  if (statusFilter === 'unpaid') {
    filtered = filtered.filter((st) => st.total_paid === 0 && st.total_outstanding > 0)
  } else if (statusFilter === 'partial') {
    filtered = filtered.filter((st) => st.total_paid > 0 && st.total_outstanding > 0)
  } else if (statusFilter === 'paid') {
    filtered = filtered.filter((st) => st.total_outstanding === 0 && st.total_due > 0)
  }

  let schoolTotalOutstanding = 0
  let schoolTotalCollected = 0
  let defaulterCount = 0

  filtered.forEach((st) => {
    schoolTotalOutstanding += st.total_outstanding
    schoolTotalCollected += st.total_paid
    if (st.total_outstanding > 0) defaulterCount++
  })

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Students — Fee Overview</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Students</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{filtered.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total Outstanding</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              schoolTotalOutstanding > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {rupees.short(schoolTotalOutstanding)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Defaulters</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              defaulterCount > 0 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {defaulterCount}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="search" className="mb-1 block text-xs text-slate-500">
              Search
            </label>
            <input
              type="text"
              name="search"
              id="search"
              defaultValue={search || ''}
              placeholder="Name or Admission No"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="w-full sm:w-48">
            <label htmlFor="class" className="mb-1 block text-xs text-slate-500">
              Class
            </label>
            <select
              name="class"
              id="class"
              defaultValue={classFilter || ''}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Classes</option>
              {safe.array(classesRaw).map((c: any) => (
                <option key={safe.string(c.id)} value={safe.string(c.id)}>
                  {safe.string(c.name)}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-48">
            <label htmlFor="status" className="mb-1 block text-xs text-slate-500">
              Fee Status
            </label>
            <select
              name="status"
              id="status"
              defaultValue={statusFilter || ''}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
          >
            Filter
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">SR</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Student</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Class</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Total Due</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Paid</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Outstanding</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No students found matching your criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((st, index) => {
                  let statusBadge = null
                  if (st.total_outstanding === 0 && st.total_due > 0) {
                    statusBadge = (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Paid
                      </span>
                    )
                  } else if (st.total_paid > 0 && st.total_outstanding > 0) {
                    statusBadge = (
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Partial
                      </span>
                    )
                  } else if (st.total_paid === 0 && st.total_due > 0) {
                    statusBadge = (
                      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Unpaid
                      </span>
                    )
                  } else {
                    statusBadge = <span className="text-slate-400">—</span>
                  }

                  return (
                    <tr
                      key={st.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        st.total_outstanding > 0 ? 'bg-red-50/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{st.full_name}</p>
                        <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 mt-1">
                          {st.admission_no || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        Class {st.class_name} {st.section_name && `- ${st.section_name}`}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {rupees.format(st.total_due)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-600">
                        {rupees.format(st.total_paid)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right ${
                          st.total_outstanding > 0
                            ? 'font-semibold text-red-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {rupees.format(st.total_outstanding)}
                      </td>
                      <td className="px-4 py-3 text-center">{statusBadge}</td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/owner/students/${st.id}`}
                          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
