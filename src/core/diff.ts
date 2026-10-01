import { createTwoFilesPatch } from 'diff'
import type { EndpointDiff, FieldDiff, ResponseCapture, Round } from '../shared/model.ts'

export function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

export interface DiffOptions { tolerance?: number; maxDiffs?: number }

/**
 * Recursive JSON field-level diff. Facts only: it reports what changed and
 * the old/new values; it never classifies changes as pass or fail.
 *
 * Semantics: objects are compared key-wise (added/removed/changed);
 * arrays are compared index-wise (order is treated as meaningful, so a
 * reorder yields per-index changes); numbers use a relative float tolerance;
 * null is its own type (null -> value is a type change).
 */
export function diffJson(before: unknown, after: unknown, options: DiffOptions = {}): FieldDiff[] {
  const tolerance = options.tolerance ?? 1e-9
  const maxDiffs = options.maxDiffs ?? 500
  const out: FieldDiff[] = []
  const walk = (path: string, a: unknown, b: unknown): void => {
    if (out.length >= maxDiffs) return
    const ta = typeName(a)
    const tb = typeName(b)
    if (ta !== tb) { out.push({ kind: 'type-changed', path, before: a, after: b, beforeType: ta, afterType: tb }); return }
    switch (ta) {
      case 'number': {
        const before = a as number
        const after = b as number
        if (Number.isNaN(before) && Number.isNaN(after)) return
        if (Math.abs(before - after) > tolerance * Math.max(1, Math.abs(before), Math.abs(after))) {
          out.push({ kind: 'value-changed', path, before, after, numeric: true, delta: after - before })
        }
        return
      }
      case 'string': case 'boolean': case 'null':
        if (a !== b) out.push({ kind: 'value-changed', path, before: a, after: b, numeric: false, delta: null })
        return
      case 'array': {
        const beforeArr = a as unknown[]
        const afterArr = b as unknown[]
        if (beforeArr.length !== afterArr.length) out.push({ kind: 'array-resized', path, beforeLength: beforeArr.length, afterLength: afterArr.length })
        const shared = Math.min(beforeArr.length, afterArr.length)
        for (let index = 0; index < shared; index++) walk(`${path}[${index}]`, beforeArr[index], afterArr[index])
        for (let index = shared; index < afterArr.length; index++) out.push({ kind: 'added', path: `${path}[${index}]`, after: afterArr[index] })
        for (let index = shared; index < beforeArr.length; index++) out.push({ kind: 'removed', path: `${path}[${index}]`, before: beforeArr[index] })
        return
      }
      case 'object': {
        const beforeObj = a as Record<string, unknown>
        const afterObj = b as Record<string, unknown>
        const keys = [...new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])].sort()
        for (const key of keys) {
          const inBefore = Object.hasOwn(beforeObj, key)
          const inAfter = Object.hasOwn(afterObj, key)
          const childPath = /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`
          if (inBefore && !inAfter) out.push({ kind: 'removed', path: childPath, before: beforeObj[key] })
          else if (!inBefore && inAfter) out.push({ kind: 'added', path: childPath, after: afterObj[key] })
          else walk(childPath, beforeObj[key], afterObj[key])
        }
        return
      }
    }
  }
  walk('$', before, after)
  return out
}

function textPatch(endpointLabel: string, before: string, after: string): string {
  if (before === after) return ''
  const patch = createTwoFilesPatch(`before/${endpointLabel}`, `after/${endpointLabel}`, before, after, '', '', { context: 1 })
  return patch.split('\n').slice(0, 240).join('\n')
}

/** Compare every endpoint's baseline and candidate captures. */
export function diffEndpoints(round: Round): EndpointDiff[] {
  const map = (responses: ResponseCapture[]): Map<string, ResponseCapture> => new Map(responses.map(response => [response.endpointId, response]))
  const beforeMap = map(round.baseline.responses)
  const afterMap = round.candidate ? map(round.candidate.responses) : new Map<string, ResponseCapture>()
  return round.endpoints.map(endpoint => {
    const baseline = beforeMap.get(endpoint.id) ?? null
    const candidate = afterMap.get(endpoint.id) ?? null
    const statusBefore = baseline?.status ?? null
    const statusAfter = candidate?.status ?? null
    const statusChanged = statusBefore !== statusAfter
    const errorSummary = candidate?.error ?? null
    let bodyCompared: EndpointDiff['bodyCompared'] = 'skipped'
    let bodyChanged = false
    let fields: FieldDiff[] = []
    let patch = ''
    if (baseline && candidate && !baseline.error && !candidate.error) {
      if (baseline.bodyKind === 'json' && candidate.bodyKind === 'json') {
        bodyCompared = 'json'
        let beforeJson: unknown; let afterJson: unknown
        try { beforeJson = JSON.parse(baseline.bodyText) } catch { beforeJson = baseline.bodyText }
        try { afterJson = JSON.parse(candidate.bodyText) } catch { afterJson = candidate.bodyText }
        if (typeof beforeJson !== 'string' && typeof afterJson !== 'string') {
          fields = diffJson(beforeJson, afterJson)
          bodyChanged = fields.length > 0
        } else {
          bodyCompared = 'text'
          patch = textPatch(endpoint.label, baseline.bodyText, candidate.bodyText)
          bodyChanged = patch !== ''
        }
      } else if (baseline.bodyKind !== 'unsupported' && candidate.bodyKind !== 'unsupported') {
        bodyCompared = 'text'
        patch = textPatch(endpoint.label, baseline.bodyText, candidate.bodyText)
        bodyChanged = patch !== ''
      }
    }
    return { endpoint, baseline, candidate, changed: statusChanged || bodyChanged || errorSummary !== null, statusChanged, statusBefore, statusAfter, bodyCompared, bodyChanged, fields, textPatch: patch, errorSummary }
  })
}
