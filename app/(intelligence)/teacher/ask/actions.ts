'use server'

import { executeNLQuery } from '@/lib/ai/query'
import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import type { NLQueryResult, ConversationTurn } from '@/types/ai'

export async function askTeacherAI(
  question: string,
  conversationHistory: ConversationTurn[]
): Promise<{ success: true; result: NLQueryResult } | { success: false; error: string }> {
  try {
    const user = await requireRole(
      ['teacher'] as unknown as Array<
        'owner' | 'principal' | 'teacher' | 'accountant' | 'parent'
      >
    )

    if (!question || question.trim().length === 0) {
      return { success: false, error: 'Question cannot be empty' }
    }

    if (question.length > 500) {
      return { success: false, error: 'Question must be 500 characters or fewer' }
    }

    const supabase = await createServerClient()

    const { data: assignments } = await supabase
      .from('teacher_assignments')
      .select('section_id')
      .eq('teacher_id', user.userId)
      .eq('school_id', user.schoolId)

    const sectionIds = safe.array(assignments).map((a: any) => safe.string(a.section_id)).filter(Boolean)

    const result = await executeNLQuery({
      question: question.trim(),
      role: 'teacher',
      schoolId: user.schoolId,
      userId: user.userId,
      academicYearId: user.academicYearId ?? '',
      conversationHistory: conversationHistory.slice(-6),
      sectionIds: sectionIds
    })

    return { success: true, result }
  } catch (error) {
    console.error('[TEACHER_ASK]', error)
    return { success: false, error: 'Failed to process question' }
  }
}
