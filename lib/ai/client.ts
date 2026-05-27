import 'server-only'
import OpenAI from 'openai'
import type { AIProvider } from '@/types/ai'

type AIMessage = { role: 'system' | 'user' | 'assistant'; content: string }

interface AICallParams {
  messages: AIMessage[]
  temperature?: number
  maxTokens?: number
  provider?: AIProvider
  responseFormat?: 'text' | 'json'
}

interface AICallMeta {
  provider: AIProvider
  model: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  success: boolean
  error?: string
}

const PROVIDERS = {
  openai: {
    baseURL: undefined as string | undefined,
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o',
    maxTokens: 1500,
  },
  nim: {
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY ?? '',
    model: 'llama-3.1-8b-instant',
    maxTokens: 1500,
  },
} as const

const FAILOVER_THRESHOLD = 3
const providerHealth: Record<'openai' | 'nim', { consecutiveFailures: number }> = {
  openai: { consecutiveFailures: 0 },
  nim: { consecutiveFailures: 0 },
}

export const AI_TEMPERATURE = {
  FACTUAL: 0.3,
  SYNTHESIS: 0.4,
  CREATIVE: 0.6,
} as const

function selectProvider(explicitProvider?: AIProvider): 'openai' | 'nim' {
  if (explicitProvider === 'openai' || explicitProvider === 'nim') return explicitProvider
  if (providerHealth.nim.consecutiveFailures >= FAILOVER_THRESHOLD) return 'openai'
  return 'nim'
}

function getFallbackProvider(provider: 'openai' | 'nim'): 'openai' | 'nim' {
  return provider === 'openai' ? 'nim' : 'openai'
}

function createAIClient(provider: 'openai' | 'nim'): OpenAI {
  // Skip OpenAI if key is invalid/disabled
  if (provider === 'openai' && 
      (!process.env.OPENAI_API_KEY || 
       process.env.OPENAI_API_KEY === 'disabled')) {
    throw new Error('OpenAI disabled')
  }
  const config = PROVIDERS[provider]
  if (!config.apiKey) throw new Error(`Missing API key for provider: ${provider}`)
  return new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL })
}

function createStreamFromAsyncIterable(
  source: AsyncIterable<{ choices?: Array<{ delta?: { content?: string | null } }> }>
): ReadableStream {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of source) {
          const content = chunk.choices?.[0]?.delta?.content ?? ''
          if (content) controller.enqueue(encoder.encode(content))
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}

export function logAICall(meta: AICallMeta): void {
  const suffix = meta.error ? ` error="${meta.error}"` : ''
  console.log(
    `[AI] provider=${meta.provider} model=${meta.model} tokens=${meta.inputTokens}/${meta.outputTokens} duration=${meta.durationMs}ms success=${meta.success}${suffix}`
  )
}

// LM Studio / local models don't support system role
// Merge system message into first user message
function preprocessMessages(
  messages: AICallParams['messages'],
  provider: AIProvider
): AICallParams['messages'] {
  if (provider !== 'nim') return messages
  const system = messages.find(m => m.role === 'system')
  const rest = messages.filter(m => m.role !== 'system')
  if (!system) return rest
  return [
    { role: 'user', content: system.content + '\n\n' + (rest[0]?.content ?? '') },
    ...rest.slice(1)
  ]
}

async function attemptCall(provider: 'openai' | 'nim', params: AICallParams): Promise<string> {
  const start = Date.now()
  const config = PROVIDERS[provider]
  const client = createAIClient(provider)
  const processedMessages = preprocessMessages(params.messages, provider)
  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      messages: processedMessages,
      temperature: params.temperature ?? AI_TEMPERATURE.FACTUAL,
      max_tokens: params.maxTokens ?? config.maxTokens,
      ...(provider === 'openai' && params.responseFormat === 'json'
        ? { response_format: { type: 'json_object' as const } }
        : {}),
    })
    providerHealth[provider].consecutiveFailures = 0
    logAICall({
      provider,
      model: config.model,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      durationMs: Date.now() - start,
      success: true,
    })
    return completion.choices[0]?.message?.content ?? ''
  } catch (error: unknown) {
    providerHealth[provider].consecutiveFailures += 1
    const message = error instanceof Error ? error.message : 'Unknown AI error'
    logAICall({
      provider,
      model: config.model,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - start,
      success: false,
      error: message,
    })
    throw error
  }
}

export async function callAI(params: AICallParams): Promise<string> {
  const primary = selectProvider(params.provider)
  try {
    return await attemptCall(primary, params)
  } catch {
    const fallback = getFallbackProvider(primary)
    return attemptCall(fallback, params)
  }
}

async function attemptStream(provider: 'openai' | 'nim', params: AICallParams): Promise<ReadableStream> {
  const start = Date.now()
  const config = PROVIDERS[provider]
  const client = createAIClient(provider)
  const processedMessages = preprocessMessages(params.messages, provider)
  try {
    const stream = await client.chat.completions.create({
      model: config.model,
      messages: processedMessages,
      temperature: params.temperature ?? AI_TEMPERATURE.SYNTHESIS,
      max_tokens: params.maxTokens ?? config.maxTokens,
      stream: true,
      ...(provider === 'openai' && params.responseFormat === 'json'
        ? { response_format: { type: 'json_object' as const } }
        : {}),
    })
    providerHealth[provider].consecutiveFailures = 0
    logAICall({
      provider,
      model: config.model,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - start,
      success: true,
    })
    return createStreamFromAsyncIterable(stream)
  } catch (error: unknown) {
    providerHealth[provider].consecutiveFailures += 1
    const message = error instanceof Error ? error.message : 'Unknown AI stream error'
    logAICall({
      provider,
      model: config.model,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - start,
      success: false,
      error: message,
    })
    throw error
  }
}

export async function callAIStream(params: AICallParams): Promise<ReadableStream> {
  const primary = selectProvider(params.provider)
  try {
    return await attemptStream(primary, params)
  } catch {
    const fallback = getFallbackProvider(primary)
    return attemptStream(fallback, params)
  }
}
