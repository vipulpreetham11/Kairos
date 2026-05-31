'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { ActionResult, DraftResult } from '@/types/ai'

type ActionType =
  | 'attendance_warning'
  | 'fee_reminder'
  | 'academic_concern'
  | 'general_followup'
  | 'positive_reinforcement'

type Channel = 'whatsapp' | 'sms'

interface DraftActionParams {
  studentId: string
  schoolId: string
  userId: string
  actionType: ActionType
  channel: Channel
  additionalContext?: string
}

interface ActionDrawerProps {
  isOpen: boolean
  onClose: () => void
  studentId: string
  studentName: string
  schoolId: string
  userId: string
  onDraft: (params: DraftActionParams) => Promise<ActionResult<DraftResult>>
}

const TABS: Array<{ value: ActionType; label: string }> = [
  { value: 'attendance_warning', label: 'Attendance' },
  { value: 'fee_reminder', label: 'Fee Reminder' },
  { value: 'academic_concern', label: 'Academic' },
  { value: 'general_followup', label: 'Follow Up' },
  { value: 'positive_reinforcement', label: 'Praise' },
]

export function ActionDrawer({
  isOpen,
  onClose,
  studentId,
  studentName,
  schoolId,
  userId,
  onDraft,
}: ActionDrawerProps) {
  const [actionType, setActionType] = useState<ActionType>('attendance_warning')
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [isGenerating, setIsGenerating] = useState(false)
  const [draftResult, setDraftResult] = useState<DraftResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function generateDraft(nextActionType?: ActionType, nextChannel?: Channel) {
    setIsGenerating(true)
    setError(null)
    const selectedActionType = nextActionType ?? actionType
    const selectedChannel = nextChannel ?? channel

    const result = await onDraft({
      studentId,
      schoolId,
      userId,
      actionType: selectedActionType,
      channel: selectedChannel,
    })

    if (result.success) {
      setDraftResult(result.data)
      setMessage(result.data.message)
    } else {
      setError(result.error)
    }

    setIsGenerating(false)
  }

  useEffect(() => {
    if (isOpen) {
      void generateDraft()
    } else {
      setDraftResult(null)
      setError(null)
      setMessage('')
    }
  }, [isOpen])

  return (
    <>
      {isOpen ? <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} /> : null}

      <aside
        className={`fixed right-0 top-0 z-50 h-full w-96 bg-white transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Draft Message - {studentName}</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-slate-600 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-slate-200 px-4 py-2">
            <div className="flex flex-wrap gap-3 text-xs">
              {TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    setActionType(tab.value)
                    void generateDraft(tab.value, channel)
                  }}
                  className={`border-b-2 pb-1 ${
                    tab.value === actionType
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setChannel('whatsapp')
                  void generateDraft(actionType, 'whatsapp')
                }}
                className={`rounded px-3 py-1.5 text-xs ${
                  channel === 'whatsapp' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => {
                  setChannel('sms')
                  void generateDraft(actionType, 'sms')
                }}
                className={`rounded px-3 py-1.5 text-xs ${
                  channel === 'sms' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                SMS
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {isGenerating ? (
              <div>
                <p className="mb-3 text-sm text-slate-600">Generating message...</p>
                <div className="space-y-2">
                  <div className="h-4 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 animate-pulse rounded bg-gray-200" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
                </div>
              </div>
            ) : null}

            {!isGenerating && error ? (
              <div className="space-y-3">
                <p className="text-sm text-red-600">{error}</p>
                <button
                  type="button"
                  onClick={() => void generateDraft()}
                  className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                >
                  Try Again
                </button>
              </div>
            ) : null}

            {!isGenerating && !error && draftResult ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  {draftResult.recipient_name} {draftResult.recipient_phone ? `- ${draftResult.recipient_phone}` : ''}
                </p>
                <textarea
                  rows={8}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-md border border-slate-300 p-2 text-sm text-slate-800"
                />
                <p className="text-xs text-slate-500">{message.length} characters</p>
              </div>
            ) : null}
          </div>

          <div className="flex gap-2 border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={() => void generateDraft()}
              disabled={!message}
              className={`rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 ${
                !message ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(message)}
              disabled={!draftResult}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-60"
            >
              Copy Message
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-slate-900 px-3 py-1.5 text-xs text-white"
            >
              Close
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
