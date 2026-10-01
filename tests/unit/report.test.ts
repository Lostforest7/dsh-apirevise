import { describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { codeDiff, reportHtml, reportMarkdown, requestText } from '../../src/core/report.ts'
import { diffEndpoints } from '../../src/core/diff.ts'
import type { Endpoint, ResponseCapture, Round, RoundView } from '../../src/shared/model.ts'

function response(endpointId: string, status: number, body: string): ResponseCapture {
  return { id: randomUUID(), endpointId, capturedAt: '2026-10-01T00:00:00.000Z', status, statusText: 'OK', headers: { 'content-type': 'application/json' }, bodyKind: 'json', bodyText: body, durationMs: 5 }
}
function endpoint(id: string, label: string, url: string): Endpoint {
  return { id, label, method: 'GET', url, headers: { 'x-evil-header': '</style><script>alert(3)</script>' }, body: undefined }
}

function fixture(): RoundView {
  const endpoints = [endpoint('e1', '<script>alert(1)</script>', 'http://127.0.0.1:3000/api/price'), endpoint('e2', '用户', 'http://127.0.0.1:3000/api/user')]
  const baseline = { id: randomUUID(), createdAt: '2026-10-01T01:00:00.000Z', sources: { 'src/index.js': 'export function price() { return 299 }\n' }, responses: [response('e1', 200, '{"price":299,"note":"<img src=x onerror=alert(1)>"}'), response('e2', 200, '{"id":1,"name":"Ada"}')] }
  const candidate = { id: randomUUID(), createdAt: '2026-10-01T02:00:00.000Z', sources: { 'src/index.js': 'export function price() { return 29900 }\n' }, responses: [response('e1', 500, '{"price":29900,"evil":"</style><script>alert(2)</script>"}'), response('e2', 200, '{"id":1,"name":"Ada","tier":"gold"}')] }
  const round: Round = {
    schemaVersion: 1, id: randomUUID(), version: 4, sessionId: 'session-test',
    title: '<script>attack()</script>', goal: '<img src=x onerror=attack()> 改成<img src=x onerror=attack()>',
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T02:00:00.000Z', status: 'comparing',
    endpoints, baseline, candidate,
    verdicts: [{ endpointId: 'e1', status: 'needs-work', feedback: '<b>bold</b> 状态码别改', reviewedCandidateId: candidate.id }, { endpointId: 'e2', status: 'accepted', feedback: '', reviewedCandidateId: candidate.id }],
  }
  return { ...round, stale: false, codeDiff: codeDiff(round), endpointDiffs: diffEndpoints(round) }
}

describe('report generation — portable, escaped, factual', () => {
  test('HTML escapes every user and response value (XSS)', () => {
    const html = reportHtml(fixture())
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('</style><script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('&lt;script&gt;attack()&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=attack()&gt;')
    expect(html).toContain('&lt;/style&gt;&lt;script&gt;alert(2)&lt;/script&gt;')
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
  })
  test('HTML carries a strict CSP and loads no external resources', () => {
    const html = reportHtml(fixture())
    expect(html).toContain('Content-Security-Policy')
    expect(html).toContain("default-src 'none'")
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('src="')
    expect(html).not.toContain('href="')
  })
  test('HTML highlights the status change and shows old/new values', () => {
    const html = reportHtml(fixture())
    expect(html).toContain('status-changed')
    expect(html).toContain('200 → 500')
    expect(html).toContain('299')
    expect(html).toContain('29900')
    expect(html).toContain('tier')
  })
  test('Markdown records facts with old and new values, no verdict claim', () => {
    const markdown = reportMarkdown(fixture())
    expect(markdown).toContain('状态码 200 → 500（已变化）')
    expect(markdown).toContain('299 → 29900')
    expect(markdown).toContain('差值')
    expect(markdown).toContain('不构成')
  })
  test('requestText carries the goal, endpoints and follow-up feedback', () => {
    const text = requestText(fixture())
    expect(text).toContain('<img src=x onerror=attack()>')
    expect(text).toContain('GET http://127.0.0.1:3000/api/price')
    expect(text).toContain('GET http://127.0.0.1:3000/api/user')
    expect(text).toContain('人类后续反馈（继续修改）')
    expect(text).toContain('<b>bold</b> 状态码别改')
    expect(text).toContain('不要自行判定回归结果')
  })
  test('codeDiff produces a unified patch between captured source snapshots', () => {
    const patch = codeDiff(fixture())
    expect(patch).toContain('-export function price() { return 299 }')
    expect(patch).toContain('+export function price() { return 29900 }')
  })
})
