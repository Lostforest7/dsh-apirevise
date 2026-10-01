import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import type { RevisionApi } from '../shared/model.ts'
import styles from './styles.css'
const style = document.createElement('style'); style.textContent = styles; document.head.append(style)
const token = location.hash.slice(1) || sessionStorage.getItem('dsh-apirevise-preview-token') || ''
if (token) sessionStorage.setItem('dsh-apirevise-preview-token', token)
history.replaceState(null, '', location.pathname)
const api: RevisionApi = {
  async call<T>(operation: string, args = {}): Promise<T> {
    const response = await fetch(`/rpc/${operation}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(args) })
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error(result.error?.message ?? '请求失败')
    return result.value as T
  },
  async send(text: string): Promise<void> {
    await navigator.clipboard.writeText(text)
    alert('本地预览没有 DSH 会话：请求已复制到剪贴板。')
  },
}
createRoot(document.getElementById('root')!).render(<App api={api} sessionLabel="本地预览 · 无会话" onClose={() => {}} />)
