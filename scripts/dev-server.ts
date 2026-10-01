/** Local preview/testing harness. Production DSH uses its authenticated Connection. */
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ApiReviseService } from '../src/core/service.ts'
import { ApiReviseError } from '../src/shared/model.ts'

export async function startPreview(options: { workspace: string; port: number; token?: string }) {
  const workspace = path.resolve(options.workspace)
  const port = options.port
  const token = options.token ?? randomUUID()
  const service = new ApiReviseService()
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? '/', `http://127.0.0.1:${port}`).pathname
      if (request.method === 'GET' && ['/', '/workbench.js'].includes(pathname)) {
        const data = await readFile(path.resolve('lib', pathname === '/' ? 'workbench.html' : 'workbench.js'))
        response.writeHead(200, { 'content-type': pathname === '/' ? 'text/html;charset=utf-8' : 'text/javascript;charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); response.end(data); return
      }
      if (request.method !== 'POST' || !pathname.startsWith('/rpc/')) { response.writeHead(404); response.end(); return }
      if (request.headers.host !== `127.0.0.1:${port}` || (request.headers.origin && request.headers.origin !== `http://127.0.0.1:${port}`) || request.headers.authorization !== `Bearer ${token}`) { response.writeHead(403); response.end(JSON.stringify({ ok: false, error: { message: 'Local preview authorization failed.' } })); return }
      let text = ''
      for await (const chunk of request) { text += chunk.toString(); if (text.length > 30_000) throw new ApiReviseError('body-limit', '请求过大。') }
      const value = await service.execute(workspace, 'local-preview', pathname.slice(5), JSON.parse(text || '{}'))
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify({ ok: true, value }))
    } catch (error) {
      response.writeHead(400, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: false, error: { message: error instanceof Error ? error.message : String(error) } }))
    }
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  return { url: `http://127.0.0.1:${port}/#${token}`, async close() { await service.dispose(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) } }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const preview = await startPreview({ workspace: process.env.APIREVISE_WORKSPACE ?? 'examples/api-server', port: Number(process.env.APIREVISE_PORT ?? 4320), token: process.env.APIREVISE_TOKEN })
  console.log(`DSH API Revise local preview: ${preview.url}`)
  process.once('SIGTERM', () => void preview.close()); process.once('SIGINT', () => void preview.close())
}
