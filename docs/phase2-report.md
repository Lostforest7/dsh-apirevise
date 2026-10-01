# Phase 2 报告 · 真实闭环验证（发布前硬门槛）

> 日期：2026-10-01。结论：**Phase 2 通过** —— 真实 DSH Web 0.2.0-rc.2 + 真实 DeepSeek 模型改后端 + 真实 GUI 全流程闭环跑通，diff 经磁盘/HTTP 独立复核一致。详细证据见 [真实模型验证](real-model-validation.md)。

## 1. 验证环境与真实性

| 项 | 实测值 |
|---|---|
| 宿主 | DSH Web **0.2.0-rc.2** 桌面宿主（live `desktop` profile） |
| 插件安装 | 插件管理器 `link:D:/dsh-plugin2/dsh-apirevise` → `dsh.profile.bundles` 追加，宿主热应用；`include:dsh-apirevise … fiberPhase: active` |
| 宿主半体证据 | `POST /api/dsh-apirevise` 未认证探活返回 **401**（非 404） |
| 客户端半体证据 | 真实 GUI 右下角出现「API 接口验收台」按钮，面板全流程可操作 |
| 模型 | **真实 DeepSeek V4-Flash（Max 推理）**，经 DSH 正常消息队列发送；**未 mock** |
| 后端 | 零依赖 `node:http` 示例服务（127.0.0.1:3000），独立重启验证新代码生效 |
| GUI 操作者 | **agent** 鼠标/键盘驱动（用户授权）；记录中如实标注"点击由 agent 完成，非人工逐条批准" |

## 2. 闭环结果（实测时间线）

| 阶段 | 时刻（本地） | 结果 |
|---|---|---|
| 建工作区/会话 → 登记 3 端点 → 基线快照 | 19:47–19:48:41 | 3/3 HTTP 200；源码快照含**改动前**的 `server.mjs` |
| 生成请求 → 发送到会话 | 19:48:56 | 请求含目标 + 端点清单 + 纪律说明 |
| **真模型改后端** | 19:49–19:52（≈2 分 45 秒 / 16 步） | `price: 299→29900`、`user` 增 `tier:'free'`；`node --check` 通过；明确未动 `/api/order` |
| 重启服务 → **重跑对比** | 19:52–19:53:29 | 结构化 diff：`$.price 值变化 299 → 29900（差值 29601）`；`$.tier 新增 "free"`；`/api/order 无差异` |
| **逐项验收** | 19:53–19:54 | 3/3 接受（版本 3→6） |
| **完成本轮验收 + 导出报告** | 19:54:15 | 轮次 `accepted`（版本 7）；`report.md` 2,026 B / `report.html` 5,420 B |

**diff 准确性**：模型磁盘改动 × 插件 diff × 独立 HTTP 探测三方一致（价格数值变化带差值、新增字段、未变接口显示无差异）。

## 3. 发现的问题（如实记录，均非插件功能缺陷）

1. **DSH 沙箱在本工作区无法配置写权限**（`SetNamedSecurityInfoW failed (Win32 5)`，agent 侧 pwsh 与模型侧 shell 同源）：模型申请一次 `danger-full-access` 执行 `diagnose-windows-sandbox-acl.ps1` 修复目录 ACL（附带回滚命令），随后 `node --check` 通过。
   - ⚠️ 该批准提示由 agent 点击时**坐标偏差点成"允许一次"**（原意为"拒绝"）——如实记录；影响限于 `work/p2-backend` 目录权限，可回滚，未改文件内容/所有者。
2. **GUI「导出报告」的浏览器下载未落到系统默认下载目录**（桌面 WebView 行为）；报告已由 `finish`/`report` 写入项目目录并核验。改进项（Phase 3 前）：面板增加"复制报告 HTML/路径"回退。
3. 插件功能面（状态码/字段/数值 diff、陈旧守卫、逐项验收门、会话隔离、报告 XSS 转义）在真实宿主中**未观察到缺陷**。

## 4. 回归复跑（Phase 2 后）

| 检查 | 结果 |
|---|---|
| `tsc` host + client | ✅ 双通过 |
| `vitest run` | ✅ 50/50 |
| 离线冒烟 `scripts/smoke.ts` | ✅ 完整闭环（含 stale 守卫） |
| 真实宿主闭环 | ✅ 本轮（见上） |

## 5. 结论

✅ **Phase 2 硬门槛达成**，且模型环节全程真实。可进入 Phase 3（发布准备）：GitHub 仓库 + 演示 GIF + npm v0.1.0 pre-release + 市场登记。

限制声明（须随发布保留）：单项目/3 端点/单轮/一台 Windows/一个模型；diff 只呈现事实，不构成"接口一定没坏"的判定。
