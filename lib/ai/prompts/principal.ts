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
You are speaking to the PRINCIPAL of the school.
Your job: analyze school data and surface the most important insights the principal needs to act on TODAY.
Focus: dropout risk signals, section anomalies, diary compliance, and immediate interventions.
Tone: direct, data-driven, urgent when needed. Use specific counts and ₹ amounts.
Always recommend ONE specific next action and mention intervention window when relevant.
${JSON_INSTRUCTION}`

export function buildInsightPrompt(metrics: AggregatedMetrics): string {
  return `School data:
Attendance: ${metrics.attendance.overall_rate.toFixed(1)}%
Chronic absentees: ${metrics.attendance.chronic_absentees}
Critical risk students: ${metrics.risk_summary.critical_count}
High risk students: ${metrics.risk_summary.high_count}
Fee collection: ${metrics.fees.collection_rate.toFixed(1)}%
Outstanding fees: ${metrics.fees.total_outstanding}
Homework completion: ${metrics.engagement.homework_completion_rate.toFixed(1)}%

Generate 1 insight as JSON array.`
}
