'use client'

import type { ReactNode } from 'react'
import type { SchoolContext } from '@/types/ai'
import { SidebarNav } from './sidebar-nav'

interface IntelligenceShellProps {
  user: SchoolContext
  hasActiveYear: boolean
  children: ReactNode
}

export function IntelligenceShell({
  user,
  hasActiveYear,
  children,
}: IntelligenceShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-[1400px] gap-4 p-4 md:gap-6 md:p-6">
        <SidebarNav user={user} />
        <main className="min-w-0 flex-1">
          {!hasActiveYear ? (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No active academic year set. Some features may be limited.
            </div>
          ) : null}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
