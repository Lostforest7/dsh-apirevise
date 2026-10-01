import { z } from 'zod'

export const METHOD = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
export type Method = z.infer<typeof METHOD>
export const BODY_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH'])

export const EndpointSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  method: METHOD,
  url: z.string().max(2000),
  headers: z.record(z.string().trim().min(1).max(1000), z.string().max(4000)),
  body: z.string().max(65536).optional(),
})
export type Endpoint = z.infer<typeof EndpointSchema>

export const ResponseSchema = z.object({
  id: z.string().uuid(),
  endpointId: z.string().uuid(),
  capturedAt: z.string(),
  status: z.number().int().min(100).max(599).nullable(),
  statusText: z.string().max(200),
  headers: z.record(z.string().max(1000), z.string().max(4000)),
  bodyKind: z.enum(['json', 'text', 'empty', 'unsupported']),
  bodyText: z.string().max(5000000),
  durationMs: z.number().int().nonnegative(),
  error: z.string().max(2000).optional(),
})
export type ResponseCapture = z.infer<typeof ResponseSchema>

export const VerdictSchema = z.object({
  endpointId: z.string().uuid(),
  status: z.enum(['pending', 'accepted', 'needs-work']),
  feedback: z.string().max(3000),
  reviewedCandidateId: z.string().uuid().optional(),
})
export type Verdict = z.infer<typeof VerdictSchema>

export const SnapshotSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  sources: z.record(z.string(), z.string()),
  responses: z.array(ResponseSchema).max(20),
})
export type Snapshot = z.infer<typeof SnapshotSchema>

export const RoundSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  version: z.number().int().positive(),
  sessionId: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(160),
  goal: z.string().trim().min(1).max(2000),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(['draft', 'sent', 'comparing', 'accepted']),
  endpoints: z.array(EndpointSchema).min(1).max(20),
  baseline: SnapshotSchema,
  candidate: SnapshotSchema.optional(),
  verdicts: z.array(VerdictSchema).max(20),
  lastSentAt: z.string().optional(),
})
export type Round = z.infer<typeof RoundSchema>
export type RoundStatus = Round['status']

/** One field-level difference inside a JSON response body. */
export type FieldDiff =
  | { kind: 'added'; path: string; after: unknown }
  | { kind: 'removed'; path: string; before: unknown }
  | { kind: 'type-changed'; path: string; before: unknown; after: unknown; beforeType: string; afterType: string }
  | { kind: 'value-changed'; path: string; before: unknown; after: unknown; numeric: boolean; delta: number | null }
  | { kind: 'array-resized'; path: string; beforeLength: number; afterLength: number }

/** Computed comparison of one endpoint between baseline and candidate. */
export interface EndpointDiff {
  endpoint: Endpoint
  baseline: ResponseCapture | null
  candidate: ResponseCapture | null
  changed: boolean
  statusChanged: boolean
  statusBefore: number | null
  statusAfter: number | null
  bodyCompared: 'json' | 'text' | 'skipped'
  bodyChanged: boolean
  fields: FieldDiff[]
  textPatch: string
  errorSummary: string | null
}

export type RoundView = Round & { stale: boolean; codeDiff: string; endpointDiffs: EndpointDiff[] }
export type RoundSummary = Pick<Round, 'id' | 'title' | 'status' | 'updatedAt' | 'version'> & { endpointCount: number; changedCount: number; acceptedCount: number }

export interface RevisionApi {
  call<T>(operation: string, args?: Record<string, unknown>): Promise<T>
  send?(text: string): Promise<void>
}

export class ApiReviseError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ApiReviseError' }
}

/** Accept only local http/https endpoints with an explicit port. */
export function parseEndpointUrl(value: string): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new ApiReviseError('invalid-url', '请输入完整地址，例如 http://127.0.0.1:3000/api/price') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ApiReviseError('invalid-url', '只支持 http/https 协议。')
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.port || url.username || url.password) {
    throw new ApiReviseError('invalid-url', '第一版只连接本机带端口的 http/https 服务。')
  }
  return url
}
