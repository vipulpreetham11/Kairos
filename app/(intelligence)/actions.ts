'use server'

import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import type { ActionResult, Role } from '@/types/ai'

export async function markInsightRead(
  insightId: string
): Promise<ActionResult<void>> {
  try {
    const user = await requireRole([
      'owner',
      'principal',
      'teacher',
      'accountant',
      'parent',
      'admin',
      'super_admin',
    ] as unknown as Role[])
    const supabase = await createServerClient()

    const { error } = await supabase
      .from('ai_insights')
      .update({ is_read: true })
      .eq('id', insightId)
      .eq('school_id', user.schoolId)

    if (error) throw error
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[markInsightRead]', err)
    return {
      success: false,
      error: 'Failed to update insight status.',
      code: 'UPDATE_FAILED',
    }
  }
}

export async function markInsightActioned(
  insightId: string
): Promise<ActionResult<void>> {
  try {
    const user = await requireRole([
      'owner',
      'principal',
      'teacher',
      'accountant',
      'parent',
      'admin',
      'super_admin',
    ] as unknown as Role[])
    const supabase = await createServerClient()

    const { error } = await supabase
      .from('ai_insights')
      .update({ action_taken: true })
      .eq('id', insightId)
      .eq('school_id', user.schoolId)

    if (error) throw error
    return { success: true, data: undefined }
  } catch (err) {
    console.error('[markInsightActioned]', err)
    return {
      success: false,
      error: 'Failed to update insight status.',
      code: 'UPDATE_FAILED',
    }
  }
}
