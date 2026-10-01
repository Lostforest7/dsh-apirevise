import { useMemo, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { App } from '../ui/App.tsx'
import { Icon } from '../ui/icons.tsx'
import type { RevisionApi } from '../shared/model.ts'
import styles from '../ui/styles.css'

export const name = 'dsh-apirevise-client'
export const inject = ['slots', 'connection', 'sessions', 'uiSession']
declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { dshApiRevise: unknown }
}

function Launcher({ ctx }: { ctx: Context }) {
  const current = ctx.uiSession.adapter.current
  const binding = useSyncExternalStore(current.subscribe, current.getSnapshot)
  const id = binding.key as SessionId | undefined
  const [opened, setOpened] = useState(false)
  const api = useMemo<RevisionApi>(() => ({
    async call<T>(operation: string, args = {}): Promise<T> {
      if (!id) throw new Error('请先选择一个项目会话。')
      const connection = ctx.get('connection') as ConnectionHandle
      const result = await connection.rpc.call('/api', 'dsh-apirevise', { operation, sessionId: id, args })
      if (!result.ok) throw new Error(result.error.message)
      return result.value as T
    },
    async send(text: string): Promise<void> {
      if (!id) throw new Error('请先选择一个项目会话。')
      await ctx.sessions.using(id, { source: 'dshApiRevise' }, async reference => {
        const binding = await reference.ready
        const result = await binding.session.prompt([{ type: 'text', text }], 'queue')
        if (!result.ok) throw new Error(result.error.message)
      })
    },
  }), [ctx, id])
  if (!id) return null
  return opened
    ? <div className="arv-overlay"><App key={id} api={api} sessionLabel={`DSH 会话 · ${id.replace(/^session-/, '').slice(0, 8)}`} onClose={() => setOpened(false)} /></div>
    : <button className="arv-launch" onClick={() => setOpened(true)}><Icon name="api" />API 接口验收台</button>
}

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const tag = document.createElement('style'); tag.dataset.plugin = 'dsh-apirevise'; tag.textContent = styles; document.head.append(tag)
    return () => tag.remove()
  }, 'dsh-apirevise: stylesheet')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'dsh-apirevise-launcher', inject: () => ({ ctx }) }, Launcher))
}
