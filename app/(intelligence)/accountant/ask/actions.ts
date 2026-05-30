'use server'

import { executeNLQuery } from '@/lib/ai/query'
import { requireRole } from '@/lib/auth/get-current-user'
import type { NLQueryResult, ConversationTurn } from '@/types/ai'

export async function askAccountantAI(
  question: string,
  conversationHistory: ConversationTurn[]
): Promise<{ success: true; result: NLQueryResult } | { success: false; error: string }> {
  try {
    const user = await requireRole(
      ['accountant'] as unknown as Array<
        'owner' | 'principal' | 'teacher' | 'accountant' | 'parent'
      >
    )

    if (!question || question.trim().length === 0) {
      return { success: false, error: 'Question cannot be empty' }
    }

    if (question.length > 500) {
      return { success: false, error: 'Question must be 500 characters or fewer' }
    }

    const result = await executeNLQuery({
      question: question.trim(),
      role: 'accountant',
      schoolId: user.schoolId,
      userId: user.userId,
      academicYearId: user.academicYearId ?? '',
      conversationHistory: conversationHistory.slice(-6),
    })

    return { success: true, result }
  } catch (error) {
    console.error('[ACCOUNTANT_ASK]', error)
    return { success: false, error: 'Failed to process question' }
  }
}
