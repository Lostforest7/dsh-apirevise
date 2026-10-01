import { lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ApiReviseError } from '../shared/model.ts'

export function assertInside(root: string, file: string): string {
  const relative = path.relative(root, file)
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw new ApiReviseError('path-outside-workspace', '路径必须在当前会话的项目目录内。')
  }
  return file
}

export async function metadataDir(workspace: string): Promise<string> {
  const root = await realpath(workspace)
  const dir = path.join(root, '.dsh-apirevise')
  try {
    if ((await lstat(dir)).isSymbolicLink()) throw new ApiReviseError('unsafe-storage', '.dsh-apirevise 不能是符号链接。')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    await mkdir(dir)
  }
  assertInside(root, await realpath(dir))
  return dir
}

export async function roundDir(workspace: string, id: string, create = false): Promise<string> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiReviseError('invalid-id', '无效的验收轮次编号。')
  const parent = await metadataDir(workspace)
  const dir = path.join(parent, id)
  if (create) await mkdir(dir, { recursive: true })
  const stat = await lstat(dir)
  if (stat.isSymbolicLink()) throw new ApiReviseError('unsafe-storage', '验收记录目录不能是符号链接。')
  assertInside(parent, await realpath(dir))
  return dir
}

export async function atomicWrite(file: string, value: string | Uint8Array): Promise<void> {
  try {
    if ((await lstat(file)).isSymbolicLink()) throw new ApiReviseError('unsafe-storage', '记录文件不能是符号链接。')
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, value, { flag: 'wx' })
  await rename(temporary, file)
}

export async function readRecord(dir: string, name: string): Promise<string> {
  const file = path.join(dir, name)
  if ((await lstat(file)).isSymbolicLink()) throw new ApiReviseError('unsafe-storage', '记录文件不能是符号链接。')
  assertInside(dir, await realpath(file))
  return readFile(file, 'utf8')
}
