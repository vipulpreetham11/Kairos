'use client'

import { useState } from 'react'
import { expandDiaryEntry, saveDiaryEntry } from './diary-actions'
import { toast } from 'sonner'

interface TeacherDiaryCopilotProps {
  schoolId: string
  userId: string
  sectionIds: string[]
}

export function TeacherDiaryCopilot({ schoolId, userId, sectionIds }: TeacherDiaryCopilotProps) {
  const [input, setInput] = useState('')
  const [expanded, setExpanded] = useState('')
  const [isExpanding, setIsExpanding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const sectionId = sectionIds[0] ?? ''

  async function handleExpand() {
    if (!input.trim()) return
    setIsExpanding(true)
    const res = await expandDiaryEntry(input, schoolId, userId)
    if (res.success) {
      setExpanded(res.data.expanded)
    } else {
      toast.error(res.error)
    }
    setIsExpanding(false)
  }

  async function handleSave() {
    if (!expanded || !sectionId) {
      toast.error('Cannot save: missing diary entry or section ID')
      return
    }
    setIsSaving(true)
    const res = await saveDiaryEntry(expanded, schoolId, sectionId)
    if (res.success) {
      setSaved(true)
      toast.success('Diary entry saved successfully')
    } else {
      toast.error(res.error)
    }
    setIsSaving(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
      <textarea 
        className="w-full border border-gray-200 rounded p-3 text-sm focus:outline-none focus:border-blue-500"
        rows={3}
        placeholder="What did you teach today? (e.g. photosynthesis, quadratic equations)"
        value={input}
        onChange={e => {
          setInput(e.target.value)
          setSaved(false)
          setExpanded('')
        }}
      />
      <button 
        className="px-4 py-2 bg-blue-50 text-blue-600 rounded text-sm font-medium hover:bg-blue-100 disabled:opacity-50"
        onClick={handleExpand}
        disabled={isExpanding || !input.trim()}
      >
        {isExpanding ? 'Expanding...' : 'Expand with AI'}
      </button>

      {expanded && (
        <div className="space-y-4 pt-4 border-t border-gray-100">
          <textarea
            className="w-full border border-gray-200 rounded p-3 text-sm bg-gray-50 focus:outline-none"
            rows={4}
            value={expanded}
            readOnly
          />
          <button
            className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            onClick={handleSave}
            disabled={isSaving || saved || !sectionId}
          >
            {saved ? 'Saved' : isSaving ? 'Saving...' : 'Save to Diary'}
          </button>
        </div>
      )}
    </div>
  )
}
