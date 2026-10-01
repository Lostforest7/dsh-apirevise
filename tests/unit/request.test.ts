import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { captureEndpoint } from '../../src/core/request.ts'
import { parseEndpointUrl, ApiReviseError, type Endpoint } from '../../src/shared/model.ts'

let server: Server
let base = ''
let closedPort = 0

beforeAll(async () => {
  server = createServer((request, response) => {
    const url = request.url ?? '/'
    if (url === '/json') { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ price: 299 })); return }
    if (url === '/text') { response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); response.end('hello world'); return }
    if (url === '/bin') { response.writeHead(200, { 'content-type': 'application/octet-stream' }); response.end(Buffer.from([0, 159, 146, 150])); return }
    if (url === '/missing') { response.writeHead(404, { 'content-type': 'text/plain' }); response.end('nope'); return }
    if (url === '/slow') { setTimeout(() => { response.writeHead(200); response.end('late') }, 3000); return }
    if (url === '/big') {
      response.writeHead(200, { 'content-type': 'application/octet-stream' })
      const chunk = Buffer.alloc(1_000_000, 65)
      for (let i = 0; i < 7; i++) response.write(chunk)
      response.end()
      return
    }
    if (url === '/echo') {
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(chunk as Buffer))
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ method: request.method, received: Buffer.concat(chunks).toString(), header: request.headers['x-test'] ?? null }))
      })
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' }); response.end('{}')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const closed = createServer(() => {})
  await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve))
  closedPort = (closed.address() as AddressInfo).port
  await new Promise<void>(resolve => closed.close(() => resolve()))
})
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())) })

const spec = (path: string, extra: Partial<Endpoint> = {}): Endpoint => ({ id: randomUUID(), label: path, method: 'GET', url: `${base}${path}`, headers: {}, body: undefined, ...extra })

describe('captureEndpoint — real loopback HTTP capture', () => {
  test('captures a JSON response', async () => {
    const capture = await captureEndpoint(spec('/json'))
    expect(capture.status).toBe(200)
    expect(capture.bodyKind).toBe('json')
    expect(JSON.parse(capture.bodyText)).toEqual({ price: 299 })
    expect(capture.error).toBeUndefined()
  })
  test('captures a text response', async () => {
    const capture = await captureEndpoint(spec('/text'))
    expect(capture.bodyKind).toBe('text')
    expect(capture.bodyText).toBe('hello world')
  })
  test('marks binary bodies as unsupported without crashing', async () => {
    const capture = await captureEndpoint(spec('/bin'))
    expect(capture.bodyKind).toBe('unsupported')
    expect(capture.error).toBe('binary-body')
    expect(capture.status).toBe(200)
  })
  test('keeps non-2xx status codes', async () => {
    const capture = await captureEndpoint(spec('/missing'))
    expect(capture.status).toBe(404)
  })
  test('records oversized bodies as body-too-large', async () => {
    const capture = await captureEndpoint(spec('/big'))
    expect(capture.error).toBe('body-too-large')
    expect(capture.bodyKind).toBe('unsupported')
  })
  test('records timeouts instead of hanging', async () => {
    const capture = await captureEndpoint(spec('/slow'), undefined, 200)
    expect(capture.status).toBeNull()
    expect(capture.error).toBe('timeout')
  })
  test('records connection failures as status null + error', async () => {
    const capture = await captureEndpoint(spec('/anything', { url: `http://127.0.0.1:${closedPort}/x` }))
    expect(capture.status).toBeNull()
    expect(capture.error).toBeTruthy()
  })
  test('sends POST bodies and custom headers', async () => {
    const capture = await captureEndpoint(spec('/echo', { method: 'POST', body: '{"item":"whale"}', headers: { 'x-test': 'present' } }))
    const echoed = JSON.parse(capture.bodyText)
    expect(echoed.method).toBe('POST')
    expect(echoed.received).toBe('{"item":"whale"}')
    expect(echoed.header).toBe('present')
  })
  test('throws for invalid endpoint URLs before any I/O', async () => {
    await expect(captureEndpoint(spec('/x', { url: 'https://example.com/api' }))).rejects.toBeInstanceOf(ApiReviseError)
    await expect(captureEndpoint(spec('/x', { url: 'http://127.0.0.1/api' }))).rejects.toBeInstanceOf(ApiReviseError)
  })
})

describe('parseEndpointUrl — v1 target policy', () => {
  test('accepts local http/https with an explicit port', () => {
    expect(parseEndpointUrl('http://127.0.0.1:3000/api').port).toBe('3000')
    expect(parseEndpointUrl('http://localhost:8080/x').hostname).toBe('localhost')
    expect(parseEndpointUrl('https://127.0.0.1:8443/x').protocol).toBe('https:')
    expect(parseEndpointUrl('http://[::1]:3000/x').hostname).toBe('[::1]')
  })
  test('rejects remote hosts, missing ports and credentials', () => {
    expect(() => parseEndpointUrl('https://example.com/api')).toThrow(ApiReviseError)
    expect(() => parseEndpointUrl('http://127.0.0.1/api')).toThrow(ApiReviseError)
    expect(() => parseEndpointUrl('ftp://127.0.0.1:21/x')).toThrow(ApiReviseError)
    expect(() => parseEndpointUrl('http://user:pass@127.0.0.1:3000/x')).toThrow(ApiReviseError)
    expect(() => parseEndpointUrl('not a url')).toThrow(ApiReviseError)
  })
})
