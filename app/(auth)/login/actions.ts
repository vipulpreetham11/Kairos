'use server'

import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { AuthError, getClientSafeError, getCurrentUser } from '@/lib/auth/get-current-user'
import type { ActionResult } from '@/types/ai'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function roleRedirect(role: string): string {
  const map: Record<string, string> = {
    owner: '/owner',
    principal: '/principal',
    teacher: '/teacher',
    accountant: '/accountant',
    parent: '/parent',
    admin: '/principal',
    super_admin: '/principal',
  }
  return map[role] ?? '/principal'
}

export async function signIn(
  formData: FormData
): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const password = String(formData.get('password') ?? '')

    if (!email || !password || !EMAIL_REGEX.test(email)) {
      return {
        success: false,
        error: 'Invalid email or password.',
        code: 'INVALID_CREDENTIALS',
      }
    }

    const supabase = await createServerClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      return {
        success: false,
        error: 'Invalid email or password.',
        code: 'INVALID_CREDENTIALS',
      }
    }

    const user = await getCurrentUser()
    return { success: true, data: { redirectTo: roleRedirect(user.role) } }
  } catch (error: unknown) {
    const code = error instanceof AuthError ? error.code : 'UNKNOWN_ERROR'
    return { success: false, error: getClientSafeError(code), code }
  }
}

export async function signOut(): Promise<void> {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
