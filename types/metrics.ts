import type { RiskFactor, RiskLevel, Role } from '@/types/ai'

export interface AggregatedMetrics {
  attendance: {
    overall_rate: number
    trend: number[]
    trend_labels: string[]
    chronic_absentees: number
    anomalous_sections: {
      section_id: string
      section_name: string
      drop_percentage: number
      days_declining: number
    }[]
  }
  fees: {
    total_outstanding: number
    collection_rate: number
    target: number
    collected: number
    forecast_30d: number
    forecast_60d: number
    high_risk_count: number
    overdue_buckets: {
      '0-30': { count: number; amount: number }
      '31-60': { count: number; amount: number }
      '61-90': { count: number; amount: number }
      '90+': { count: number; amount: number }
    }
    daily_collection_trend: number[]
  }
  academic: {
    school_average: number
    pass_rate: number
    subject_averages: {
      subject_id: string
      subject_name: string
      average: number
      pass_rate: number
      fail_count: number
    }[]
    declining_students: number
    top_performers: number
    at_risk_students: number
  }
  engagement: {
    homework_completion_rate: number
    diary_fill_rate: number
    parent_response_rate: number
    homework_trend: number[]
  }
  risk_summary: {
    critical_count: number
    high_count: number
    medium_count: number
    low_count: number
    top_at_risk: {
      student_id: string
      student_name: string
      admission_no: string
      class_name: string
      section_name: string
      composite_risk_score: number
      risk_level: RiskLevel
      risk_factors: RiskFactor[]
      trend: string
      intervention_window_days: number | null
    }[]
  }
  enrollment?: {
    current_total: number
    vs_last_year: number
    dropout_count_ytd: number
    pipeline_count: number
    projected_next_year: number
    class_wise_strength: {
      class_name: string
      count: number
    }[]
  }
  admissions?: {
    total_leads: number
    conversion_rate: number
    by_stage: Record<string, number>
    by_source: Record<string, number>
    overdue_followups: number
    pipeline_value: number
  }
  computed_at: string
}

export interface AggregateParams {
  role: Role
  schoolId: string
  academicYearId: string
  userId: string
  dateRange: { from: Date; to: Date }
  sectionIds?: string[]
  studentId?: string
}
