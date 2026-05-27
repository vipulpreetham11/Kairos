'use client'

import { BarChart2 } from 'lucide-react'
import type { Role } from '@/types/ai'

interface EmptyStateProps {
  role: Role
  module: string
  message?: string
}

const DEFAULT_MESSAGES: Record<Role, string> = {
  principal: 'No insights yet. Risk scores are being computed.',
  owner: 'No revenue insights yet. Check back shortly.',
  teacher: 'No class data available yet.',
  accountant: 'No fee data available yet.',
  parent: "Your child's summary is being prepared.",
}

export function EmptyState({ role, module, message }: EmptyStateProps) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
      <BarChart2 className="h-12 w-12 text-slate-400" />
      <p className="mt-3 text-sm font-medium text-slate-800">{message ?? DEFAULT_MESSAGES[role]}</p>
      <p className="mt-1 text-xs text-slate-500">{module}</p>
    </div>
  )
}
