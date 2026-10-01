import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-session-query'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ApiReviseService } from '../core/service.ts'
import { ApiReviseError } from '../shared/model.ts'

export const name = 'dsh-apirevise'
export const inject = ['connection', 'sessionQuery']
const RequestSchema = z.object({ operation: z.string().max(40), sessionId: z.string().trim().min(1).max(200), args: z.unknown() })
const EnvelopeSchema = z.object({ type: z.literal('client-request'), rpcId: z.string().min(1).max(200), method: z.literal('dsh-apirevise'), payload: RequestSchema })

export function apply(ctx: Context): void {
  const service = new ApiReviseService()
  ctx.connection.fetch.register({ path: '/api/dsh-apirevise', methods: ['POST'], requestBody: 'buffered', fetch: async incoming => {
    let rpcId = randomUUID() as string
    let result: unknown
    try {
      const envelope = EnvelopeSchema.parse(await incoming.json())
      rpcId = envelope.rpcId
      const request = envelope.payload
      using observation = await ctx.sessionQuery.observeSession(request.sessionId as SessionId, { projectionMode: 'none', signal: incoming.signal })
      const workspace = observation.header.cwd
      if (!workspace) throw new ApiReviseError('no-workspace', '当前会话没有项目目录，请先创建项目会话。')
      const value = await service.execute(workspace, request.sessionId, request.operation, request.args, incoming.signal)
      result = { ok: true, value }
    } catch (error) {
      result = { ok: false, error: { code: error instanceof ApiReviseError ? error.code : error instanceof z.ZodError ? 'invalid-request' : 'apirevise/failed', message: error instanceof Error ? error.message : String(error), details: {} } }
    }
    return Response.json({ type: 'server-response', rpcId, result }, { headers: { 'cache-control': 'no-store' } })
  } })
  ctx.effect(() => () => service.dispose(), 'dsh-apirevise: request and storage lifetime')
}
