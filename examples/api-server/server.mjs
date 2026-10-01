// Zero-dependency sample backend for the dsh-apirevise acceptance loop.
// Start with `node server.mjs` and register the endpoints below in DSH API Revise.
import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 3000)

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
  response.setHeader('content-type', 'application/json; charset=utf-8')
  if (request.method === 'GET' && url.pathname === '/api/price') {
    // Integer yuan. The demo change: report cents instead.
    response.end(JSON.stringify({ price: 299, currency: 'CNY' }))
    return
  }
  if (request.method === 'GET' && url.pathname === '/api/user') {
    response.end(JSON.stringify({ id: 1, name: 'Ada', email: 'ada@example.dev' }))
    return
  }
  if (request.method === 'POST' && url.pathname === '/api/order') {
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      let item = null
      try { item = JSON.parse(Buffer.concat(chunks).toString() || '{}').item ?? null } catch { /* keep null */ }
      response.end(JSON.stringify({ ok: true, total: 199, item }))
    })
    return
  }
  response.statusCode = 404
  response.end(JSON.stringify({ error: 'not found' }))
})

server.listen(port, '127.0.0.1', () => console.log(`api-server example listening on http://127.0.0.1:${port}`))
