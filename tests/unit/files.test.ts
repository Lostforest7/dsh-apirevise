import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { atomicWrite, assertInside, metadataDir, readRecord, roundDir } from '../../src/core/files.ts'
import { ApiReviseError } from '../../src/shared/model.ts'

let workspace: string
beforeEach(async () => {
  await mkdir('work/unit', { recursive: true })
  workspace = await mkdtemp(path.resolve('work/unit/files-'))
})
afterEach(async () => { await rm(workspace, { recursive: true, force: true }) })

async function trySymlink(target: string, link: string, type: 'dir' | 'file'): Promise<boolean> {
  try { await symlink(target, link, type); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM' || (error as NodeJS.ErrnoException).code === 'EACCES' || (error as NodeJS.ErrnoException).code === 'ENOTSUP') return false
    throw error
  }
}

describe('record storage under .dsh-apirevise', () => {
  test('creates the metadata directory and round directories', async () => {
    const meta = await metadataDir(workspace)
    expect(meta.endsWith('.dsh-apirevise')).toBe(true)
    const dir = await roundDir(workspace, '00000000-0000-4000-8000-000000000000', true)
    expect(dir.startsWith(meta)).toBe(true)
  })
  test('rejects malformed round ids', async () => {
    await expect(roundDir(workspace, '../escape')).rejects.toBeInstanceOf(ApiReviseError)
    await expect(roundDir(workspace, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'ENOENT' })
  })
  test('atomicWrite creates and overwrites records', async () => {
    const file = path.join(workspace, 'record.json')
    await atomicWrite(file, 'first')
    expect(await readFile(file, 'utf8')).toBe('first')
    await atomicWrite(file, 'second')
    expect(await readFile(file, 'utf8')).toBe('second')
    const leftovers = (await import('node:fs/promises')).readdir(workspace)
    expect((await leftovers).filter(name => name.endsWith('.tmp'))).toEqual([])
  })
  test('readRecord reads records written by atomicWrite', async () => {
    const dir = await roundDir(workspace, '00000000-0000-4000-8000-000000000000', true)
    await atomicWrite(path.join(dir, 'round.json'), '{"ok":true}')
    expect(await readRecord(dir, 'round.json')).toBe('{"ok":true}')
  })
  test('assertInside rejects paths outside the workspace', () => {
    expect(() => assertInside(workspace, path.join(workspace, 'a', 'b'))).not.toThrow()
    expect(() => assertInside(workspace, path.resolve(workspace, '..', 'elsewhere'))).toThrow(ApiReviseError)
    expect(() => assertInside(workspace, 'D:\\outside')).toThrow(ApiReviseError)
  })
  test('refuses a symlinked metadata directory when symlinks are creatable', async () => {
    const outside = await mkdtemp(path.resolve('work/unit/outside-'))
    const link = path.join(workspace, '.dsh-apirevise')
    try { await rm(outside, { recursive: true, force: true }) } catch { /* ignore */ }
    if (await trySymlink(outside, link, 'dir')) {
      await expect(metadataDir(workspace)).rejects.toMatchObject({ code: 'unsafe-storage' })
    }
  })
  test('refuses symlinked record files when symlinks are creatable', async () => {
    const outside = await mkdtemp(path.resolve('work/unit/outside-file-'))
    const target = path.join(outside, 'target.json')
    await writeFile(target, 'x')
    const link = path.join(workspace, 'record.json')
    if (await trySymlink(target, link, 'file')) {
      await expect(atomicWrite(link, 'y')).rejects.toMatchObject({ code: 'unsafe-storage' })
    }
  })
})
