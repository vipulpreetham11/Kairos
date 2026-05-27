import 'server-only'
import { callAI, AI_TEMPERATURE } from '@/lib/ai/client'
import { SYSTEM_PROMPT as PRINCIPAL_SYSTEM_PROMPT, buildInsightPrompt as buildPrincipalPrompt, JSON_INSTRUCTION as PRINCIPAL_JSON } from '@/lib/ai/prompts/principal'
import { SYSTEM_PROMPT as OWNER_SYSTEM_PROMPT, buildInsightPrompt as buildOwnerPrompt, JSON_INSTRUCTION as OWNER_JSON } from '@/lib/ai/prompts/owner'
import { SYSTEM_PROMPT as TEACHER_SYSTEM_PROMPT, buildInsightPrompt as buildTeacherPrompt, JSON_INSTRUCTION as TEACHER_JSON } from '@/lib/ai/prompts/teacher'
import { SYSTEM_PROMPT as ACCOUNTANT_SYSTEM_PROMPT, buildInsightPrompt as buildAccountantPrompt, JSON_INSTRUCTION as ACCOUNTANT_JSON } from '@/lib/ai/prompts/accountant'
import { SYSTEM_PROMPT as PARENT_SYSTEM_PROMPT, buildInsightPrompt as buildParentPrompt, JSON_INSTRUCTION as PARENT_JSON } from '@/lib/ai/prompts/parent'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import type { AIInsight, AIProvider, Role } from '@/types/ai'
import type { AggregatedMetrics } from '@/types/metrics'

interface InsightParams { role: Role; schoolId: string; userId: string; academicYearId: string; metrics: AggregatedMetrics; forceRefresh?: boolean }
interface CacheParams { role: Role; schoolId: string; userId: string }
interface InsightResult { insights: AIInsight[]; generatedAt: string; provider: AIProvider; fromCache: boolean }
interface CachedInsightResult { insights: AIInsight[]; generatedAt: string | null; expiresAt: string | null; isStale: boolean }
interface GeneratedInsight { insight_type: string; severity: 'info' | 'warning' | 'critical'; title: string; narrative: string; recommendation: string; consequence?: string | null; chart_data?: AIInsight['chart_data']; confidence_level?: 'high' | 'medium' | 'low'; data_points_used?: number }

function getExpiry(role: Role): string {
  const h = role === 'teacher' || role === 'principal' ? 12 : role === 'parent' ? 24 : 6
  return new Date(Date.now() + h * 3600000).toISOString()
}
function trimMetricsToTokenBudget(metrics: AggregatedMetrics): string {
  const direct = JSON.stringify(metrics)
  if (direct.length <= 1500) return direct
  const reducedRisk: AggregatedMetrics = { ...metrics, risk_summary: { ...metrics.risk_summary, top_at_risk: metrics.risk_summary.top_at_risk.slice(0, 5) } }
  const reducedStr = JSON.stringify(reducedRisk)
  if (reducedStr.length <= 1500) return reducedStr
  return JSON.stringify({ ...reducedRisk, academic: { ...reducedRisk.academic, subject_averages: [] } })
}
function validateInsightSchema(raw: string): GeneratedInsight[] | null {
  console.log('[RAW]', raw.substring(0, 300))
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('Not array')
    return parsed.filter((item: unknown): item is GeneratedInsight => {
      if (typeof item !== 'object' || item === null) return false
      const i = item as Record<string, unknown>
      return Boolean(i.severity && i.title && i.narrative && i.recommendation)
    })
  } catch { return null }
}
function generateFallbackInsights(role: Role): GeneratedInsight[] {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)
  return [{ insight_type: 'system', severity: 'info', title: 'AI insights temporarily unavailable', narrative: `${roleLabel} insights are temporarily unavailable. Risk scores have been computed from your school data. Check back in a few minutes for AI-generated insights.`, recommendation: 'Refresh the page in 2-3 minutes.', consequence: null, confidence_level: 'medium', data_points_used: 0, chart_data: null }]
}
function rolePrompt(role: Role): { system: string; build: (m: AggregatedMetrics) => string; json: string } {
  if (role === 'owner') return { system: OWNER_SYSTEM_PROMPT, build: buildOwnerPrompt, json: OWNER_JSON }
  if (role === 'principal') return { system: PRINCIPAL_SYSTEM_PROMPT, build: buildPrincipalPrompt, json: PRINCIPAL_JSON }
  if (role === 'teacher') return { system: TEACHER_SYSTEM_PROMPT, build: buildTeacherPrompt, json: TEACHER_JSON }
  if (role === 'accountant') return { system: ACCOUNTANT_SYSTEM_PROMPT, build: buildAccountantPrompt, json: ACCOUNTANT_JSON }
  return { system: PARENT_SYSTEM_PROMPT, build: buildParentPrompt, json: PARENT_JSON }
}

export async function getCachedInsights(params: CacheParams): Promise<CachedInsightResult> {
  const supabase = await createServerClient()
  const { data } = await supabase.from('ai_insights').select('*').eq('school_id', params.schoolId).eq('role', params.role).eq('generated_for_user_id', params.userId).gt('expires_at', new Date().toISOString()).order('generated_at', { ascending: false }).limit(10)
  const rows = safe.array<AIInsight>(data)
  if (rows.length > 0) return { insights: rows, generatedAt: rows[0].generated_at ?? null, expiresAt: rows[0].expires_at ?? null, isStale: false }
  return { insights: [], generatedAt: null, expiresAt: null, isStale: true }
}

export async function getInsights(params: InsightParams): Promise<InsightResult> {
  const start = Date.now()
  if (!params.forceRefresh) {
    const cached = await getCachedInsights({ role: params.role, schoolId: params.schoolId, userId: params.userId })
    if (!cached.isStale && cached.generatedAt) return { insights: cached.insights, generatedAt: cached.generatedAt, provider: 'openai', fromCache: true }
  }

  const supabase = await createServerClient()
  const prompt = rolePrompt(params.role)
  const trimmedMetrics = trimMetricsToTokenBudget(params.metrics)
  const userMessage = `${prompt.build(params.metrics)}\n\n${trimmedMetrics}\n\n${prompt.json}`
  let parsed: GeneratedInsight[] | null = null
  try {
    const raw = await callAI({ messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: userMessage }], temperature: AI_TEMPERATURE.FACTUAL, maxTokens: 1500, responseFormat: 'json' })
    parsed = validateInsightSchema(raw)
  } catch (error) {
    console.error('[INSIGHTS] AI generation failed', error)
  }
  const finalInsights = parsed ?? generateFallbackInsights(params.role)
  const expiresAt = getExpiry(params.role)
  const generatedAt = new Date().toISOString()

  await supabase.from('ai_insights').delete().eq('school_id', params.schoolId).eq('role', params.role).eq('generated_for_user_id', params.userId)
  const records = finalInsights.map((insight) => ({
    school_id: params.schoolId, role: params.role, generated_for_user_id: params.userId, entity_type: 'school',
    insight_type: safe.string(insight.insight_type), severity: insight.severity, title: safe.string(insight.title), narrative: safe.string(insight.narrative),
    recommendation: safe.string(insight.recommendation), consequence: insight.consequence ?? null, chart_data: insight.chart_data ?? null,
    confidence_level: insight.confidence_level ?? 'medium', data_points_used: safe.number(insight.data_points_used, 0), data_snapshot: {},
    generated_at: generatedAt, expires_at: expiresAt, is_read: false, action_taken: false, version: 1,
  }))
  const { data: inserted } = await supabase.from('ai_insights').insert(records).select('*')
  const insights = safe.array<AIInsight>(inserted)
  console.log(`[INSIGHTS] Generated ${insights.length} insights for ${params.role} in ${Date.now() - start}ms`)
  return { insights, generatedAt, provider: 'openai', fromCache: false }
}
