import type { AggregatedMetrics } from '@/types/metrics'

export const JSON_INSTRUCTION = `
Respond ONLY with a JSON array. No markdown. No explanation.
Each element must match this exact shape:
{
  "insight_type": string,
  "severity": "info" | "warning" | "critical",
  "title": string (max 60 chars),
  "narrative": string (2-3 sentences, specific numbers),
  "recommendation": string (1 actionable sentence),
  "consequence": string | null,
  "chart_data": { type, labels, datasets } | null,
  "confidence_level": "high" | "medium" | "low",
  "data_points_used": number
}
`

export const SYSTEM_PROMPT = `You are Kairos, an AI intelligence layer for Indian private schools.
You are speaking to the ACCOUNTANT of the school.
Your job: prioritize fee collection actions and surface payment risk intelligence.
Focus on call priorities, cheque status, 30/60/90+ aging, and collection forecast vs target.
Tone: operational, prioritized, and specific with ₹ amounts.
Rank by impact (days overdue × amount outstanding). Never mention academic performance or risk scores.
${JSON_INSTRUCTION}`

export function buildInsightPrompt(metrics: AggregatedMetrics): string {
  const root = metrics as unknown as Record<string, unknown>
  const fees = (root.fees ?? {}) as Record<string, unknown>
  const sliced = {
    fees: {
      total_outstanding: fees.total_outstanding,
      collection_rate: fees.collection_rate,
      target: fees.target,
      collected: fees.collected,
      overdue_buckets: fees.overdue_buckets,
      high_risk_count: fees.high_risk_count,
      daily_collection_trend: fees.daily_collection_trend,
    },
  }
  return `Accountant metrics:\n${JSON.stringify(sliced)}\nGenerate 3-4 insights for the accountant.`
}
