import { useEffect, useState } from 'react'
import type { EndpointDiff, FieldDiff, RevisionApi, RoundStatus, RoundSummary, RoundView, Verdict } from '../shared/model.ts'
import { Icon } from './icons.tsx'

const STATUS_LABEL: Record<RoundStatus, string> = { draft: '草稿', sent: '已发送', comparing: '对比中', accepted: '已验收' }
const VERDICT_LABEL: Record<Verdict['status'], string> = { pending: '待验收', accepted: '已接受', 'needs-work': '继续修改' }
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

interface EndpointDraft { label: string; method: (typeof METHODS)[number]; url: string; headersText: string; body: string }

function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error) }

export function App({ api, sessionLabel, onClose }: { api: RevisionApi; sessionLabel: string; onClose: () => void }) {
  const [screen, setScreen] = useState<{ mode: 'list' } | { mode: 'create' } | { mode: 'round'; id: string }>({ mode: 'list' })
  const [error, setError] = useState('')
  return (
    <div className="arv-panel" onClick={event => event.stopPropagation()}>
      <header>
        <span className="brand">API REVISE</span>
        <h2>接口回归验收台</h2>
        <span className="muted">{sessionLabel}</span>
        <button className="arv-iconbtn" title="关闭" onClick={onClose}><Icon name="close" /></button>
      </header>
      {error && <div className="arv-error">{error}<button className="arv-iconbtn" style={{ float: 'right' }} onClick={() => setError('')}><Icon name="x" size={12} /></button></div>}
      <div className="arv-scroll">
        {screen.mode === 'list' && <ListView api={api} onError={setError} onOpen={id => setScreen({ mode: 'round', id })} onCreate={() => setScreen({ mode: 'create' })} />}
        {screen.mode === 'create' && <CreateView api={api} onError={setError} onBack={() => setScreen({ mode: 'list' })} onDone={id => setScreen({ mode: 'round', id })} />}
        {screen.mode === 'round' && <RoundView key={screen.id} api={api} id={screen.id} onError={setError} onBack={() => setScreen({ mode: 'list' })} />}
      </div>
    </div>
  )
}

function ListView({ api, onOpen, onCreate, onError }: { api: RevisionApi; onOpen: (id: string) => void; onCreate: () => void; onError: (message: string) => void }) {
  const [rounds, setRounds] = useState<RoundSummary[] | null>(null)
  const refresh = async () => {
    try { setRounds(await api.call<RoundSummary[]>('list')) } catch (error) { onError(errorText(error)) }
  }
  useEffect(() => { void refresh() }, [])
  return (
    <div>
      <div className="arv-toolbar">
        <button className="arv-btn primary" onClick={onCreate}><Icon name="plus" size={14} />新建验收轮次</button>
        <button className="arv-btn" onClick={() => void refresh()}><Icon name="refresh" size={14} />刷新</button>
      </div>
      {rounds === null ? <div className="arv-busy">加载中…</div> : rounds.length === 0 ? (
        <div className="arv-card">
          <h3>还没有验收轮次</h3>
          <p className="arv-muted">登记后端接口并快照基线，然后把改动意图发给 DSH 会话；模型改完代码后一键重跑，逐项验收响应差异并导出报告。</p>
        </div>
      ) : (
        <table className="arv-table">
          <thead><tr><th>标题</th><th>状态</th><th>接口</th><th>差异</th><th>验收</th><th>更新于</th></tr></thead>
          <tbody>
            {rounds.map(round => (
              <tr key={round.id} className="clickable" onClick={() => onOpen(round.id)}>
                <td><b>{round.title}</b></td>
                <td><span className={`arv-badge ${round.status}`}>{STATUS_LABEL[round.status]}</span></td>
                <td>{round.endpointCount}</td>
                <td>{round.status === 'comparing' || round.status === 'accepted' ? round.changedCount : '—'}</td>
                <td>{round.acceptedCount}/{round.endpointCount}</td>
                <td className="arv-muted">{round.updatedAt.replace('T', ' ').slice(0, 19)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function CreateView({ api, onDone, onBack, onError }: { api: RevisionApi; onDone: (id: string) => void; onBack: () => void; onError: (message: string) => void }) {
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [endpoints, setEndpoints] = useState<EndpointDraft[]>([{ label: '', method: 'GET', url: '', headersText: '', body: '' }])
  const [busy, setBusy] = useState(false)
  const patch = (index: number, patch: Partial<EndpointDraft>) => setEndpoints(endpoints.map((item, i) => i === index ? { ...item, ...patch } : item))
  const submit = async () => {
    setBusy(true)
    try {
      const parsed = endpoints.map(item => {
        let headers: Record<string, string> = {}
        if (item.headersText.trim()) {
          try { headers = JSON.parse(item.headersText) } catch { throw new Error(`接口「${item.label || item.url}」的请求头不是合法 JSON 对象。`) }
          if (typeof headers !== 'object' || Array.isArray(headers)) throw new Error(`接口「${item.label || item.url}」的请求头必须是 JSON 对象。`)
        }
        return { label: item.label.trim(), method: item.method, url: item.url.trim(), headers, body: item.body }
      })
      const round = await api.call<RoundView>('create', { title, goal, endpoints: parsed })
      onDone(round.id)
    } catch (error) { onError(errorText(error)) } finally { setBusy(false) }
  }
  return (
    <div>
      <div className="arv-toolbar"><button className="arv-iconbtn" onClick={onBack} title="返回"><Icon name="back" /></button><b>新建验收轮次</b></div>
      <div className="arv-field"><label>标题（这轮要改什么）</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：价格接口改成分、用户接口加字段" /></div>
      <div className="arv-field"><label>目标描述（将发送给 DSH 会话）</label><textarea rows={3} value={goal} onChange={e => setGoal(e.target.value)} placeholder="描述期望的后端改动…" /></div>
      <div className="arv-field">
        <label>受监控接口（登记后立即快照基线）</label>
        {endpoints.map((endpoint, index) => (
          <div className="arv-endpoint-edit" key={index}>
            <div className="head">
              <span>接口 {index + 1}</span>
              {endpoints.length > 1 && <button className="arv-iconbtn" onClick={() => setEndpoints(endpoints.filter((_, i) => i !== index))}><Icon name="trash" size={14} /></button>}
            </div>
            <div className="row">
              <input type="text" value={endpoint.label} onChange={e => patch(index, { label: e.target.value })} placeholder="名称（如：价格接口）" />
              <select value={endpoint.method} onChange={e => patch(index, { method: e.target.value as EndpointDraft['method'] })}>
                {METHODS.map(method => <option key={method}>{method}</option>)}
              </select>
              <input type="text" style={{ flex: '2 1 260px' }} value={endpoint.url} onChange={e => patch(index, { url: e.target.value })} placeholder="http://127.0.0.1:3000/api/price" />
            </div>
            <div className="arv-field"><label>请求头（JSON 对象，可留空）</label><textarea rows={2} value={endpoint.headersText} onChange={e => patch(index, { headersText: e.target.value })} placeholder='{"authorization":"Bearer …"}' /></div>
            <div className="arv-field"><label>请求体（POST/PUT/PATCH 生效，可留空）</label><textarea rows={2} value={endpoint.body} onChange={e => patch(index, { body: e.target.value })} placeholder='{"item":"whale"}' /></div>
          </div>
        ))}
        {endpoints.length < 20 && <button className="arv-btn small" onClick={() => setEndpoints([...endpoints, { label: '', method: 'GET', url: '', headersText: '', body: '' }])}><Icon name="plus" size={12} />添加接口</button>}
      </div>
      <div className="arv-toolbar">
        <button className="arv-btn primary" disabled={busy || !title.trim() || !goal.trim() || endpoints.some(item => !item.url.trim())} onClick={() => void submit()}>
          <Icon name="check" size={14} />{busy ? '正在快照基线…' : '创建并快照基线'}
        </button>
      </div>
      {busy && <div className="arv-busy">正在请求全部接口并记录源码快照，请稍候…</div>}
    </div>
  )
}

function FieldRow({ field }: { field: FieldDiff }) {
  const kind = { added: ['added', '新增'], removed: ['removed', '删除'], 'type-changed': ['type', '类型变化'], 'value-changed': ['value', '值变化'], 'array-resized': ['value', '数组长度'] }[field.kind]
  const before = 'before' in field ? JSON.stringify(field.before) : ''
  const after = 'after' in field ? JSON.stringify(field.after) : ''
  const body = field.kind === 'array-resized'
    ? `${field.beforeLength} → ${field.afterLength}`
    : field.kind === 'type-changed'
      ? `${field.beforeType} ${before} → ${field.afterType} ${after}`
      : field.kind === 'value-changed'
        ? `${before} → ${after}${field.numeric && field.delta !== null ? `（差值 ${field.delta}）` : ''}`
        : field.kind === 'added' ? after : before
  return <li className={kind[0]}><b>{field.path}</b> {kind[1]} <code>{body}</code></li>
}

function DiffCard({ diff, verdict, feedback, onFeedback, onReview, busy }: {
  diff: EndpointDiff; verdict: Verdict | undefined; feedback: string; busy: boolean
  onFeedback: (value: string) => void; onReview: (status: 'accepted' | 'needs-work') => void
}) {
  const e = diff.endpoint
  const statusChanged = diff.statusChanged
  return (
    <div className="arv-card">
      <h3>{e.label} <span className="arv-muted arv-monospace">{e.method} {e.url}</span></h3>
      <div className="arv-statusline">
        <span className="from">{diff.statusBefore ?? '无响应'}</span><span className="arrow">→</span>
        <span className="to">{diff.statusAfter ?? '无响应'}</span>
        {statusChanged && <span className="changed">状态码变化</span>}
        {!diff.changed && <span className="arv-muted">无差异</span>}
        <span className="arv-muted">耗时 {diff.candidate?.durationMs ?? '—'} ms</span>
      </div>
      {diff.errorSummary && <div className="arv-error" style={{ margin: '8px 0 0' }}>请求错误: {diff.errorSummary}</div>}
      {diff.bodyCompared === 'json' && diff.fields.length > 0 && <ul className="arv-fields">{diff.fields.map((field, index) => <FieldRow key={index} field={field} />)}</ul>}
      {diff.textPatch && <pre className="arv-pre">{diff.textPatch}</pre>}
      {diff.bodyCompared === 'skipped' && !diff.errorSummary && <p className="arv-muted">无法对比响应体（非 JSON/文本响应或请求未完成）。</p>}
      <div className="arv-verdict">
        {verdict && <span className={`state ${verdict.status}`}>{VERDICT_LABEL[verdict.status]}</span>}
        <button className="arv-btn small success" disabled={busy} onClick={() => onReview('accepted')}><Icon name="check" size={12} />接受</button>
        <button className="arv-btn small" disabled={busy} onClick={() => onReview('needs-work')}><Icon name="x" size={12} />继续修改</button>
        <input type="text" className="arv-endpoint-edit" style={{ flex: '1 1 200px' }} placeholder="继续修改时附上反馈…" value={feedback} onChange={e => onFeedback(e.target.value)} disabled={busy} />
      </div>
    </div>
  )
}

function RoundView({ api, id, onBack, onError }: { api: RevisionApi; id: string; onBack: () => void; onError: (message: string) => void }) {
  const [round, setRound] = useState<RoundView | null>(null)
  const [busy, setBusy] = useState('')
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [request, setRequest] = useState<{ text: string; relativePath: string } | null>(null)
  const [dialogBusy, setDialogBusy] = useState('')

  const load = async () => {
    try { setRound(await api.call<RoundView>('get', { id })) } catch (error) { onError(errorText(error)) }
  }
  useEffect(() => { void load() }, [])

  const act = async (operation: string, args: Record<string, unknown> = {}, message = '处理中…') => {
    setBusy(message)
    try {
      const value = await api.call<unknown>(operation, { id, version: round!.version, ...args })
      if (operation === 'request') { setRequest(value as { text: string; relativePath: string }) } else await load()
      return value
    } catch (error) { onError(errorText(error)) } finally { setBusy('') }
  }

  if (!round) return <div className="arv-busy">加载中…</div>
  const verdictOf = (endpointId: string) => round.verdicts.find(item => item.endpointId === endpointId)
  const allAccepted = round.candidate !== undefined && round.verdicts.length === round.endpoints.length && round.verdicts.every(item => item.status === 'accepted')

  return (
    <div>
      <div className="arv-toolbar">
        <button className="arv-iconbtn" onClick={onBack} title="返回列表"><Icon name="back" /></button>
        <b>{round.title}</b>
        <span className={`arv-badge ${round.status}`}>{STATUS_LABEL[round.status]}</span>
        <span className="arv-muted">版本 {round.version}</span>
        {round.lastSentAt && <span className="arv-muted">上次发送 {round.lastSentAt.replace('T', ' ').slice(0, 19)}</span>}
      </div>
      <div className="arv-goal"><b>目标：</b>{round.goal}</div>
      {round.candidate && round.stale && <div className="arv-warn"><Icon name="warn" size={13} /> 源码在重跑后又有变化：当前差异已过期，请重新「重跑对比」后再验收。</div>}
      <div className="arv-actions">
        <button className="arv-btn primary" disabled={busy !== '' || round.status === 'accepted'} onClick={() => void act('request', {}, '生成请求…')}><Icon name="send" size={14} />生成请求</button>
        <button className="arv-btn" disabled={busy !== '' || round.status === 'accepted'} onClick={() => { if (window.confirm('重跑会重新请求全部接口并重置验收状态，继续？')) void act('rerun', {}, '重跑对比…') }}><Icon name="refresh" size={14} />重跑对比</button>
        <button className="arv-btn" disabled={busy !== ''} onClick={() => void downloadReport() }><Icon name="download" size={14} />导出报告</button>
        <button className="arv-btn success" disabled={busy !== '' || !allAccepted} onClick={() => void act('finish', {}, '完成验收…')}><Icon name="check" size={14} />完成本轮验收</button>
      </div>
      {busy && <div className="arv-busy" style={{ marginTop: 12 }}>{busy}</div>}

      <h3 style={{ marginBottom: 4 }}>接口与基线</h3>
      <table className="arv-table">
        <thead><tr><th>接口</th><th>基线状态</th><th>耗时</th><th>响应体</th><th>验收</th></tr></thead>
        <tbody>
          {round.endpoints.map(endpoint => {
            const baseline = round.baseline.responses.find(response => response.endpointId === endpoint.id)
            const verdict = verdictOf(endpoint.id)
            return (
              <tr key={endpoint.id}>
                <td><b>{endpoint.label}</b><br /><span className="arv-muted arv-monospace">{endpoint.method} {endpoint.url}</span></td>
                <td>{baseline ? <span className="arv-monospace">{baseline.status ?? '无响应'}</span> : '—'}{baseline?.error && <div className="arv-muted">{(baseline.error ?? '').slice(0, 60)}</div>}</td>
                <td className="arv-muted">{baseline?.durationMs ?? '—'} ms</td>
                <td className="arv-muted">{baseline ? ({ json: 'JSON', text: '文本', empty: '空', unsupported: '不支持' })[baseline.bodyKind] : '—'}</td>
                <td>{verdict ? <span className={`arv-verdict state ${verdict.status}`} style={{ display: 'inline-flex' }}>{VERDICT_LABEL[verdict.status]}</span> : <span className="arv-muted">—</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {round.candidate && (
        <>
          <h3 style={{ marginTop: 24 }}>重跑差异（{round.candidate.createdAt.replace('T', ' ').slice(0, 19)}）</h3>
          {round.endpointDiffs.map(diff => (
            <DiffCard key={diff.endpoint.id} diff={diff} verdict={verdictOf(diff.endpoint.id)} busy={busy !== ''}
              feedback={feedback[diff.endpoint.id] ?? verdictOf(diff.endpoint.id)?.feedback ?? ''}
              onFeedback={value => setFeedback({ ...feedback, [diff.endpoint.id]: value })}
              onReview={status => void act('review', { endpointId: diff.endpoint.id, status, feedback: feedback[diff.endpoint.id] ?? verdictOf(diff.endpoint.id)?.feedback ?? '' })} />
          ))}
        </>
      )}

      {request && (
        <div className="arv-dialog">
          <div className="arv-dialog-box">
            <header><h3>发送到当前 DSH 会话</h3><button className="arv-iconbtn" style={{ marginLeft: 'auto' }} onClick={() => setRequest(null)}><Icon name="close" /></button></header>
            <textarea readOnly value={request.text} />
            <footer>
              <button className="arv-btn" onClick={() => { void navigator.clipboard?.writeText(request.text); }}><Icon name="copy" size={14} />复制</button>
              <button className="arv-btn primary" disabled={dialogBusy !== ''} onClick={async () => {
                setDialogBusy('发送中…')
                try {
                  await api.send?.(request.text)
                  await act('markSent', {}, '标记已发送…')
                  setRequest(null)
                } catch (error) { onError(errorText(error)) } finally { setDialogBusy('') }
              }}><Icon name="send" size={14} />{dialogBusy || '发送到当前会话'}</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )

  async function downloadReport() {
    setBusy('生成报告…')
    try {
      const report = await api.call<{ html: string; relativePath: string }>('report', { id })
      const blob = new Blob([report.html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `apirevise-${round!.id.slice(0, 8)}.html`
      anchor.click()
      URL.revokeObjectURL(url)
      onError(`报告已下载；项目内也保存了 ${report.relativePath} 与 report.md。`)
    } catch (error) { onError(errorText(error)) } finally { setBusy('') }
  }
}
