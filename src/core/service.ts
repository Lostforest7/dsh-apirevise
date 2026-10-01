import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { ApiReviseError, EndpointSchema, RoundSchema, parseEndpointUrl, type Endpoint, type Round, type RoundSummary, type RoundView, type Snapshot, type Verdict } from '../shared/model.ts'
import { atomicWrite, metadataDir, readRecord, roundDir } from './files.ts'
import { readSources, sameSources } from './sources.ts'
import { captureEndpoint, type Requester } from './request.ts'
import { diffEndpoints } from './diff.ts'
import { codeDiff, reportHtml, reportMarkdown, requestText } from './report.ts'

const ID = z.string().uuid()
const Version = z.number().int().positive()
const Base = z.object({ id: ID, version: Version })
const commands = {
  list: z.object({}), get: z.object({ id: ID }),
  create: z.object({ title: z.string().trim().min(1).max(160), goal: z.string().trim().min(1).max(2000), endpoints: z.array(EndpointSchema.omit({ id: true })).min(1).max(20) }),
  updateEndpoints: Base.extend({ endpoints: z.array(EndpointSchema.omit({ id: true })).min(1).max(20) }),
  request: Base, markSent: Base, rerun: Base,
  review: Base.extend({ endpointId: ID, status: z.enum(['accepted', 'needs-work']), feedback: z.string().max(3000).default('') }),
  finish: Base, report: z.object({ id: ID }),
} as const

export class ApiReviseService {
  private readonly locks = new Map<string, Promise<unknown>>()
  constructor(readonly requester: Requester = captureEndpoint) {}

  async execute(workspace: string, sessionId: string, operation: string, payload: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!Object.hasOwn(commands, operation)) throw new ApiReviseError('unknown-operation', '未知操作。')
    const parsed = commands[operation as keyof typeof commands].parse(payload ?? {})
    const previous = this.locks.get(workspace) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(async () => {
      signal?.throwIfAborted()
      return this.run(workspace, sessionId, operation, parsed, signal)
    })
    this.locks.set(workspace, next)
    try { return await next } finally { if (this.locks.get(workspace) === next) this.locks.delete(workspace) }
  }

  private async load(workspace: string, sessionId: string, id: string): Promise<Round> {
    const dir = await roundDir(workspace, id)
    const round = RoundSchema.parse(JSON.parse(await readRecord(dir, 'round.json')))
    if (round.sessionId !== sessionId) throw new ApiReviseError('wrong-session', '这轮验收属于另一个 DSH 会话。')
    return round
  }

  private async save(workspace: string, round: Round): Promise<void> {
    const dir = await roundDir(workspace, round.id, true)
    await atomicWrite(path.join(dir, 'round.json'), JSON.stringify(RoundSchema.parse(round)))
  }

  private async view(workspace: string, round: Round): Promise<RoundView> {
    const current = await readSources(workspace)
    const reference = round.candidate ?? round.baseline
    return { ...round, stale: !sameSources(reference.sources, current), codeDiff: codeDiff(round), endpointDiffs: diffEndpoints(round) }
  }

  private async snapshot(workspace: string, endpoints: Endpoint[], signal?: AbortSignal): Promise<Snapshot> {
    const sources = await readSources(workspace)
    const responses = []
    for (const spec of endpoints) {
      signal?.throwIfAborted()
      responses.push(await this.requester(spec, signal))
    }
    if (!sameSources(sources, await readSources(workspace))) throw new ApiReviseError('changed-during-capture', '采集期间源码发生变化，请等后端保存完成后再试。')
    return { id: randomUUID(), createdAt: new Date().toISOString(), sources, responses }
  }

  private materialize(input: z.infer<typeof commands.create>['endpoints'][number]): Endpoint {
    parseEndpointUrl(input.url)
    return EndpointSchema.parse({ id: randomUUID(), ...input })
  }

  private async run(workspace: string, sessionId: string, operation: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    if (operation === 'list') {
      const dir = await metadataDir(workspace)
      const summaries: RoundSummary[] = []
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || !ID.safeParse(entry.name).success) continue
        const round = await this.load(workspace, sessionId, entry.name).catch(error => {
          if (error instanceof ApiReviseError && error.code === 'wrong-session') return undefined
          throw error
        })
        if (!round) continue
        const diffs = diffEndpoints(round)
        summaries.push({
          id: round.id, title: round.title, status: round.status, updatedAt: round.updatedAt, version: round.version,
          endpointCount: round.endpoints.length, changedCount: diffs.filter(diff => diff.changed).length,
          acceptedCount: round.verdicts.filter(verdict => verdict.status === 'accepted').length,
        })
      }
      return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }
    if (operation === 'create') {
      const endpoints = (args.endpoints as z.infer<typeof commands.create>['endpoints']).map(input => this.materialize(input))
      const now = new Date().toISOString()
      const baseline = await this.snapshot(workspace, endpoints, signal)
      const round: Round = { schemaVersion: 1, id: randomUUID(), version: 1, sessionId, title: args.title as string, goal: args.goal as string, createdAt: now, updatedAt: now, status: 'draft', endpoints, baseline, verdicts: [] }
      await this.save(workspace, round)
      return this.view(workspace, round)
    }
    const round = await this.load(workspace, sessionId, args.id as string)
    if (operation === 'get') return this.view(workspace, round)
    if (operation === 'report') {
      const view = await this.view(workspace, round)
      const markdown = reportMarkdown(view)
      const html = reportHtml(view)
      const dir = await roundDir(workspace, round.id)
      await atomicWrite(path.join(dir, 'report.md'), markdown)
      await atomicWrite(path.join(dir, 'report.html'), html)
      return { markdown, html, relativePath: `.dsh-apirevise/${round.id}/report.html` }
    }
    if (args.version !== round.version) throw new ApiReviseError('conflict', '另一处已更新这轮验收，请刷新后再操作。')
    if (round.status === 'accepted') throw new ApiReviseError('round-closed', '这轮已验收完成，请新建一轮。')
    if (operation === 'updateEndpoints') {
      if (round.status !== 'draft') throw new ApiReviseError('endpoints-frozen', '发送后接口清单固定；请新建一轮验收。')
      round.endpoints = (args.endpoints as z.infer<typeof commands.updateEndpoints>['endpoints']).map(input => this.materialize(input))
      round.baseline = await this.snapshot(workspace, round.endpoints, signal)
      round.verdicts = []
    } else if (operation === 'request' || operation === 'markSent') {
      if (round.candidate && round.verdicts.length === round.endpoints.length && round.verdicts.every(verdict => verdict.status === 'accepted')) {
        throw new ApiReviseError('no-pending-changes', '当前对比的差异已全部接受，请直接完成验收。')
      }
      if (operation === 'request') {
        const text = requestText(round)
        await atomicWrite(path.join(await roundDir(workspace, round.id), 'request.md'), text)
        return { text, relativePath: `.dsh-apirevise/${round.id}/request.md` }
      }
      round.status = round.candidate ? 'comparing' : 'sent'
      round.lastSentAt = new Date().toISOString()
    } else if (operation === 'rerun') {
      const candidate = await this.snapshot(workspace, round.endpoints, signal)
      round.candidate = candidate
      round.status = 'comparing'
      round.verdicts = round.endpoints.map(endpoint => ({ endpointId: endpoint.id, status: 'pending', feedback: '' }))
    } else if (operation === 'review' || operation === 'finish') {
      if (!round.candidate) throw new ApiReviseError('no-candidate', '请先重跑对比。')
      if (!sameSources(round.candidate.sources, await readSources(workspace))) throw new ApiReviseError('stale-candidate', '源码在重跑后又发生变化，请重新重跑，旧对比不能用于验收。')
      if (operation === 'review') {
        const verdict = round.verdicts.find(item => item.endpointId === args.endpointId)
        if (!verdict) throw new ApiReviseError('verdict-not-found', '该接口不在本轮清单中。')
        verdict.status = args.status as Verdict['status']
        verdict.feedback = args.feedback as string
        verdict.reviewedCandidateId = round.candidate.id
      } else {
        if (round.verdicts.length !== round.endpoints.length || !round.verdicts.every(verdict => verdict.status === 'accepted' && verdict.reviewedCandidateId === round.candidate!.id)) {
          throw new ApiReviseError('incomplete-review', '需要逐项接受当前重跑版本的全部差异，才能完成验收。')
        }
        round.status = 'accepted'
      }
    }
    round.version++
    round.updatedAt = new Date().toISOString()
    await this.save(workspace, round)
    if (operation === 'finish') {
      const dir = await roundDir(workspace, round.id)
      const view = await this.view(workspace, round)
      await atomicWrite(path.join(dir, 'report.md'), reportMarkdown(view))
      await atomicWrite(path.join(dir, 'report.html'), reportHtml(view))
    }
    return this.view(workspace, round)
  }

  async dispose(): Promise<void> { await Promise.allSettled(this.locks.values()) }
}
