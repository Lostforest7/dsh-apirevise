import { describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { diffEndpoints, diffJson, typeName } from '../../src/core/diff.ts'
import type { Endpoint, ResponseCapture, Round } from '../../src/shared/model.ts'

function response(endpointId: string, status: number, body: string): ResponseCapture {
  return { id: randomUUID(), endpointId, capturedAt: '2026-10-01T00:00:00.000Z', status, statusText: 'OK', headers: { 'content-type': 'application/json' }, bodyKind: 'json', bodyText: body, durationMs: 5 }
}
function endpoint(id: string, label: string, url: string): Endpoint {
  return { id, label, method: 'GET', url, headers: {}, body: undefined }
}
function round(before: ResponseCapture[], after?: ResponseCapture[]): Round {
  const endpoints = [endpoint('e1', 'price', 'http://127.0.0.1:3000/api/price'), endpoint('e2', 'user', 'http://127.0.0.1:3000/api/user')]
  return { schemaVersion: 1, id: randomUUID(), version: 1, sessionId: 'session-test', title: 't', goal: 'g', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', status: 'comparing', endpoints, baseline: { id: randomUUID(), createdAt: '', sources: {}, responses: before }, candidate: after ? { id: randomUUID(), createdAt: '', sources: {}, responses: after } : undefined, verdicts: [] }
}

describe('diffJson — structured field diff fixtures', () => {
  test('reports added fields', () => {
    expect(diffJson({ a: 1 }, { a: 1, b: 2 })).toEqual([{ kind: 'added', path: '$.b', after: 2 }])
  })
  test('reports removed fields', () => {
    expect(diffJson({ a: 1, b: 2 }, { a: 1 })).toEqual([{ kind: 'removed', path: '$.b', before: 2 }])
  })
  test('reports numeric changes with old/new values and delta', () => {
    const diffs = diffJson({ price: 299 }, { price: 29900 })
    expect(diffs).toEqual([{ kind: 'value-changed', path: '$.price', before: 299, after: 29900, numeric: true, delta: 29601 }])
  })
  test('reports nested paths', () => {
    const diffs = diffJson({ user: { profile: { age: 30 } } }, { user: { profile: { age: 31 } } })
    expect(diffs).toHaveLength(1)
    expect(diffs[0]).toMatchObject({ kind: 'value-changed', path: '$.user.profile.age', before: 30, after: 31 })
  })
  test('treats null -> value as a type change', () => {
    expect(diffJson({ v: null }, { v: 5 })).toEqual([{ kind: 'type-changed', path: '$.v', before: null, after: 5, beforeType: 'null', afterType: 'number' }])
  })
  test('treats value -> null as a type change', () => {
    expect(diffJson({ v: 'x' }, { v: null })).toEqual([{ kind: 'type-changed', path: '$.v', before: 'x', after: null, beforeType: 'string', afterType: 'null' }])
  })
  test('compares arrays index-wise so a reorder yields per-index changes', () => {
    const diffs = diffJson({ list: [1, 2, 3] }, { list: [3, 1, 2] })
    expect(diffs).toHaveLength(3)
    expect(diffs[0]).toMatchObject({ kind: 'value-changed', path: '$.list[0]', before: 1, after: 3 })
    expect(diffs[1]).toMatchObject({ kind: 'value-changed', path: '$.list[1]', before: 2, after: 1 })
    expect(diffs[2]).toMatchObject({ kind: 'value-changed', path: '$.list[2]', before: 3, after: 2 })
  })
  test('reports array resize plus appended elements', () => {
    const diffs = diffJson({ list: [1, 2] }, { list: [1, 2, 3] })
    expect(diffs[0]).toEqual({ kind: 'array-resized', path: '$.list', beforeLength: 2, afterLength: 3 })
    expect(diffs[1]).toEqual({ kind: 'added', path: '$.list[2]', after: 3 })
  })
  test('ignores float noise inside the relative tolerance', () => {
    expect(diffJson({ v: 0.1 + 0.2 }, { v: 0.3 })).toEqual([])
    expect(diffJson({ v: 1 }, { v: 1.0000000001 })).toEqual([])
    expect(diffJson({ v: 1 }, { v: 1.001 })).toHaveLength(1)
  })
  test('reports scalar type changes', () => {
    expect(diffJson({ v: '5' }, { v: 5 })).toEqual([{ kind: 'type-changed', path: '$.v', before: '5', after: 5, beforeType: 'string', afterType: 'number' }])
  })
  test('returns no diffs for identical values, NaN equal to NaN', () => {
    expect(diffJson({ a: 1, b: [1, { c: 'x' }], d: null }, { a: 1, b: [1, { c: 'x' }], d: null })).toEqual([])
    expect(diffJson({ v: Number.NaN }, { v: Number.NaN })).toEqual([])
  })
  test('caps output at maxDiffs', () => {
    const before: Record<string, number> = {}; const after: Record<string, number> = {}
    for (let i = 0; i < 20; i++) { before[`k${i}`] = i; after[`k${i}`] = i + 1 }
    expect(diffJson(before, after, { maxDiffs: 3 })).toHaveLength(3)
  })
  test('typeName treats null and arrays as their own types', () => {
    expect(typeName(null)).toBe('null')
    expect(typeName([])).toBe('array')
    expect(typeName(1)).toBe('number')
  })
})

describe('diffEndpoints — per-endpoint comparison', () => {
  test('flags a status code change', () => {
    const r = round([response('e1', 200, '{"price":299}')], [response('e1', 500, '{"error":"boom"}')])
    const diffs = diffEndpoints(r)
    expect(diffs[0]).toMatchObject({ statusChanged: true, statusBefore: 200, statusAfter: 500, changed: true })
    expect(diffs[1]).toMatchObject({ statusChanged: false, changed: false })
  })
  test('compares JSON bodies field-wise when both parse', () => {
    const r = round([response('e1', 200, '{"price":299,"currency":"CNY"}')], [response('e1', 200, '{"price":29900}')])
    const diffs = diffEndpoints(r)
    expect(diffs[0]).toMatchObject({ bodyCompared: 'json', bodyChanged: true, changed: true, statusChanged: false })
    expect(diffs[0].fields).toEqual([
      { kind: 'removed', path: '$.currency', before: 'CNY' },
      { kind: 'value-changed', path: '$.price', before: 299, after: 29900, numeric: true, delta: 29601 },
    ])
  })
  test('falls back to text comparison for non-JSON bodies', () => {
    const r = round([response('e1', 200, 'hello')], [response('e1', 200, 'world')])
    const diffs = diffEndpoints(r)
    expect(diffs[0]).toMatchObject({ bodyCompared: 'text', bodyChanged: true })
    expect(diffs[0].textPatch).toContain('-hello')
    expect(diffs[0].textPatch).toContain('+world')
  })
  test('records request errors without hiding the endpoint', () => {
    const failed: ResponseCapture = { id: randomUUID(), endpointId: 'e1', capturedAt: '', status: null, statusText: '', headers: {}, bodyKind: 'empty', bodyText: '', durationMs: 1, error: 'connect ECONNREFUSED' }
    const r = round([response('e1', 200, '{}')], [failed])
    const diffs = diffEndpoints(r)
    expect(diffs[0]).toMatchObject({ changed: true, statusAfter: null, errorSummary: 'connect ECONNREFUSED', bodyCompared: 'skipped' })
  })
  test('reports no difference when responses match', () => {
    const r = round([response('e1', 200, '{"price":299}')], [response('e1', 200, '{"price":299}')])
    const diffs = diffEndpoints(r)
    expect(diffs[0]).toMatchObject({ changed: false, statusChanged: false, bodyChanged: false, fields: [] })
  })
})
