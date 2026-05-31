import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthError, getCurrentUser } from '@/lib/auth/get-current-user'
import { IntelligenceShell } from './intelligence-shell'

const ROLE_HOME: Record<string, string> = {
  owner: '/owner',
  principal: '/principal',
  teacher: '/teacher',
  accountant: '/accountant',
  parent: '/parent',
  admin: '/principal',
  super_admin: '/principal',
}

const ROLE_ALLOWED_PATHS: Record<string, string[]> = {
  owner: ['/owner'],
  principal: ['/principal'],
  teacher: ['/teacher', '/principal/students'],
  accountant: ['/accountant'],
  parent: ['/parent'],
  admin: ['/principal'],
  super_admin: ['/owner', '/principal', '/teacher', '/accountant', '/parent'],
}

export default async function IntelligenceLayout({
  children,
}: {
  children: ReactNode
}) {
  let user
  try {
    user = await getCurrentUser()
  } catch (error: unknown) {
    if (error instanceof AuthError) redirect('/login')
    redirect('/login')
  }

  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? ''
  const userHome = ROLE_HOME[user.role] ?? '/login'
  const allowedPaths = ROLE_ALLOWED_PATHS[user.role] ?? []
  const isAllowed = allowedPaths.some((p) => pathname.startsWith(p))

  if (!isAllowed) redirect(userHome)

  const hasActiveYear = user.hasActiveYear
  return (
    <IntelligenceShell user={user} hasActiveYear={hasActiveYear}>
      {children}
    </IntelligenceShell>
  )
}
