'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionDrawer } from '@/components/shared/action-drawer'
import { EmptyState } from '@/components/shared/empty-state'
import { StudentMiniCard } from '@/components/shared/student-mini-card'
import type { AggregatedMetrics } from '@/types/metrics'
import { draftMessageAction } from './draft-actions'

interface RiskStudentsPanelProps {
  students: AggregatedMetrics['risk_summary']['top_at_risk']
  schoolId: string
  userId?: string
}

export function RiskStudentsPanel({ students, schoolId, userId = '' }: RiskStudentsPanelProps) {
  const router = useRouter()
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string } | null>(null)

  if (students.length === 0) return <EmptyState role="principal" module="risk" />

  return (
    <div className="space-y-3">
      {students.slice(0, 5).map((student) => (
        <StudentMiniCard
          key={student.student_id}
          student={student}
          onViewProfile={(studentId) => router.push(`/principal/${studentId}`)}
          onDraftMessage={(studentId) => {
            const found = students.find((s) => s.student_id === studentId)
            setSelectedStudent({ id: studentId, name: found?.student_name ?? 'Student' })
          }}
        />
      ))}

      <ActionDrawer
        isOpen={Boolean(selectedStudent)}
        onClose={() => setSelectedStudent(null)}
        studentId={selectedStudent?.id ?? ''}
        studentName={selectedStudent?.name ?? ''}
        schoolId={schoolId}
        userId={userId}
        onDraft={draftMessageAction}
      />
    </div>
  )
}
