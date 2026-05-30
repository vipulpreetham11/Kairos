'use server'

import { executeNLQuery } from '@/lib/ai/query'
import { requireRole } from '@/lib/auth/get-current-user'
import { createServerClient } from '@/lib/supabase/server'
import type { NLQueryResult, ConversationTurn } from '@/types/ai'

export async function askParentAI(
  question: string,
  conversationHistory: ConversationTurn[]
): Promise<{ success: true; result: NLQueryResult } | { success: false; error: string }> {
  try {
    const user = await requireRole(
      ['parent'] as unknown as Array<
        'owner' | 'principal' | 'teacher' | 'accountant' | 'parent'
      >
    )

    if (!question || question.trim().length === 0) {
      return { success: false, error: 'Question cannot be empty' }
    }

    if (question.length > 500) {
      return { success: false, error: 'Question must be 500 characters or fewer' }
    }

    const supabase = createServerClient()

    const { data: parentData } = await supabase
      .from('parents')
      .select('id')
      .eq('user_id', user.userId)
      .eq('school_id', user.schoolId)
      .single()

    if (!parentData) {
      return { 
        success: false, 
        error: 'Parent profile not found' 
      }
    }

    const { data: link } = await supabase
      .from('student_parents')
      .select('student_id')
      .eq('parent_id', parentData.id)
      .eq('school_id', user.schoolId)
      .limit(1)
      .single()

    if (!link?.student_id) {
      return { 
        success: false, 
        error: 'No student linked to your account' 
      }
    }

    const studentId = link.student_id

    const result = await executeNLQuery({
      question: question.trim(),
      role: 'parent',
      schoolId: user.schoolId,
      userId: user.userId,
      academicYearId: user.academicYearId ?? '',
      conversationHistory: conversationHistory.slice(-6),
      studentId: studentId
    })

    return { success: true, result }
  } catch (error) {
    console.error('[PARENT_ASK]', error)
    return { success: false, error: 'Failed to process question' }
  }
}
