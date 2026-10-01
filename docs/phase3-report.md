# Phase 3 报告 · 发布准备

> 日期：2026-10-01。结论：**Phase 3 全部完成** —— GitHub 仓库 + 中英 README + 64 秒真实演示 GIF + npm v0.1.0 + GitHub Pre-release + **两个市场/精选列表投稿**；发布产物已实测可安装可加载。

## 1. 发布清单（逐项对照任务书）

| 任务书要求 | 状态 | 证据 |
|---|---|---|
| GitHub 仓库 `dsh-apirevise` | ✅ | https://github.com/Lostforest7/dsh-apirevise（public，MIT，默认分支 main） |
| topic `dsh-plugin` | ✅ | topics：`dsh-plugin, deepseek-harness, api-testing, regression, acceptance` |
| 仓库 About / npm description | ✅ | 均为 `API regression & acceptance workbench for DeepSeek Harness.` |
| 中英双语 README 顶部放 60–90 秒真实演示 GIF | ✅ | `docs/assets/real-model-demo.gif`：**64 秒 / 5 帧**，全部取自 Phase 2 真实运行截图，中英双语字幕；README 顶部已内嵌（绝对 URL，npm 页同样可渲染） |
| npm 发布（发布前再确认名字未被抢，用官方 registry） | ✅ | 发布前实测名字 404（空闲）；`npm publish --registry=https://registry.npmjs.org` → [`dsh-apirevise@0.1.0`](https://www.npmjs.com/package/dsh-apirevise)（tag latest） |
| v0.1.0 Pre-release 姿态 | ✅ | GitHub [v0.1.0](https://github.com/Lostforest7/dsh-apirevise/releases/tag/v0.1.0) 标记 **Pre-release**，附 `dsh-apirevise-0.1.0.tgz`；README 顶部保留验证范围与限制声明 |
| 提交 awesome-dsh-plugin 列表 | ✅ 已提 PR | [PR #6311](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6311)：只新增 `data/plugins/Lostforest7__dsh-apirevise.yml`（category `dev`，含 `tarball:` 指向固定 tag）。**仓库年龄门槛（CI 要求创建满 1 天）首次会红，按官方说明无需任何操作，`regate` 定时重跑会自动转绿** |
| 提交 dsh-plugin.org 市场 | ✅ 已收录 | 经其公开收录接口提交 → `state: "published"`；索引已含本条目：分类 `dev`、tags `dev/acceptance/api-testing/regression`、`installable: true`、`installRequiresBuildApproval: false`、安装命令 `dsh plugin --profile web add dsh-apirevise`。详情：https://deepseekplugin.org/plugins/submitted?slug=lostforest7-2f-dsh-2d-apirevise |
| 市场卡片截图声明 | ✅ | 仓库根新增 `screenshots.json`（4 张 Phase 2 真实运行截图），供市场详情页按序展示 |

## 2. 发布产物实测（发布后验证，非"打包成功即完成"）

- `npm install dsh-apirevise@0.1.0 --registry=https://registry.npmjs.org` → 装入 3 个包（本体 + zod + diff）。
- 加载宿主半体：`exports = { apply, inject, name }`；`name = dsh-apirevise`；`inject = [connection, sessionQuery]`；`apply` 为函数。
- `package.json` 的 `dsh.bundle.patch = ./cordis.patch.yml`、`dsh.client = web + 5 个 inject` 均随包正确发布。
- registry 复核：`versions = 0.1.0`、`dist-tags.latest = 0.1.0`、description 与 5 个关键词正确。
- 仓库内 `lib/`（host + client + 预览页）已随源码提交，clone 后无需构建即可被 `dsh plugin add` 加载。

## 3. 演示 GIF 制作方式（诚实说明）

- 素材：Phase 2 真实运行的 4 张全屏截图（基线 3×200 / 模型改动 / 重跑结构化 diff / 验收完成），来自真实 DSH Web 界面。
- 5 帧、64 秒，每帧下方中英双语字幕；**不是连续录屏**，README 与验证文档均已注明。
- 生成脚本随仓库提供：`scripts/make-demo-gif.py`（Pillow，可复现）。

## 4. 发布后的仓库状态

| 项 | 值 |
|---|---|
| 提交 | `ae60dea`（v0.1.0 全量）+ `dd578be`（GIF 绝对 URL）+ `2a9db0d`（安装链接与 Phase 3 报告）+ `6ee5f40`（screenshots.json）+ 本次市场收录结果 |
| 提交作者 | `Lostforest7 <151099323+Lostforest7@users.noreply.github.com>`（仓库级 git 身份，全局身份未被修改） |
| 忽略项 | `node_modules/`、`work/`、`.refs/`（竞品参考源码）、`*.tgz`、`.dsh-apirevise/` |
| 未入库 | 竞品源码参考（`.refs/`）、Phase 2 临时后端与记录（`work/`） |

## 5. 遗留与建议

1. **awesome-dsh-plugin PR 的年龄门槛**：CI 首次运行会因"仓库创建未满 1 天"报错——这是官方的预期行为，无需任何操作（不必重开 PR、不必补提交），`regate.yml` 每 6 小时重跑一次，仓库满 1 天后维持者即可合并。**无需人工干预。**
2. **导出报告的下载回退**（Phase 2 发现）：桌面 WebView 下"导出报告"未落到系统下载目录；报告本体始终写入项目 `.dsh-apirevise/<round>/`。建议 v0.1.1 在面板加"复制报告 HTML / 路径"。
3. 本机 live profile 仍指向本地 `link:` 开发目录；如需切到 npm 版，执行 `dsh plugin --profile web add dsh-apirevise` 即可（发布产物已实测可加载）。
4. 另有 [cordis.run/submit](https://cordis.run/submit) 入口需 GitHub 登录态表单（其索引驱动 web-casa 的 awesome 列表）；任务书未要求，如需可后续手动提交。

## 6. 结论

三个 Phase 全部交付：**立项核对 → 实现与测试（50 项单测 + 双 typecheck + 构建）→ 真实宿主真实模型闭环 → 发布（GitHub + npm + Pre-release + 演示 GIF + 两个市场投稿）**。全部验证环节均未 mock 模型，全部限制声明随包发布。
