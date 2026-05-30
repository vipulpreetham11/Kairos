'use server'

import { requireRole } from '@/lib/auth/get-current-user'
import { callAI, AI_TEMPERATURE } from '@/lib/ai/client'
import { createServerClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/types/ai'

export async function expandDiaryEntry(
  input: string,
  schoolId: string,
  userId: string
): Promise<ActionResult<{ expanded: string }>> {
  try {
    const user = await requireRole(['teacher'])
    if (user.schoolId !== schoolId || user.userId !== userId) {
      return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }
    }

    const res = await callAI({
      messages: [
        {
          role: 'system',
          content: 'You are a helpful school teacher assistant. Expand the teacher\'s brief note into a proper class diary entry (3-4 sentences). Include: what was taught, learning objectives, student engagement level (assume good). Professional tone. Present tense.'
        },
        {
          role: 'user',
          content: input
        }
      ],
      temperature: AI_TEMPERATURE.CREATIVE,
      maxTokens: 200,
    })

    if (!res) {
      return { success: false, error: 'AI failed to expand note', code: 'AI_ERROR' }
    }

    const content = res
    return { success: true, data: { expanded: content } }
  } catch (error: unknown) {
    console.error('[expandDiaryEntry]', error)
    return { success: false, error: 'Failed to expand entry', code: 'INTERNAL_ERROR' }
  }
}

export async function saveDiaryEntry(
  entry: string,
  schoolId: string,
  sectionId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireRole(['teacher'])
    if (user.schoolId !== schoolId) {
      return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }
    }

    const supabase = await createServerClient()
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('class_diary')
      .insert({
        school_id: schoolId,
        section_id: sectionId,
        what_was_taught: entry,
        date: today,
        period_number: 1,
        created_by: user.userId,
        has_homework: false
      })
      .select('id')
      .single()

    if (error || !data) {
      return { success: false, error: 'Failed to save entry to database', code: 'DB_ERROR' }
    }

    return { success: true, data: { id: data.id } }
  } catch (error: unknown) {
    console.error('[saveDiaryEntry]', error)
    return { success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' }
  }
}
