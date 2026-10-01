import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ApiReviseService } from '../../src/core/service.ts'
import type { Requester } from '../../src/core/request.ts'
import type { RoundSummary, RoundView } from '../../src/shared/model.ts'

let workspace: string
let service: ApiReviseService
let phase: 'baseline' | 'changed' = 'baseline'
let srcFile = ''

const requester: Requester = async spec => {
  if (phase === 'baseline') return capture(spec, spec.url.includes('/price') ? { price: 299 } : { id: 1, name: 'Ada' })
  return capture(spec, spec.url.includes('/price') ? { price: 29900 } : { id: 1, name: 'Ada', tier: 'gold' })
}
function capture(spec: { id: string }, body: unknown) {
  return { id: randomUUID(), endpointId: spec.id, capturedAt: new Date().toISOString(), status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, bodyKind: 'json' as const, bodyText: JSON.stringify(body), durationMs: 3 }
}
const ENDPOINTS = [
  { label: '价格', method: 'GET' as const, url: 'http://127.0.0.1:3000/api/price', headers: {}, body: '' },
  { label: '用户', method: 'GET' as const, url: 'http://127.0.0.1:3000/api/user', headers: {}, body: '' },
]

beforeEach(async () => {
  await mkdir('work/unit', { recursive: true })
  workspace = await mkdtemp(path.resolve('work/unit/case-'))
  srcFile = path.join(workspace, 'src', 'index.js')
  await mkdir(path.join(workspace, 'src'))
  await writeFile(srcFile, 'export function price() { return 299 }\n')
  phase = 'baseline'
  service = new ApiReviseService(requester)
})
afterEach(async () => { await service.dispose(); await rm(workspace, { recursive: true, force: true }) })
const run = (operation: string, args = {}, session = 'session-test') => service.execute(workspace, session, operation, args)
async function create(session = 'session-test'): Promise<RoundView> {
  return await run('create', { title: '价格改成分、用户加字段', goal: '把价格接口返回值从整数改成分，给用户接口加字段', endpoints: ENDPOINTS }, session) as RoundView
}

describe('API acceptance lifecycle', () => {
  test('runs the full lifecycle: baseline -> send -> rerun -> stale guard -> per-item acceptance -> finish', async () => {
    let round = await create()
    expect(round.status).toBe('draft')
    expect(round.version).toBe(1)
    expect(round.baseline.responses).toHaveLength(2)
    expect(JSON.parse(round.baseline.responses[0]!.bodyText)).toEqual({ price: 299 })

    const request = await run('request', { id: round.id, version: round.version }) as { text: string; relativePath: string }
    expect(request.text).toContain('把价格接口返回值从整数改成分')
    expect(request.text).toContain('http://127.0.0.1:3000/api/price')
    expect(request.text).toContain('http://127.0.0.1:3000/api/user')
    expect(await readFile(path.join(workspace, '.dsh-apirevise', round.id, 'request.md'), 'utf8')).toContain(round.title)

    round = await run('markSent', { id: round.id, version: round.version }) as RoundView
    expect(round.status).toBe('sent')
    await expect(run('updateEndpoints', { id: round.id, version: round.version, endpoints: ENDPOINTS })).rejects.toMatchObject({ code: 'endpoints-frozen' })
    await expect(run('review', { id: round.id, version: round.version, endpointId: round.endpoints[0]!.id, status: 'accepted' })).rejects.toMatchObject({ code: 'no-candidate' })

    phase = 'changed'
    round = await run('rerun', { id: round.id, version: round.version }) as RoundView
    expect(round.status).toBe('comparing')
    expect(round.candidate).toBeDefined()
    expect(round.verdicts.map(item => item.status)).toEqual(['pending', 'pending'])
    expect(round.endpointDiffs.filter(diff => diff.changed)).toHaveLength(2)

    await expect(run('review', { id: round.id, version: 1, endpointId: round.endpoints[0]!.id, status: 'accepted' })).rejects.toMatchObject({ code: 'conflict' })
    round = await run('review', { id: round.id, version: round.version, endpointId: round.endpoints[0]!.id, status: 'accepted' }) as RoundView
    expect(round.verdicts[0]).toMatchObject({ status: 'accepted', reviewedCandidateId: round.candidate!.id })

    // Source changed after the rerun: the old comparison cannot complete acceptance.
    await writeFile(srcFile, 'export function price() { return 29900 }\n')
    await expect(run('finish', { id: round.id, version: round.version })).rejects.toMatchObject({ code: 'stale-candidate' })
    await expect(run('review', { id: round.id, version: round.version, endpointId: round.endpoints[1]!.id, status: 'accepted' })).rejects.toMatchObject({ code: 'stale-candidate' })

    // Rerun again: verdicts reset, fresh sources make acceptance possible again.
    round = await run('rerun', { id: round.id, version: round.version }) as RoundView
    expect(round.verdicts.map(item => item.status)).toEqual(['pending', 'pending'])
    await expect(run('finish', { id: round.id, version: round.version })).rejects.toMatchObject({ code: 'incomplete-review' })

    round = await run('review', { id: round.id, version: round.version, endpointId: round.endpoints[0]!.id, status: 'accepted' }) as RoundView
    round = await run('review', { id: round.id, version: round.version, endpointId: round.endpoints[1]!.id, status: 'needs-work', feedback: 'tier 字段名字不对' }) as RoundView
    await expect(run('finish', { id: round.id, version: round.version })).rejects.toMatchObject({ code: 'incomplete-review' })

    // Feedback travels back into the next request.
    const followUp = await run('request', { id: round.id, version: round.version }) as { text: string }
    expect(followUp.text).toContain('tier 字段名字不对')

    round = await run('review', { id: round.id, version: round.version, endpointId: round.endpoints[1]!.id, status: 'accepted', feedback: '' }) as RoundView
    await expect(run('request', { id: round.id, version: round.version })).rejects.toMatchObject({ code: 'no-pending-changes' })
    round = await run('finish', { id: round.id, version: round.version }) as RoundView
    expect(round.status).toBe('accepted')

    const report = await readFile(path.join(workspace, '.dsh-apirevise', round.id, 'report.md'), 'utf8')
    expect(report).toContain('[accepted]')
    expect(report).toContain('299 → 29900')
    expect(await readFile(path.join(workspace, '.dsh-apirevise', round.id, 'report.html'), 'utf8')).toContain('<!doctype html>')

    await expect(run('rerun', { id: round.id, version: round.version })).rejects.toMatchObject({ code: 'round-closed' })
  })

  test('rejects stale versions and isolates sessions', async () => {
    const round = await create()
    await expect(run('get', { id: round.id }, 'other-session')).rejects.toMatchObject({ code: 'wrong-session' })
    expect(await run('list', {}, 'other-session')).toEqual([])
    await run('markSent', { id: round.id, version: round.version })
    await expect(run('rerun', { id: round.id, version: round.version })).rejects.toMatchObject({ code: 'conflict' })
  })

  test('lists only the current session rounds with diff counts', async () => {
    await create()
    await create('session-two')
    const mine = await run('list', {}, 'session-test') as RoundSummary[]
    const theirs = await run('list', {}, 'session-two') as RoundSummary[]
    expect(mine).toHaveLength(1)
    expect(theirs).toHaveLength(1)
    expect(mine[0]!.endpointCount).toBe(2)
  })

  test('rejects endpoint URLs outside the local policy and leaves no record', async () => {
    await expect(run('create', { title: 'bad', goal: 'g', endpoints: [{ label: 'x', method: 'GET', url: 'https://example.com/api', headers: {}, body: '' }] })).rejects.toMatchObject({ code: 'invalid-url' })
    expect(await run('list')).toEqual([])
  })

  test('keeps the baseline when endpoints are edited while still draft', async () => {
    let round = await create()
    phase = 'changed'
    round = await run('updateEndpoints', { id: round.id, version: round.version, endpoints: ENDPOINTS.slice(0, 1) }) as RoundView
    expect(round.endpoints).toHaveLength(1)
    expect(round.baseline.responses).toHaveLength(1)
    expect(round.verdicts).toEqual([])
  })

  test('fails a capture when sources change mid-request', async () => {
    const sneaky: Requester = async spec => { await writeFile(srcFile, 'mutated\n'); return capture(spec, { ok: true }) }
    await service.dispose()
    service = new ApiReviseService(sneaky)
    await expect(run('create', { title: 'race', goal: 'g', endpoints: ENDPOINTS })).rejects.toMatchObject({ code: 'changed-during-capture' })
  })

  test('rejects a workspace without any supported source files', async () => {
    const empty = await mkdtemp(path.resolve('work/unit/empty-'))
    try { await expect(service.execute(empty, 'session-test', 'create', { title: 't', goal: 'g', endpoints: ENDPOINTS })).rejects.toMatchObject({ code: 'no-sources' }) }
    finally { await rm(empty, { recursive: true, force: true }) }
  })

  test('rejects unknown operations', async () => {
    await expect(run('rm-rf')).rejects.toMatchObject({ code: 'unknown-operation' })
  })
})
