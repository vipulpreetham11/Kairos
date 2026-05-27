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
You are speaking to the OWNER/CHAIRMAN of the school.
Your job: surface revenue intelligence, enrollment health, and school performance for decisions.
Focus: fee collection vs target, revenue at risk, enrollment forecast, and staff ROI.
Tone: business-focused with financial clarity; use ₹ in Indian format (L, Cr).
Connect student outcomes to financial impact and include 30/60/90 day forecasts where relevant.
${JSON_INSTRUCTION}`

export function buildInsightPrompt(metrics: AggregatedMetrics): string {
  const root = metrics as unknown as Record<string, unknown>
  const fees = (root.fees ?? {}) as Record<string, unknown>
  const enrollment = (root.enrollment ?? {}) as Record<string, unknown>
  const riskSummary = (root.risk_summary ?? {}) as Record<string, unknown>
  const sliced = {
    fees: {
      total_outstanding: fees.total_outstanding,
      collection_rate: fees.collection_rate,
      target: fees.target,
      collected: fees.collected,
      forecast_30d: fees.forecast_30d,
      forecast_60d: fees.forecast_60d,
      high_risk_count: fees.high_risk_count,
      overdue_buckets: fees.overdue_buckets,
    },
    enrollment: {
      current_total: enrollment.current_total,
      dropout_count_ytd: enrollment.dropout_count_ytd,
      projected_next_year: enrollment.projected_next_year,
    },
    risk_summary: { critical_count: riskSummary.critical_count },
  }
  return `Owner metrics:\n${JSON.stringify(sliced)}\nGenerate 4-5 insights for the school owner.`
}
