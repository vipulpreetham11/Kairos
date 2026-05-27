export type Role =
  | 'owner'
  | 'principal'
  | 'teacher'
  | 'accountant'
  | 'parent'

export type Severity = 'info' | 'warning' | 'critical'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type InsightType =
  | 'attendance_anomaly'
  | 'fee_default_risk'
  | 'academic_decline'
  | 'dropout_risk'
  | 'collection_forecast'
  | 'curriculum_gap'
  | 'teacher_performance'
  | 'parent_engagement'
  | 'enrollment_health'
  | 'revenue_intelligence'
  | 'student_spotlight'
  | 'homework_completion'
  | 'concession_pending_approval'
  | 'weekly_summary'
  | 'system'

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export type AIProvider = 'openai' | 'nim' | 'fallback'

export interface SchoolContext {
  userId: string
  role: Role
  schoolId: string
  schoolName: string
  schoolLogo: string | null
  userName: string
  userEmail: string
  academicYearId: string | null
  academicYearName: string | null
  hasActiveYear: boolean
}

export interface RiskFactor {
  factor: 'attendance' | 'academic' | 'fee' | 'engagement'
  score: number
  weight: number
  detail: string
}

export interface StudentRiskScore {
  student_id: string
  attendance_score: number
  academic_score: number
  fee_score: number
  engagement_score: number
  composite_risk_score: number
  risk_level: RiskLevel
  risk_factors: RiskFactor[]
  previous_score: number | null
  score_delta: number | null
  trend: 'improving' | 'stable' | 'declining' | 'critical' | null
  projected_score_30d: number | null
  intervention_window_days: number | null
  computed_at: string
}

export interface ChartDataset {
  label: string
  data: number[]
  color?: string
  dashed?: boolean
  fill?: boolean
}

export interface ChartData {
  type: 'line' | 'bar' | 'area' | 'donut' | 'heatmap'
  labels: string[]
  datasets: ChartDataset[]
  threshold_value?: number
  threshold_label?: string
  stacked?: boolean
}

export interface AIInsight {
  id: string
  school_id: string
  role: Role
  generated_for_user_id: string | null
  student_id: string | null
  entity_type: string
  entity_id: string | null
  insight_type: InsightType
  severity: Severity
  title: string
  narrative: string
  recommendation: string
  consequence: string | null
  chart_data: ChartData | null
  data_snapshot: Record<string, unknown>
  confidence_level: ConfidenceLevel
  data_points_used: number
  generated_at: string
  expires_at: string
  is_read: boolean
  action_taken: boolean
  version: number
  superseded_by: string | null
}

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string }

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface NLQueryResult {
  answer: string
  data_used: {
    tables: string[]
    record_count: number
    date_range: { from: string; to: string }
  }
  confidence: ConfidenceLevel
  follow_up_suggestions: string[]
  raw_data?: Record<string, unknown>[]
  is_partial?: boolean
}

export interface DraftResult {
  recipient_name: string
  recipient_phone: string
  message: string
  channel: 'whatsapp' | 'sms'
  character_count: number
  context_used: {
    student_name: string
    specific_metrics: string[]
  }
}
