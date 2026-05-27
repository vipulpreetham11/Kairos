'use client'

import { RiskLevelBadge } from '@/components/shared/risk-level-badge'
import { TrendArrow } from '@/components/shared/trend-arrow'
import type { RiskLevel } from '@/types/ai'

interface StudentMiniCardProps {
  student: {
    student_id: string
    student_name: string
    admission_no: string
    class_name: string
    section_name: string
    composite_risk_score: number
    risk_level: RiskLevel
    trend: string
    intervention_window_days: number | null
  }
  onViewProfile?: (studentId: string) => void
  onDraftMessage?: (studentId: string) => void
}

const colorMap: Record<RiskLevel, string> = { low: 'bg-emerald-100 text-emerald-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700' }

export function StudentMiniCard({ student, onViewProfile, onDraftMessage }: StudentMiniCardProps) {
  const initials = student.student_name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase()
  const trend = student.trend === 'improving' || student.trend === 'stable' || student.trend === 'declining' || student.trend === 'critical' ? student.trend : 'stable'
  const windowTone = student.intervention_window_days !== null && student.intervention_window_days <= 7 ? 'text-red-600' : 'text-amber-600'
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${colorMap[student.risk_level]}`}>{initials}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-slate-900">{student.student_name}</p>
          <p className="text-[12px] text-slate-500">{student.class_name} {student.section_name}</p>
          <p className="text-[11px] text-slate-400">{student.admission_no}</p>
        </div>
        <div className="text-right">
          <p className={`text-xl font-semibold ${colorMap[student.risk_level].split(' ')[1]}`}>{Math.round(student.composite_risk_score)}</p>
          <RiskLevelBadge level={student.risk_level} />
          <div className="mt-1"><TrendArrow trend={trend} /></div>
        </div>
      </div>
      {student.intervention_window_days !== null ? <p className={`mt-2 text-xs font-medium ${windowTone}`}>⚠ Act within {student.intervention_window_days} days</p> : null}
      {(onViewProfile || onDraftMessage) ? (
        <div className="mt-3 flex gap-2">
          {onViewProfile ? <button type="button" onClick={() => onViewProfile(student.student_id)} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50">View Profile</button> : null}
          {onDraftMessage ? <button type="button" onClick={() => onDraftMessage(student.student_id)} className="rounded-md bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-700">Draft Message</button> : null}
        </div>
      ) : null}
    </div>
  )
}
