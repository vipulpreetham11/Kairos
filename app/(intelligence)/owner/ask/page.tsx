'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { askOwnerAI } from './actions'
import { Send, Loader2, ChevronRight } from 'lucide-react'
import type { ConversationTurn, NLQueryResult } from '@/types/ai'

type Message = {
  id: string
  type: 'user' | 'assistant'
  content: string
  result?: NLQueryResult
  loading?: boolean
}

const SUGGESTIONS = [
  'Will we hit fee collection target this term?',
  'How much revenue is at risk from defaulters?',
  'Which class has the most fee defaults?',
  'What is our enrollment count this year?',
  'How many students are at critical dropout risk?',
  'Which fee head has the lowest collection rate?',
]

function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-emerald-50 text-emerald-700',
    medium: 'bg-amber-50 text-amber-700',
    low: 'bg-slate-50 text-slate-500',
  }
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 ${styles[confidence]}`}>
      {confidence} confidence
    </span>
  )
}

export default function OwnerAskPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [input])

  async function handleSubmit(question: string) {
    const trimmed = question.trim()
    if (!trimmed || isLoading) return

    const userMsgId = crypto.randomUUID()
    const assistantMsgId = crypto.randomUUID()

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, type: 'user', content: trimmed },
      { id: assistantMsgId, type: 'assistant', content: '', loading: true },
    ])
    setInput('')
    setIsLoading(true)

    const response = await askOwnerAI(trimmed, conversationHistory)

    if (response.success) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { id: assistantMsgId, type: 'assistant', content: response.result.answer, result: response.result, loading: false }
            : m
        )
      )
      setConversationHistory((prev) =>
        [
          ...prev,
          { role: 'user' as const, content: trimmed },
          { role: 'assistant' as const, content: response.result.answer },
        ].slice(-6)
      )
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { id: assistantMsgId, type: 'assistant', content: "Sorry, I couldn't process that. Try again.", loading: false }
            : m
        )
      )
    }

    setIsLoading(false)
  }

  function handleSuggestionClick(suggestion: string) {
    handleSubmit(suggestion)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(input)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <Link
          href="/owner"
          className="text-sm text-slate-500 hover:text-slate-700 transition-colors inline-flex items-center gap-1 mb-3"
        >
          <span>&#8592;</span> Owner Dashboard
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Ask AI</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Ask anything about your school&apos;s finances and performance
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center h-full px-4 py-12">
            <div className="rounded-full bg-blue-50 p-4 mb-4">
              <span className="text-blue-600 font-bold text-lg">AI</span>
            </div>
            <h2 className="text-lg font-medium text-slate-700 mb-2">
              What would you like to know?
            </h2>
            <p className="text-sm text-slate-500 max-w-sm text-center">
              Ask about fee collections, enrollment trends, defaulters, or any financial and performance metric.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-6 max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestionClick(s)}
                  className="border border-slate-200 rounded-full px-4 py-2 text-sm text-slate-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages List */
          <div className="space-y-4 p-4">
            {messages.map((msg) => (
              <div key={msg.id} className={msg.type === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                {msg.type === 'user' ? (
                  <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-xs">
                    {msg.content}
                  </div>
                ) : msg.loading ? (
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-2xl flex items-center gap-2">
                    <Loader2 className="animate-spin h-4 w-4 text-slate-400" />
                    <span className="text-sm text-slate-500">Analyzing your question...</span>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-2xl space-y-3">
                    <p className="text-sm text-slate-800 leading-relaxed">{msg.content}</p>

                    {msg.result && (
                      <>
                        {msg.result.data_used.record_count > 0 && (
                          <p className="text-xs text-slate-400">
                            Based on {msg.result.data_used.record_count} records from{' '}
                            {msg.result.data_used.tables.join(', ')}
                          </p>
                        )}

                        <ConfidenceBadge confidence={msg.result.confidence} />

                        {msg.result.follow_up_suggestions.length > 0 && (
                          <div className="pt-1">
                            <p className="text-xs text-slate-400 mb-2">You might also ask:</p>
                            <div className="flex flex-wrap gap-2">
                              {msg.result.follow_up_suggestions.slice(0, 3).map((s) => (
                                <button
                                  key={s}
                                  onClick={() => handleSuggestionClick(s)}
                                  className="border border-slate-200 rounded-full px-3 py-1 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer flex items-center gap-1"
                                >
                                  {s}
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white p-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about fees, enrollment, student risk..."
              maxLength={500}
              disabled={isLoading}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none overflow-y-auto focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ maxHeight: '120px' }}
            />
            {input.length > 400 && (
              <p className="text-xs text-slate-400 text-right mt-1">{input.length}/500</p>
            )}
          </div>
          <button
            onClick={() => handleSubmit(input)}
            disabled={isLoading || input.trim() === ''}
            className="bg-blue-600 text-white rounded-xl p-3 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="animate-spin h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
