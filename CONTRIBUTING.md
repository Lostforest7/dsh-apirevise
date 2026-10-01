# 开发指南

## 环境

- Node 22.19+（22.x 线）或 Node 24；开发环境实测 Node 24.21.0。
- 依赖安装：`npm ci`。
- 契约依赖：`@deepseek-ai/dsh@0.2.0-rc.2` 及同版本 client/session 包（devDependencies，仅用于类型与运行契约）。

## 常用命令

```sh
npm run build       # esbuild 构建 lib/index.js（宿主）+ lib/client.js（DSH 客户端）+ lib/workbench.*（预览）
npm run typecheck   # 宿主与客户端两套 tsc
npm test            # vitest 单元测试（fixture 化，离线，无需 DSH）
npm run check       # 以上全部
npm run dev         # 本地预览：node scripts/dev-server.ts 起 /rpc 服务，打开输出 URL（examples/api-server 为工作区）
```

## 架构

- `src/shared/model.ts` — zod 数据模型、`ApiReviseError`、本地 URL 策略 `parseEndpointUrl`。
- `src/core/` — 纯函数核心，**不 import 任何 `@deepseek-ai/*`**，可离线单测：
  - `files.ts` 记录存储（原子写 / 符号链接防御 / 路径包含校验）
  - `sources.ts` 后端源码快照
  - `request.ts` HTTP 请求采集（Node 内置 fetch）
  - `diff.ts` JSON 字段级结构化 diff + 端点对比
  - `report.ts` 请求文案 + Markdown/HTML 报告（XSS 转义）
  - `service.ts` 轮次状态机：version CAS、跨会话隔离、陈旧检测、逐项验收
- `src/host/index.ts` — 宿主插件：`ctx.connection.fetch.register('/api/dsh-apirevise')` + `ctx.sessionQuery.observeSession` 取工作区。
- `src/client/index.tsx` + `src/ui/` — DSH Web 面板（右下角入口 + 工作台）。

## 测试纪律

- 纯函数全部 fixture 化：固定 JSON 响应对断言 diff（新增字段 / 删除字段 / 数值变化 / 状态码变化 / 嵌套路径 / null→值 / 数组重排 / 浮点容差）。
- 边界覆盖：版本冲突、跨会话隔离、源码变化后旧 diff 不能完成验收、报告 XSS 转义。
- HTTP 测试只打 127.0.0.1 回环（`node:http` 进程内服务器），不访问外网。
- 模型环节不得 mock；真实模型闭环验证见 `docs/real-model-validation.md`（Phase 2 硬门槛）。

## 命名纪律

模型可见工具（若有）一律 `apirevise_` 前缀。MVP 与 dsh-revise 一致：不注册模型工具，交互全部走 Web 面板与「生成请求 → 发到当前会话」。
