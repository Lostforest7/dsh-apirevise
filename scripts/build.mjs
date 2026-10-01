import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'

await mkdir('lib', { recursive: true })
await build({ entryPoints: ['src/host/index.ts'], outfile: 'lib/index.js', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external' })
await build({ entryPoints: ['src/client/index.tsx'], outfile: 'lib/client.js', bundle: true, minify: true, platform: 'browser', format: 'cjs', target: 'es2022', jsx: 'automatic', loader: { '.css': 'text' }, external: ['react', 'react/jsx-runtime'],
  banner: { js: 'window.__ModuleLoader__.load({id:"dsh-apirevise",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' }, define: { 'process.env.NODE_ENV': '"production"' },
})
await build({ entryPoints: ['src/ui/standalone.tsx'], outfile: 'lib/workbench.js', bundle: true, minify: true, platform: 'browser', format: 'iife', target: 'es2022', jsx: 'automatic', loader: { '.css': 'text' }, define: { 'process.env.NODE_ENV': '"production"' } })
await writeFile('lib/workbench.html', '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DSH API Revise · 接口回归验收台</title><style>body{margin:0;background:#101114}</style></head><body><div id="root"></div><script src="/workbench.js"></script></body></html>')
console.log('Built host, DSH client and preview workbench.')
