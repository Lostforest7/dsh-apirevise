# Phase 1 报告 · dsh-apirevise 实现、测试与构建结果

> 日期：2026-10-01。结论：**Phase 1 完成**——宿主插件 + Web 面板 + 纯函数核心 + 50 项单元测试全绿 + 双语文档 + 离线全链路冒烟通过。可交 PM 复核，批准后进入 Phase 2（真实 DSH + 真实模型闭环）。

## 1. 交付物清单

```
dsh-apirevise/
├── package.json            # dsh.bundle / dsh.client 声明；exports ./ + ./client；deps 仅 diff+zod
├── cordis.patch.yml        # profile 插入补丁（与 dsh-revise 同姿势）
├── pnpm-workspace.yaml     # pnpm 11 的 allowBuilds: esbuild
├── tsconfig.{base,host,client}.json · vitest.config.ts · scripts/build.mjs
├── src/shared/model.ts     # zod 模型：Endpoint/Response/Verdict/Round + ApiReviseError + parseEndpointUrl
├── src/core/files.ts       # .dsh-apirevise 存储：原子写/符号链接防御/路径包含校验
├── src/core/sources.ts     # 后端源码快照（多语言扩展名 + 构建清单，500文件/512KB/5MB 上限）
├── src/core/request.ts     # Node 内置 fetch 采集：超时/5MB 体上限/JSON|text|unsupported/错误记录
├── src/core/diff.ts        # 自研 JSON 字段级 diff（浮点容差/数组按下标/null→值/嵌套路径）+ diffEndpoints
├── src/core/report.ts      # requestText + Markdown/HTML 报告（XSS 转义 + CSP default-src 'none'）
├── src/core/service.ts     # 状态机：draft→sent→comparing→accepted；version CAS；会话隔离；陈旧检测；逐项验收
├── src/host/index.ts       # connection.fetch.register('/api/dsh-apirevise') + observeSession + zod 信封 + ctx.effect
├── src/client/index.tsx    # shell.overlay 右下入口；rpc.call('/api')；sessions.using().prompt('queue')
├── src/ui/{App,icons,styles,standalone}.tsx/css   # 工作台面板（列表/登记/重跑/diff 卡片/验收/报告下载）
├── scripts/{dev-server.ts,smoke.ts}  # 本地预览服务器 + 离线全链路冒烟（不依赖 DSH）
├── tests/unit/*.test.ts    # 5 文件 50 用例
├── examples/api-server/    # 零依赖示例后端（3 端点，Phase 2 用）
├── README.md / README.zh-CN.md / docs/compatibility.md / CONTRIBUTING.md / LICENSE
```

## 2. 测试与构建结果（全部真实执行）

| 检查 | 结果 |
|---|---|
| `tsc -p tsconfig.host.json` / `tsconfig.client.json` | ✅ 双通过（TS 7.0.2，strict） |
| `vitest run` | ✅ **50/50 通过**（5 文件；fixture 化、离线、无需 DSH/外网，HTTP 仅 127.0.0.1 回环） |
| `node scripts/build.mjs` | ✅ lib/index.js（宿主 ESM）+ lib/client.js（`__ModuleLoader__.load` CJS）+ lib/workbench.*（预览） |
| 离线冒烟 `tsx scripts/smoke.ts` | ✅ 完整闭环：3 端点基线 → 后端 v2 重跑 → 3/3 结构化 diff 命中（price 数值 299→29900、unit/tier 新增、total 数值变化）→ **源码改动触发 stale 守卫拦截验收** → 重新重跑 → 逐项接受 → finish → report.html 落盘（旧值/新值齐全、无原始 `<script>`） |

测试覆盖清单（任务书要求逐项对齐）：
- diff fixture：新增字段 / 删除字段 / 数值变化（含差值）/ 状态码变化 / 嵌套路径 / null→值 / 值→null / 数组重排（按下标确定性）/ 数组伸缩 / 浮点容差（0.1+0.2 vs 0.3 无差、1.001 有差）/ 类型变化 / NaN / maxDiffs 截断；
- 版本冲突（CAS）、跨会话隔离（wrong-session + list 过滤）、`endpoints-frozen`、`round-closed`、`no-candidate`、`stale-candidate`、`incomplete-review`、`no-pending-changes`、`changed-during-capture`、`no-sources`、非法 URL 拒绝；
- 报告 XSS 转义（title/goal/header/body 注入 `<script>`、`<img onerror>`、`</style>` 全部转义）+ CSP 断言；
- 真实回环 HTTP：JSON/文本/二进制/404/超时/连接拒绝/超大响应/POST 体与自定义头透传。

## 3. 与任务书的偏差（如实报告）

1. **devDependencies 精简**：去掉 `@deepseek-ai/dsh` 全量包（会拉入 libreoffice-kit/sharp/sherpa-onnx 等 583 个重型包，且安装屡次超时），改为按需引入 8 个 0.2.0-rc.2 契约小包（cordis、session、session-query、client-connection、client-ui-{renderer,layout,session,slots}、client-store、api-session-controller）。类型与运行契约不变。
2. **pnpm 11 配置**：`onlyBuiltDependencies` 迁移至 pnpm-workspace.yaml（allowBuilds: esbuild）；package.json 不再携带 pnpm 字段。
3. **新增排练工具**（非 MVP 范围，纯开发用）：dev-server 本地预览 + smoke 冒烟脚本，用于 Phase 2 前的闭环彩排。
4. **MVP 不注册模型工具**（与 dsh-revise 一致，纯 UI 工作流）；`apirevise_` 命名纪律写入 CONTRIBUTING，供未来工具使用。
5. 工具链实测版本：Node 24.21.0（DSH 官方 runtime）/ pnpm 11.7.0 / TS 7.0.2 / vitest 4.1.11 / esbuild 0.28.2。

## 4. 尚未做（按计划留给后续 Phase）

- 真实 DSH Web 0.2.0-rc.2 宿主安装与界面验证、真实 DeepSeek 模型改后端闭环（→ Phase 2 硬门槛，模型环节不 mock）；
- 演示 GIF、GitHub 仓库、npm 发布、市场登记（→ Phase 3）；
- docs/compatibility.md 的「真实宿主/真实模型」行将在 Phase 2 后回填。

## 5. Phase 2 预登记风险

1. 本机 `dsh` CLI 不在 PATH（桌面宿主），插件安装将走宿主自带的 profile 通道（与 dsh-revise 安装方式一致）；Phase 2 首步先核实 web profile 安装路径。
2. DSH 受限 shell 拦截 piped spawn（EPERM，dsh-revise 实录同类问题）：示例后端是零依赖 node http（无构建步骤），已从根上绕开；若模型自行引入构建命令，预期一次性批准。
3. 真实验证将使用桌面宿主 + web profile + 真实 DeepSeek 账号（本机 `~/.dsh` 已配置 deepseek-v4-pro / max）。
