'use client'

import Link from 'next/link'
import { signOut } from '@/app/(auth)/login/actions'
import type { SchoolContext } from '@/types/ai'
import { LayoutDashboard, Users, Calendar, BookOpen, MessageSquare, IndianRupee, TrendingUp } from 'lucide-react'

interface SidebarNavProps {
  user: SchoolContext
}

const NAV_BY_ROLE: Record<string, Array<{ label: string; href: string; icon?: any }>> = {
  owner: [
    { label: 'Dashboard',  href: '/owner',            icon: LayoutDashboard },
    { label: 'Fees',       href: '/owner/fees',        icon: IndianRupee },
    { label: 'Enrollment', href: '/owner/enrollment',  icon: Users },
    { label: 'Ask AI',     href: '/owner/ask',         icon: MessageSquare },
  ],
  principal: [
    { label: 'Dashboard',      href: '/principal',            icon: LayoutDashboard },
    { label: 'Students',       href: '/principal/students',   icon: Users },
    { label: 'Attendance',     href: '/principal/attendance', icon: Calendar },
    { label: 'Exams & Results',href: '/principal/exams',      icon: BookOpen },
    { label: 'Ask AI',         href: '/principal/ask',        icon: MessageSquare },
  ],
  teacher: [
    { label: "Today's Schedule", href: '/teacher' },
    { label: 'Class Pulse', href: '/teacher#pulse' },
    { label: 'Student Spotlight', href: '/teacher#spotlight' },
    { label: 'Diary Copilot', href: '/teacher#diary' },
  ],
  accountant: [
    { label: 'Dashboard',   href: '/accountant',             icon: LayoutDashboard },
    { label: 'Collections', href: '/accountant/collections', icon: TrendingUp },
    { label: 'Ask AI',      href: '/accountant/ask',         icon: MessageSquare },
  ],
  parent: [
    { label: 'My Child',   href: '/parent',            icon: Users },
    { label: 'Attendance', href: '/parent/attendance', icon: Calendar },
    { label: 'Results',    href: '/parent/results',    icon: BookOpen },
    { label: 'Ask AI',     href: '/parent/ask',        icon: MessageSquare },
  ],
  admin: [
    { label: 'Morning Briefing', href: '/principal' },
    { label: 'Risk Monitor', href: '/principal#risk' },
    { label: 'Critical Alerts', href: '/principal#alerts' },
    { label: 'Section Health', href: '/principal#sections' },
    { label: 'Ask AI', href: '/principal/ask' },
  ],
}

export function SidebarNav({ user }: SidebarNavProps) {
  const links = NAV_BY_ROLE[user.role] ?? NAV_BY_ROLE.principal
  return (
    <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-72 shrink-0 flex-col rounded-xl border border-slate-200 bg-[#F0F7FF] p-4 shadow-sm md:flex">
      <div>
        <p className="text-lg font-semibold text-slate-900">Kairos</p>
        <p className="mt-1 text-xs text-slate-500">Intelligence Layer</p>
      </div>

      <nav className="mt-6 space-y-1">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-white hover:text-slate-900"
          >
            {item.icon && <item.icon className="h-4 w-4" />}
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-sm font-medium text-slate-900">{user.userName || 'User'}</p>
          <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium capitalize text-blue-700">
            {user.role}
          </span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
