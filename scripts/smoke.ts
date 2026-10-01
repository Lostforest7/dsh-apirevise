// Offline full-loop smoke test: no DSH, no external network, no detached processes.
// Runs the preview server (startPreview) in-process, serves the example backend in-process,
// and drives the whole acceptance loop: baseline -> model edit -> rerun -> diff -> accept -> finish -> report.
import { createServer } from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { startPreview } from './dev-server.ts'

const PORT = 3100
const RPC_PORT = 4321
const TOKEN = 'smoke-token'

const HANDLERS = {
  v1: {
    '/api/price': { price: 299, currency: 'CNY' },
    '/api/user': { id: 1, name: 'Ada', email: 'ada@example.dev' },
  },
  v2: {
    '/api/price': { price: 29900, currency: 'CNY', unit: 'cent' },
    '/api/user': { id: 1, name: 'Ada', email: 'ada@example.dev', tier: 'gold' },
  },
}

function startBackend(version: 'v1' | 'v2'): Promise<ReturnType<typeof createServer>> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`)
    response.setHeader('content-type', 'application/json; charset=utf-8')
    const body = HANDLERS[version][url.pathname as keyof (typeof HANDLERS)['v1']]
    if (request.method === 'GET' && body) { response.end(JSON.stringify(body)); return }
    if (request.method === 'POST' && url.pathname === '/api/order') {
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(chunk as Buffer))
      request.on('end', () => {
        let item = null
        try { item = JSON.parse(Buffer.concat(chunks).toString() || '{}').item ?? null } catch { /* ignore */ }
        const total = version === 'v1' ? 199 : 19900
        response.end(JSON.stringify({ ok: true, total, item }))
      })
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ error: 'not found' }))
  })
  return new Promise(resolve => server.listen(PORT, '127.0.0.1', () => resolve(server)))
}

const ENDPOINTS = [
  { label: '价格', method: 'GET', url: `http://127.0.0.1:${PORT}/api/price`, headers: {}, body: '' },
  { label: '用户', method: 'GET', url: `http://127.0.0.1:${PORT}/api/user`, headers: {}, body: '' },
  { label: '下单', method: 'POST', url: `http://127.0.0.1:${PORT}/api/order`, headers: {}, body: '{"item":"whale"}' },
]

const preview = await startPreview({ workspace: 'work/smoke', port: RPC_PORT, token: TOKEN })
let backend = await startBackend('v1')
try {
  const rpc = async (operation: string, args: unknown): Promise<any> => {
    const response = await fetch(`http://127.0.0.1:${RPC_PORT}/rpc/${operation}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(args ?? {}),
    })
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error(`${operation}: ${result.error?.message ?? 'failed'}`)
    return result.value
  }

  const round = await rpc('create', { title: '价格接口改成分、用户接口加字段', goal: '把价格接口返回值从整数改成分，给用户接口加字段', endpoints: ENDPOINTS })
  console.log('baseline:', round.baseline.responses.map((r: any) => `${r.status}:${r.bodyText}`).join(' | '))

  await new Promise<void>(resolve => backend.close(() => resolve()))
  backend = await startBackend('v2')

  let view = await rpc('rerun', { id: round.id, version: round.version })
  console.log('rerun diffs:')
  for (const diff of view.endpointDiffs) {
    console.log(`  ${diff.endpoint.label}: status ${diff.statusBefore}→${diff.statusAfter}${diff.statusChanged ? ' CHANGED' : ''}; fields: ${diff.fields.map((f: any) => `${f.kind}@${f.path}`).join(', ') || 'none'}`)
  }
  const changed = view.endpointDiffs.filter((diff: any) => diff.changed).length
  if (changed !== 3) throw new Error(`expected 3 changed endpoints, got ${changed}`)
  if (!view.endpointDiffs[0].fields.some((f: any) => f.kind === 'value-changed' && f.path === '$.price' && f.numeric)) throw new Error('price numeric change missing')
  if (!view.endpointDiffs[1].fields.some((f: any) => f.kind === 'added' && f.path === '$.tier')) throw new Error('user added field missing')

  // Stale guard: source changes after the rerun must block acceptance until a fresh rerun.
  writeFileSync('work/smoke/server.mjs', readFileSync('work/smoke/server.mjs', 'utf8') + '\n// model edit marker\n')
  let stale = false
  try { await rpc('review', { id: round.id, version: view.version, endpointId: view.endpoints[0].id, status: 'accepted', feedback: '' }) }
  catch (error: any) { stale = /重跑后又发生变化|stale/.test(String(error.message)) }
  if (!stale) throw new Error('stale guard did not fire')
  view = await rpc('rerun', { id: round.id, version: view.version })
  console.log('stale guard fired; re-rerun ok; codeDiff has patch:', view.codeDiff.includes('+'))

  for (const endpoint of view.endpoints) {
    view = await rpc('review', { id: round.id, version: view.version, endpointId: endpoint.id, status: 'accepted', feedback: '' })
  }
  view = await rpc('finish', { id: round.id, version: view.version })
  console.log('final status:', view.status, '| codeDiff has patch:', view.codeDiff.includes('+'))
  const report = await rpc('report', { id: round.id })
  const reportPath = `work/smoke/.dsh-apirevise/${round.id}/report.html`
  if (!existsSync(reportPath)) throw new Error('report.html missing on disk')
  const html = readFileSync(reportPath, 'utf8')
  if (!html.includes('299') || !html.includes('29900')) throw new Error('report missing old/new values')
  if (html.includes('<script>')) throw new Error('report contains raw script tag')
  console.log('SMOKE OK:', report.relativePath, `${html.length} bytes`)
} finally {
  await new Promise<void>(resolve => backend.close(() => resolve()))
  await preview.close()
}
