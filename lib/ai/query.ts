import 'server-only'
import { callAI, AI_TEMPERATURE } from '@/lib/ai/client'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import type { ConversationTurn, NLQueryResult, Role } from '@/types/ai'

interface NLQueryParams {
  question: string
  role: Role
  schoolId: string
  userId: string
  academicYearId: string
  conversationHistory?: ConversationTurn[]
  sectionIds?: string[]
  studentId?: string
}

interface QueryConstraints {
  allowedTables: string[]
  schoolId: string
  academicYearId: string
  roleFilter: Record<string, unknown>
}

interface StructuredQueryParams {
  table: string
  filters: Record<string, unknown>
  select: string
  limit: number
  orderBy?: { column: string; ascending: boolean } | null
  is_out_of_scope?: boolean
}

function sanitizeNLQuery(question: string): { blocked: boolean; reason?: 'OUT_OF_SCOPE'; sanitized: string } {
  const trimmed = question.trim()
  if (trimmed.length < 3) throw new Error('Question too short')
  const capped = trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed
  const patterns = ['ignore previous', 'ignore all', 'system prompt', 'forget everything', 'new instructions', 'you are now', 'act as', 'jailbreak', 'show all schools', 'show all users', 'drop table', 'delete from', 'truncate']
  const lower = capped.toLowerCase()
  if (patterns.some((p) => lower.includes(p))) return { blocked: true, reason: 'OUT_OF_SCOPE', sanitized: capped }
  return { blocked: false, sanitized: capped }
}

function buildQueryConstraints(role: Role, schoolId: string, academicYearId: string, sectionIds?: string[], studentId?: string): QueryConstraints {
  if (role === 'teacher') return { allowedTables: ['students', 'attendance', 'homework_submissions', 'class_diary', 'results', 'enrollments'], schoolId, academicYearId, roleFilter: { school_id: schoolId, section_id: safe.array<string>(sectionIds) } }
  if (role === 'accountant') return { allowedTables: ['fee_invoices', 'fee_payments', 'students'], schoolId, academicYearId, roleFilter: { school_id: schoolId } }
  if (role === 'parent') return { allowedTables: ['attendance', 'homework_submissions', 'results', 'class_diary'], schoolId, academicYearId, roleFilter: { school_id: schoolId, student_id: safe.string(studentId) } }
  return { allowedTables: ['students', 'attendance', 'fee_invoices', 'results', 'student_risk_scores', 'enrollments'], schoolId, academicYearId, roleFilter: { school_id: schoolId } }
}

function buildQuerySystemPrompt(constraints: QueryConstraints): string {
  return `You are a school data query assistant.
You can only query these tables: ${constraints.allowedTables.join(', ')}.
Every query MUST include school_id = ${constraints.schoolId}.
Respond ONLY with JSON in this exact shape:
{
  "table": string,
  "select": string,
  "filters": { "column": "value" },
  "limit": number,
  "orderBy": { "column": string, "ascending": boolean } | null,
  "is_out_of_scope": boolean
}
If the question cannot be answered from school data, set is_out_of_scope: true.`
}

function trimConversationHistory(history?: ConversationTurn[]): ConversationTurn[] {
  if (!history || history.length === 0) return []
  return history.slice(-6)
}

function outOfScopeResult(): NLQueryResult {
  return {
    answer: "I can only answer questions about this school's data. Try asking about attendance, fees, or student performance.",
    data_used: { tables: [], record_count: 0, date_range: { from: '', to: '' } },
    confidence: 'low',
    follow_up_suggestions: ['Which students have low attendance?', 'What is the fee collection rate?', 'Which class has the best results?'],
  }
}

async function buildSafeSupabaseQuery(params: StructuredQueryParams, constraints: QueryConstraints): Promise<Record<string, unknown>[]> {
  const supabase = await createServerClient()
  if (!constraints.allowedTables.includes(params.table)) return []
  let query = supabase.from(params.table).select(params.select).eq('school_id', constraints.schoolId).limit(Math.min(safe.number(params.limit, 20), 50))
  const roleFilter = constraints.roleFilter
  if (Array.isArray(roleFilter.section_id) && roleFilter.section_id.length > 0) query = query.in('section_id', safe.array<string>(roleFilter.section_id))
  if (safe.string(roleFilter.student_id)) query = query.eq('student_id', safe.string(roleFilter.student_id))
  Object.entries(params.filters).forEach(([key, value]) => {
    if (key === 'school_id') return
    if (Array.isArray(value)) query = query.in(key, value.map((v) => String(v)))
    else query = query.eq(key, value as string | number | boolean)
  })
  if (params.orderBy?.column) query = query.order(params.orderBy.column, { ascending: params.orderBy.ascending })
  const { data } = await query
  return safe.array<Record<string, unknown>>(data)
}

function findRelatedQuestions(role: Role): string[] {
  if (role === 'principal') return ['Which students are most at risk of dropping out?', 'Which section has the worst attendance?', 'How many students failed last exam?']
  if (role === 'owner') return ['Will we hit the fee target this month?', 'How much revenue is at risk?', 'Which class has the most fee defaulters?']
  if (role === 'teacher') return ['Which students have not submitted homework?', 'Who has attendance below 75%?', 'How is my class performing compared to last exam?']
  if (role === 'accountant') return ['Who has the highest outstanding fees?', 'How many cheques are pending clearance?', 'What is the 90+ days overdue amount?']
  return ['What homework is pending?', 'How is attendance this month?', 'What did they learn this week?']
}

export async function executeNLQuery(params: NLQueryParams): Promise<NLQueryResult> {
  const start = Date.now()
  try {
    const sanitized = sanitizeNLQuery(params.question)
    if (sanitized.blocked) return outOfScopeResult()
    const constraints = buildQueryConstraints(params.role, params.schoolId, params.academicYearId, params.sectionIds, params.studentId)
    const queryRaw = await callAI({
      messages: [{ role: 'system', content: buildQuerySystemPrompt(constraints) }, ...trimConversationHistory(params.conversationHistory), { role: 'user', content: sanitized.sanitized }],
      temperature: AI_TEMPERATURE.FACTUAL,
      responseFormat: 'json',
    })
    const parsed = JSON.parse(queryRaw) as StructuredQueryParams
    if (parsed.is_out_of_scope) return outOfScopeResult()
    const safeParams: StructuredQueryParams = {
      table: safe.string(parsed.table),
      select: safe.string(parsed.select, '*'),
      filters: (parsed.filters && typeof parsed.filters === 'object' ? parsed.filters : {}) as Record<string, unknown>,
      limit: safe.number(parsed.limit, 20),
      orderBy: parsed.orderBy ?? null,
    }
    const rows = await buildSafeSupabaseQuery(safeParams, constraints)
    const answer = await callAI({
      messages: [
        { role: 'system', content: 'You are a school data assistant. Synthesize this data into a clear, specific answer in 2-3 sentences. Use specific numbers. Use ₹ for amounts. Be direct. No hedging.' },
        { role: 'user', content: `Question: ${sanitized.sanitized}\nData: ${JSON.stringify(rows)}` },
      ],
      temperature: AI_TEMPERATURE.SYNTHESIS,
    })
    console.log(`[NL_QUERY] table=${safeParams.table} rows=${rows.length} duration=${Date.now() - start}ms`)
    return {
      answer,
      data_used: { tables: [safeParams.table], record_count: rows.length, date_range: { from: '', to: '' } },
      confidence: rows.length > 0 ? 'high' : 'low',
      follow_up_suggestions: findRelatedQuestions(params.role),
      raw_data: rows,
      is_partial: false,
    }
  } catch {
    return outOfScopeResult()
  }
}
