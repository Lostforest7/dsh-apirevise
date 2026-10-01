import { performance } from 'node:perf_hooks'
import { randomUUID } from 'node:crypto'
import { BODY_METHODS, parseEndpointUrl, type Endpoint, type ResponseCapture } from '../shared/model.ts'

export type Requester = (spec: Endpoint, signal?: AbortSignal) => Promise<ResponseCapture>

const MAX_BODY = 5_000_000
const MAX_HEADERS = 40
const MAX_HEADER_BYTES = 4_000
const MAX_TIMEOUT_MS = 30_000

function decode(bytes: Uint8Array): string | null {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return null }
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trimStart()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

/**
 * Send one endpoint request and record a lossless-enough response capture.
 * Network failures are recorded (status null + error), not thrown, so one
 * broken endpoint never hides the others. Invalid URLs throw before any I/O.
 */
export async function captureEndpoint(spec: Endpoint, signal?: AbortSignal, timeoutMs = 10_000): Promise<ResponseCapture> {
  const url = parseEndpointUrl(spec.url)
  const started = performance.now()
  const id = randomUUID()
  const capturedAt = new Date().toISOString()
  const timeout = AbortSignal.timeout(Math.min(Math.max(timeoutMs, 1), MAX_TIMEOUT_MS))
  const link = signal ? AbortSignal.any([signal, timeout]) : timeout
  const done = (patch: Partial<ResponseCapture> & { headers: Record<string, string> }): ResponseCapture => ({
    id, endpointId: spec.id, capturedAt, status: null, statusText: '', bodyKind: 'empty', bodyText: '', durationMs: Math.round(performance.now() - started), ...patch,
  })
  try {
    const headers: Record<string, string> = { ...spec.headers }
    if (!Object.keys(headers).some(key => key.toLowerCase() === 'accept')) headers.accept = 'application/json, text/plain;q=0.9, */*;q=0.1'
    const response = await fetch(url, {
      method: spec.method, headers,
      body: BODY_METHODS.has(spec.method) && spec.body ? spec.body : undefined,
      redirect: 'follow', signal: link,
    })
    const captured: Record<string, string> = {}
    let headerCount = 0
    for (const [key, value] of response.headers) {
      if (headerCount >= MAX_HEADERS) break
      captured[key] = value.length > MAX_HEADER_BYTES ? value.slice(0, MAX_HEADER_BYTES) : value
      headerCount++
    }
    const contentType = captured['content-type'] ?? ''
    if (response.status === 204 || response.status === 304 || spec.method === 'HEAD') {
      return done({ status: response.status, statusText: response.statusText, headers: captured })
    }
    const chunks: Uint8Array[] = []
    let total = 0
    let exceeded = false
    const reader = response.body?.getReader()
    if (reader) {
      try {
        for (;;) {
          const { done: finished, value } = await reader.read()
          if (finished) break
          total += value.byteLength
          if (total > MAX_BODY) { exceeded = true; await reader.cancel().catch(() => {}); break }
          chunks.push(value)
        }
      } finally { reader.releaseLock() }
    }
    if (exceeded) return done({ status: response.status, statusText: response.statusText, headers: captured, bodyKind: 'unsupported', error: 'body-too-large' })
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const text = decode(bytes)
    if (text === null) return done({ status: response.status, statusText: response.statusText, headers: captured, bodyKind: 'unsupported', error: 'binary-body' })
    const bodyKind = /json/i.test(contentType) || looksLikeJson(text) ? 'json' as const : 'text' as const
    return done({ status: response.status, statusText: response.statusText, headers: captured, bodyKind, bodyText: text })
  } catch (error) {
    const name = (error as Error)?.name
    const aborted = name === 'AbortError' || name === 'TimeoutError'
    return done({ headers: {}, error: aborted ? (signal?.aborted ? 'cancelled' : 'timeout') : error instanceof Error ? `${name}: ${error.message}` : String(error) })
  }
}
