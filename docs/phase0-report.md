# Phase 0 立项核对报告 · dsh-apirevise

> 结论先行：**「响应级回归对比 + 逐项验收」在 DSH 生态中是空白，差异化成立，建议进入 Phase 1。**
> 核对日期：2026-10-01。核对方法：本地解包竞品源码实装核验（非只看宣传页）+ 宿主运行时目录/配置实录 + 官方 awesome 列表与市场目录交叉检索。

## 1. DSH 当前版本与内置能力核对

| 核对项 | 证据 | 结论 |
|---|---|---|
| DSH 版本 | `~/.dsh/dsh-runtimes/dsh-primary-runtime/runtime.json` → `desktopVersion: "0.2.0-rc.2"`，Node 24.21.0 / pnpm 11.7.0 | 与任务书一致，按 **0.2.0-rc.2** 开发与验证 |
| 本机 profile | `~/.dsh/profiles/{web,desktop}/cordis.patch.yml`：web 为空补丁，desktop 仅 ui-chat/ui-settings/默认模型/computer-use，**无任何接口/回归类插件** | 干净基线 |
| 宿主内置 Service 目录 | `cordis_inspect_list` + `Service.listService` 全文核对（60+ 服务：connection/sessionQuery/storage/workspace*/tools/commands…） | **无** API 请求、响应快照、回归对比类内置服务 |
| 宿主内置 Tool 目录 | `Tool.listTools`（本会话可见工具全集） | **无** 接口/回归类内置工具；工具命名空间无 `apirevise` 冲突 |
| 官方插件清单 | [Awesome-DeepSeek-Harness-Plugins](https://github.com/web-casa/Awesome-DeepSeek-Harness-Plugins) 331 条全量 grep | 无任何「API 响应快照 + 回归对比 + 逐项验收」插件 |

说明：本机 `dsh` CLI 不在 PATH（DSH 以桌面宿主运行，无 npm 全局 CLI）。`dsh --dump-config` 用上述 runtime.json + profile 补丁 + 宿主 Service/Tool/Event 三目录实录等价替代；Phase 1 将在 `web` profile 真实安装验证，Phase 2 在真实宿主跑闭环。

## 2. 竞品功能矩阵（实装核验）

三家竞品源码均已下载解包至本地 `.refs/`（内部参考，不进仓库），逐一读 README + 工具/命令/路由注册代码：

| 竞品 | 作者/渠道 | 领域与实现（实装核验） | 响应级回归 | 逐项验收 | 报告导出 |
|---|---|---|---|---|---|
| **dsh-test-workbench** | dmsobtl / GitHub | QA 人格 Profile：组装 3 插件（UI 断言+**视觉回归**、会话分析、视觉路由）+ 预置 Skill + persona。其 Roadmap 明确列出 `dsh-tool-api-test`（HTTP 接口测试）为**未实现项** | ❌ 截图视觉回归 | ❌ | ❌ |
| **dsh-build-diff** | KeLearns / GitHub | agent loop 结束自动**工作区文件**快照对比：行级 diff + 逐文件/整轮撤销 + 审阅气泡。webServer 路由 + betterSidebar 标签页；**无模型工具**；`fetch` 仅访问自身插件路由 | ❌ 文件 diff | ⚠️ 只有「标记已读/撤销」，无验收门 | ❌ |
| **dsh-checkpoint-diff** | tmpdot / npm 0.5.2 | 只读消费 dsh-checkpoint-rewind 检查点：`/diff` `/rollback` 命令 + HTTP API + 浮层面板，**文件**时间节点 diff + 预览式回滚 | ❌ 文件 diff | ❌ | ❌ |
| dsh-openapi | Degurechaff57 | OpenAPI 发现与 API **调用**工具（无快照/对比） | ❌ | ❌ | ❌ |
| dsh-batch-regression | PangYiMing | 一条命令跑 N 轮按中位数/分布判断（命令统计，非接口） | ❌ | ❌ | ❌ |
| @deepseek-ai/dsh-tool-diff | omdsh-dev | 通用文本/JSON diff **构件**（无快照、无工作流） | ⚠️ 仅构件 | ❌ | ❌ |
| dsh-test-runner / dsh-payload-capture 等 | 多人 | 测试框架运行器 / 捕获 DSH 自身 LLM 上行 payload | ❌ | ❌ | ❌ |

**结论**：生态里 diff/回归的存量全部落在「文件/截图」域或「通用构件/调用工具」层；「用户登记端点 → 快照基线 → agent 改后端 → 重跑 → **响应级结构化 diff（状态码/字段/数值，可追溯新旧值）** → **逐项验收 + 反馈回会话** → **导出报告**」这条闭环**无人做过**。dsh-test-workbench 的 api-test 仍是 Roadmap 未实现项，恰说明需求存在且无交付。**差异化成立。**

## 3. 技术预研结论

| 课题 | 备选 | 结论与理由 |
|---|---|---|
| JSON 结构化 diff | json-diff / deep-diff（多年未维护）；jsondiffpatch（成熟但 delta 格式复杂、无浮点容差语义、引入体积） | **自研纯函数**（src/core/diff.ts，~150 行）：新增/删除/类型变化/数值变化（新旧值+浮点容差）/嵌套路径/null→值/数组重排判定/状态码对比。零依赖、语义完全可控、离线可测——与"纯函数核心不 import @deepseek-ai/*"纪律一致 |
| 快照存储 | — | **`.dsh-apirevise/<round-id>/`**（与 dsh-revise 的 `.dsh-revise/` 同风格）：round.json + baseline.json + candidate.json + request.md + report.md/html；原子写（tmp+rename）、符号链接防御、路径包含校验、sessionId 跨会话隔离、version CAS——全部照搬 dsh-revise 已验证实现（[service.ts](../../.refs/dsh-revise-main/src/core/service.ts)、[files.ts](../../.refs/dsh-revise-main/src/core/files.ts) 已逐行阅读） |
| HTTP 请求发送 | Node 内置 fetch vs 显式 undici | **Node 内置全局 fetch**（undici 内置于 Node ≥22.19，engines 声明 ^22.19 \|\| >=24）：AbortSignal.timeout、响应体上限 5MB、仅 http/https 本地端点（127.0.0.1/localhost/[::1] + 显式端口）、JSON/文本响应 |
| 代码 diff | — | 后端源码快照（后端扩展名范围 + package.json/requirements.txt 等）+ `diff`（jsdiff，与 dsh-revise 同库）createTwoFilesPatch，与响应 diff 并排展示 |
| 集成姿势 | — | 完全复用 dsh-revise 已验证姿势：`export const name/inject` + `ctx.connection.fetch.register('/api/dsh-apirevise')` + `ctx.sessionQuery.observeSession({projectionMode:'none'})` 取工作区 + zod 信封 `{type:'client-request',rpcId,method,payload:{operation,sessionId,args}}` + `ctx.effect` 清理；Web 端 `slots.inject('shell.overlay')` 右下入口 + `connection.rpc.call('/api',...)` + `sessions.using(...).session.prompt(text,'queue')` 发会话；esbuild 构建 host/client |
| 工具命名 | — | MVP 与 dsh-revise 一致**不注册模型工具**（纯 UI 工作流）；未来任何模型工具一律 `apirevise_` 前缀，已写入实现纪律 |
| 测试 | vitest（同 revise） | 纯函数全 fixture 化：新增/删除字段、数值变化、状态码变化、嵌套路径、null→值、数组重排、浮点容差、版本冲突、跨会话隔离、报告 XSS 转义 |

## 4. 风险与已知环境问题（提前登记）

1. **dsh CLI 不在 PATH**：Phase 2 需经桌面宿主真实安装（`dsh plugin --profile web add` 由宿主提供）；Phase 1 开发用 `@deepseek-ai/dsh@0.2.0-rc.2` devDependency 做类型与运行契约。
2. **DSH 受限 shell 拦截 piped spawn（EPERM）**：dsh-revise 真实模型验证实录（其 docs/real-model-validation.md）——Phase 2 示例后端构建时预期需一次批准，属 DSH 环境行为，非插件缺陷。
3. **命名独占性**：npm `dsh-apirevise` 404、GitHub 仓库搜索 0 结果、市场目录无冲突（发布前再确认一次）。
4. 竞品源码仅作内部核对参考，存放于 `.refs/`（已加入 .gitignore），不进入发布包。

## 5. Phase 0 结论

✅ 差异化成立（响应级回归对比 + 逐项验收为生态空白）→ ✅ 技术方案全部有 dsh-revise 已验证先例 → ✅ 无命名/内置冲突 → **建议批准进入 Phase 1（实现 + 测试 + 双语文档）。**

*附：本报告的事实来源均为本地可复现证据（runtime.json、profile 补丁、宿主目录实录、竞品源码 grep），外部链接仅作索引。*
