import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { ApiReviseError } from '../shared/model.ts'
import { assertInside } from './files.ts'

const SOURCE_EXT = /\.(?:tsx?|jsx?|mjs|cjs|py|go|java|rs|rb|php|c|h|cc|cpp|hpp|cs|kt|swift|scala|sql|vue|svelte)$/i
const ROOT_CONFIG = /^(?:package\.json|requirements\.txt|pyproject\.toml|go\.mod|go\.sum|Cargo\.toml|Cargo\.lock|pom\.xml|build\.gradle(?:\.[\w-]+)?|Gemfile|composer\.json|Makefile|Dockerfile(?:\.[\w-]+)?)$/
const SOURCE_DIRS = ['src', 'app', 'api', 'lib', 'routes', 'controllers', 'services', 'models', 'server', 'handlers', 'middleware', 'migrations', 'cmd', 'pkg', 'internal', 'domain', 'repository']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.venv', '__pycache__', '.git', 'target', 'vendor', '.next', 'out'])

/** Snapshot the supported backend source surface; never silently omit oversized files. */
export async function readSources(workspace: string): Promise<Record<string, string>> {
  const root = await realpath(workspace)
  const files: Record<string, string> = {}
  let bytes = 0
  async function read(file: string): Promise<void> {
    const resolved = await realpath(file)
    assertInside(root, resolved)
    const key = path.relative(root, file).split(path.sep).join('/')
    const data = await readFile(file)
    bytes += data.byteLength
    if (data.byteLength > 512_000 || bytes > 5_000_000 || Object.keys(files).length >= 500) {
      throw new ApiReviseError('source-limit', '首版源码快照上限：500 个文件、单文件 512 KB、合计 5 MB。请使用较小的后端项目。')
    }
    files[key] = data.toString('utf8')
  }
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const file = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) throw new ApiReviseError('source-symlink', '源码目录中的符号链接暂不支持。')
      if (entry.isDirectory()) await walk(file)
      else if (SOURCE_EXT.test(entry.name)) await read(file)
    }
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink() && (ROOT_CONFIG.test(entry.name) || SOURCE_DIRS.includes(entry.name))) throw new ApiReviseError('source-symlink', '源码目录中的符号链接暂不支持。')
    if (entry.isFile() && (ROOT_CONFIG.test(entry.name) || SOURCE_EXT.test(entry.name))) await read(path.join(root, entry.name))
    if (entry.isDirectory() && SOURCE_DIRS.includes(entry.name)) await walk(path.join(root, entry.name))
  }
  if (!Object.keys(files).length) throw new ApiReviseError('no-sources', '未找到支持的后端源码：需要 src/ 等目录或源码文件。')
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
}

export function sameSources(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key])
}
