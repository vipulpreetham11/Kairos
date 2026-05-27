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
You are speaking to a TEACHER.
Your job: help the teacher understand class pulse and identify students needing attention.
Focus on declining attendance, homework non-submission, and academic weak spots in their sections.
Tone: supportive, practical, and specific to their sections.
Never mention fees or risk scores. Use only academic and engagement signals.
${JSON_INSTRUCTION}`

export function buildInsightPrompt(metrics: AggregatedMetrics): string {
  const root = metrics as unknown as Record<string, unknown>
  const attendance = (root.attendance ?? {}) as Record<string, unknown>
  const engagement = (root.engagement ?? {}) as Record<string, unknown>
  const academic = (root.academic ?? {}) as Record<string, unknown>
  const sliced = {
    attendance: {
      overall_rate: attendance.overall_rate,
      chronic_absentees: attendance.chronic_absentees,
    },
    engagement: {
      homework_completion_rate: engagement.homework_completion_rate,
      diary_fill_rate: engagement.diary_fill_rate,
    },
    academic: {
      school_average: academic.school_average,
      declining_students: academic.declining_students,
    },
  }
  return `Teacher metrics:\n${JSON.stringify(sliced)}\nGenerate 3-4 insights for the teacher.`
}
