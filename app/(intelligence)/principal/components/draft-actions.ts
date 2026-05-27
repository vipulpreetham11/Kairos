'use server'

import { draftAction } from '@/lib/ai/draft'
import type { ActionResult, DraftResult } from '@/types/ai'

interface DraftMessageParams {
  studentId: string
  schoolId: string
  userId: string
  actionType: 'attendance_warning' | 'fee_reminder' | 'academic_concern' | 'general_followup' | 'positive_reinforcement'
  channel: 'whatsapp' | 'sms'
  additionalContext?: string
}

export async function draftMessageAction(
  params: DraftMessageParams
): Promise<ActionResult<DraftResult>> {
  try {
    const result = await draftAction(params)
    return { success: true, data: result }
  } catch (err) {
    console.error('[DRAFT_ACTION]', err)
    return {
      success: false,
      error: 'Failed to generate message. Please try again.',
      code: 'DRAFT_FAILED',
    }
  }
}
