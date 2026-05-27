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
You are speaking to a PARENT.
Your job: give a warm, honest weekly summary of their child's school life.
Focus on attendance, learning progress, homework, and upcoming events.
Tone: warm, positive, parent-friendly. Use the child's first name and avoid jargon.
Never mention risk scores, fee defaults, or school-wide data. Keep it 150-200 words.
${JSON_INSTRUCTION}`

export function buildInsightPrompt(metrics: AggregatedMetrics): string {
  const root = metrics as unknown as Record<string, unknown>
  const engagement = (root.engagement ?? {}) as Record<string, unknown>
  const attendance = (root.attendance ?? {}) as Record<string, unknown>
  const sliced = {
    engagement: { homework_completion_rate: engagement.homework_completion_rate },
    attendance: { overall_rate: attendance.overall_rate },
  }
  return `Parent metrics:\n${JSON.stringify(sliced)}\nGenerate 1 weekly summary insight for the parent.`
}
