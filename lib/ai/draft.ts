import 'server-only'
import { AI_TEMPERATURE, callAI } from '@/lib/ai/client'
import { createServerClient } from '@/lib/supabase/server'
import { safe } from '@/lib/utils/safe'
import type { DraftResult } from '@/types/ai'

interface DraftParams {
  studentId: string
  schoolId: string
  userId: string
  actionType: 'attendance_warning' | 'fee_reminder' | 'academic_concern' | 'general_followup' | 'positive_reinforcement'
  channel: 'whatsapp' | 'sms'
  additionalContext?: string
}

interface StudentActionContext {
  student_name: string
  class_name: string
  section_name: string
  parent_name: string
  parent_phone: string
  attendance_rate: number
  days_absent_this_month: number
  outstanding_fees: number
  overdue_days: number
  last_exam_percentage: number | null
  homework_completion_rate: number
  risk_level: string
}

function buildDraftSystemPrompt(channel: 'whatsapp' | 'sms'): string {
  if (channel === 'whatsapp') {
    return 'You are drafting a WhatsApp message from a school to a parent. Tone: warm, respectful, specific. Length: 80-120 words. Language: English with occasional Hindi words (ji, namaste) for warmth. Always address parent by name. Always mention child by first name. Always include one specific data point. End with a call to action. No emojis. No asterisks for bold.'
  }
  return 'You are drafting an SMS from a school to a parent. Tone: professional, brief. Length: maximum 160 characters. Include: child name, issue, contact number. No emojis.'
}

function assembleActionContext(context: StudentActionContext, actionType: DraftParams['actionType'], additionalContext?: string): string {
  const extra = additionalContext ? `\n${additionalContext}` : ''
  const exam = context.last_exam_percentage === null ? 'N/A' : `${Math.round(context.last_exam_percentage)}`
  return `Draft a ${actionType} message for:
Student: ${context.student_name}, Class ${context.class_name} ${context.section_name}
Parent: ${context.parent_name}

Current situation:
- Attendance this month: ${Math.round(context.attendance_rate)}% (${context.days_absent_this_month} days absent)
- Outstanding fees: ₹${Math.round(context.outstanding_fees / 100)} (${context.overdue_days} days overdue)
- Last exam average: ${exam}%
- Homework completion: ${Math.round(context.homework_completion_rate)}%
- Risk level: ${context.risk_level}
${extra}

Draft the message now.`
}

export async function draftAction(params: DraftParams): Promise<DraftResult> {
  const start = Date.now()
  const supabase = await createServerClient()
  const thirtyDaysAgoDate = new Date(Date.now() - 30 * 86400000)
  const thirtyDaysAgo = thirtyDaysAgoDate.toISOString()

  const [core, attendanceData, feeData, resultData, homeworkData] = await Promise.all([
    (async () => {
      try {
        const [studentRes, enrollmentRes, parentRes] = await Promise.all([
          supabase.from('students').select('full_name, admission_no').eq('id', params.studentId).eq('school_id', params.schoolId).single(),
          supabase.from('enrollments').select('classes(name), sections(name)').eq('student_id', params.studentId).eq('school_id', params.schoolId).order('created_at', { ascending: false }).limit(1),
          supabase.from('student_parents').select('parents(full_name, phone)').eq('student_id', params.studentId).eq('school_id', params.schoolId).eq('is_primary', true).limit(1),
        ])
        if (studentRes.error || !studentRes.data) throw new Error('Student not found')
        const enrollmentRow = safe.array<Record<string, unknown>>(enrollmentRes.data)[0] ?? {}
        const classObj = (typeof enrollmentRow.classes === 'object' && enrollmentRow.classes !== null ? enrollmentRow.classes : {}) as Record<string, unknown>
        const sectionObj = (typeof enrollmentRow.sections === 'object' && enrollmentRow.sections !== null ? enrollmentRow.sections : {}) as Record<string, unknown>
        const parentRow = safe.array<Record<string, unknown>>(parentRes.data)[0] ?? {}
        const parentObj = (typeof parentRow.parents === 'object' && parentRow.parents !== null ? parentRow.parents : {}) as Record<string, unknown>
        return {
          student_name: safe.string(studentRes.data.full_name),
          class_name: safe.string(classObj.name),
          section_name: safe.string(sectionObj.name),
          parent_name: safe.string(parentObj.full_name, 'Parent'),
          parent_phone: safe.string(parentObj.phone, ''),
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'Student not found') throw error
        return { student_name: '', class_name: '', section_name: '', parent_name: 'Parent', parent_phone: '' }
      }
    })(),
    (async () => {
      try {
        const { data } = await supabase.from('attendance').select('date, status').eq('student_id', params.studentId).eq('school_id', params.schoolId).gte('date', thirtyDaysAgo.slice(0, 10))
        const rows = safe.array<Record<string, unknown>>(data)
        const total = rows.length
        const present = rows.filter((r) => ['present', 'late'].includes(safe.string(r.status).toLowerCase())).length
        const absent = rows.filter((r) => safe.string(r.status).toLowerCase() === 'absent').length
        return { attendance_rate: total > 0 ? (present / total) * 100 : 0, days_absent_this_month: absent }
      } catch { return { attendance_rate: 0, days_absent_this_month: 0 } }
    })(),
    (async () => {
      try {
        const { data } = await supabase.from('fee_invoices').select('outstanding, due_date, status').eq('student_id', params.studentId).eq('school_id', params.schoolId).neq('status', 'cancelled')
        const rows = safe.array<Record<string, unknown>>(data)
        const outstanding_fees = Math.round(rows.reduce((sum, r) => sum + safe.number(r.outstanding), 0))
        const overdue_days = rows.reduce((max, r) => {
          if (safe.number(r.outstanding) <= 0) return max
          const due = safe.date(r.due_date); if (!due) return max
          return Math.max(max, Math.floor((Date.now() - due.getTime()) / 86400000))
        }, 0)
        return { outstanding_fees, overdue_days }
      } catch { return { outstanding_fees: 0, overdue_days: 0 } }
    })(),
    (async () => {
      try {
        const { data } = await supabase.from('results').select('marks_obtained, max_marks, exam_id').eq('student_id', params.studentId).eq('school_id', params.schoolId).order('created_at', { ascending: false }).limit(5)
        const rows = safe.array<Record<string, unknown>>(data)
        if (rows.length === 0) return { last_exam_percentage: null as number | null }
        const avg = rows.reduce((sum, r) => sum + (safe.number(r.marks_obtained) / Math.max(safe.number(r.max_marks), 1)) * 100, 0) / rows.length
        return { last_exam_percentage: avg }
      } catch { return { last_exam_percentage: null as number | null } }
    })(),
    (async () => {
      try {
        const { data } = await supabase.from('homework_submissions').select('status').eq('student_id', params.studentId).eq('school_id', params.schoolId).gte('created_at', thirtyDaysAgo)
        const rows = safe.array<Record<string, unknown>>(data)
        const total = rows.length
        const completed = rows.filter((r) => safe.string(r.status).toLowerCase() === 'completed').length
        return { homework_completion_rate: total > 0 ? (completed / total) * 100 : 0 }
      } catch { return { homework_completion_rate: 0 } }
    })(),
  ])

  if (!core.student_name) throw new Error('Student not found')

  const context: StudentActionContext = {
    student_name: core.student_name,
    class_name: core.class_name,
    section_name: core.section_name,
    parent_name: core.parent_name || 'Parent',
    parent_phone: core.parent_phone || '',
    attendance_rate: attendanceData.attendance_rate,
    days_absent_this_month: attendanceData.days_absent_this_month,
    outstanding_fees: feeData.outstanding_fees,
    overdue_days: feeData.overdue_days,
    last_exam_percentage: resultData.last_exam_percentage,
    homework_completion_rate: homeworkData.homework_completion_rate,
    risk_level: 'medium',
  }

  const systemPrompt = buildDraftSystemPrompt(params.channel)
  const userMessage = assembleActionContext(context, params.actionType, params.additionalContext)
  const aiResponse = await callAI({
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
    temperature: AI_TEMPERATURE.CREATIVE,
    maxTokens: 300,
  })
  const message = aiResponse.trim()
  console.log(`[DRAFT] actionType=${params.actionType} student=${params.studentId} duration=${Date.now() - start}ms`)
  return {
    recipient_name: context.parent_name,
    recipient_phone: context.parent_phone,
    message,
    channel: params.channel,
    character_count: message.length,
    context_used: {
      student_name: context.student_name,
      specific_metrics: [
        `Attendance: ${Math.round(context.attendance_rate)}%`,
        `Outstanding: ₹${Math.round(context.outstanding_fees / 100)}`,
        `Last exam: ${context.last_exam_percentage === null ? 'N/A' : Math.round(context.last_exam_percentage)}%`,
      ],
    },
  }
}
